import { actorName, pushToGroupExceptActor } from "../lib/push";
import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { groupCurrencyOf, lockRate } from "../lib/fxRates";
import { db, settlementsTable, groupMembersTable } from "@workspace/db";
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

async function validateSettlement(
  groupId: string,
  fromMemberKey: string,
  toMemberKey: string,
  amount: number,
): Promise<string | null> {
  if (!Number.isFinite(amount) || amount <= 0) return "Settlement amount must be greater than zero";
  if (fromMemberKey === toMemberKey) return "A settlement must have different payer and recipient";
  const members = await db
    .select({ memberKey: groupMembersTable.memberKey })
    .from(groupMembersTable)
    .where(eq(groupMembersTable.groupId, groupId));
  const allowed = new Set(members.map(member => member.memberKey));
  if (!allowed.has(fromMemberKey) || !allowed.has(toMemberKey)) {
    return "Both settlement parties must be members of this group";
  }
  return null;
}

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
    const validationError = await validateSettlement(
      groupId,
      b.fromMemberKey,
      b.toMemberKey,
      b.amount,
    );
    if (validationError) {
      res.status(400).json({ error: validationError });
      return;
    }
    const groupCurrency = await groupCurrencyOf(groupId);
    let fx = await lockRate(b.currency, groupCurrency, null);
    // A payment that clears a debt in another currency carries its exact rate so nothing
    // is left over. Accept it when it is within 10% of the market rate.
    if (b.fxRate && b.fxRate > 0 && b.currency !== groupCurrency) {
      const market = fx.fxRate ? Number(fx.fxRate) : null;
      if (market === null || Math.abs(b.fxRate - market) / market <= 0.1) {
        fx = { fxRate: String(b.fxRate), fxRateCurrency: groupCurrency };
      }
    }
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
            ...fx,
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
      void pushToGroupExceptActor(
        groupId,
        req.localUser!.id,
        (groupName) => ({
          title: groupName,
          body: `${actorName(req.localUser)} recorded a payment of ${b.amount} ${b.currency}`,
        }),
        { type: "settlement_recorded", settlementId: settlement.id },
        "settlement",
      [b.fromMemberKey, b.toMemberKey],
    );
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
    if (!m.isAdmin && settlement.recordedByUserId !== req.localUser!.id) {
      res.status(403).json({ error: "Only the settlement creator or a group admin can delete a settlement" });
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
