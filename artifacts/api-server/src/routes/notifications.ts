import { Router, type IRouter } from "express";
import { and, eq } from "drizzle-orm";
import { db, groupMembersTable, notificationsTable, deviceTokensTable } from "@workspace/db";
import {
  ListNotificationsResponse,
  MarkNotificationReadResponse,
  MarkAllNotificationsReadResponse,
  RegisterDeviceTokenBody,
  SendGroupReminderBody,
} from "@workspace/api-zod";
import { requireAuth } from "../lib/auth";
import { getMembership } from "../lib/authz";
import { withIdempotency } from "../lib/idempotency";
import { param } from "../lib/params";
import {
  serializeNotification,
  serializeDeviceToken,
} from "../lib/serialize";
import { filterByPref, sendPushToUsers } from "../lib/push";

const router: IRouter = Router();

router.get("/notifications", requireAuth, async (req, res): Promise<void> => {
  const rows = await db
    .select()
    .from(notificationsTable)
    .where(eq(notificationsTable.userId, req.localUser!.id));
  res.json(ListNotificationsResponse.parse(rows.map(serializeNotification)));
});

router.post(
  "/groups/:groupId/reminders",
  requireAuth,
  async (req, res): Promise<void> => {
    const groupId = param(req, "groupId");
    const parsed = SendGroupReminderBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }

    const membership = await getMembership(groupId, req.localUser!.id);
    if (!membership) {
      res.status(404).json({ error: "Group not found" });
      return;
    }
    if (!membership.isMember) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    const [recipient] = await db
      .select()
      .from(groupMembersTable)
      .where(
        and(
          eq(groupMembersTable.groupId, groupId),
          eq(groupMembersTable.memberKey, parsed.data.recipientMemberKey),
        ),
      )
      .limit(1);

    if (!recipient) {
      res.status(404).json({ error: "Recipient is not a member of this group" });
      return;
    }
    if (!recipient.userId) {
       res.status(400).json({ error: "This member has not joined Split Mate yet" });
      return;
    }
    if (recipient.userId === req.localUser!.id) {
      res.status(400).json({ error: "You can't send a reminder to yourself" });
      return;
    }

    const title = `Balance reminder from ${req.localUser!.name}`;
    const body = `${req.localUser!.name} reminded you about your ${parsed.data.currency} ${parsed.data.amount.toFixed(2)} balance in "${membership.group.name}".`;

    await withIdempotency(req, res, async (record) => {
      const [notification] = await db
        .insert(notificationsTable)
        .values({
          userId: recipient.userId!,
          type: "settlement_reminder",
          groupId,
          title,
          body,
          read: false,
        })
        .returning();

      await sendPushToUsers(await filterByPref([recipient.userId!], "settlement"), {
        title,
        body,
        data: { groupId, type: "settlement_reminder" },
      });

      const payload = serializeNotification(notification!);
      record(201, payload);
      res.status(201).json(payload);
    });
  },
);

router.post(
  "/notifications/read-all",
  requireAuth,
  async (req, res): Promise<void> => {
    const updated = await db
      .update(notificationsTable)
      .set({ read: true })
      .where(
        and(
          eq(notificationsTable.userId, req.localUser!.id),
          eq(notificationsTable.read, false),
        ),
      )
      .returning({ id: notificationsTable.id });
    res.json(
      MarkAllNotificationsReadResponse.parse({ count: updated.length }),
    );
  },
);

router.post(
  "/notifications/:notificationId/read",
  requireAuth,
  async (req, res): Promise<void> => {
    const notificationId = param(req, "notificationId");
    const [updated] = await db
      .update(notificationsTable)
      .set({ read: true })
      .where(
        and(
          eq(notificationsTable.id, notificationId),
          eq(notificationsTable.userId, req.localUser!.id),
        ),
      )
      .returning();
    if (!updated) {
      res.status(404).json({ error: "Notification not found" });
      return;
    }
    res.json(MarkNotificationReadResponse.parse(serializeNotification(updated)));
  },
);

router.post(
  "/device-tokens",
  requireAuth,
  async (req, res): Promise<void> => {
    const parsed = RegisterDeviceTokenBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const { token, platform } = parsed.data;
    const [row] = await db
      .insert(deviceTokensTable)
      .values({ userId: req.localUser!.id, token, platform })
      .onConflictDoUpdate({
        target: deviceTokensTable.token,
        set: { userId: req.localUser!.id, platform, updatedAt: new Date() },
      })
      .returning();
    res.status(201).json(serializeDeviceToken(row!));
  },
);

router.delete(
  "/device-tokens/:token",
  requireAuth,
  async (req, res): Promise<void> => {
    const token = param(req, "token");
    const [deleted] = await db
      .delete(deviceTokensTable)
      .where(
        and(
          eq(deviceTokensTable.token, token),
          eq(deviceTokensTable.userId, req.localUser!.id),
        ),
      )
      .returning();
    if (!deleted) {
      res.status(404).json({ error: "Device token not found" });
      return;
    }
    res.sendStatus(204);
  },
);

export default router;
