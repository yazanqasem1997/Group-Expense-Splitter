import { Router, type IRouter } from "express";
import { and, eq } from "drizzle-orm";
import { db, notificationsTable, deviceTokensTable } from "@workspace/db";
import {
  ListNotificationsResponse,
  MarkNotificationReadResponse,
  MarkAllNotificationsReadResponse,
  RegisterDeviceTokenBody,
} from "@workspace/api-zod";
import { requireAuth } from "../lib/auth";
import { param } from "../lib/params";
import {
  serializeNotification,
  serializeDeviceToken,
} from "../lib/serialize";

const router: IRouter = Router();

router.get("/notifications", requireAuth, async (req, res): Promise<void> => {
  const rows = await db
    .select()
    .from(notificationsTable)
    .where(eq(notificationsTable.userId, req.localUser!.id));
  res.json(ListNotificationsResponse.parse(rows.map(serializeNotification)));
});

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
