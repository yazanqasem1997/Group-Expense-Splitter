import { actorName, pushToGroupExceptActor } from "../lib/push";
import { Router, type IRouter } from "express";
import { eq, inArray } from "drizzle-orm";
import { groupCurrencyOf, lockRate } from "../lib/fxRates";
import { rewardReferralIfDue } from "../lib/plan";
import {
  db,
  expensesTable,
  expenseSplitsTable,
  expenseCommentsTable,
  receiptSessionsTable,
  groupMembersTable,
} from "@workspace/db";
import {
  ListExpensesResponse,
  CreateExpenseBody,
  GetExpenseResponse,
  UpdateExpenseBody,
  UpdateExpenseResponse,
  AddExpenseCommentBody,
} from "@workspace/api-zod";
import { requireAuth } from "../lib/auth";
import { getMembership, recordAudit } from "../lib/authz";
import { withIdempotency } from "../lib/idempotency";
import { param } from "../lib/params";
import { serializeExpense, serializeComment } from "../lib/serialize";

const router: IRouter = Router();

type Split = {
  memberKey: string;
  amount: number;
  percentage?: number | null;
  paid?: number | null;
};

async function validateExpenseFinancials(
  groupId: string,
  amount: number,
  paidByMemberKey: string,
  splits: Split[],
): Promise<string | null> {
  if (!Number.isFinite(amount) || amount <= 0) return "Expense amount must be greater than zero";
  if (splits.length === 0) return "An expense must include at least one split";

  const members = await db
    .select({ memberKey: groupMembersTable.memberKey })
    .from(groupMembersTable)
    .where(eq(groupMembersTable.groupId, groupId));
  const allowed = new Set(members.map(member => member.memberKey));
  if (!allowed.has(paidByMemberKey)) return "The payer must be a member of this group";

  const seen = new Set<string>();
  for (const split of splits) {
    if (!allowed.has(split.memberKey)) return "Every split must belong to a group member";
    if (seen.has(split.memberKey)) return "Each group member may appear only once in the splits";
    if (!Number.isFinite(split.amount) || split.amount < 0) return "Split amounts must be valid and non-negative";
    if (split.paid != null && (!Number.isFinite(split.paid) || split.paid < 0)) {
      return "Paid amounts must be valid and non-negative";
    }
    seen.add(split.memberKey);
  }

  // Compare money in minor units rather than with floating-point decimals.
  // Equal splits can be one cent short after rounding (e.g. 5,500 / 3 =
  // 1,833.33 each), which is still a valid representation of the expense.
  const amountCents = Math.round(amount * 100);
  const splitTotalCents = splits.reduce(
    (sum, split) => sum + Math.round(split.amount * 100),
    0,
  );
  if (Math.abs(splitTotalCents - amountCents) > 1) {
    return "Split amounts must add up to the expense amount";
  }
  const paidSplits = splits.filter((split) => split.paid != null);
  if (paidSplits.length > 0) {
    const paidTotalCents = paidSplits.reduce(
      (sum, split) => sum + Math.round((split.paid ?? 0) * 100),
      0,
    );
    if (Math.abs(paidTotalCents - amountCents) > 1) {
      return "Paid amounts must add up to the expense amount";
    }
  }
  if (splits.every(split => split.percentage != null)) {
    const percentageBasisPoints = splits.reduce(
      (sum, split) => sum + Math.round(Number(split.percentage) * 100),
      0,
    );
    if (Math.abs(percentageBasisPoints - 10_000) > 1) {
      return "Split percentages must add up to 100%";
    }
  }
  return null;
}

/** Make shares add up to the expense total exactly (absorbs a 1-cent rounding gap). */
function exactSplits(splits: Split[], amount: number): Split[] {
  if (splits.length === 0) return splits;
  const target = Math.round(amount * 100);
  const total = splits.reduce((sum, sp) => sum + Math.round(sp.amount * 100), 0);
  const diff = target - total;
  if (diff === 0 || Math.abs(diff) > splits.length) return splits;
  let idx = 0;
  splits.forEach((sp, i) => { if (sp.amount > splits[idx]!.amount) idx = i; });
  return splits.map((sp, i) => (i === idx ? { ...sp, amount: (Math.round(sp.amount * 100) + diff) / 100 } : sp));
}

