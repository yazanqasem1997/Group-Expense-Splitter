// Simulates 1,000 users across ~300 groups with random currencies, split types,
// multi-payer bills, departed members and partial settlements, then checks that the
// app's real balance, split and conversion code never loses or invents a cent.
import assert from "node:assert/strict";
import test from "node:test";
import {
  computeNetBalanceCents,
  computePairwiseDebts,
  getMemberNetPosition,
  simplifyDebtCents,
  summarizeCounterpartyBalances,
  summarizeMemberGroupBalances,
} from "./balanceMath.ts";
import { allocateByWeights, fromCents, percentagesAddUp, splitByPercentages, splitByShares, splitEqually, toCents } from "./splitMath.ts";
import { FALLBACK_RATES, convertWithRates } from "./fx.ts";

const USERS = 1000;
const COMMON = ["AED", "USD", "EUR", "GBP", "SAR", "INR", "JPY", "KWD", "EGP", "PKR"];
const ALL = Object.keys(FALLBACK_RATES);
const convert = (amount, from, to) => {
  const value = convertWithRates(amount, from, to, FALLBACK_RATES);
  if (value === null) throw new Error(`no rate ${from}->${to}`);
  return value;
};
const sumCents = values => values.reduce((sum, value) => sum + toCents(value), 0);

