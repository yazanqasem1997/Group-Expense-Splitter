import { eq, lt } from "drizzle-orm";
import { db, usersTable } from "@workspace/db";
import { sendPushToUsers } from "./push";

const DAY = 86_400_000;
const LINES = [
  { title: "Been a while \u{1F44B}", body: "Who owes who this week? Tap to split a bill." },
  { title: "Dinner, rides, rent\u2026", body: "Split it in seconds. Tap to add an expense." },
  { title: "Settle up, stay friends \u{1F91D}", body: "Tap to split your next bill on Split Mate." },
];

/**
 * Friendly nudge for people who haven't opened Split Mate in 7 days.
 * At most one a week, stops after 3 unanswered nudges, resets when they come back,
 * respects the "Reminders" switch, and only sends during the day (10:00-20:00 Gulf time).
 */
export function startComebackReminders(): () => void {
  const run = async (): Promise<void> => {
    try {
      const now = Date.now();
      const hourUtc = new Date(now).getUTCHours();
      if (hourUtc < 6 || hourUtc >= 16) return;
      const idle = await db
        .select({ id: usersTable.id, prefs: usersTable.notifPrefs, updatedAt: usersTable.updatedAt })
        .from(usersTable)
        .where(lt(usersTable.updatedAt, new Date(now - 7 * DAY)));
      for (const u of idle) {
        const p = ((u.prefs ?? {}) as Record<string, unknown>);
        if (p.reminders === false) continue;
        const last = typeof p._nudgeAt === "number" ? p._nudgeAt : 0;
        let count = typeof p._nudgeCount === "number" ? p._nudgeCount : 0;
        if (last && u.updatedAt.getTime() > last) count = 0; // they came back since the last nudge
        if (last > now - 7 * DAY || count >= 3) continue;
        const line = LINES[count % LINES.length]!;
        if (p.reminders === false) continue; // user turned Reminders off
        await sendPushToUsers([u.id], { title: line.title, body: line.body, data: { type: "comeback" } });
        await db
          .update(usersTable)
          .set({ notifPrefs: { ...p, _nudgeAt: now, _nudgeCount: count + 1 }, updatedAt: u.updatedAt })
          .where(eq(usersTable.id, u.id));
      }
    } catch {
      // best effort
    }
  };
  const first = setTimeout(() => void run(), 60_000);
  const timer = setInterval(() => void run(), 3 * 3_600_000);
  return () => { clearTimeout(first); clearInterval(timer); };
}
