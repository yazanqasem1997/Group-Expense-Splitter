import { and, eq, gte, isNull, sql } from "drizzle-orm";
import { db, groupsTable, receiptScanUsageTable, referralsTable, usersTable } from "@workspace/db";

/** Free users get this many receipt scans per calendar month (UTC). */
export const FREE_SCANS_PER_MONTH = 5;
/** Most invite rewards one person can earn in a year. */
const MAX_REFERRAL_PASSES_PER_YEAR = 3;
const DAY_MS = 24 * 60 * 60 * 1000;
/** The Plus free trial: 7 days, with at most 30 receipt scans in it. */
export const TRIAL_DAYS = 7;
export const TRIAL_SCAN_LIMIT = 30;
/** Days of Plus a person gets when they pick Plus as their invite reward. */
const REWARD_PLUS_DAYS = 7;

const monthKey = (d = new Date()) => d.toISOString().slice(0, 7);
const nextMonthStart = (d = new Date()) =>
  new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1)).toISOString().slice(0, 10);

/** Emails in the PLUS_USER_EMAILS secret get Plus, for testing before purchases go live. */
const testers = () =>
  (process.env.PLUS_USER_EMAILS ?? "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);

export type ScanUsage = {
  plan: "free" | "plus" | "trip";
  used: number;
  limit: number | null;
  resetsOn: string;
  tripPassCredits: number;
  rewardsToClaim: number;
};

/** Which plan applies (Plus for the user, or a Trip Pass on the group) and scans used this month. */
export async function scanUsage(userId: string, groupId?: string | null): Promise<ScanUsage> {
  const now = new Date();
  const [user] = await db
    .select({ plan: usersTable.plan, planExpiresAt: usersTable.planExpiresAt, email: usersTable.email, credits: usersTable.tripPassCredits, rewards: usersTable.rewardsToClaim })
    .from(usersTable)
    .where(eq(usersTable.id, userId))
    .limit(1);
  const [row] = await db
    .select({ scans: receiptScanUsageTable.scans })
    .from(receiptScanUsageTable)
    .where(and(eq(receiptScanUsageTable.userId, userId), eq(receiptScanUsageTable.month, monthKey(now))))
    .limit(1);
  const used = row?.scans ?? 0;
  const resetsOn = nextMonthStart(now);
  const tripPassCredits = user?.credits ?? 0;
  const rewardsToClaim = user?.rewards ?? 0;
  if (user?.plan === "trial" && user.planExpiresAt && user.planExpiresAt > now) {
    return { plan: "plus", used, limit: process.env.PURCHASES_LIVE === "1" ? TRIAL_SCAN_LIMIT : null, resetsOn, tripPassCredits, rewardsToClaim };
  }
  const plus =
    (user?.plan === "plus" && (!user.planExpiresAt || user.planExpiresAt > now)) ||
    (!!user?.email && testers().includes(user.email.toLowerCase()));
  // Until store purchases are switched on (PURCHASES_LIVE=1), everyone gets everything.
  if (plus || process.env.PURCHASES_LIVE !== "1") return { plan: "plus", used, limit: null, resetsOn, tripPassCredits, rewardsToClaim };
  if (groupId) {
    const [group] = await db
      .select({ until: groupsTable.tripPassExpiresAt })
      .from(groupsTable)
      .where(eq(groupsTable.id, groupId))
      .limit(1);
    if (group?.until && group.until > now) return { plan: "trip", used, limit: null, resetsOn, tripPassCredits, rewardsToClaim };
  }
  return { plan: "free", used, limit: FREE_SCANS_PER_MONTH, resetsOn, tripPassCredits, rewardsToClaim };
}

export async function recordScan(userId: string): Promise<void> {
  await db
    .insert(receiptScanUsageTable)
    .values({ userId, month: monthKey(), scans: 1 })
    .onConflictDoUpdate({
      target: [receiptScanUsageTable.userId, receiptScanUsageTable.month],
      set: { scans: sql`${receiptScanUsageTable.scans} + 1` },
    });
}

/** A brand-new account (under 14 days old) that adds a friend from an invite counts as their referral. */
export async function recordReferral(referredUserId: string, referrerUserId: string): Promise<void> {
  if (referredUserId === referrerUserId) return;
  const [user] = await db.select({ createdAt: usersTable.createdAt }).from(usersTable).where(eq(usersTable.id, referredUserId)).limit(1);
  if (!user || Date.now() - user.createdAt.getTime() > 14 * DAY_MS) return;
  await db.insert(referralsTable).values({ referredUserId, referrerUserId }).onConflictDoNothing();
}

/** Called when someone adds an expense: their first one earns their inviter a free Trip Pass. */
export async function rewardReferralIfDue(referredUserId: string): Promise<void> {
  const [ref] = await db
    .select()
    .from(referralsTable)
    .where(and(eq(referralsTable.referredUserId, referredUserId), isNull(referralsTable.rewardedAt)))
    .limit(1);
  if (!ref) return;
  const [earned] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(referralsTable)
    .where(and(eq(referralsTable.referrerUserId, ref.referrerUserId), gte(referralsTable.rewardedAt, new Date(Date.now() - 365 * DAY_MS))));
  await db.update(referralsTable).set({ rewardedAt: new Date() }).where(eq(referralsTable.referredUserId, referredUserId));
  if ((earned?.n ?? 0) >= MAX_REFERRAL_PASSES_PER_YEAR) return;
  await db
    .update(usersTable)
    .set({ rewardsToClaim: sql`${usersTable.rewardsToClaim} + 1` })
    .where(eq(usersTable.id, ref.referrerUserId));
  // The reward is applied straight away: 7 days of Plus, no choice to make.
  await claimInviteReward(ref.referrerUserId, "plus");
}

/** Uses one free Trip Pass on a group: Plus for everyone in it for 30 more days. */
export async function redeemTripPass(userId: string, groupId: string): Promise<"ok" | "no_credit"> {
  return db.transaction(async (tx) => {
    const [spent] = await tx
      .update(usersTable)
      .set({ tripPassCredits: sql`${usersTable.tripPassCredits} - 1` })
      .where(and(eq(usersTable.id, userId), gte(usersTable.tripPassCredits, 1)))
      .returning({ id: usersTable.id });
    if (!spent) return "no_credit" as const;
    const [group] = await tx.select({ until: groupsTable.tripPassExpiresAt }).from(groupsTable).where(eq(groupsTable.id, groupId)).limit(1);
    const start = group?.until && group.until > new Date() ? group.until : new Date();
    await tx.update(groupsTable).set({ tripPassExpiresAt: new Date(start.getTime() + 30 * DAY_MS) }).where(eq(groupsTable.id, groupId));
    return "ok" as const;
  });
}

/** Starts the 7-day Plus trial. Called when the store reports a trial (store purchases arrive with the App Store release). */
export async function startTrial(userId: string): Promise<void> {
  await db
    .update(usersTable)
    .set({ plan: "trial", planExpiresAt: new Date(Date.now() + TRIAL_DAYS * DAY_MS) })
    .where(eq(usersTable.id, userId));
}

/**
 * Spends one invite reward on what the person picked: 30 days of Plus for them,
 * or a free Trip Pass they can use on any group. Someone already on an open-ended
 * Plus subscription gets the Trip Pass, since more Plus would change nothing.
 */
export async function claimInviteReward(userId: string, choice: "plus" | "trip_pass"): Promise<"ok" | "none"> {
  return db.transaction(async (tx): Promise<"ok" | "none"> => {
    const spent = await tx
      .update(usersTable)
      .set({ rewardsToClaim: sql`${usersTable.rewardsToClaim} - 1` })
      .where(and(eq(usersTable.id, userId), gte(usersTable.rewardsToClaim, 1)))
      .returning({ plan: usersTable.plan, until: usersTable.planExpiresAt });
    if (spent.length === 0) return "none";
    const { plan, until } = spent[0];
    if (choice === "trip_pass" || (plan === "plus" && !until)) {
      await tx
        .update(usersTable)
        .set({ tripPassCredits: sql`${usersTable.tripPassCredits} + 1` })
        .where(eq(usersTable.id, userId));
      return "ok";
    }
    const now = new Date();
    const start = until && until > now ? until : now;
    await tx
      .update(usersTable)
      .set({ plan: "plus", planExpiresAt: new Date(start.getTime() + REWARD_PLUS_DAYS * DAY_MS) })
      .where(eq(usersTable.id, userId));
    return "ok";
  });
}
