import { and, eq, inArray, lte, sql } from "drizzle-orm";
import {
  db,
  recurringExpensesTable,
  expensesTable,
  expenseSplitsTable,
  groupsTable,
  groupMembersTable,
  type RecurringExpense,
} from "@workspace/db";
import { recordAudit } from "./authz";

const FREQUENCY_DAYS: Record<string, number> = {
  weekly: 7,
  biweekly: 14,
  monthly: 30,
  quarterly: 90,
  custom: 30,
};

type JsonSplit = {
  memberKey: string;
  amount: number | string;
  percentage?: number | string | null;
  paid?: number | string | null;
};

/** Compute the next due instant after a firing, honoring day-of-week snapping. */
export function computeNextDue(r: RecurringExpense, from: Date): Date {
  const intervalDays =
    r.frequency === "custom" && r.customDays
      ? r.customDays
      : (FREQUENCY_DAYS[r.frequency] ?? 30);
  let next = new Date(from.getTime() + intervalDays * 24 * 60 * 60 * 1000);
  if (
    r.dayOfWeek != null &&
    (r.frequency === "weekly" || r.frequency === "biweekly")
  ) {
    const diff = (r.dayOfWeek - next.getDay() + 7) % 7;
    if (diff > 0) {
      next = new Date(next.getTime() + diff * 24 * 60 * 60 * 1000);
    }
  }
  return next;
}

/** Whether a schedule should stop after this firing based on its end rule. */
function hasReachedEnd(r: RecurringExpense, occurrenceAfter: number): boolean {
  if (r.endType === "count" && r.endCount != null) {
    return occurrenceAfter >= r.endCount;
  }
  if (r.endType === "date" && r.endDate) {
    return new Date(`${r.endDate}T23:59:59`) < new Date();
  }
  return false;
}

/**
 * Materialize all recurring schedules that are due (nextDueAt <= now) for the
 * given group ids. Runs inside a single transaction and advances each
 * schedule's cursor. Idempotency is provided by the `lastRunAt` guard combined
 * with the caller-supplied Idempotency-Key: if the same schedule is processed
 * twice within the same wall-clock second the second pass is skipped.
 *
 * Returns the ids of the expenses that were generated.
 */
export async function runDueRecurring(
  groupIds: string[],
  changedByUserId: string,
  now: Date,
): Promise<string[]> {
  if (groupIds.length === 0) return [];

  return db.transaction(async (tx) => {
    // Serialize recurring materialization across API instances. The lock is
    // transaction-scoped and is released automatically on commit/rollback.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext('spliteasy_recurring'))`);

    const due = await tx
      .select()
      .from(recurringExpensesTable)
      .where(
        and(
          inArray(recurringExpensesTable.groupId, groupIds),
          eq(recurringExpensesTable.isActive, true),
          lte(recurringExpensesTable.nextDueAt, now),
        ),
      );

    const generated: string[] = [];

    for (const r of due) {
      // Guard against double-firing when nextDueAt hasn't advanced but a run
      // already happened this second (e.g. concurrent retries).
      if (r.lastRunAt && r.lastRunAt.getTime() >= r.nextDueAt.getTime()) {
        continue;
      }

      const [expense] = await tx
        .insert(expensesTable)
        .values({
          groupId: r.groupId,
          description: r.description,
          amount: r.amount,
          currency: r.currency,
          paidByMemberKey: r.paidByMemberKey,
          splitType: r.splitType,
          category: r.category,
          recurringId: r.id,
          addedByUserId: changedByUserId,
        })
        .returning();

      const splits = (Array.isArray(r.splits) ? r.splits : []) as JsonSplit[];
      if (splits.length > 0) {
        await tx.insert(expenseSplitsTable).values(
          splits.map((s) => ({
            expenseId: expense!.id,
            memberKey: s.memberKey,
            amount: String(s.amount),
            percentage:
              s.percentage != null ? String(s.percentage) : null,
            paid: s.paid != null ? String(s.paid) : null,
          })),
        );
      }

      const occurrenceAfter = r.occurrenceCount + 1;
      const nextDue = computeNextDue(r, r.nextDueAt);
      const stop = hasReachedEnd(r, occurrenceAfter);

      await tx
        .update(recurringExpensesTable)
        .set({
          occurrenceCount: occurrenceAfter,
          nextDueAt: nextDue,
          lastRunAt: now,
          isActive: stop ? false : r.isActive,
        })
        .where(eq(recurringExpensesTable.id, r.id));

      await recordAudit(tx as never, {
        entityType: "expense",
        entityId: expense!.id,
        groupId: r.groupId,
        action: "created",
        changedByUserId,
        fieldChanges: [{ field: "recurringId", oldValue: "", newValue: r.id }],
      });

      generated.push(expense!.id);
    }

    return generated;
  });
}

/** Resolve every group id the user participates in (owner or member). */
export async function groupIdsForUser(userId: string): Promise<string[]> {
  const [owned, memberOf] = await Promise.all([
    db
      .select({ id: groupsTable.id })
      .from(groupsTable)
      .where(eq(groupsTable.createdByUserId, userId)),
    db
      .select({ groupId: groupMembersTable.groupId })
      .from(groupMembersTable)
      .where(eq(groupMembersTable.userId, userId)),
  ]);
  return Array.from(
    new Set([...owned.map((r) => r.id), ...memberOf.map((r) => r.groupId)]),
  );
}
