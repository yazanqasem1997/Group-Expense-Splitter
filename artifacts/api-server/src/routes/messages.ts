import { Router, type IRouter } from "express";
import { and, eq, isNotNull, ne } from "drizzle-orm";
import { db, groupMessagesTable, groupMembersTable, groupsTable, notificationsTable } from "@workspace/db";
import { filterByPref, sendPushToUsers } from "../lib/push";
import {
  ListGroupMessagesResponse,
  CreateGroupMessageBody,
  ListGroupMessageReadsResponse,
  MarkGroupMessagesReadResponse,
} from "@workspace/api-zod";
import { requireAuth } from "../lib/auth";
import { getMembership } from "../lib/authz";
import { param } from "../lib/params";
import { serializeMessage, serializeMessageReadReceipt } from "../lib/serialize";

const router: IRouter = Router();

router.get(
  "/groups/:groupId/messages",
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
    const rows = await db
      .select()
      .from(groupMessagesTable)
      .where(eq(groupMessagesTable.groupId, groupId));
    res.json(ListGroupMessagesResponse.parse(rows.map(serializeMessage)));
  },
);

router.post(
  "/groups/:groupId/messages",
  requireAuth,
  async (req, res): Promise<void> => {
    const groupId = param(req, "groupId");
    const parsed = CreateGroupMessageBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const m = await getMembership(groupId, req.localUser!.id);
    if (!m) {
      res.status(404).json({ error: "Group not found" });
      return;
    }
    if (!m.isMember) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    // Derive the actor's memberKey from their authenticated membership row.
    // Reject any attempt to impersonate a different member by supplying a
    // mismatched memberKey in the request body.
    const authenticatedMemberKey = m.member?.memberKey;
    if (!authenticatedMemberKey) {
      // The group owner may not have a member row — treat that as forbidden
      // for message posting until they have one.
      res.status(403).json({ error: "No membership record found for your account in this group" });
      return;
    }
    // "me" = the signed-in member (used when replying from a notification).
    if (parsed.data.memberKey !== "me" && parsed.data.memberKey !== authenticatedMemberKey) {
      res.status(403).json({ error: "memberKey does not match your group membership" });
      return;
    }

    const [row] = await db
      .insert(groupMessagesTable)
      .values({
        groupId,
        memberKey: authenticatedMemberKey,
        text: parsed.data.text,
      })
      .returning();
    res.status(201).json(serializeMessage(row!));

    // Tell everyone else in the group. Push failures never affect the message itself.
    void (async () => {
      const others = await db.select({ userId: groupMembersTable.userId }).from(groupMembersTable)
        .where(and(eq(groupMembersTable.groupId, groupId), isNotNull(groupMembersTable.userId), ne(groupMembersTable.memberKey, authenticatedMemberKey)));
      const [g] = await db.select({ name: groupsTable.name }).from(groupsTable).where(eq(groupsTable.id, groupId)).limit(1);
      const sender = m.member?.name ?? "Someone";
      const text = parsed.data.text.length > 120 ? parsed.data.text.slice(0, 117) + "…" : parsed.data.text;
      const chatIds = others.map(o => o.userId!).filter(u => !!u && u !== req.localUser!.id);
      if (chatIds.length > 0) {
        const existing = await db.select({ userId: notificationsTable.userId }).from(notificationsTable)
          .where(and(eq(notificationsTable.groupId, groupId), eq(notificationsTable.type, "group_message"), eq(notificationsTable.read, false)));
        const have = new Set(existing.map(e => e.userId));
        const fresh = chatIds.filter(u => !have.has(u));
        if (fresh.length > 0) {
          await db.insert(notificationsTable).values(fresh.map(uid => ({ userId: uid, type: "group_message", groupId, title: g?.name ?? "Group chat", body: `${sender}: ${text}`, read: false })));
        }
      }
      const chatPushThrottle = (globalThis as any).__chatPushThrottle ??= new Map<string, number>();
      await sendPushToUsers((await filterByPref(others.map(o => o.userId!).filter(u => !!u && u !== req.localUser!.id), "chat")).filter(u => { const k = u + ":" + groupId; const last = chatPushThrottle.get(k) ?? 0; if (Date.now() - last < 180000) return false; chatPushThrottle.set(k, Date.now()); return true; }), {
        title: g?.name ?? "Group chat",
        body: `${sender}: ${text}`,
        categoryId: "chat",
        data: { groupId, type: "group_message" },
      });
    })().catch(() => {});
  },
);

router.get(
  "/groups/:groupId/messages/reads",
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
    const rows = await db
      .select({
        memberKey: groupMembersTable.memberKey,
        lastReadMessagesAt: groupMembersTable.lastReadMessagesAt,
      })
      .from(groupMembersTable)
      .where(eq(groupMembersTable.groupId, groupId));
    res.json(ListGroupMessageReadsResponse.parse(rows.map(serializeMessageReadReceipt)));
  },
);

router.post(
  "/groups/:groupId/messages/reads",
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
    const authenticatedMemberKey = m.member?.memberKey;
    if (!authenticatedMemberKey) {
      res.status(403).json({ error: "No membership record found for your account in this group" });
      return;
    }
    const now = new Date();
    const [row] = await db
      .update(groupMembersTable)
      .set({ lastReadMessagesAt: now })
      .where(eq(groupMembersTable.memberKey, authenticatedMemberKey))
      .returning({
        memberKey: groupMembersTable.memberKey,
        lastReadMessagesAt: groupMembersTable.lastReadMessagesAt,
      });
    res.json(MarkGroupMessagesReadResponse.parse(serializeMessageReadReceipt(row!)));
  },
);

export default router;
