import { friendRequestsTable as frT, groupInvitationsTable as giT, groupMembersTable as gmT, usersTable as uT, notificationsTable as nT } from "@workspace/db";
import { and as dAnd, eq as dEq, or as dOr, sql as dSql, ne as dNe } from "drizzle-orm";
import { randomUUID as rUUID } from "node:crypto";
import { actorName, filterByPref, sendPushToUsers } from "../lib/push";
import { Router, type IRouter } from "express";
import { and, eq, isNotNull, isNull, ne, sql } from "drizzle-orm";
import {
  db,
  groupsTable,
  groupMembersTable,
  groupInvitationsTable,
  expensesTable,
  settlementsTable,
  notificationsTable,
  usersTable,
} from "@workspace/db";
import {
  ListGroupsResponse,
  CreateGroupBody,
  GetGroupResponse,
  UpdateGroupBody,
  UpdateGroupResponse,
  ListGroupMembersResponse,
  AddGroupMemberBody,
  CreateGroupInvitationBody,
  ListGroupInvitationsResponse,
} from "@workspace/api-zod";
import { requireAuth } from "../lib/auth";
import { getMembership, recordAudit } from "../lib/authz";
import { withIdempotency } from "../lib/idempotency";
import { param, randomKey, randomToken } from "../lib/params";
import {
  serializeGroup,
  serializeMember,
  serializeInvitation,
} from "../lib/serialize";
import { sendGroupInvitationEmail } from "../lib/email";

/** A member added by email who already has a Split Mate account joins the group straight away. */
async function accountForEmail(email: string | null | undefined): Promise<string | null> {
  if (!email || !email.trim()) return null;
  const [u] = await db.select({ id: usersTable.id }).from(usersTable)
    .where(and(eq(sql`lower(${usersTable.email})`, email.trim().toLowerCase()), isNull(usersTable.deletionScheduledFor)))
    .limit(1);
  return u?.id ?? null;
}

const router: IRouter = Router();

router.get("/groups", requireAuth, async (req, res): Promise<void> => {
  const userId = req.localUser!.id;
  const memberRows = await db
    .select({ groupId: groupMembersTable.groupId })
    .from(groupMembersTable)
    .where(eq(groupMembersTable.userId, userId));
  const owned = await db
    .select()
    .from(groupsTable)
    .where(eq(groupsTable.createdByUserId, userId));

  const ids = new Set(owned.map((g) => g.id));
  const groups = [...owned];
  const memberGroupIds = memberRows
    .map((r) => r.groupId)
    .filter((id) => !ids.has(id));
  for (const gid of memberGroupIds) {
    const [g] = await db
      .select()
      .from(groupsTable)
      .where(eq(groupsTable.id, gid))
      .limit(1);
    if (g && !ids.has(g.id)) {
      groups.push(g);
      ids.add(g.id);
    }
  }
  res.json(ListGroupsResponse.parse(groups.map(serializeGroup)));
});

router.post("/groups", requireAuth, async (req, res): Promise<void> => {
  const parsed = CreateGroupBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const userId = req.localUser!.id;
  const user = req.localUser!;
  const body = parsed.data;

  await withIdempotency(req, res, async (record) => {
    const created = await db.transaction(async (tx) => {
      const [group] = await tx
        .insert(groupsTable)
        .values({
          name: body.name,
          emoji: body.emoji ?? "💸",
          currency: body.currency ?? user.defaultCurrency,
          type: body.type ?? "other",
          createdByUserId: userId,
          startDate: body.startDate ?? null,
          endDate: body.endDate ?? null,
          reminderDays: body.reminderDays ?? null,
          tripStartReminderDays: body.tripStartReminderDays ?? null,
          settleUpReminderDays: body.settleUpReminderDays ?? null,
          reminderChannel: body.reminderChannel ?? null,
          customItemizations: (body.customItemizations ?? []) as never,
        })
        .returning();

      // Always add the creator as an admin member.
      await tx.insert(groupMembersTable).values({
        groupId: group!.id,
        userId,
        memberKey: randomKey(),
        name: user.name,
        email: user.email,
        avatarColor: user.avatarColor,
        photo: user.photo,
        isAdmin: true,
        isPending: false,
        joinedAt: new Date(),
      });

      // Add any supplied members (placeholders unless explicitly not pending).
      // Skip entries that match the creator (by email) to avoid a duplicate row —
      // the creator row was already inserted above with the real userId link.
      for (const m of body.members ?? []) {
        const isCreator =
          m.email && user.email && m.email.toLowerCase() === user.email.toLowerCase();
        if (isCreator) continue;
        await tx.insert(groupMembersTable).values({
          groupId: group!.id,
          memberKey: m.memberKey ?? randomKey(),
          name: m.name,
          email: m.email ?? null, userId: await accountForEmail(m.email),
          phone: m.phone ?? null,
          avatarColor: m.avatarColor ?? "#6366F1",
          photo: m.photo ?? null,
          isAdmin: m.isAdmin ?? false,
          isPending: (await accountForEmail(m.email)) ? false : (m.isPending ?? true),
        });
      }

      await recordAudit(tx as never, {
        entityType: "group",
        entityId: group!.id,
        groupId: group!.id,
        action: "created",
        changedByUserId: userId,
      });

      return group!;
    });

    const payload = GetGroupResponse.parse(serializeGroup(created));
    void notifyAddedToGroup(created.id, created.name, userId, actorName(req.localUser));
    record(201, payload);
    res.status(201).json(payload);
  });
});

