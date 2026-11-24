import { Router, type IRouter } from "express";
import { eq, or } from "drizzle-orm";
import { db, directPaymentsTable, notificationsTable } from "@workspace/db";
import { requireAuth } from "../lib/auth";
import { actorName, filterByPref, sendPushToUsers } from "../lib/push";

const router: IRouter = Router();
const UUID = /^[0-9a-f-]{36}$/i;

router.get("/direct-payments", requireAuth, async (req, res): Promise<void> => {
  const me = req.localUser!.id;
  const rows = await db
    .select()
    .from(directPaymentsTable)
    .where(or(eq(directPaymentsTable.fromUserId, me), eq(directPaymentsTable.toUserId, me)));
  res.setHeader("Cache-Control", "no-store");
  res.json(rows.map(r => ({
    clientId: r.clientId,
    fromUserId: r.fromUserId,
    toUserId: r.toUserId,
    createdBy: r.createdBy,
    amount: r.amount,
    currency: r.currency,
    reason: r.reason,
    comments: r.comments,
    category: r.category,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
    deletedAt: r.deletedAt ? r.deletedAt.toISOString() : null,
    meta: r.meta ?? null,
  })));
});

/** Create or update (by clientId). Only the two people in it can touch it. */
router.post("/direct-payments", requireAuth, async (req, res): Promise<void> => {
  const me = req.localUser!.id;
  const b = (req.body ?? {}) as Record<string, unknown>;
  const clientId = String(b.clientId ?? "").slice(0, 100);
  const fromUserId = String(b.fromUserId ?? "");
  const toUserId = String(b.toUserId ?? "");
  const amount = Number(b.amount);
  if (!clientId || !UUID.test(fromUserId) || !UUID.test(toUserId) || fromUserId === toUserId
    || !(amount > 0) || (me !== fromUserId && me !== toUserId)) {
    res.status(400).json({ error: "Invalid one-off" });
    return;
  }
  const values = {
    fromUserId,
    toUserId,
    amount,
    currency: String(b.currency ?? "USD").slice(0, 8),
    reason: String(b.reason ?? "").slice(0, 200),
    comments: b.comments ? String(b.comments).slice(0, 1000) : null,
    category: b.category ? String(b.category).slice(0, 50) : null,
    meta: b.meta && typeof b.meta === "object" && JSON.stringify(b.meta).length < 20000 ? b.meta : null,
  };
  const [existing] = await db.select().from(directPaymentsTable).where(eq(directPaymentsTable.clientId, clientId)).limit(1);
  if (existing) {
    if (existing.fromUserId !== me && existing.toUserId !== me) { res.status(404).json({ error: "Not found" }); return; }
    await db.update(directPaymentsTable).set({ ...values, updatedAt: new Date() }).where(eq(directPaymentsTable.id, existing.id));
    res.json({ ok: true });
    return;
  }
  await db.insert(directPaymentsTable).values({ ...values, clientId, createdBy: me });
  const other = fromUserId === me ? toUserId : fromUserId;
  const body = `${actorName(req.localUser)} added "${values.reason || "a one-off"}" \u00b7 ${values.amount} ${values.currency}`;
  void db.insert(notificationsTable).values({ userId: other, type: "direct_payment_added", title: "One-off added", body, read: false }).catch(() => {});
  void filterByPref([other], "expenseAdded")
    .then(ids => sendPushToUsers(ids, { title: "One-off added", body, data: { type: "direct_payment_added" } }))
    .catch(() => {});
  res.status(201).json({ ok: true });
});

router.delete("/direct-payments/:clientId", requireAuth, async (req, res): Promise<void> => {
  const me = req.localUser!.id;
  const clientId = String(req.params.clientId ?? "");
  const [row] = await db.select().from(directPaymentsTable).where(eq(directPaymentsTable.clientId, clientId)).limit(1);
  if (!row || (row.fromUserId !== me && row.toUserId !== me) || row.deletedAt) { res.sendStatus(204); return; }
  const quiet = req.query.quiet === "1";
  await db.update(directPaymentsTable).set({ deletedAt: new Date(), updatedAt: new Date() }).where(eq(directPaymentsTable.id, row.id));
  const other = row.fromUserId === me ? row.toUserId : row.fromUserId;
  if (quiet) { res.sendStatus(204); return; }
  const body = `${actorName(req.localUser)} removed "${row.reason || "a one-off"}"`;
  void db.insert(notificationsTable).values({ userId: other, type: "direct_payment_deleted", title: "One-off removed", body, read: false }).catch(() => {});
  void filterByPref([other], "expenseAdded")
    .then(ids => sendPushToUsers(ids, { title: "One-off removed", body, data: { type: "direct_payment_deleted" } }))
    .catch(() => {});
  res.sendStatus(204);
});

export default router;
