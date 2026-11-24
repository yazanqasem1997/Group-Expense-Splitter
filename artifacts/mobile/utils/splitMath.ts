/**
 * Cent-exact helpers for turning an expense total into per-person shares.
 *
 * Every function works in integer minor units (cents) internally and uses the
 * largest-remainder method, so the shares ALWAYS add back up to the total
 * exactly. Rounding each share on its own (the old approach) loses or invents
 * cents: 100 / 3 -> 33.33 x 3 = 99.99, and 100 / 6 -> 16.67 x 6 = 100.02,
 * which the API rejects because it allows at most one cent of drift.
 *
 * Self-contained on purpose (no imports) so Node's test runner can load it.
 */

/** Percent splits must add up to 100 within this many percentage points (matches the API's 1 basis point). */
export const PERCENT_TOLERANCE = 0.01;

/** Converts a money value to integer cents, immune to binary noise such as 1.005 * 100 = 100.4999. */
export function toCents(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * 100 + (value >= 0 ? 1e-6 : -1e-6));
}

export function fromCents(cents: number): number {
  return cents / 100;
}

/** Adds money values without floating-point drift. */
export function sumMoney(values: number[]): number {
  return fromCents(values.reduce((sum, value) => sum + toCents(value), 0));
}

/**
 * Splits `total` across `weights` (shares, percentages, or 1s for equal) so the
 * parts add up to `total` to the cent. Leftover cents go to the largest
 * fractional remainders; ties go to the earlier entry, so the result is stable.
 * Entries with a zero or invalid weight receive 0.
 */
export function allocateByWeights(total: number, weights: number[]): number[] {
  const n = weights.length;
  if (n === 0) return [];
  const clean = weights.map(w => (Number.isFinite(w) && w > 0 ? w : 0));
  const weightSum = clean.reduce((sum, w) => sum + w, 0);
  if (weightSum <= 0) return weights.map(() => 0);

  const totalCents = toCents(total);
  const sign = totalCents < 0 ? -1 : 1;
  const absCents = Math.abs(totalCents);
  const exact = clean.map(w => (absCents * w) / weightSum);
  const cents = exact.map(value => Math.floor(value + 1e-9));
  let remaining = absCents - cents.reduce((sum, c) => sum + c, 0);

  const order = exact
    .map((value, index) => ({ index, fraction: value - cents[index] }))
    .filter(entry => clean[entry.index] > 0)
    .sort((a, b) => b.fraction - a.fraction || a.index - b.index);
  for (let k = 0; remaining > 0 && order.length > 0; k++, remaining--) {
    cents[order[k % order.length].index] += 1;
  }
  return cents.map(c => fromCents(sign * c) + 0); // + 0 turns -0 into 0
}

export function splitEqually(total: number, count: number): number[] {
  if (count <= 0) return [];
  return allocateByWeights(total, Array.from({ length: count }, () => 1));
}

export function splitByShares(total: number, shares: number[]): number[] {
  return allocateByWeights(total, shares);
}

/** Splits by percentages; the parts always sum to `total` even if the percentages are a hair off 100. */
export function splitByPercentages(total: number, percentages: number[]): number[] {
  return allocateByWeights(total, percentages);
}

export function sumPercentages(percentages: number[]): number {
  return Math.round(percentages.reduce((sum, p) => sum + (Number.isFinite(p) ? p : 0), 0) * 10_000) / 10_000;
}

export function percentagesAddUp(percentages: number[]): boolean {
  return Math.abs(sumPercentages(percentages) - 100) <= PERCENT_TOLERANCE + 1e-9;
}

/** Default percentages for `count` people that add up to exactly 100.00 (e.g. 33.34 / 33.33 / 33.33). */
export function evenPercentages(count: number): number[] {
  return splitEqually(100, count);
}

/**
 * Recovers whole-ish share counts from saved amounts when editing a "shares"
 * expense (the API stores amounts, not share counts). Smallest share -> 1.
 */
export function inferShares(amounts: number[]): number[] {
  const positive = amounts.filter(a => a > 0);
  if (positive.length === 0) return amounts.map(() => 1);
  const smallest = Math.min(...positive);
  return amounts.map(a => (a > 0 ? Math.round((a / smallest) * 100) / 100 : 0));
}

/** Currencies with no minor unit: amounts must be whole numbers (e.g. ¥334 + ¥333 + ¥333). */
export const ZERO_DECIMAL_CURRENCIES = new Set([
  "JPY", "KRW", "VND", "CLP", "ISK", "UGX", "XAF", "XOF", "XPF", "PYG", "RWF", "KMF", "GNF", "DJF", "VUV", "BIF",
]);
const isWhole = (currency?: string) => !!currency && ZERO_DECIMAL_CURRENCIES.has(currency);

export function splitEquallyFor(amount: number, count: number, currency?: string): number[] {
  if (!isWhole(currency)) return splitEqually(amount, count);
  return splitEqually(Math.round(amount) / 100, count).map(v => Math.round(v * 100));
}
export function splitBySharesFor(amount: number, weights: number[], currency?: string): number[] {
  if (!isWhole(currency)) return splitByShares(amount, weights);
  return splitByShares(Math.round(amount) / 100, weights).map(v => Math.round(v * 100));
}
export function splitByPercentagesFor(amount: number, pcts: number[], currency?: string): number[] {
  if (!isWhole(currency)) return splitByPercentages(amount, pcts);
  return splitByPercentages(Math.round(amount) / 100, pcts).map(v => Math.round(v * 100));
}
