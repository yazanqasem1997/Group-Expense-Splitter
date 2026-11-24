import assert from "node:assert/strict";
import test from "node:test";
import { buildReceiptMemberTotals } from "./receiptArithmetic.ts";

const sumTotals = (totals) =>
  Math.round(Object.values(totals).reduce((sum, amount) => sum + amount, 0) * 100) / 100;

test("allocates VAT and tip proportionally across claimed members", () => {
  const totals = buildReceiptMemberTotals({
    items: [
      { id: "coffee", amount: 40, claimedByMemberKeys: ["alice"] },
      { id: "lunch", amount: 60, claimedByMemberKeys: ["bob"] },
    ],
    total: 110,
    discount: 0,
    discountMemberKeys: [],
    tax: 6,
    tip: 4,
  });

  assert.deepEqual(totals, { alice: 44, bob: 66 });
  assert.equal(sumTotals(totals), 110);
});

test("keeps a VAT line separate from product claims", () => {
  const totals = buildReceiptMemberTotals({
    items: [{ id: "product", amount: 100, claimedByMemberKeys: ["alice", "bob"] }],
    total: 105,
    discount: 0,
    discountMemberKeys: [],
    tax: 5,
    tip: 0,
  });

  assert.deepEqual(totals, { alice: 52.5, bob: 52.5 });
  assert.equal(sumTotals(totals), 105);
});

test("applies the manual discount after proportional VAT and tip", () => {
  const totals = buildReceiptMemberTotals({
    items: [
      { id: "starter", amount: 30, claimedByMemberKeys: ["alice"] },
      { id: "main", amount: 70, claimedByMemberKeys: ["bob"] },
    ],
    total: 105,
    discount: -10,
    discountMemberKeys: ["bob"],
    tax: 10,
    tip: 5,
  });

  assert.deepEqual(totals, { alice: 34.5, bob: 70.5 });
  assert.equal(sumTotals(totals), 105);
});

test("keeps the final total exact when proportional allocations need rounding", () => {
  const totals = buildReceiptMemberTotals({
    items: [
      { id: "small", amount: 1, claimedByMemberKeys: ["alice"] },
      { id: "large", amount: 2, claimedByMemberKeys: ["bob"] },
    ],
    total: 3.01,
    discount: 0,
    discountMemberKeys: [],
    tax: 0.01,
    tip: 0,
  });

  assert.deepEqual(totals, { alice: 1, bob: 2.01 });
  assert.equal(sumTotals(totals), 3.01);
});

test("does not change item shares when VAT and tip are missing or zero", () => {
  const totals = buildReceiptMemberTotals({
    items: [
      { id: "one", amount: 25, claimedByMemberKeys: ["alice"] },
      { id: "two", amount: 75, claimedByMemberKeys: ["bob"] },
    ],
    total: 100,
    discount: 0,
    discountMemberKeys: [],
    tax: 0,
    tip: 0,
  });

  assert.deepEqual(totals, { alice: 25, bob: 75 });
  assert.equal(sumTotals(totals), 100);
});