router.get("/groups/:groupId", requireAuth, async (req, res): Promise<void> => {
  const groupId = param(req, "groupId");
  const m = await getMembership(groupId, req.localUser!.id);
  if (!m) {
    res.status(404).json({ error: "Group not found" });
    return;
  }
  if (!m.isMember) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  res.json(GetGroupResponse.parse(serializeGroup(m.group)));
});

router.patch(
  "/groups/:groupId",
  requireAuth,
  async (req, res): Promise<void> => {
    const groupId = param(req, "groupId");
    const parsed = UpdateGroupBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const m = await getMembership(groupId, req.localUser!.id);
    if (!m) {
      res.status(404).json({ error: "Group not found" });
      return;
    }
    const onlyUpdatingCustomItemizations =
      Object.keys(parsed.data).length === 1 && parsed.data.customItemizations !== undefined;
    const onlyUpdatingSimplifyDebts =
      Object.keys(parsed.data).length === 1 && parsed.data.simplifyDebtsEnabled !== undefined;
    // Any member may change the group's default currency.
    const onlyUpdatingCurrency =
      Object.keys(parsed.data).length === 1 && parsed.data.currency !== undefined;
    if (!m.isAdmin && !onlyUpdatingCustomItemizations && !onlyUpdatingSimplifyDebts && !onlyUpdatingCurrency) {
      res.status(403).json({ error: "Admin required" });
      return;
    }
    const body = parsed.data;
    const patch: Record<string, unknown> = { ...body };
    // Legacy clients may still send the removed settlement nudge setting.
    delete patch.nudgeCampaign;
    if (body.customItemizations !== undefined) {
      patch.customItemizations = body.customItemizations as never;
    }
    if (body.isArchived === true) patch.archivedAt = new Date();
    if (body.isEnded === true) patch.endedAt = new Date();
    if (Object.keys(patch).length === 0) {
      res.status(400).json({ error: "No group changes supplied" });
      return;
    }

    const [updated] = await db
      .update(groupsTable)
      .set(patch)
      .where(eq(groupsTable.id, groupId))
      .returning();
    await recordAudit(db, {
      entityType: "group",
      entityId: groupId,
      groupId,
      action: "updated",
      changedByUserId: req.localUser!.id,
    });

    res.json(UpdateGroupResponse.parse(serializeGroup(updated!)));
  },
);

router.delete(
  "/groups/:groupId",
  requireAuth,
  async (req, res): Promise<void> => {
    const groupId = param(req, "groupId");
    const m = await getMembership(groupId, req.localUser!.id);
    if (!m) {
      res.status(404).json({ error: "Group not found" });
      return;
    }
    if (!m.isOwner) {
      res.status(403).json({ error: "Only the owner can delete a group" });
      return;
    }
    const [doomed] = await db.select({ name: groupsTable.name }).from(groupsTable).where(eq(groupsTable.id, groupId)).limit(1);
    const others = (await db.select({ userId: groupMembersTable.userId }).from(groupMembersTable).where(eq(groupMembersTable.groupId, groupId)))
      .map(r => r.userId)
      .filter((u): u is string => !!u && u !== req.localUser!.id);
    await db.delete(groupsTable).where(eq(groupsTable.id, groupId));
    if (others.length > 0) {
      const body = `${actorName(req.localUser)} deleted "${doomed?.name ?? "a group"}"`;
      void db.insert(notificationsTable).values(others.map(uid => ({ userId: uid, type: "group_deleted", title: doomed?.name ?? "Group deleted", body, read: false }))).catch(() => {});
      void filterByPref(others, "invite").then(ids => sendPushToUsers(ids, { title: "Group deleted", body, data: { type: "group_deleted" } })).catch(() => {});
    }
    res.sendStatus(204);
  },
);

