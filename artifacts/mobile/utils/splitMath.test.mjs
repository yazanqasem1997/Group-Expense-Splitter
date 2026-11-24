import assert from "node:assert/strict";
import test from "node:test";
import {
  allocateByWeights,
  evenPercentages,
  inferShares,
  percentagesAddUp,
  splitByPercentages,
  splitByShares,
  splitEqually,
  sumMoney,
  toCents,
} from "./splitMath.ts";

const cents = values => values.reduce((sum, v) => sum + toCents(v), 0);

test("toCents is immune to binary noise", () => {
  assert.equal(toCents(1.005), 101);
  assert.equal(toCents(0.1 + 0.2), 30);
  assert.equal(toCents(-1.005), -101);
});

test("equal split of 100 three ways adds back to 100.00 (was 99.99)", () => {
  const parts = splitEqually(100, 3);
  assert.deepEqual(parts, [33.34, 33.33, 33.33]);
  assert.equal(cents(parts), 10000);
});

test("equal split of 100 six ways adds back to 100.00 (was 100.02, rejected by the API)", () => {
  const parts = splitEqually(100, 6);
  assert.equal(cents(parts), 10000);
  assert.ok(parts.every(p => p === 16.67 || p === 16.66));
});

test("equal split never drifts for many awkward totals", () => {
  for (let n = 1; n <= 13; n++) {
    for (const total of [0.01, 0.05, 1, 9.99, 10, 33.33, 100, 1234.57, 99999.99]) {
      const parts = splitEqually(total, n);
      assert.equal(cents(parts), toCents(total), `${total} / ${n}`);
      const spread = Math.max(...parts.map(toCents)) - Math.min(...parts.map(toCents));
      assert.ok(spread <= 1, `shares differ by at most one cent (${total} / ${n})`);
    }
  }
});

test("percentage split sums exactly even when amounts round unevenly", () => {
  const parts = splitByPercentages(10, [33.33, 33.33, 33.34]);
  assert.equal(cents(parts), 1000);
  const odd = splitByPercentages(99.99, [12.5, 37.5, 50]);
  assert.equal(cents(odd), 9999);
});

test("percentages must add up to 100 within one basis point (same rule as the API)", () => {
  assert.equal(percentagesAddUp([33.33, 33.33, 33.34]), true);
  assert.equal(percentagesAddUp([33.3, 33.3, 33.3]), false); // 99.9% used to pass on the client and fail on the server
  assert.equal(percentagesAddUp([50, 50.01]), true);
  assert.equal(percentagesAddUp([50, 50.02]), false);
});

test("even default percentages add up to exactly 100", () => {
  assert.deepEqual(evenPercentages(3), [33.34, 33.33, 33.33]);
  assert.equal(percentagesAddUp(evenPercentages(7)), true);
});

test("shares split 2:1:1 of 100 is 50 / 25 / 25 and odd totals still sum", () => {
  assert.deepEqual(splitByShares(100, [2, 1, 1]), [50, 25, 25]);
  const parts = splitByShares(10, [1, 1, 1]);
  assert.equal(cents(parts), 1000);
  assert.deepEqual(splitByShares(10, [0, 1, 0]), [0, 10, 0]);
});

test("allocation handles empty and zero-weight inputs", () => {
  assert.deepEqual(allocateByWeights(10, []), []);
  assert.deepEqual(allocateByWeights(10, [0, 0]), [0, 0]);
  assert.deepEqual(allocateByWeights(-10, [1, 1, 1]), [-3.34, -3.33, -3.33]);
});

test("inferShares recovers ratios from saved amounts", () => {
  assert.deepEqual(inferShares([50, 25, 25]), [2, 1, 1]);
  assert.deepEqual(inferShares([0, 0]), [1, 1]);
});

test("sumMoney adds without float noise", () => {
  assert.equal(sumMoney([0.1, 0.2]), 0.3);
  assert.equal(sumMoney([33.34, 33.33, 33.33]), 100);
});
