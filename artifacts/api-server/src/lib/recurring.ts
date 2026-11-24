import { and, eq, inArray, lte, sql } from "drizzle-orm";
import { groupCurrencyOf, lockRate } from "./fxRates";
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

const FALLBACK_TIME_ZONE = "UTC";

type JsonSplit = {
  memberKey: string;
  amount: number | string;
  percentage?: number | string | null;
  paid?: number | string | null;
};

type RecurringWithTimeZone = RecurringExpense & { timeZone?: string | null };

type DateParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

function datePartsInTimeZone(date: Date, timeZone: string): DateParts {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const values: Record<string, number> = {};
  parts.forEach((part) => {
    if (
      part.type === "year" ||
      part.type === "month" ||
      part.type === "day" ||
      part.type === "hour" ||
      part.type === "minute" ||
      part.type === "second"
    ) {
      values[part.type] = Number(part.value);
    }
  });
  return {
    year: values.year,
    month: values.month,
    day: values.day,
    hour: values.hour,
    minute: values.minute,
    second: values.second,
  };
}

export function dateOnlyInTimeZone(date: Date, timeZone?: string): string {
  try {
    const { year, month, day } = datePartsInTimeZone(
      date,
      timeZone || FALLBACK_TIME_ZONE,
    );
    return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  } catch {
    return date.toISOString().slice(0, 10);
  }
}

function offsetAt(instant: Date, timeZone: string): number {
  const parts = datePartsInTimeZone(instant, timeZone);
  return (
    Date.UTC(
      parts.year,
      parts.month - 1,
      parts.day,
      parts.hour,
      parts.minute,
      parts.second,
    ) - instant.getTime()
  );
}

export function dateOnlyToInstant(dateOnly: string, timeZone?: string): Date {
  const zone = timeZone || FALLBACK_TIME_ZONE;
  const [year, month, day] = dateOnly.split("-").map(Number);
  const wallClock = Date.UTC(year, month - 1, day);
  try {
    let instant = wallClock - offsetAt(new Date(wallClock), zone);
    instant = wallClock - offsetAt(new Date(instant), zone);
    return new Date(instant);
  } catch {
    return new Date(`${dateOnly}T00:00:00Z`);
  }
}

function addRecurringInterval(
  dateOnly: string,
  frequency: string,
  customDays?: number | null,
  intervalMonths?: number | null,
  intervalWeeks?: number | null,
  intervalDays?: number | null,
): string {
  const [year, month, day] = dateOnly.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  const hasExplicitInterval =
    intervalMonths != null || intervalWeeks != null || intervalDays != null;
  if (hasExplicitInterval) {
    const months = Math.max(0, intervalMonths ?? 0);
    if (months > 0) {
      const originalDay = date.getUTCDate();
      date.setUTCDate(1);
      date.setUTCMonth(date.getUTCMonth() + months);
      const lastDay = new Date(
        Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0),
      ).getUTCDate();
      date.setUTCDate(Math.min(originalDay, lastDay));
    }
    const days =
      Math.max(0, intervalWeeks ?? 0) * 7 + Math.max(0, intervalDays ?? 0);
    date.setUTCDate(date.getUTCDate() + days);
  } else if (frequency === "monthly" || frequency === "quarterly") {
    const originalDay = date.getUTCDate();
    const months = frequency === "monthly" ? 1 : 3;
    date.setUTCDate(1);
    date.setUTCMonth(date.getUTCMonth() + months);
    const lastDay = new Date(
      Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0),
    ).getUTCDate();
    date.setUTCDate(Math.min(originalDay, lastDay));
  } else {
    const days =
      frequency === "custom"
        ? Math.max(1, customDays ?? 30)
        : frequency === "biweekly"
          ? 14
          : 7;
    date.setUTCDate(date.getUTCDate() + days);
  }
  return [
    date.getUTCFullYear(),
    String(date.getUTCMonth() + 1).padStart(2, "0"),
    String(date.getUTCDate()).padStart(2, "0"),
  ].join("-");
}

/** Compute the next due instant after a firing in the creator's timezone. */
export function computeNextDue(r: RecurringExpense, from: Date): Date {
  const schedule = r as RecurringWithTimeZone;
  const zone = schedule.timeZone || FALLBACK_TIME_ZONE;
  const dueDate = dateOnlyInTimeZone(from, zone);
  const nextDate = addRecurringInterval(
    dueDate,
    r.frequency,
    r.customDays,
    r.intervalMonths,
    r.intervalWeeks,
    r.intervalDays,
  );
  return dateOnlyToInstant(nextDate, zone);
}

/** Whether a schedule should stop after this firing based on its end rule. */
function hasReachedEnd(
  r: RecurringExpense,
  occurrenceAfter: number,
  dueAt: Date,
): boolean {
  if (r.endType === "count" && r.endCount != null) {
    return occurrenceAfter >= r.endCount;
  }
  if (r.endType === "date" && r.endDate) {
    return dateOnlyInTimeZone(
      dueAt,
      (r as RecurringWithTimeZone).timeZone ?? undefined,
    ) > r.endDate;
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
      const schedule = r as RecurringWithTimeZone;
      if (
        (r.endType === "count" &&
          r.endCount != null &&
          r.occurrenceCount >= r.endCount) ||
        (r.endType === "date" &&
          r.endDate &&
          dateOnlyInTimeZone(r.nextDueAt, schedule.timeZone ?? undefined) > r.endDate)
      ) {
        await tx
          .update(recurringExpensesTable)
          .set({ isActive: false, lastRunAt: now })
          .where(eq(recurringExpensesTable.id, r.id));
        continue;
      }

      const fx = await lockRate(r.currency, await groupCurrencyOf(r.groupId), null);
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
          paymentDate: dateOnlyInTimeZone(
            r.nextDueAt,
            (r as RecurringWithTimeZone).timeZone ?? undefined,
          ),
          recurringId: r.id,
          ...fx,
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
      const stop = hasReachedEnd(r, occurrenceAfter, r.nextDueAt);

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
