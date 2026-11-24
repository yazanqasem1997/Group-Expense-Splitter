import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { FALLBACK_RATES, convertWithRates, sanitizeRates, withFallback } from "./fx.ts";

const source = readFileSync(new URL("../context/AppContext.tsx", import.meta.url), "utf8");
const listed = [...new Set([...source.matchAll(/code: "([A-Z]{3})"/g)].map(m => m[1]))];

test("every currency in the picker has a bundled rate", () => {
  assert.ok(listed.length > 100);
  assert.deepEqual(listed.filter(code => !(code in FALLBACK_RATES)), []);
});

test("unknown currencies are reported, never treated as USD", () => {
  assert.equal(convertWithRates(100, "XXX", "AED", FALLBACK_RATES), null);
  assert.equal(convertWithRates(100, "AED", "AED", {}), 100);
});

test("missing live rates fall back to bundled ones instead of 1:1", () => {
  const table = withFallback({ USD: 1, EUR: 0.9 });
  assert.equal(table.EUR, 0.9);
  const aed = convertWithRates(100, "USD", "AED", table);
  assert.ok(aed > 300 && aed < 400);
});

test("bad API payloads are rejected", () => {
  assert.equal(sanitizeRates(null), null);
  assert.equal(sanitizeRates({ USD: 1, EUR: 0.9 }), null);
  const cleaned = sanitizeRates({ ...FALLBACK_RATES, EUR: -1, ABC: "x" });
  assert.ok(cleaned && !("EUR" in cleaned) && !("ABC" in cleaned));
});
