import { Router, type IRouter } from "express";
import { eq, inArray } from "drizzle-orm";
import { db, recurringExpensesTable } from "@workspace/db";
import {
  ListAllRecurringResponse,
  ListGroupRecurringResponse,
  CreateRecurringBody,
  UpdateRecurringBody,
  UpdateRecurringResponse,
  RunRecurringResponse,
} from "@workspace/api-zod";
import { requireAuth } from "../lib/auth";
import { getMembership, recordAudit } from "../lib/authz";
import { withIdempotency } from "../lib/idempotency";
import { param } from "../lib/params";
import { serializeRecurring } from "../lib/serialize";
import { runDueRecurring, groupIdsForUser } from "../lib/recurring";

const router: IRouter = Router();

type Split = {
  memberKey: string;
  amount: number;
  percentage?: number | null;
  paid?: number | null;
};

const normalizeSplits = (splits: Split[]) =>
  splits.map((s) => ({
    memberKey: s.memberKey,
    amount: s.amount,
    percentage: s.percentage ?? null,
    paid: s.paid ?? null,
  }));

function isValidTimeZone(timeZone: unknown): timeZone is string {
  if (typeof timeZone !== "string" || timeZone.length === 0) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone }).format();
    return true;
  } catch {
    return false;
  }
}

router.get("/recurring", requireAuth, async (req, res): Promise<void> => {
  const groupIds = await groupIdsForUser(req.localUser!.id);
  if (groupIds.length === 0) {
    res.json(ListAllRecurringResponse.parse([]));
    return;
  }
  const rows = await db
    .select()
    .from(recurringExpensesTable)
    .where(inArray(recurringExpensesTable.groupId, groupIds));
  res.json(ListAllRecurringResponse.parse(rows.map(serializeRecurring)));
});

router.post("/recurring/run", requireAuth, async (req, res): Promise<void> => {
  await withIdempotency(req, res, async (record) => {
    const groupIds = await groupIdsForUser(req.localUser!.id);
    const generated = await runDueRecurring(
      groupIds,
      req.localUser!.id,
      new Date(),
    );
    const payload = RunRecurringResponse.parse({
      firedCount: generated.length,
      generatedExpenseIds: generated,
    });
    record(200, payload);
    res.status(200).json(payload);
  });
});

router.get(
  "/groups/:groupId/recurring",
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
      .from(recurringExpensesTable)
      .where(eq(recurringExpensesTable.groupId, groupId));
    res.json(ListGroupRecurringResponse.parse(rows.map(serializeRecurring)));
  },
);

router.post(
  "/groups/:groupId/recurring",
  requireAuth,
  async (req, res): Promise<void> => {
    const groupId = param(req, "groupId");
    const parsed = CreateRecurringBody.safeParse(req.body);
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
    const requestedTimeZone = (b as typeof b & { timeZone?: string }).timeZone;
    if (requestedTimeZone !== undefined && !isValidTimeZone(requestedTimeZone)) {
      res.status(400).json({ error: "Invalid IANA timezone" });
      return;
    }
    await withIdempotency(req, res, async (record) => {
      const [row] = await db
        .insert(recurringExpensesTable)
        .values({
          groupId,
          description: b.description,
          amount: String(b.amount),
          currency: b.currency,
          paidByMemberKey: b.paidByMemberKey,
          splitType: b.splitType ?? "equal",
          splits: normalizeSplits((b.splits ?? []) as Split[]) as never,
          category: b.category ?? "other",
          frequency: b.frequency,
          customDays: b.customDays ?? null,
          intervalMonths: b.intervalMonths ?? null,
          intervalWeeks: b.intervalWeeks ?? null,
          intervalDays: b.intervalDays ?? null,
          dayOfWeek: b.dayOfWeek ?? null,
          timeOfDay: b.timeOfDay ?? null,
          timeZone: requestedTimeZone ?? null,
          endType: b.endType ?? "never",
          endCount: b.endCount ?? null,
          endDate: b.endDate ?? null,
          nextDueAt: b.nextDueAt,
          isActive: b.isActive ?? true,
        } as any)
        .returning();
      await recordAudit(db, {
        entityType: "recurring",
        entityId: row!.id,
        groupId,
        action: "created",
        changedByUserId: req.localUser!.id,
      });
      const payload = serializeRecurring(row!);
      record(201, payload);
      res.status(201).json(payload);
    });
  },
);

