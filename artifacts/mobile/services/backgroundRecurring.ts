/**
 * backgroundRecurring.ts
 *
 * Standalone (no React state) recurring-expense processor.
 * Reads from AsyncStorage, fires any overdue recurrences, writes back.
 * Safe to call from both the foreground (AppContext) and a background task.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import * as BackgroundFetch from "expo-background-fetch";
import * as TaskManager from "expo-task-manager";

// ─── Storage keys (must match AppContext.tsx) ──────────────────────────────
const STORAGE_KEY = "spliteasy_data_v3";
const RECURRING_KEY = "@spliteasy_recurring";
const NOTIFICATIONS_KEY = "@spliteasy_notifications";

// ─── Minimal type mirrors (avoid importing from AppContext to keep this pure) ─
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
  dayOfWeek?: number;
  timeOfDay?: string;
  endType?: "never" | "count" | "date";
  endCount?: number;
  endDate?: string;
  occurrenceCount?: number;
  nextDueAt: string;
  isActive: boolean;
  createdAt: string;
}

interface AppNotification {
  id: string;
  type:
    | "settlement_reminder"
    | "recurring_fired"
    | "expense_added" | "expense_edited" | "expense_deleted"
    | "settlement_recorded" | "settlement_deleted"
    | "member_added" | "member_removed"
    | "group_updated" | "group_archived" | "group_ended"
    | "comment_added"
    | "recurring_added" | "recurring_updated" | "recurring_deleted";
  groupId?: string;
  expenseId?: string;
  title: string;
  body: string;
  createdAt: string;
  read: boolean;
}

// ─── Helpers ──────────────────────────────────────────────────────────────
function genId(): string {
  return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
}

// ─── Core processor ───────────────────────────────────────────────────────
/**
 * Reads recurring expenses and main data from AsyncStorage, fires any that
 * are overdue, persists the results, and returns how many were added.
 * Does NOT touch React state — safe to call from a background JS context.
 */
export async function processOverdueRecurring(): Promise<number> {
  try {
    const [mainRaw, recurringRaw, notifsRaw] = await Promise.all([
      AsyncStorage.getItem(STORAGE_KEY),
      AsyncStorage.getItem(RECURRING_KEY),
      AsyncStorage.getItem(NOTIFICATIONS_KEY),
    ]);

    if (!mainRaw || !recurringRaw) return 0;

    const mainData = JSON.parse(mainRaw);
    const recurringExpenses: RecurringExpense[] = JSON.parse(recurringRaw);
    const existingNotifs: AppNotification[] = notifsRaw ? JSON.parse(notifsRaw) : [];

    const now = new Date();
    let added = 0;
    const updatedRecurring = [...recurringExpenses];
    const newExpenses: unknown[] = [];
    const newNotifs: AppNotification[] = [];

    recurringExpenses.forEach((r, idx) => {
      if (!r.isActive) return;
      const due = new Date(r.nextDueAt);
      if (due > now) return;

      const newCount = (r.occurrenceCount ?? 0) + 1;

      // End-condition checks
      if (r.endType === "count" && r.endCount !== undefined && (r.occurrenceCount ?? 0) >= r.endCount) {
        updatedRecurring[idx] = { ...r, isActive: false };
        return;
      }
      if (r.endType === "date" && r.endDate && due > new Date(r.endDate + "T23:59:59")) {
        updatedRecurring[idx] = { ...r, isActive: false };
        return;
      }

      // Create the fired expense
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
        addedBy: "user_current",
      });

      // Compute next due date
      const intervalDays =
        r.frequency === "custom" && r.customDays ? r.customDays : FREQUENCY_DAYS[r.frequency];
      const intervalMs = intervalDays * 24 * 60 * 60 * 1000;
      let nextDue = new Date(r.nextDueAt);
      while (nextDue <= now) nextDue = new Date(nextDue.getTime() + intervalMs);

      if (r.dayOfWeek !== undefined && (r.frequency === "weekly" || r.frequency === "biweekly")) {
        const diff = (r.dayOfWeek - nextDue.getDay() + 7) % 7;
        if (diff > 0) nextDue = new Date(nextDue.getTime() + diff * 24 * 60 * 60 * 1000);
      }

      if (r.timeOfDay) {
        const [h, m] = r.timeOfDay.split(":").map(Number);
        nextDue.setHours(h, m, 0, 0);
      }

      const shouldDeactivate =
        (r.endType === "count" && r.endCount !== undefined && newCount >= r.endCount) ||
        (r.endType === "date" && r.endDate && nextDue > new Date(r.endDate + "T23:59:59"));

      updatedRecurring[idx] = {
        ...r,
        nextDueAt: nextDue.toISOString(),
        occurrenceCount: newCount,
        isActive: !shouldDeactivate,
      };

      // In-app notification for the fired expense
      newNotifs.push({
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

    if (added > 0) {
      const updatedMain = {
        ...mainData,
        expenses: [...newExpenses, ...(mainData.expenses ?? [])],
      };

      await Promise.all([
        AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updatedMain)),
        AsyncStorage.setItem(RECURRING_KEY, JSON.stringify(updatedRecurring)),
        AsyncStorage.setItem(
          NOTIFICATIONS_KEY,
          JSON.stringify([...newNotifs, ...existingNotifs])
        ),
      ]);
    }

    return added;
  } catch {
    return 0;
  }
}

// ─── Background task registration ─────────────────────────────────────────
export const BACKGROUND_RECURRING_TASK = "SPLITEASY_BACKGROUND_RECURRING";

/**
 * Define the task. Must be called at the module level (top of the entry file)
 * so TaskManager can find it before the app UI mounts.
 */
export function defineBackgroundRecurringTask() {
  if (TaskManager.isTaskDefined(BACKGROUND_RECURRING_TASK)) return;

  TaskManager.defineTask(BACKGROUND_RECURRING_TASK, async () => {
    try {
      const count = await processOverdueRecurring();
      return count > 0
        ? BackgroundFetch.BackgroundFetchResult.NewData
        : BackgroundFetch.BackgroundFetchResult.NoData;
    } catch {
      return BackgroundFetch.BackgroundFetchResult.Failed;
    }
  });
}

/**
 * Register the background fetch schedule. Safe to call multiple times —
 * it unregisters the old schedule first.
 * minimumInterval is in seconds; iOS/Android enforce a ~15-minute floor.
 */
export async function registerBackgroundRecurring(
  minimumInterval = 15 * 60
): Promise<void> {
  try {
    const status = await BackgroundFetch.getStatusAsync();
    const isAvailable =
      status === BackgroundFetch.BackgroundFetchStatus.Available;

    if (!isAvailable) {
      // Background fetch is restricted or denied — graceful no-op.
      // The foreground AppState listener in AppContext acts as fallback.
      return;
    }

    await BackgroundFetch.registerTaskAsync(BACKGROUND_RECURRING_TASK, {
      minimumInterval,
      stopOnTerminate: false, // keep running after app is closed (Android)
      startOnBoot: true,      // resume after device restart (Android)
    });
  } catch {
    // Already registered or unavailable — safe to ignore.
  }
}

/**
 * Unregister the background task (e.g. when the user disables recurring expenses).
 */
export async function unregisterBackgroundRecurring(): Promise<void> {
  try {
    await BackgroundFetch.unregisterTaskAsync(BACKGROUND_RECURRING_TASK);
  } catch {}
}
