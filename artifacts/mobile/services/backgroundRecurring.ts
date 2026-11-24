/**
 * Background recurring-expense processor.
 *
 * Previously used expo-background-fetch (now deprecated). This module uses
 * expo-background-task, the officially supported replacement for Expo SDK 54+.
 *
 * The module must be imported at the top level of the app entry point so that
 * TaskManager.defineTask() is called before any background execution attempt.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import * as BackgroundTask from "expo-background-task";
import * as TaskManager from "expo-task-manager";
import {
  dateOnlyInTimeZone,
  nextRecurringInstant,
} from "@/utils/recurring";

// ─── Storage keys (must match AppContext.tsx) ────────────────────────────────
/** Active server-cache key — the authoritative local store for all app data. */
const SERVER_CACHE_KEY = "@spliteasy_server_cache_v1";
/** Standalone recurring schedules cache (written by saveRecurring in AppContext). */
const RECURRING_KEY = "@spliteasy_recurring";

// ─── Types (mirrored from AppContext to avoid cross-import cycles) ────────────
type RecurringFrequency = "weekly" | "biweekly" | "monthly" | "quarterly" | "custom";

const FREQUENCY_DAYS: Record<RecurringFrequency, number> = {
  weekly: 7,
  biweekly: 14,
  monthly: 30,
  quarterly: 90,
  custom: 30,
};

interface RecurringExpense {
  id: string;
  groupId: string;
  description: string;
  amount: number;
  currency: string;
  paidById: string;
  splitType: string;
  splits: unknown[];
  category: string;
  frequency: RecurringFrequency;
  customDays?: number;
  intervalMonths?: number;
  intervalWeeks?: number;
  intervalDays?: number;
  dayOfWeek?: number;
  timeOfDay?: string;
  timeZone?: string;
  endType?: "never" | "count" | "date";
  endCount?: number;
  endDate?: string;
  occurrenceCount?: number;
  nextDueAt: string;
  isActive: boolean;
  createdAt: string;
}