// ---- Members ----

router.get(
  "/groups/:groupId/members",
  requireAuth,
  async (req, res): Promise<void> => {
    const groupId = param(req, "groupId");
    const m = await getMembership(groupId, req.localUser!.id);
    if (!m) {
      res.status(404).json({ error: "Group not found" });
      return;
    }
    if (!m.isMember) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    const members = await db
      .select()
      .from(groupMembersTable)
      .where(eq(groupMembersTable.groupId, groupId));
    res.json(ListGroupMembersResponse.parse(members.map(serializeMember)));
  },
);

router.post(
  "/groups/:groupId/members",
  requireAuth,
  async (req, res): Promise<void> => {
    const groupId = param(req, "groupId");
    const parsed = AddGroupMemberBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const m = await getMembership(groupId, req.localUser!.id);
    if (!m) {
      res.status(404).json({ error: "Group not found" });
      return;
    }
    if (!m.isAdmin) {
      res.status(403).json({ error: "Admin required" });
      return;
    }
    const b = parsed.data;
    // Same person already in this group? Return their existing spot instead of adding them twice.
    const existingUserId = await accountForEmail(b.email);
    if (existingUserId) {
      const [dup] = await db.select().from(groupMembersTable)
        .where(and(eq(groupMembersTable.groupId, groupId), eq(groupMembersTable.userId, existingUserId))).limit(1);
      if (dup) { res.status(200).json(serializeMember(dup)); return; }
    }
    const [member] = await db
      .insert(groupMembersTable)
      .values({
        groupId,
        memberKey: b.memberKey ?? randomKey(),
        name: b.name,
        email: b.email ?? null, userId: await accountForEmail(b.email),
        phone: b.phone ?? null,
        avatarColor: b.avatarColor ?? "#6366F1",
        photo: b.photo ?? null,
        isAdmin: b.isAdmin ?? false,
        isPending: (await accountForEmail(b.email)) ? false : (b.isPending ?? true),
      })
      .returning();
    // Someone with an account was just added: tell them (unless they turned "Group invites" off).
    if (member?.userId && member.userId !== req.localUser!.id) {
      const [grp] = await db.select({ name: groupsTable.name }).from(groupsTable).where(eq(groupsTable.id, groupId)).limit(1);
      void db.insert(notificationsTable).values({
        userId: member.userId,
        type: "member_added",
        groupId,
        title: grp?.name ?? "New group",
        body: `${actorName(req.localUser)} added you to "${grp?.name ?? "a group"}"`,
        read: false,
      }).catch(() => {});
      void filterByPref([member.userId], "invite")
        .then(ids => sendPushToUsers(ids, {
          title: "Added to a group",
          body: `${actorName(req.localUser)} added you to a group on Split Mate`,
          data: { type: "group_invite", groupId },
        }))
        .catch(() => {});
    }
    res.status(201).json(serializeMember(member!));
  },
);

router.patch(
  "/groups/:groupId/members/:memberKey",
  requireAuth,
  async (req, res): Promise<void> => {
    const groupId = param(req, "groupId");
    const memberKey = param(req, "memberKey");
    const m = await getMembership(groupId, req.localUser!.id);
    if (!m) {
      res.status(404).json({ error: "Group not found" });
      return;
    }
    if (!m.isAdmin) {
      res.status(403).json({ error: "Admin required" });
      return;
    }
    const { isAdmin } = req.body as { isAdmin?: boolean };
    if (typeof isAdmin !== "boolean") {
      res.status(400).json({ error: "isAdmin (boolean) required" });
      return;
    }
    const [updated] = await db
      .update(groupMembersTable)
      .set({ isAdmin })
      .where(
        and(
          eq(groupMembersTable.groupId, groupId),
          eq(groupMembersTable.memberKey, memberKey),
        ),
      )
      .returning();
    if (!updated) {
      res.status(404).json({ error: "Member not found" });
      return;
    }
    await recordAudit(db, {
      entityType: "group",
      entityId: groupId,
      groupId,
      action: "updated",
      changedByUserId: req.localUser!.id,
      fieldChanges: [{ field: "member.isAdmin", oldValue: String(!isAdmin), newValue: String(isAdmin) }],
    });
    res.json(serializeMember(updated));
  },
);

