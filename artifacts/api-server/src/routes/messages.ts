import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, groupMessagesTable } from "@workspace/db";
import {
  ListGroupMessagesResponse,
  CreateGroupMessageBody,
} from "@workspace/api-zod";
import { requireAuth } from "../lib/auth";
import { getMembership } from "../lib/authz";
import { param } from "../lib/params";
import { serializeMessage } from "../lib/serialize";

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
    if (parsed.data.memberKey !== authenticatedMemberKey) {
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
  },
);

export default router;
