import assert from "node:assert/strict";
import test from "node:test";
import {
  computeGroupDebts,
  computeNetBalanceCents,
  computePairwiseDebts,
  getMemberNetPosition,
  roundBalancesToCents,
  simplifyDebtCents,
  summarizeCounterpartyBalances,
} from "./balanceMath.ts";

const same = (amount) => amount;
const totalCents = (edges) => edges.reduce((s, e) => s + Math.round(e.amount * 100), 0);
const expense = (paidById, amount, splits, currency = "USD") => ({
  paidById,
  amount,
  currency,
  splits: splits.map(([memberId, share, paid]) => ({ memberId, amount: share, paid })),
});

test("net balances always sum to exactly zero cents", () => {
  const ids = ["a", "b", "c"];
  const expenses = [
    expense("a", 100, [["a", 33.34], ["b", 33.33], ["c", 33.33]]),
    expense("b", 10, [["a", 3.34], ["b", 3.33], ["c", 3.33]]),
    expense("c", 0.07, [["a", 0.03], ["b", 0.02], ["c", 0.02]]),
  ];
  const net = computeNetBalanceCents(ids, expenses, [], "USD", same);
  assert.equal(Object.values(net).reduce((s, v) => s + v, 0), 0);
  assert.deepEqual(net, { a: 6329, b: -2668, c: -3661 });
});

test("simplified payments exactly clear every balance", () => {
  const net = { a: 6329, b: -2668, c: -3661 };
  const payments = simplifyDebtCents(net);
  assert.deepEqual(payments, [
    { fromId: "c", toId: "a", amount: 36.61 },
    { fromId: "b", toId: "a", amount: 26.68 },
  ]);
  for (const id of Object.keys(net)) assert.equal(Math.round(getMemberNetPosition(payments, id) * 100), net[id]);
});

test("exact matches are paired first, avoiding an extra transfer", () => {
  // Greedy-largest-first alone needs 4 transfers here; pairing y=b (4.00) first needs 3.
  const payments = simplifyDebtCents({ a: 600, b: 400, x: -500, y: -400, z: -100 });
  assert.equal(payments.length, 3);
  assert.deepEqual(payments[0], { fromId: "y", toId: "b", amount: 4 });
});

test("settling everything that was suggested leaves the group at exactly zero", () => {
  const ids = ["me", "alex", "sam", "kim", "lee", "joe"];
  const expenses = [
    expense("me", 100, ids.map((id, i) => [id, i < 4 ? 16.67 : 16.66])),
    expense("alex", 59.99, [["me", 20], ["sam", 19.99], ["alex", 20]]),
  ];
  const debts = computeGroupDebts({ memberIds: ids, expenses, settlements: [], groupCurrency: "USD", convert: same, simplify: true });
  const settlements = debts.map(d => ({ ...d, currency: "USD" }));
  const after = computeGroupDebts({ memberIds: ids, expenses, settlements, groupCurrency: "USD", convert: same, simplify: true });
  assert.deepEqual(after, []);
});

test("multi-payer expense splits the debt pro rata to what each person paid", () => {
  const ids = ["a", "b", "c"];
  const e = expense("a", 90, [["a", 30, 60], ["b", 30, 30], ["c", 30, 0]]);
  const net = computeNetBalanceCents(ids, [e], [], "USD", same);
  assert.deepEqual(net, { a: 3000, b: 0, c: -3000 });
  const pairs = computePairwiseDebts(ids, [e], [], "USD", same);
  // c owes 30, split 2:1 between payers a and b; b's share to a nets with a's share to b.
  assert.deepEqual(pairs, [
    { fromId: "b", toId: "a", amount: 10 },
    { fromId: "c", toId: "a", amount: 20 },
    { fromId: "c", toId: "b", amount: 10 },
  ]);
});

test("foreign-currency expenses are converted into the group currency", () => {
  const rates = { USD: 1, EUR: 0.5 };
  const convert = (amount, from, to) => (amount / rates[from]) * rates[to];
  const e = expense("a", 10, [["a", 5], ["b", 5]], "EUR");
  const debts = computeGroupDebts({ memberIds: ["a", "b"], expenses: [e], settlements: [], groupCurrency: "USD", convert, simplify: true });
  assert.deepEqual(debts, [{ fromId: "b", toId: "a", amount: 10 }]);
});

test("lines for people who left the group are ignored on both sides, so the group still balances", () => {
  const e = expense("a", 30, [["a", 10], ["b", 10], ["gone", 10]]);
  const net = computeNetBalanceCents(["a", "b"], [e], [], "USD", same);
  assert.equal(net.a + net.b, 0);
  assert.deepEqual(net, { a: 1000, b: -1000 });
});

test("pairwise mode nets a partial settlement in the right direction", () => {
  const e = expense("a", 20, [["a", 10], ["b", 10]]);
  const pairs = computePairwiseDebts(["a", "b"], [e], [{ fromId: "b", toId: "a", amount: 4, currency: "USD" }], "USD", same);
  assert.deepEqual(pairs, [{ fromId: "b", toId: "a", amount: 6 }]);
});

test("rounding to cents keeps the total", () => {
  const rounded = roundBalancesToCents({ a: 1 / 3, b: 1 / 3, c: -2 / 3 });
  assert.equal(rounded.a + rounded.b + rounded.c, 0);
});

test("friend balances across groups are converted before they are added", () => {
  const groups = [
    { currency: "AED", debts: [{ fromId: "alex", toId: "me", amount: 36.73 }] },
    { currency: "EUR", debts: [{ fromId: "me", toId: "alex", amount: 5 }] },
  ];
  const toUsd = (amount, from) => amount * (from === "AED" ? 0.2723 : 1.08);
  const result = summarizeCounterpartyBalances(groups, "me", toUsd);
  assert.deepEqual(result, { alex: 4.6 }); // 10.00 - 5.40; the old code showed 36.73 - 5 = 31.73
});

test("expenses saved a cent off their total still balance against the real total", () => {
  const ids = ["me", "alex", "jordan"];
  const expenses = [
    expense("me", 5, ids.map(id => [id, 1.67])),
    expense("me", 55, ids.map(id => [id, 18.33])),
  ];
  const debts = computeGroupDebts({ memberIds: ids, expenses, settlements: [], groupCurrency: "USD", convert: same, simplify: true });
  const owedToMe = debts.filter(d => d.toId === "me").reduce((sum, d) => sum + Math.round(d.amount * 100), 0);
  // Each expense's shares must add up to its real total: others owe 60.00 minus my share (1.66/1.67 + 18.33/18.34).
  assert.ok(owedToMe === 6000 - 167 - 1834 || owedToMe === 6000 - 166 - 1834 || owedToMe === 6000 - 167 - 1833 || owedToMe === 6000 - 166 - 1833, String(owedToMe));
  const settlements = debts.map(d => ({ ...d, currency: "USD" }));
  const after = computeGroupDebts({ memberIds: ids, expenses, settlements, groupCurrency: "USD", convert: same, simplify: true });
  assert.deepEqual(after, []);
});
