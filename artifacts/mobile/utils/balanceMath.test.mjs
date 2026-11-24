import assert from "node:assert/strict";
import test from "node:test";
import { getMemberNetPosition, summarizeMemberGroupBalances } from "./balanceMath.ts";

test("nets a settled payment cycle instead of counting its gross links", () => {
  const debts = [
    { fromId: "me", toId: "alex", amount: 2283 },
    { fromId: "alex", toId: "sam", amount: 2283 },
    { fromId: "sam", toId: "me", amount: 2283 },
  ];

  assert.equal(getMemberNetPosition(debts, "me"), 0);
});

test("keeps a genuine outstanding balance and its direction", () => {
  const debts = [
    { fromId: "me", toId: "alex", amount: 80.25 },
    { fromId: "sam", toId: "me", amount: 12.1 },
  ];

  assert.equal(getMemberNetPosition(debts, "me"), -68.15);
  assert.equal(getMemberNetPosition(debts, "alex"), 80.25);
});

test("keeps the global total at zero when every displayed group balance is settled", () => {
  const summary = summarizeMemberGroupBalances(
    [
      { currency: "AED", debts: [] },
      { currency: "EUR", debts: [] },
    ],
    "me",
    amount => amount,
  );

  assert.deepEqual(summary, { youOwe: 0, youAreOwed: 0 });
});

test("converts each group's net balance separately to the preferred currency", () => {
  const summary = summarizeMemberGroupBalances(
    [
      { currency: "EUR", debts: [{ fromId: "me", toId: "alex", amount: 80.25 }] },
      { currency: "AED", debts: [{ fromId: "sam", toId: "me", amount: 12.1 }] },
    ],
    "me",
    (amount, from) => amount * (from === "EUR" ? 1.1 : 0.27),
  );

  assert.equal(summary.youOwe, 88.275);
  assert.equal(summary.youAreOwed, 3.267);
});
