import assert from "node:assert/strict";
import test from "node:test";
import { buildCsv, buildHtml } from "./exportFormat.ts";

const input = {
  groupName: "Bali <trip>",
  groupCurrency: "AED",
  memberIds: ["a", "b"],
  nameOf: id => ({ a: "Sara", b: "Omar, Jr" })[id] ?? "?",
  expenses: [{
    description: '=HYPERLINK("x")', amount: 100, currency: "USD", paidById: "a",
    createdAt: "2026-11-10T10:00:00Z", paymentDate: "2026-11-09",
    splits: [{ memberId: "a", amount: 50 }, { memberId: "b", amount: 50 }],
    fxRate: 3.6725, fxRateCurrency: "AED",
  }],
  settlements: [{ fromId: "b", toId: "a", amount: 183.63, currency: "AED", createdAt: "2026-11-11T10:00:00Z" }],
  debts: [],
  convert: () => { throw new Error("the locked rate should be used"); },
  generatedOn: "2026-11-16",
};

test("CSV uses the locked rate, escapes commas and blocks spreadsheet formulas", () => {
  const csv = buildCsv(input);
  assert.match(csv, /367\.25/);
  assert.match(csv, /"Omar, Jr share"/);
  assert.match(csv, /'=HYPERLINK/);
  assert.equal(csv.trim().split("\r\n").length, 3);
});

test("PDF report escapes names and says when everyone is settled", () => {
  const html = buildHtml(input);
  assert.match(html, /Bali &lt;trip&gt;/);
  assert.match(html, /settled up/);
});
