/**
 * POST /api/seed
 *
 * Creates realistic demo data (3 groups, members, expenses, settlements, and a
 * recurring schedule) for the authenticated user. Safe to call multiple times —
 * each call produces a fresh independent set of groups.
 */
import { Router, type IRouter } from "express";
import {
  db,
  groupsTable,
  groupMembersTable,
  expensesTable,
  expenseSplitsTable,
  settlementsTable,
  recurringExpensesTable,
} from "@workspace/db";
import { requireAuth } from "../lib/auth";

const router: IRouter = Router();

// Helper: distribute amount equally across memberKeys, giving the remainder to
// the last member so the total always sums correctly.
function equalSplits(
  expenseId: string,
  memberKeys: string[],
  totalCents: number,
): { expenseId: string; memberKey: string; amount: string }[] {
  const base = Math.floor(totalCents / memberKeys.length);
  const remainder = totalCents - base * (memberKeys.length - 1);
  return memberKeys.map((memberKey, i) => ({
    expenseId,
    memberKey,
    amount: ((i === memberKeys.length - 1 ? remainder : base) / 100).toFixed(
      2,
    ),
  }));
}

function daysAgo(n: number): Date {
  return new Date(Date.now() - n * 86_400_000);
}

router.post("/seed", requireAuth, async (req, res): Promise<void> => {
  const user = req.localUser!;
  const userId = user.id;
  const userName = user.name || "You";

  // ── IDs ────────────────────────────────────────────────────────────────────
  const [g1, g2, g3] = [
    crypto.randomUUID(),
    crypto.randomUUID(),
    crypto.randomUUID(),
  ];

  // Member keys (stable per-group identifiers)
  const BMe = "barca-you",
    BSofia = "barca-sofia",
    BMarco = "barca-marco",
    BPriya = "barca-priya";
  const FMe = "flat-you",
    FJames = "flat-james",
    FLily = "flat-lily";
  const LMe = "lunch-you",
    LAlex = "lunch-alex",
    LJordan = "lunch-jordan";

  // ── Groups ─────────────────────────────────────────────────────────────────
  await db.insert(groupsTable).values([
    {
      id: g1,
      name: "Barcelona Trip",
      emoji: "🏖️",
      currency: "EUR",
      type: "trip",
      createdByUserId: userId,
      startDate: daysAgo(10).toISOString().split("T")[0],
      endDate: daysAgo(7).toISOString().split("T")[0],
    },
    {
      id: g2,
      name: "Flat Bills",
      emoji: "🏠",
      currency: "GBP",
      type: "household",
      createdByUserId: userId,
    },
    {
      id: g3,
      name: "Lunch Club",
      emoji: "🍜",
      currency: "USD",
      type: "other",
      createdByUserId: userId,
    },
  ]);

  // ── Members ────────────────────────────────────────────────────────────────
  await db.insert(groupMembersTable).values([
    // Barcelona
    {
      groupId: g1,
      userId,
      memberKey: BMe,
      name: userName,
      isAdmin: true,
      isPending: false,
      joinedAt: daysAgo(11),
    },
    {
      groupId: g1,
      userId: null,
      memberKey: BSofia,
      name: "Sofia Marconi",
      avatarColor: "#F59E0B",
      isAdmin: false,
      isPending: true,
    },
    {
      groupId: g1,
      userId: null,
      memberKey: BMarco,
      name: "Marco Silva",
      avatarColor: "#10B981",
      isAdmin: false,
      isPending: true,
    },
    {
      groupId: g1,
      userId: null,
      memberKey: BPriya,
      name: "Priya Patel",
      avatarColor: "#8B5CF6",
      isAdmin: false,
      isPending: true,
    },
    // Flat Bills
    {
      groupId: g2,
      userId,
      memberKey: FMe,
      name: userName,
      isAdmin: true,
      isPending: false,
      joinedAt: daysAgo(32),
    },
    {
      groupId: g2,
      userId: null,
      memberKey: FJames,
      name: "James O'Brien",
      avatarColor: "#EF4444",
      isAdmin: false,
      isPending: true,
    },
    {
      groupId: g2,
      userId: null,
      memberKey: FLily,
      name: "Lily Chen",
      avatarColor: "#3B82F6",
      isAdmin: false,
      isPending: true,
    },
    // Lunch Club
    {
      groupId: g3,
      userId,
      memberKey: LMe,
      name: userName,
      isAdmin: true,
      isPending: false,
      joinedAt: daysAgo(5),
    },
    {
      groupId: g3,
      userId: null,
      memberKey: LAlex,
      name: "Alex Kim",
      avatarColor: "#06B6D4",
      isAdmin: false,
      isPending: true,
    },
    {
      groupId: g3,
      userId: null,
      memberKey: LJordan,
      name: "Jordan Reyes",
      avatarColor: "#F97316",
      isAdmin: false,
      isPending: true,
    },
  ]);

  // ── Expenses ───────────────────────────────────────────────────────────────
  // Barcelona Trip  (4 members)
  const barcaMembers = [BMe, BSofia, BMarco, BPriya];
  const barcaExpenses: {
    id: string;
    desc: string;
    amountCents: number;
    paidBy: string;
    cat: string;
    daysAgoN: number;
  }[] = [
    {
      id: crypto.randomUUID(),
      desc: "Hotel (3 nights)",
      amountCents: 32400,
      paidBy: BMe,
      cat: "accommodation",
      daysAgoN: 10,
    },
    {
      id: crypto.randomUUID(),
      desc: "Dinner at La Boqueria",
      amountCents: 7240,
      paidBy: BSofia,
      cat: "food",
      daysAgoN: 9,
    },
    {
      id: crypto.randomUUID(),
      desc: "Sagrada Família tickets",
      amountCents: 8800,
      paidBy: BMarco,
      cat: "entertainment",
      daysAgoN: 8,
    },
    {
      id: crypto.randomUUID(),
      desc: "Groceries & snacks",
      amountCents: 4560,
      paidBy: BPriya,
      cat: "groceries",
      daysAgoN: 8,
    },
    {
      id: crypto.randomUUID(),
      desc: "Taxi to airport",
      amountCents: 3800,
      paidBy: BMe,
      cat: "transport",
      daysAgoN: 7,
    },
    {
      id: crypto.randomUUID(),
      desc: "Bar tab at W Hotel",
      amountCents: 9200,
      paidBy: BSofia,
      cat: "drinks",
      daysAgoN: 9,
    },
  ];

  await db.insert(expensesTable).values(
    barcaExpenses.map((e) => ({
      id: e.id,
      groupId: g1,
      description: e.desc,
      amount: (e.amountCents / 100).toFixed(2),
      currency: "EUR",
      paidByMemberKey: e.paidBy,
      splitType: "equal",
      category: e.cat,
      addedByUserId: userId,
      createdAt: daysAgo(e.daysAgoN),
    })),
  );

  const barcaSplits = barcaExpenses.flatMap((e) =>
    equalSplits(e.id, barcaMembers, e.amountCents),
  );
  await db.insert(expenseSplitsTable).values(barcaSplits);

  // Flat Bills  (3 members)
  const flatMembers = [FMe, FJames, FLily];
  const flatExpenses: {
    id: string;
    desc: string;
    amountCents: number;
    paidBy: string;
    cat: string;
    daysAgoN: number;
  }[] = [
    {
      id: crypto.randomUUID(),
      desc: "April rent",
      amountCents: 120000,
      paidBy: FMe,
      cat: "housing",
      daysAgoN: 30,
    },
    {
      id: crypto.randomUUID(),
      desc: "Electricity bill",
      amountCents: 8550,
      paidBy: FJames,
      cat: "utilities",
      daysAgoN: 28,
    },
    {
      id: crypto.randomUUID(),
      desc: "Internet",
      amountCents: 4500,
      paidBy: FLily,
      cat: "utilities",
      daysAgoN: 28,
    },
    {
      id: crypto.randomUUID(),
      desc: "Netflix",
      amountCents: 1799,
      paidBy: FMe,
      cat: "entertainment",
      daysAgoN: 25,
    },
    {
      id: crypto.randomUUID(),
      desc: "Council tax",
      amountCents: 13000,
      paidBy: FMe,
      cat: "housing",
      daysAgoN: 30,
    },
  ];

  await db.insert(expensesTable).values(
    flatExpenses.map((e) => ({
      id: e.id,
      groupId: g2,
      description: e.desc,
      amount: (e.amountCents / 100).toFixed(2),
      currency: "GBP",
      paidByMemberKey: e.paidBy,
      splitType: "equal",
      category: e.cat,
      addedByUserId: userId,
      createdAt: daysAgo(e.daysAgoN),
    })),
  );

  const flatSplits = flatExpenses.flatMap((e) =>
    equalSplits(e.id, flatMembers, e.amountCents),
  );
  await db.insert(expenseSplitsTable).values(flatSplits);

  // Lunch Club  (3 members)
  const lunchMembers = [LMe, LAlex, LJordan];
  const lunchExpenses: {
    id: string;
    desc: string;
    amountCents: number;
    paidBy: string;
    cat: string;
    daysAgoN: number;
  }[] = [
    {
      id: crypto.randomUUID(),
      desc: "Thai lunch",
      amountCents: 8750,
      paidBy: LMe,
      cat: "food",
      daysAgoN: 3,
    },
    {
      id: crypto.randomUUID(),
      desc: "Coffee run",
      amountCents: 2240,
      paidBy: LAlex,
      cat: "food",
      daysAgoN: 2,
    },
    {
      id: crypto.randomUUID(),
      desc: "Sushi takeout",
      amountCents: 6380,
      paidBy: LJordan,
      cat: "food",
      daysAgoN: 1,
    },
  ];

  await db.insert(expensesTable).values(
    lunchExpenses.map((e) => ({
      id: e.id,
      groupId: g3,
      description: e.desc,
      amount: (e.amountCents / 100).toFixed(2),
      currency: "USD",
      paidByMemberKey: e.paidBy,
      splitType: "equal",
      category: e.cat,
      addedByUserId: userId,
      createdAt: daysAgo(e.daysAgoN),
    })),
  );

  const lunchSplits = lunchExpenses.flatMap((e) =>
    equalSplits(e.id, lunchMembers, e.amountCents),
  );
  await db.insert(expenseSplitsTable).values(lunchSplits);

  // ── Settlements ────────────────────────────────────────────────────────────
  await db.insert(settlementsTable).values([
    // Barcelona: Sofia paid you back a little
    {
      id: crypto.randomUUID(),
      groupId: g1,
      fromMemberKey: BSofia,
      toMemberKey: BMe,
      amount: "24.00",
      currency: "EUR",
      note: "Venmo",
      recordedByUserId: userId,
      createdAt: daysAgo(7),
    },
    // Flat: James paid you back
    {
      id: crypto.randomUUID(),
      groupId: g2,
      fromMemberKey: FJames,
      toMemberKey: FMe,
      amount: "45.00",
      currency: "GBP",
      note: "Bank transfer",
      recordedByUserId: userId,
      createdAt: daysAgo(20),
    },
  ]);

  // ── Recurring expense (Flat Bills: monthly electricity) ────────────────────
  const nextMonth = new Date();
  nextMonth.setDate(nextMonth.getDate() + 3); // due in 3 days for demo visibility
  nextMonth.setHours(9, 0, 0, 0);

  await db.insert(recurringExpensesTable).values({
    id: crypto.randomUUID(),
    groupId: g2,
    description: "Electricity bill",
    amount: "85.50",
    currency: "GBP",
    paidByMemberKey: FJames,
    splitType: "equal",
    splits: flatMembers.map((mk) => ({
      memberKey: mk,
      amount: (8550 / flatMembers.length / 100).toFixed(2),
    })),
    category: "utilities",
    frequency: "monthly",
    endType: "never",
    occurrenceCount: 1,
    nextDueAt: nextMonth,
    isActive: true,
  });

  res.json({ ok: true, groups: ["Barcelona Trip", "Flat Bills", "Lunch Club"] });
});

export default router;
