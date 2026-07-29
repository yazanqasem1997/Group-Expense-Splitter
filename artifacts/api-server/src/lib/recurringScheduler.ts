import { and, eq, lte } from "drizzle-orm";
import {
  db,
  groupsTable,
  recurringExpensesTable,
} from "@workspace/db";
import { logger } from "./logger";
import { runDueRecurring } from "./recurring";

const RUN_INTERVAL_MS = 60_000;

async function runScheduledRecurring(): Promise<void> {
  const now = new Date();
  const dueOwners = await db
    .select({
      groupId: recurringExpensesTable.groupId,
      userId: groupsTable.createdByUserId,
    })
    .from(recurringExpensesTable)
    .innerJoin(groupsTable, eq(groupsTable.id, recurringExpensesTable.groupId))
    .where(
      and(
        eq(recurringExpensesTable.isActive, true),
        lte(recurringExpensesTable.nextDueAt, now),
      ),
    );

  const groupsByOwner = new Map<string, Set<string>>();
  dueOwners.forEach(({ userId, groupId }) => {
    const groupIds = groupsByOwner.get(userId) ?? new Set<string>();
    groupIds.add(groupId);
    groupsByOwner.set(userId, groupIds);
  });

  for (const [userId, groupIds] of groupsByOwner) {
    await runDueRecurring(Array.from(groupIds), userId, now);
  }
}

export function startRecurringScheduler(): () => void {
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      await runScheduledRecurring();
    } catch (error) {
      logger.error({ err: error }, "Scheduled recurring run failed");
    } finally {
      running = false;
    }
  };

  const initial = setTimeout(() => void tick(), 5_000);
  const interval = setInterval(() => void tick(), RUN_INTERVAL_MS);
  initial.unref();
  interval.unref();
  return () => {
    clearTimeout(initial);
    clearInterval(interval);
  };
}