function mulberry32(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function simulate(seed) {
  const r = mulberry32(seed);
  const pick = list => list[Math.floor(r() * list.length)];
  const int = (lo, hi) => lo + Math.floor(r() * (hi - lo + 1));
  const money = () => {
    const k = r();
    const value = k < 0.3 ? r() * 20 : k < 0.85 ? r() * 500 : r() * 25000;
    return fromCents(Math.max(1, Math.round(value * 100)));
  };
  const currency = () => (r() < 0.75 ? pick(COMMON) : pick(ALL));
  const weights = n => Array.from({ length: n }, () => int(1, 9));

  const s = { users: USERS, groups: 0, expenses: 0, settlements: 0, splitTypes: { equal: 0, shares: 0, percent: 0, exact: 0 },
    multiPayer: 0, departedMemberSplits: 0, foreignExpenses: 0, conversionsChecked: 0, currencies: new Set(),
    failures: 0, examples: [], pairwiseMaxDriftCents: 0, foreignSettleGroups: 0, foreignSettleGroupsWithLeftover: 0, foreignSettleMaxLeftoverCents: 0, lockedGroupsChecked: 0 };
  const fail = msg => { s.failures++; if (s.examples.length < 10) s.examples.push(msg); };

  const users = Array.from({ length: USERS }, (_, i) => ({ id: `u${i}`, home: currency() }));
  const shuffled = [...users].sort(() => r() - 0.5);
  const memberLists = [];
  for (let i = 0; i < shuffled.length; ) { const n = int(2, 8); memberLists.push(shuffled.slice(i, i + n).map(u => u.id)); i += n; }
  while (memberLists.length < 300) { const n = int(2, 8); memberLists.push([...new Set(Array.from({ length: n }, () => pick(users).id))]); }

  const groups = memberLists.filter(m => m.length >= 2).map((memberIds, gi) => {
    const g = { id: `g${gi}`, currency: currency(), memberIds, expenses: [], settlements: [] };
    s.currencies.add(g.currency);
    for (let e = int(3, 40); e > 0; e--) {
      const cur = r() < 0.7 ? g.currency : currency();
      if (cur !== g.currency) s.foreignExpenses++;
      s.currencies.add(cur);
      const amount = money();
      const people = r() < 0.6 ? memberIds : memberIds.filter(() => r() < 0.6);
      if (people.length === 0) people.push(memberIds[0]);
      const type = pick(["equal", "equal", "shares", "percent", "exact"]);
      s.splitTypes[type]++;
      let parts;
      if (type === "equal") parts = splitEqually(amount, people.length);
      else if (type === "shares") parts = splitByShares(amount, people.map(() => int(1, 5)));
      else if (type === "exact") parts = allocateByWeights(amount, weights(people.length));
      else {
        const pct = allocateByWeights(100, weights(people.length));
        if (!percentagesAddUp(pct)) fail(`percentages ${pct.join("+")} do not add up to 100`);
        parts = splitByPercentages(amount, pct);
      }
      if (sumCents(parts) !== toCents(amount)) fail(`${type} split of ${amount} sums to ${fromCents(sumCents(parts))}`);
      if (parts.some(p => p < 0 || !Number.isFinite(p))) fail(`${type} split of ${amount} has a negative or invalid share`);
      const splits = new Map(people.map((id, i) => [id, { memberId: id, amount: parts[i], paid: null }]));
      const payer = pick(memberIds);
      if (r() < 0.15) {
        s.multiPayer++;
        const payers = [...new Set([payer, pick(memberIds), pick(memberIds)])];
        const paid = allocateByWeights(amount, weights(payers.length));
        payers.forEach((id, i) => { const split = splits.get(id) ?? { memberId: id, amount: 0, paid: null }; split.paid = paid[i]; splits.set(id, split); });
      }
      if (r() < 0.03) { s.departedMemberSplits++; splits.set("left", { memberId: "left", amount: 0.01, paid: null }); }
      const lock = gi % 2 === 1 && cur !== g.currency;
      g.expenses.push({ amount, currency: cur, paidById: payer, splits: [...splits.values()], ...(lock ? { fxRate: convert(1, cur, g.currency), fxRateCurrency: g.currency } : {}) });
      s.expenses++;
    }
    for (let k = int(0, 5); k > 0; k--) {
      const fromId = pick(memberIds); const toId = pick(memberIds.filter(id => id !== fromId));
      const sc = r() < 0.8 ? g.currency : currency();
      g.settlements.push({ fromId, toId, amount: fromCents(int(1, 20000)), currency: sc, ...(gi % 2 === 1 && sc !== g.currency ? { fxRate: convert(1, sc, g.currency), fxRateCurrency: g.currency } : {}) });
      s.settlements++;
    }
    return g;
  });
  s.groups = groups.length;

  for (const g of groups) {
    const net = computeNetBalanceCents(g.memberIds, g.expenses, g.settlements, g.currency, convert);
    const total = Object.values(net).reduce((a, b) => a + b, 0);
    if (total !== 0) fail(`${g.id}: balances add up to ${total} cents, not 0`);
    if (Object.values(net).some(v => !Number.isInteger(v))) fail(`${g.id}: balance is not a whole number of cents`);
    const edges = simplifyDebtCents(net);
    if (edges.length > g.memberIds.length - 1) fail(`${g.id}: ${edges.length} payments for ${g.memberIds.length} people`);
    if (edges.some(e => !(e.amount > 0))) fail(`${g.id}: zero or negative payment suggested`);
    for (const id of g.memberIds) {
      if (toCents(getMemberNetPosition(edges, id)) !== net[id]) fail(`${g.id}: suggested payments do not match ${id}'s balance`);
      const drift = Math.abs(toCents(getMemberNetPosition(computePairwiseDebts(g.memberIds, g.expenses, g.settlements, g.currency, convert), id)) - net[id]);
      s.pairwiseMaxDriftCents = Math.max(s.pairwiseMaxDriftCents, drift);
    }
    const settled = [...g.settlements, ...edges.map(e => ({ ...e, currency: g.currency }))];
    const after = computeNetBalanceCents(g.memberIds, g.expenses, settled, g.currency, convert);
    if (Object.values(after).some(v => v !== 0)) fail(`${g.id}: Settle all leaves a balance`);
    const homeOf = id => users.find(u => u.id === id)?.home ?? g.currency;
    const foreign = edges.map(e => {
      const cur = homeOf(e.fromId);
      const paidAmount = Math.max(0.01, fromCents(toCents(convert(e.amount, g.currency, cur))));
      // The app records the exact rate that clears the debt, as the settle-up screen does.
      return { ...e, currency: cur, amount: paidAmount, fxRate: e.amount / paidAmount, fxRateCurrency: g.currency };
    });
    if (foreign.some(e => e.currency !== g.currency)) {
      s.foreignSettleGroups++;
      const left = computeNetBalanceCents(g.memberIds, g.expenses, [...g.settlements, ...foreign], g.currency, convert);
      const worst = Math.max(...Object.values(left).map(Math.abs));
      if (worst > 0) s.foreignSettleGroupsWithLeftover++;
      s.foreignSettleMaxLeftoverCents = Math.max(s.foreignSettleMaxLeftoverCents, worst);
    }
    g.debts = edges;
    if (Number(g.id.slice(1)) % 2 === 1) {
      const shifted = (amount, from, to) => convert(amount, from, to) * (from === to ? 1 : 1.07);
      const moved = computeNetBalanceCents(g.memberIds, g.expenses, g.settlements, g.currency, shifted);
      s.lockedGroupsChecked++;
      if (g.memberIds.some(id => moved[id] !== net[id])) fail(`${g.id}: balances moved when exchange rates changed`);
    }
  }

  for (let i = 0; i < 3000; i++) {
    const a = pick(ALL), b = pick(ALL), x = money();
    const y = convert(x, a, b), back = convert(y, b, a);
    s.conversionsChecked++;
    if (!(y > 0) || !Number.isFinite(y)) fail(`${x} ${a} -> ${b} gave ${y}`);
    if (Math.abs(back - x) > 1e-9 * Math.max(1, x)) fail(`${x} ${a} -> ${b} -> ${a} came back as ${back}`);
  }

  for (const u of users.slice(0, 400)) {
    const mine = groups.filter(g => g.memberIds.includes(u.id)).map(g => ({ currency: g.currency, debts: g.debts }));
    const toHome = (amount, from) => convert(amount, from, u.home);
    const { youOwe, youAreOwed } = summarizeMemberGroupBalances(mine, u.id, toHome);
    const perFriend = Object.values(summarizeCounterpartyBalances(mine, u.id, toHome)).reduce((a, b) => a + b, 0);
    const debts = mine.reduce((n, g) => n + g.debts.length, 0);
    if (Math.abs(perFriend - (youAreOwed - youOwe)) > 0.01 * Math.max(1, debts)) fail(`${u.id}: Friends tab total ${perFriend} != Home total ${youAreOwed - youOwe}`);
  }

  s.currencies = s.currencies.size;
  return s;
}

test("1,000 simulated users: no balance, split or conversion errors", () => {
  for (const seed of [1, 2, 3]) {
    const result = simulate(seed);
    console.log("SIM", JSON.stringify(result));
    assert.equal(result.failures, 0, result.examples.join("\n"));
    assert.equal(result.pairwiseMaxDriftCents, 0, "who owes whom differs from the totals");
    assert.equal(result.foreignSettleGroupsWithLeftover, 0, "settling in another currency left a balance");
  }
});
