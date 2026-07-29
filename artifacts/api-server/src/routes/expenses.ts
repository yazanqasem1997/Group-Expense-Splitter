import { Router, type IRouter } from "express";
import { eq, inArray } from "drizzle-orm";
import {
  db,
  expensesTable,
  expenseSplitsTable,
  expenseCommentsTable,
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
    const splits = (b.splits ?? []) as Split[];

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
    const b = parsed.data;
    const splits = b.splits as Split[] | undefined;

    const result = await db.transaction(async (tx) => {
      const patch: Record<string, unknown> = {};
      if (b.description !== undefined) patch.description = b.description;
      if (b.amount !== undefined) patch.amount = String(b.amount);
      if (b.currency !== undefined) patch.currency = b.currency;
      if (b.paidByMemberKey !== undefined)
        patch.paidByMemberKey = b.paidByMemberKey;
      if (b.splitType !== undefined) patch.splitType = b.splitType;
      if (b.category !== undefined) patch.category = b.category;
      if (b.notes !== undefined) patch.notes = b.notes;
      if (b.reactions !== undefined) patch.reactions = b.reactions as never;

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