/** Minimal shape of the server cache written by AppContext's saveData / applyBootstrap. */
interface ServerCache {
  expenses?: unknown[];
  recurringExpenses?: RecurringExpense[];
  notifications?: unknown[];
  [key: string]: unknown;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function genId(): string {
  return Date.now().toString(36) + Math.random().toString(36).substring(2, 9);
}

function processSchedules(
  recurringExpenses: RecurringExpense[],
  now: Date
): {
  updatedRecurring: RecurringExpense[];
  newExpenses: unknown[];
  newNotifications: unknown[];
  added: number;
} {
  const updatedRecurring = [...recurringExpenses];
  const newExpenses: unknown[] = [];
  const newNotifications: unknown[] = [];
  let added = 0;

  recurringExpenses.forEach((r, idx) => {
    if (!r.isActive) return;

    const due = new Date(r.nextDueAt);
    if (due > now) return;

    const currentCount = r.occurrenceCount ?? 0;
    const newCount = currentCount + 1;

    // Check end-by-count (before firing)
    if (r.endType === "count" && r.endCount !== undefined && currentCount >= r.endCount) {
      updatedRecurring[idx] = { ...r, isActive: false };
      return;
    }

    // Check end-by-date (before firing)
    if (r.endType === "date" && r.endDate && due > new Date(r.endDate + "T23:59:59")) {
      updatedRecurring[idx] = { ...r, isActive: false };
      return;
    }

    // Create the new expense
    newExpenses.push({
      id: genId(),
      groupId: r.groupId,
      description: r.description,
      amount: r.amount,
      currency: r.currency,
      paidById: r.paidById,
      splitType: r.splitType,
      splits: r.splits,
      category: r.category,
      createdAt: now.toISOString(),
      paymentDate: dateOnlyInTimeZone(due, r.timeZone),
      addedBy: "user_current",
      sourceRecurringId: r.id,
    });

    // Advance nextDueAt past now
    let nextDue = new Date(
      nextRecurringInstant(
        r.nextDueAt,
        r.frequency,
        r.frequency === "custom" ? r.customDays : undefined,
        r.timeZone,
        { months: r.intervalMonths, weeks: r.intervalWeeks, days: r.intervalDays },
      ),
    );
    while (nextDue <= now) {
      nextDue = new Date(
        nextRecurringInstant(
          nextDue.toISOString(),
          r.frequency,
          r.frequency === "custom" ? r.customDays : undefined,
          r.timeZone,
          { months: r.intervalMonths, weeks: r.intervalWeeks, days: r.intervalDays },
        ),
      );
    }

    const willExpireAfterThis =
      (r.endType === "count" &&
        r.endCount !== undefined &&
        newCount >= r.endCount) ||
      (r.endType === "date" &&
        r.endDate &&
        dateOnlyInTimeZone(nextDue, r.timeZone) > r.endDate);

    updatedRecurring[idx] = {
      ...r,
      nextDueAt: nextDue.toISOString(),
      occurrenceCount: newCount,
      isActive: !willExpireAfterThis,
    };

    newNotifications.push({
      id: genId(),
      type: "recurring_fired",
      groupId: r.groupId,
      title: "Recurring expense added",
      body: `"${r.description}" was automatically added.`,
      createdAt: now.toISOString(),
      read: false,
    });

    added++;
  });

  return { updatedRecurring, newExpenses, newNotifications, added };
}

// ─── Core logic ───────────────────────────────────────────────────────────────

/**
 * Reads the active server cache from AsyncStorage, fires any overdue recurring
 * expenses, and writes the updated cache back. Returns the number of new
 * expenses created.
 *
 * Reads from `@spliteasy_server_cache_v1` — the same key that AppContext uses
 * as its authoritative local store. Falls back to the standalone recurring
 * schedules key (`@spliteasy_recurring`) when the server cache is absent.
 *
 * Safe to call from a background task context (no React state, no context).
 */
export async function processOverdueRecurring(): Promise<number> {
  try {
    const now = new Date();

    // ── Primary path: active server cache ────────────────────────────────────
    const cacheRaw = await AsyncStorage.getItem(SERVER_CACHE_KEY);
    if (cacheRaw) {
      const cache: ServerCache = JSON.parse(cacheRaw);
      const recurring: RecurringExpense[] = cache.recurringExpenses ?? [];
      if (recurring.length === 0) return 0;

      const { updatedRecurring, newExpenses, newNotifications, added } =
        processSchedules(recurring, now);

      if (added > 0) {
        const updatedCache: ServerCache = {
          ...cache,
          expenses: [...newExpenses, ...(cache.expenses ?? [])],
          recurringExpenses: updatedRecurring,
          notifications: [
            ...newNotifications,
            ...(cache.notifications ?? []),
          ],
        };
        await AsyncStorage.setItem(SERVER_CACHE_KEY, JSON.stringify(updatedCache));

        // Also update the standalone recurring key so AppContext's loadServerCache
        // and saveRecurring stay consistent on next foreground load.
        await AsyncStorage.setItem(RECURRING_KEY, JSON.stringify(updatedRecurring));
      }

      return added;
    }

    // ── Fallback path: standalone recurring key only ──────────────────────────
    // Reached when the app has never completed a bootstrap (e.g. first install,
    // signed-out state). Nothing to do without the expense list to append to.
    return 0;
  } catch {
    return 0;
  }
}

// ─── Background task definition ───────────────────────────────────────────────

export const BACKGROUND_RECURRING_TASK = "SPLITEASY_BACKGROUND_RECURRING";

/**
 * Register the task handler with TaskManager. Must be called at module-load
 * time (i.e. outside any component), before the app's first render completes.
 * Calling it more than once is safe — it guards against double-registration.
 */
export function defineBackgroundRecurringTask(): void {
  if (TaskManager.isTaskDefined(BACKGROUND_RECURRING_TASK)) return;

  TaskManager.defineTask(BACKGROUND_RECURRING_TASK, async () => {
    try {
      await processOverdueRecurring();
    } catch {
      // Swallow errors so the background task runner doesn't penalise the app.
    }
  });
}

/**
 * Ask the OS to schedule periodic background execution of the task.
 * Safe to call multiple times — unregisters the previous schedule first if
 * one already exists, so interval changes take effect immediately.
 *
 * @param minimumIntervalMinutes  Minimum minutes between runs (default: 15).
 *                                The OS may delay execution beyond this value.
 */
export async function registerBackgroundRecurring(
  minimumIntervalMinutes = 15
): Promise<void> {
  try {
    const status = await BackgroundTask.getStatusAsync();
    if (status !== BackgroundTask.BackgroundTaskStatus.Available) return;

    // Unregister first so a changed interval is respected on re-registration.
    const isRegistered = await TaskManager.isTaskRegisteredAsync(
      BACKGROUND_RECURRING_TASK
    );
    if (isRegistered) {
      await BackgroundTask.unregisterTaskAsync(BACKGROUND_RECURRING_TASK);
    }

    await BackgroundTask.registerTaskAsync(BACKGROUND_RECURRING_TASK, {
      minimumInterval: minimumIntervalMinutes,
    });
  } catch {
    // Background tasks are unavailable on some simulators/devices — fail silently.
  }
}

/**
 * Remove the periodic background schedule. Call when the user signs out or
 * when recurring expenses are no longer needed.
 */
export async function unregisterBackgroundRecurring(): Promise<void> {
  try {
    await BackgroundTask.unregisterTaskAsync(BACKGROUND_RECURRING_TASK);
  } catch {
    // Already unregistered — nothing to do.
  }
}
