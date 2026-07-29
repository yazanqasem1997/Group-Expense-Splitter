import { Router, type IRouter } from "express";
import { and, eq } from "drizzle-orm";
import {
  db,
  groupsTable,
  groupMembersTable,
  groupInvitationsTable,
  expensesTable,
  settlementsTable,
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
          nudgeCampaign: (body.nudgeCampaign ?? null) as never,
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
          email: m.email ?? null,
          phone: m.phone ?? null,
          avatarColor: m.avatarColor ?? "#6366F1",
          photo: m.photo ?? null,
          isAdmin: m.isAdmin ?? false,
          isPending: m.isPending ?? true,
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
    if (!m.isAdmin) {
      res.status(403).json({ error: "Admin required" });
      return;
    }
    const body = parsed.data;
    const patch: Record<string, unknown> = { ...body };
    if (body.nudgeCampaign !== undefined) {
      patch.nudgeCampaign = body.nudgeCampaign as never;
    }
    if (body.isArchived === true) patch.archivedAt = new Date();
    if (body.isEnded === true) patch.endedAt = new Date();

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
    await db.delete(groupsTable).where(eq(groupsTable.id, groupId));
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
    const [member] = await db
      .insert(groupMembersTable)
      .values({
        groupId,
        memberKey: b.memberKey ?? randomKey(),
        name: b.name,
        email: b.email ?? null,
        phone: b.phone ?? null,
        avatarColor: b.avatarColor ?? "#6366F1",
        photo: b.photo ?? null,
        isAdmin: b.isAdmin ?? false,
        isPending: b.isPending ?? true,
      })
      .returning();
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
    if (!m.isAdmin) {
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
      res.status(409).json({
        error: "Member has activity in this group and cannot be removed",
      });
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
      const payload = serializeInvitation(invite!);
      record(201, payload);
      res.status(201).json(payload);
    });
  },
);

export default router;