router.patch(
  "/recurring/:recurringId",
  requireAuth,
  async (req, res): Promise<void> => {
    const recurringId = param(req, "recurringId");
    const parsed = UpdateRecurringBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const [existing] = await db
      .select()
      .from(recurringExpensesTable)
      .where(eq(recurringExpensesTable.id, recurringId))
      .limit(1);
    if (!existing) {
      res.status(404).json({ error: "Recurring schedule not found" });
      return;
    }
    const m = await getMembership(existing.groupId, req.localUser!.id);
    if (!m?.isMember) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    const b = parsed.data;
    const requestedTimeZone = (b as typeof b & { timeZone?: string }).timeZone;
    if (requestedTimeZone !== undefined && !isValidTimeZone(requestedTimeZone)) {
      res.status(400).json({ error: "Invalid IANA timezone" });
      return;
    }
    const patch: Record<string, unknown> = {};
    if (b.description !== undefined) patch.description = b.description;
    if (b.amount !== undefined) patch.amount = String(b.amount);
    if (b.currency !== undefined) patch.currency = b.currency;
    if (b.paidByMemberKey !== undefined)
      patch.paidByMemberKey = b.paidByMemberKey;
    if (b.splitType !== undefined) patch.splitType = b.splitType;
    if (b.splits !== undefined)
      patch.splits = normalizeSplits(b.splits as Split[]) as never;
    if (b.category !== undefined) patch.category = b.category;
    if (b.frequency !== undefined) patch.frequency = b.frequency;
    if (b.customDays !== undefined) patch.customDays = b.customDays;
    if (b.intervalMonths !== undefined) patch.intervalMonths = b.intervalMonths;
    if (b.intervalWeeks !== undefined) patch.intervalWeeks = b.intervalWeeks;
    if (b.intervalDays !== undefined) patch.intervalDays = b.intervalDays;
    if (b.dayOfWeek !== undefined) patch.dayOfWeek = b.dayOfWeek;
    if (b.timeOfDay !== undefined) patch.timeOfDay = b.timeOfDay;
    if (requestedTimeZone !== undefined) patch.timeZone = requestedTimeZone;
    if (b.endType !== undefined) patch.endType = b.endType;
    if (b.endCount !== undefined) patch.endCount = b.endCount;
    if (b.endDate !== undefined) patch.endDate = b.endDate;
    if (b.nextDueAt !== undefined) patch.nextDueAt = b.nextDueAt;
    if (b.isActive !== undefined) patch.isActive = b.isActive;

    const [updated] = await db
      .update(recurringExpensesTable)
      .set(patch)
      .where(eq(recurringExpensesTable.id, recurringId))
      .returning();
    await recordAudit(db, {
      entityType: "recurring",
      entityId: recurringId,
      groupId: existing.groupId,
      action: "updated",
      changedByUserId: req.localUser!.id,
    });
    res.json(UpdateRecurringResponse.parse(serializeRecurring(updated!)));
  },
);

router.delete(
  "/recurring/:recurringId",
  requireAuth,
  async (req, res): Promise<void> => {
    const recurringId = param(req, "recurringId");
    const [existing] = await db
      .select()
      .from(recurringExpensesTable)
      .where(eq(recurringExpensesTable.id, recurringId))
      .limit(1);
    if (!existing) {
      res.status(404).json({ error: "Recurring schedule not found" });
      return;
    }
    const m = await getMembership(existing.groupId, req.localUser!.id);
    if (!m?.isMember) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    await db
      .delete(recurringExpensesTable)
      .where(eq(recurringExpensesTable.id, recurringId));
    await recordAudit(db, {
      entityType: "recurring",
      entityId: recurringId,
      groupId: existing.groupId,
      action: "deleted",
      changedByUserId: req.localUser!.id,
    });
    res.sendStatus(204);
  },
);

export default router;