function dateOnly(value: Date | null | undefined): string | null {
  return value ? value.toISOString().slice(0, 10) : null;
}

/** One-off expenses can't be dated in the future (one day of slack covers time zones). */
function isFutureDate(value: string | null | undefined): boolean {
  if (!value) return false;
  return value > new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}
const FUTURE_DATE_ERROR = "The payment date can't be in the future. Use a recurring expense for future payments.";

async function loadExpenseWithGroup(expenseId: string) {
  const [expense] = await db
    .select()
    .from(expensesTable)
    .where(eq(expensesTable.id, expenseId))
    .limit(1);
  return expense ?? null;
}

async function fetchSplitsAndComments(expenseId: string) {
  const [splits, comments] = await Promise.all([
    db
      .select()
      .from(expenseSplitsTable)
      .where(eq(expenseSplitsTable.expenseId, expenseId)),
    db
      .select()
      .from(expenseCommentsTable)
      .where(eq(expenseCommentsTable.expenseId, expenseId)),
  ]);
  return { splits, comments };
}

router.get(
  "/groups/:groupId/expenses",
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
    const expenses = await db
      .select()
      .from(expensesTable)
      .where(eq(expensesTable.groupId, groupId));
    const ids = expenses.map((e) => e.id);
    const [splits, comments] =
      ids.length > 0
        ? await Promise.all([
            db
              .select()
              .from(expenseSplitsTable)
              .where(inArray(expenseSplitsTable.expenseId, ids)),
            db
              .select()
              .from(expenseCommentsTable)
              .where(inArray(expenseCommentsTable.expenseId, ids)),
          ])
        : [[], []];
    const splitsBy = new Map<string, typeof splits>();
    for (const s of splits) {
      const arr = splitsBy.get(s.expenseId) ?? [];
      arr.push(s);
      splitsBy.set(s.expenseId, arr);
    }
    const commentsBy = new Map<string, typeof comments>();
    for (const c of comments) {
      const arr = commentsBy.get(c.expenseId) ?? [];
      arr.push(c);
      commentsBy.set(c.expenseId, arr);
    }
    res.json(
      ListExpensesResponse.parse(
        expenses.map((e) =>
          serializeExpense(
            e,
            splitsBy.get(e.id) ?? [],
            commentsBy.get(e.id) ?? [],
          ),
        ),
      ),
    );
  },
);

router.post(
  "/groups/:groupId/expenses",
  requireAuth,
  async (req, res): Promise<void> => {
    const groupId = param(req, "groupId");
    const parsed = CreateExpenseBody.safeParse(req.body);
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
    const splits = exactSplits((b.splits ?? []) as Split[], b.amount);
    const financialError = await validateExpenseFinancials(
      groupId,
      b.amount,
      b.paidByMemberKey,
      splits,
    );
    if (financialError) {
      res.status(400).json({ error: financialError });
      return;
    }

    if (isFutureDate(dateOnly(b.paymentDate))) {
      res.status(400).json({ error: FUTURE_DATE_ERROR });
      return;
    }
    const fx = await lockRate(b.currency, await groupCurrencyOf(groupId), dateOnly(b.paymentDate));
    await withIdempotency(req, res, async (record) => {
      const result = await db.transaction(async (tx) => {
        const [expense] = await tx
          .insert(expensesTable)
          .values({
            groupId,
            description: b.description,
            amount: String(b.amount),
            currency: b.currency,
            paidByMemberKey: b.paidByMemberKey,
            splitType: b.splitType ?? "equal",
            category: b.category ?? "other",
            notes: b.notes ?? null,
            addedByUserId: req.localUser!.id,
            reactions: (b.reactions ?? null) as never,
            paymentDate: dateOnly(b.paymentDate),
            receiptId: b.receiptId ?? null,
            ...fx,
            categoryBreakdown: (b.categoryBreakdown ?? null) as never,
          })
          .returning();

        if (splits.length > 0) {
          await tx.insert(expenseSplitsTable).values(
            splits.map((s) => ({
              expenseId: expense!.id,
              memberKey: s.memberKey,
              amount: String(s.amount),
              percentage: s.percentage != null ? String(s.percentage) : null,
              paid: s.paid != null ? String(s.paid) : null,
            })),
          );
        }

        if (b.receiptId) {
          await tx
            .update(receiptSessionsTable)
            .set({ linkedExpenseId: expense!.id, status: "linked" })
            .where(eq(receiptSessionsTable.id, b.receiptId));
        }

        await recordAudit(tx as never, {
          entityType: "expense",
          entityId: expense!.id,
          groupId,
          action: "created",
          changedByUserId: req.localUser!.id,
        });

        const insertedSplits = await tx
          .select()
          .from(expenseSplitsTable)
          .where(eq(expenseSplitsTable.expenseId, expense!.id));
        return { expense: expense!, splits: insertedSplits };
      });

      const payload = GetExpenseResponse.parse(
        serializeExpense(result.expense, result.splits, []),
      );
      void rewardReferralIfDue(req.localUser!.id).catch(() => {});
        void pushToGroupExceptActor(
          groupId,
          req.localUser!.id,
          (groupName) => ({
            title: groupName,
            body: `${actorName(req.localUser)} added "${b.description}" · ${b.amount} ${b.currency}`,
          }),
          { type: "expense_added", expenseId: result.expense.id },
          "expenseAdded",
          [result.expense.paidByMemberKey, ...result.splits.map(s => s.memberKey)],
        );
      record(201, payload);
      res.status(201).json(payload);
    });
  },
);

