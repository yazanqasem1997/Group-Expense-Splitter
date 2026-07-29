import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, settlementsTable } from "@workspace/db";
import {
  ListSettlementsResponse,
  CreateSettlementBody,
} from "@workspace/api-zod";
import { requireAuth } from "../lib/auth";
import { getMembership, recordAudit } from "../lib/authz";
import { withIdempotency } from "../lib/idempotency";
import { param } from "../lib/params";
import { serializeSettlement } from "../lib/serialize";

const router: IRouter = Router();

router.get(
  "/groups/:groupId/settlements",
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
      .from(settlementsTable)
      .where(eq(settlementsTable.groupId, groupId));
    res.json(ListSettlementsResponse.parse(rows.map(serializeSettlement)));
  },
);

router.post(
  "/groups/:groupId/settlements",
  requireAuth,
  async (req, res): Promise<void> => {
    const groupId = param(req, "groupId");
    const parsed = CreateSettlementBody.safeParse(req.body);
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
    const b = parsed.data;
    await withIdempotency(req, res, async (record) => {
      const settlement = await db.transaction(async (tx) => {
        const [row] = await tx
          .insert(settlementsTable)
          .values({
            groupId,
            fromMemberKey: b.fromMemberKey,
            toMemberKey: b.toMemberKey,
            amount: String(b.amount),
            currency: b.currency,
            note: b.note ?? null,
            recordedByUserId: req.localUser!.id,
          })
          .returning();
        await recordAudit(tx as never, {
          entityType: "settlement",
          entityId: row!.id,
          groupId,
          action: "created",
          changedByUserId: req.localUser!.id,
        });
        return row!;
      });
      const payload = serializeSettlement(settlement);
      record(201, payload);
      res.status(201).json(payload);
    });
  },
);

router.delete(
  "/settlements/:settlementId",
  requireAuth,
  async (req, res): Promise<void> => {
    const settlementId = param(req, "settlementId");
    const [settlement] = await db
      .select()
      .from(settlementsTable)
      .where(eq(settlementsTable.id, settlementId))
      .limit(1);
    if (!settlement) {
      res.status(404).json({ error: "Settlement not found" });
      return;
    }
    const m = await getMembership(settlement.groupId, req.localUser!.id);
    if (!m?.isMember) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    await db.transaction(async (tx) => {
      await tx
        .delete(settlementsTable)
        .where(eq(settlementsTable.id, settlementId));
      await recordAudit(tx as never, {
        entityType: "settlement",
        entityId: settlementId,
        groupId: settlement.groupId,
        action: "deleted",
        changedByUserId: req.localUser!.id,
      });
    });
    res.sendStatus(204);
  },
);

export default router;