router.delete(
  "/groups/:groupId/members/:memberKey",
  requireAuth,
  async (req, res): Promise<void> => {
    const groupId = param(req, "groupId");
    const memberKey = param(req, "memberKey");
    const m = await getMembership(groupId, req.localUser!.id);
    if (!m) {
      res.status(404).json({ error: "Group not found" });
      return;
    }
    const selfLeave = m.member?.memberKey === memberKey;
    if (!m.isAdmin && !selfLeave) {
      res.status(403).json({ error: "Admin required" });
      return;
    }

    const [target] = await db
      .select()
      .from(groupMembersTable)
      .where(
        and(
          eq(groupMembersTable.groupId, groupId),
          eq(groupMembersTable.memberKey, memberKey),
        ),
      )
      .limit(1);
    if (!target) {
      res.status(404).json({ error: "Member not found" });
      return;
    }

    // Block removing a member who still participates in expenses/settlements
    // (would leave dangling balances). Callers must settle first.
    // Check BOTH settlement roles (payer = fromMemberKey, recipient = toMemberKey).
    const [expenseRefs, settlementFromRefs, settlementToRefs] = await Promise.all([
      db
        .select({ id: expensesTable.id })
        .from(expensesTable)
        .where(
          and(
            eq(expensesTable.groupId, groupId),
            eq(expensesTable.paidByMemberKey, memberKey),
          ),
        )
        .limit(1),
      db
        .select({ id: settlementsTable.id })
        .from(settlementsTable)
        .where(
          and(
            eq(settlementsTable.groupId, groupId),
            eq(settlementsTable.fromMemberKey, memberKey),
          ),
        )
        .limit(1),
      db
        .select({ id: settlementsTable.id })
        .from(settlementsTable)
        .where(
          and(
            eq(settlementsTable.groupId, groupId),
            eq(settlementsTable.toMemberKey, memberKey),
          ),
        )
        .limit(1),
    ]);
    if (expenseRefs.length > 0 || settlementFromRefs.length > 0 || settlementToRefs.length > 0) {
      // Balance was checked in the app before this call. Keep the row so names
      // in old expenses stay readable, but remove the person's access.
      await db
        .update(groupMembersTable)
        .set({ userId: null, isAdmin: false, leftAt: new Date() })
        .where(eq(groupMembersTable.id, target.id));
      res.sendStatus(204);
      return;
    }

    await db
      .delete(groupMembersTable)
      .where(eq(groupMembersTable.id, target.id));
    res.sendStatus(204);
  },
);

// ---- Invitations ----

router.get(
  "/groups/:groupId/invitations",
  requireAuth,
  async (req, res): Promise<void> => {
    const groupId = param(req, "groupId");
    const m = await getMembership(groupId, req.localUser!.id);
    if (!m) {
      res.status(404).json({ error: "Group not found" });
      return;
    }
    if (!m.isMember) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    const invites = await db
      .select()
      .from(groupInvitationsTable)
      .where(eq(groupInvitationsTable.groupId, groupId));
    res.json(
      ListGroupInvitationsResponse.parse(invites.map(serializeInvitation)),
    );
  },
);

router.post(
  "/groups/:groupId/invitations",
  requireAuth,
  async (req, res): Promise<void> => {
    const groupId = param(req, "groupId");
    const parsed = CreateGroupInvitationBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const m = await getMembership(groupId, req.localUser!.id);
    if (!m) {
      res.status(404).json({ error: "Group not found" });
      return;
    }
    if (!m.isAdmin) {
      res.status(403).json({ error: "Admin required" });
      return;
    }
    const b = parsed.data;
    await withIdempotency(req, res, async (record) => {
      const [invite] = await db
        .insert(groupInvitationsTable)
        .values({
          groupId,
          inviterUserId: req.localUser!.id,
          invitedEmail: b.invitedEmail,
          invitedName: b.invitedName ?? null,
          invitedMemberKey: b.invitedMemberKey ?? null,
          status: "pending",
          token: randomToken(),
        })
        .returning();
      if (!invite) {
        res.status(500).json({ error: "Could not create invitation" });
        return;
      }

      // Already friends? Add them straight away - no invite to accept, no email.
      const friendUser = await friendAccount(invite!.invitedEmail, req.localUser!.id);
      if (friendUser) {
        const accepted = await addFriendDirectly(invite!, friendUser);
        if (accepted) {
          void db.insert(nT).values({
            userId: friendUser.id, type: "member_added", groupId,
            title: m.group.name, body: `${actorName(req.localUser)} added you to "${m.group.name}"`, read: false,
          }).catch(() => {});
          void filterByPref([friendUser.id], "invite")
            .then(ids => sendPushToUsers(ids, { title: "Added to a group", body: `${actorName(req.localUser)} added you to "${m.group.name}"`, data: { type: "group_added", groupId } }))
            .catch(() => {});
          const payloadDirect = serializeInvitation(accepted);
          record(201, payloadDirect);
          res.status(201).json(payloadDirect);
          return;
        }
      }

      try {
        await sendGroupInvitationEmail({
          to: invite.invitedEmail,
          invitedName: invite.invitedName,
          inviterName: req.localUser!.name,
          groupName: m.group.name,
        });
      } catch (error) {
        req.log.error(
          { err: error, invitationId: invite.id, groupId },
          "Invitation was saved but its email could not be sent",
        );
        res.status(502).json({
          error: "Invitation saved, but the email could not be sent. Please try again.",
        });
        return;
      }

      const payload = serializeInvitation(invite!);
      record(201, payload);
      res.status(201).json(payload);
    });
  },
);