router.get(
  "/expenses/:expenseId",
  requireAuth,
  async (req, res): Promise<void> => {
    const expenseId = param(req, "expenseId");
    const expense = await loadExpenseWithGroup(expenseId);
    if (!expense) {
      res.status(404).json({ error: "Expense not found" });
      return;
    }
    const m = await getMembership(expense.groupId, req.localUser!.id);
    if (!m?.isMember) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    const { splits, comments } = await fetchSplitsAndComments(expenseId);
    res.json(GetExpenseResponse.parse(serializeExpense(expense, splits, comments)));
  },
);

router.patch(
  "/expenses/:expenseId",
  requireAuth,
  async (req, res): Promise<void> => {
    const expenseId = param(req, "expenseId");
    const parsed = UpdateExpenseBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const expense = await loadExpenseWithGroup(expenseId);
    if (!expense) {
      res.status(404).json({ error: "Expense not found" });
      return;
    }
    const m = await getMembership(expense.groupId, req.localUser!.id);
    if (!m?.isMember) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    if (!m.isAdmin && expense.addedByUserId !== req.localUser!.id) {
      res.status(403).json({ error: "Only the expense creator or a group admin can edit an expense" });
      return;
    }
    const b = parsed.data;
    const splits = b.splits && b.amount != null ? exactSplits(b.splits as Split[], b.amount) : (b.splits as Split[] | undefined);
    const existingSplits = await db
      .select()
      .from(expenseSplitsTable)
      .where(eq(expenseSplitsTable.expenseId, expenseId));
    const effectiveSplits = splits ?? existingSplits.map(split => ({
      memberKey: split.memberKey,
      amount: Number(split.amount),
      percentage: split.percentage == null ? null : Number(split.percentage),
      paid: split.paid == null ? null : Number(split.paid),
    }));
    const financialError = await validateExpenseFinancials(
      expense.groupId,
      b.amount ?? Number(expense.amount),
      b.paidByMemberKey ?? expense.paidByMemberKey,
      effectiveSplits,
    );
    if (financialError) {
      res.status(400).json({ error: financialError });
      return;
    }

    if (b.paymentDate !== undefined && isFutureDate(dateOnly(b.paymentDate))) {
      res.status(400).json({ error: FUTURE_DATE_ERROR });
      return;
    }
    // Re-lock the rate only when the currency or the payment day changes.
    const fx = b.currency !== undefined || b.paymentDate !== undefined
      ? await lockRate(b.currency ?? expense.currency, await groupCurrencyOf(expense.groupId), b.paymentDate === undefined ? expense.paymentDate : dateOnly(b.paymentDate))
      : null;
    const result = await db.transaction(async (tx) => {
      const patch: Record<string, unknown> = {};
      if (b.description !== undefined) patch.description = b.description;
      if (b.amount !== undefined) patch.amount = String(b.amount);
      if (b.currency !== undefined) patch.currency = b.currency;
      if (b.paidByMemberKey !== undefined)
        patch.paidByMemberKey = b.paidByMemberKey;
      if (b.splitType !== undefined) patch.splitType = b.splitType;
      if (b.category !== undefined) patch.category = b.category;
      if (b.categoryBreakdown !== undefined) patch.categoryBreakdown = b.categoryBreakdown as never;
      if (b.notes !== undefined) patch.notes = b.notes;
      if (b.reactions !== undefined) patch.reactions = b.reactions as never;
      if (b.paymentDate !== undefined) {
        patch.paymentDate = dateOnly(b.paymentDate);
      }
      if (fx) Object.assign(patch, fx);

      const [updated] =
        Object.keys(patch).length > 0
          ? await tx
              .update(expensesTable)
              .set(patch)
              .where(eq(expensesTable.id, expenseId))
              .returning()
          : [expense];

      if (splits !== undefined) {
        await tx
          .delete(expenseSplitsTable)
          .where(eq(expenseSplitsTable.expenseId, expenseId));
        if (splits.length > 0) {
          await tx.insert(expenseSplitsTable).values(
            splits.map((s) => ({
              expenseId,
              memberKey: s.memberKey,
              amount: String(s.amount),
              percentage: s.percentage != null ? String(s.percentage) : null,
              paid: s.paid != null ? String(s.paid) : null,
            })),
          );
        }
      }

      await recordAudit(tx as never, {
        entityType: "expense",
        entityId: expenseId,
        groupId: expense.groupId,
        action: "updated",
        changedByUserId: req.localUser!.id,
      });

      const [newSplits, comments] = await Promise.all([
        tx
          .select()
          .from(expenseSplitsTable)
          .where(eq(expenseSplitsTable.expenseId, expenseId)),
        tx
          .select()
          .from(expenseCommentsTable)
          .where(eq(expenseCommentsTable.expenseId, expenseId)),
      ]);
      return { updated: updated!, splits: newSplits, comments };
    });

    res.json(
      UpdateExpenseResponse.parse(
        serializeExpense(result.updated, result.splits, result.comments),
      ),
    );
  },
);

