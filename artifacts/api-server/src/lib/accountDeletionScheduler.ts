import { and, eq, lte } from "drizzle-orm";
import { clerkClient } from "@clerk/express";
import { db, groupsTable, usersTable } from "@workspace/db";
import { logger } from "./logger";

const RUN_INTERVAL_MS = 60_000;
const RECOVERY_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

export const ACCOUNT_DELETION_RECOVERY_WINDOW_MS = RECOVERY_WINDOW_MS;

async function finalizeDueAccountDeletions(): Promise<void> {
  const due = await db
    .select({
      id: usersTable.id,
      clerkUserId: usersTable.clerkUserId,
    })
    .from(usersTable)
    .where(
      and(
        lte(usersTable.deletionScheduledFor, new Date()),
      ),
    );

  for (const user of due) {
    try {
      await clerkClient.users.deleteUser(user.clerkUserId);
      await db.transaction(async tx => {
        // Owned groups are deleted with their shared records. Membership in
        // groups owned by someone else is detached by the FK's SET NULL rule.
        await tx.delete(groupsTable).where(eq(groupsTable.createdByUserId, user.id));
        await tx.delete(usersTable).where(eq(usersTable.id, user.id));
      });
      logger.info({ userId: user.id }, "Finalized scheduled account deletion");
    } catch (error) {
      logger.error({ err: error, userId: user.id }, "Scheduled account deletion failed; will retry");
    }
  }
}

export function startAccountDeletionScheduler(): () => void {
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      await finalizeDueAccountDeletions();
    } catch (error) {
      logger.error({ err: error }, "Scheduled account deletion sweep failed");
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