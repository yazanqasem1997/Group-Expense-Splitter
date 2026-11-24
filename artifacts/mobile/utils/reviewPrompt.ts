import AsyncStorage from "@react-native-async-storage/async-storage";
import * as StoreReview from "expo-store-review";

const FIRST_OPEN = "review.firstOpenAt";
const LAST_ASKED = "review.lastAskedAt";
const EXPENSES = "review.expensesAdded";
const DAY_MS = 24 * 60 * 60 * 1000;

/** Remembers when the app was first used (the 7-day clock for asking for a review). */
export async function noteFirstOpen(): Promise<void> {
  try {
    if (!(await AsyncStorage.getItem(FIRST_OPEN))) await AsyncStorage.setItem(FIRST_OPEN, String(Date.now()));
  } catch {}
}

/**
 * Shows Apple's or Google's own rating pop-up at a happy moment: after settling up or
 * adding the 5th expense, once the app has been used for 7 days, at most every 4 months.
 * The store also limits how often it really appears (Apple: 3 times a year).
 * No reward is ever tied to rating: both stores forbid it.
 */
export async function maybeAskForReview(moment: "settled" | "expense"): Promise<void> {
  try {
    if (moment === "expense") {
      const added = Number((await AsyncStorage.getItem(EXPENSES)) ?? "0") + 1;
      await AsyncStorage.setItem(EXPENSES, String(added));
      if (added < 5) return;
    }
    const firstOpen = Number((await AsyncStorage.getItem(FIRST_OPEN)) ?? "0");
    if (!firstOpen) {
      await noteFirstOpen();
      return;
    }
    if (Date.now() - firstOpen < 7 * DAY_MS) return;
    const lastAsked = Number((await AsyncStorage.getItem(LAST_ASKED)) ?? "0");
    if (Date.now() - lastAsked < 120 * DAY_MS) return;
    if (!(await StoreReview.isAvailableAsync()) || !(await StoreReview.hasAction())) return;
    await AsyncStorage.setItem(LAST_ASKED, String(Date.now()));
    // Let the success animation and sound finish first.
    setTimeout(() => { StoreReview.requestReview().catch(() => {}); }, 1800);
  } catch {}
}