router.delete(
  "/expenses/:expenseId",
  requireAuth,
  async (req, res): Promise<void> => {
    const expenseId = param(req, "expenseId");
    const expense = await loadExpenseWithGroup(expenseId);
    if (!expense) {
      res.status(404).json({ error: "Expense not found" });
      return;
    }
    const m = await getMembership(expense.groupId, req.localUser!.id);
    if (!m?.isMember) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    if (!m.isAdmin && expense.addedByUserId !== req.localUser!.id) {
      res.status(403).json({ error: "Only the expense creator or a group admin can delete an expense" });
      return;
    }
    await db.transaction(async (tx) => {
      await tx.delete(expensesTable).where(eq(expensesTable.id, expenseId));
      await recordAudit(tx as never, {
        entityType: "expense",
        entityId: expenseId,
        groupId: expense.groupId,
        action: "deleted",
        changedByUserId: req.localUser!.id,
      });
    });
    res.sendStatus(204);
  },
);

router.post(
  "/expenses/:expenseId/comments",
  requireAuth,
  async (req, res): Promise<void> => {
    const expenseId = param(req, "expenseId");
    const parsed = AddExpenseCommentBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const expense = await loadExpenseWithGroup(expenseId);
    if (!expense) {
      res.status(404).json({ error: "Expense not found" });
      return;
    }
    const m = await getMembership(expense.groupId, req.localUser!.id);
    if (!m?.isMember) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    // Derive the actor's memberKey from their authenticated membership row.
    // Reject any attempt to impersonate a different member by supplying a
    // mismatched memberKey in the request body.
    const authenticatedMemberKey = m.member?.memberKey;
    if (!authenticatedMemberKey) {
      res.status(403).json({ error: "No membership record found for your account in this group" });
      return;
    }
    if (parsed.data.memberKey !== authenticatedMemberKey) {
      res.status(403).json({ error: "memberKey does not match your group membership" });
      return;
    }

    const [comment] = await db
      .insert(expenseCommentsTable)
      .values({
        expenseId,
        memberKey: authenticatedMemberKey,
        text: parsed.data.text,
      })
      .returning();
    res.status(201).json(serializeComment(comment!));
  },
);

export default router;