export default router;

/** In-app notification + push for everyone with an account added to a brand-new group. Never throws. */
async function notifyAddedToGroup(groupId: string, groupName: string, creatorId: string, creatorName: string): Promise<void> {
  try {
    const rows = await db.select({ userId: groupMembersTable.userId }).from(groupMembersTable).where(eq(groupMembersTable.groupId, groupId));
    const ids = [...new Set(rows.map(r => r.userId).filter((u): u is string => !!u && u !== creatorId))];
    if (ids.length === 0) return;
    const body = `${creatorName} added you to "${groupName}"`;
    await db.insert(notificationsTable).values(ids.map(uid => ({ userId: uid, type: "member_added", groupId, title: groupName, body, read: false })));
    const allowed = await filterByPref(ids, "invite");
    if (allowed.length > 0) await sendPushToUsers(allowed, { title: "Added to a group", body, data: { type: "group_added", groupId } });
  } catch {
    // best effort
  }
}

/** The account behind this email, if it is already a friend of the inviter (accepted request or a shared group). */
async function friendAccount(email: string | null | undefined, inviterId: string) {
  try {
    return await friendAccountInner(email, inviterId);
  } catch {
    return null;
  }
}
async function friendAccountInner(email: string | null | undefined, inviterId: string) {
  if (!email) return null;
  const [u] = await db.select().from(uT).where(dSql`lower(${uT.email}) = ${email.toLowerCase()}`).limit(1);
  if (!u || u.id === inviterId) return null;
  const [fr] = await db.select({ id: frT.id }).from(frT).where(dAnd(
    dEq(frT.status, "accepted"),
    dOr(dAnd(dEq(frT.senderUserId, inviterId), dEq(frT.recipientUserId, u.id)), dAnd(dEq(frT.senderUserId, u.id), dEq(frT.recipientUserId, inviterId))),
  )).limit(1);
  if (fr) return u;
  const shared = await db.execute(dSql`select 1 from ${gmT} a join ${gmT} b on a.group_id = b.group_id where a.user_id = ${inviterId} and b.user_id = ${u.id} limit 1`);
  return (shared as unknown as { rows?: unknown[] }).rows?.length ? u : null;
}

/** Same as accepting the invite on their behalf. Returns the accepted invitation, or null to fall back to a normal invite. */
async function addFriendDirectly(invite: typeof giT.$inferSelect, user: typeof uT.$inferSelect) {
  try {
    return await db.transaction(async (tx) => {
      const [already] = await tx.select({ id: gmT.id }).from(gmT).where(dAnd(dEq(gmT.groupId, invite.groupId), dEq(gmT.userId, user.id))).limit(1);
      let memberKey = invite.invitedMemberKey ?? null;
      if (!already) {
        if (memberKey) {
          const upd = await tx.update(gmT)
            .set({ userId: user.id, email: user.email, avatarColor: user.avatarColor, photo: user.photo, isPending: false, joinedAt: new Date() })
            .where(dAnd(dEq(gmT.groupId, invite.groupId), dEq(gmT.memberKey, memberKey)))
            .returning({ id: gmT.id });
          if (upd.length === 0) memberKey = null;
        }
        if (!memberKey) {
          memberKey = rUUID();
          await tx.insert(gmT).values({
            groupId: invite.groupId, userId: user.id, memberKey, name: user.name, email: user.email,
            avatarColor: user.avatarColor, photo: user.photo, isAdmin: false, isPending: false, joinedAt: new Date(),
          });
        }
      }
      const [updated] = await tx.update(giT)
        .set({ status: "accepted", ...(memberKey ? { invitedMemberKey: memberKey } : {}) })
        .where(dEq(giT.id, invite.id))
        .returning();
      return updated ?? null;
    });
  } catch {
    return null;
  }
}
