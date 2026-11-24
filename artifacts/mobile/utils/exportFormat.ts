/**
 * CSV and PDF (HTML) exports of a group. Pure functions so they can be tested in Node.
 * Amounts in the group currency use the rate locked on each record when there is one.
 */
export type ExportExpense = {
  description: string;
  amount: number;
  currency: string;
  paidById: string;
  createdAt: string;
  paymentDate?: string | null;
  category?: string;
  splits: { memberId: string; amount: number }[];
  fxRate?: number | null;
  fxRateCurrency?: string | null;
};
export type ExportSettlement = {
  fromId: string;
  toId: string;
  amount: number;
  currency: string;
  createdAt: string;
  fxRate?: number | null;
  fxRateCurrency?: string | null;
};
export type ExportInput = {
  groupName: string;
  groupCurrency: string;
  memberIds: string[];
  nameOf: (id: string) => string;
  expenses: ExportExpense[];
  settlements: ExportSettlement[];
  debts: { fromId: string; toId: string; amount: number }[];
  convert: (amount: number, from: string, to: string) => number;
  /** YYYY-MM-DD */
  generatedOn: string;
};

const day = (record: { paymentDate?: string | null; createdAt: string }) => (record.paymentDate || record.createdAt).slice(0, 10);
const money = (value: number) => value.toFixed(2);

function inGroup(input: ExportInput, amount: number, currency: string, fxRate?: number | null, fxRateCurrency?: string | null): number {
  if (currency === input.groupCurrency) return amount;
  if (fxRate && fxRate > 0 && fxRateCurrency) {
    const locked = amount * fxRate;
    return fxRateCurrency === input.groupCurrency ? locked : input.convert(locked, fxRateCurrency, input.groupCurrency);
  }
  return input.convert(amount, currency, input.groupCurrency);
}

function csvCell(value: string | number): string {
  let text = String(value);
  // Stop spreadsheet apps from running text that looks like a formula.
  if (typeof value === "string" && /^[=+\-@]/.test(text)) text = "'" + text;
  return /[",\r\n]/.test(text) ? '"' + text.replace(/"/g, '""') + '"' : text;
}

export function buildCsv(input: ExportInput): string {
  const header = [
    "Date", "Type", "Description", "Category", "Paid by", "Amount", "Currency",
    "Rate to " + input.groupCurrency, "Amount in " + input.groupCurrency,
    ...input.memberIds.map(id => input.nameOf(id) + " share"),
  ];
  const rows: (string | number)[][] = [header];
  const items = [
    ...input.expenses.map(expense => ({ when: day(expense), expense, settlement: null as ExportSettlement | null })),
    ...input.settlements.map(settlement => ({ when: day(settlement), expense: null as ExportExpense | null, settlement })),
  ].sort((a, b) => a.when.localeCompare(b.when));
  for (const item of items) {
    if (item.expense) {
      const e = item.expense;
      const value = inGroup(input, e.amount, e.currency, e.fxRate, e.fxRateCurrency);
      rows.push([
        item.when, "Expense", e.description, e.category ?? "", input.nameOf(e.paidById),
        money(e.amount), e.currency, (e.amount ? value / e.amount : 1).toFixed(6), money(value),
        ...input.memberIds.map(id => {
          const share = e.splits.filter(split => split.memberId === id).reduce((sum, split) => sum + split.amount, 0);
          return share ? money(share) : "";
        }),
      ]);
    } else if (item.settlement) {
      const s = item.settlement;
      const value = inGroup(input, s.amount, s.currency, s.fxRate, s.fxRateCurrency);
      rows.push([
        item.when, "Payment", input.nameOf(s.fromId) + " paid " + input.nameOf(s.toId), "", input.nameOf(s.fromId),
        money(s.amount), s.currency, (s.amount ? value / s.amount : 1).toFixed(6), money(value),
        ...input.memberIds.map(() => ""),
      ]);
    }
  }
  return "﻿" + rows.map(row => row.map(csvCell).join(",")).join("\r\n") + "\r\n";
}

const esc = (text: string) =>
  text.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string);

export function buildHtml(input: ExportInput): string {
  const cur = esc(input.groupCurrency);
  const expenses = [...input.expenses].sort((a, b) => day(a).localeCompare(day(b)));
  const total = expenses.reduce((sum, e) => sum + inGroup(input, e.amount, e.currency, e.fxRate, e.fxRateCurrency), 0);
  const rows = expenses.map(e => {
    const value = inGroup(input, e.amount, e.currency, e.fxRate, e.fxRateCurrency);
    const foreign = e.currency !== input.groupCurrency ? '<div class="sub">' + money(e.amount) + " " + esc(e.currency) + "</div>" : "";
    return "<tr><td>" + day(e) + "</td><td>" + esc(e.description) + foreign + "</td><td>" + esc(input.nameOf(e.paidById)) +
      '</td><td class="num">' + money(value) + "</td></tr>";
  }).join("");
  const owes = input.debts.length
    ? input.debts.map(d => "<li>" + esc(input.nameOf(d.fromId)) + " pays " + esc(input.nameOf(d.toId)) + " <b>" + cur + " " + money(d.amount) + "</b></li>").join("")
    : "<li>Everyone is settled up.</li>";
  return '<!doctype html><html><head><meta charset="utf-8"><style>' +
    "body{font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#0B2A2E;margin:32px}" +
    "header{background:linear-gradient(135deg,#04404A,#0E7C86 60%,#18B6A4);color:#fff;border-radius:16px;padding:22px 24px;margin-bottom:22px}" +
    "h1{margin:0 0 4px;font-size:24px}header p{margin:0;opacity:.85}h2{font-size:16px;margin:24px 0 8px}" +
    "table{width:100%;border-collapse:collapse;font-size:13px}th,td{text-align:left;padding:8px 6px;border-bottom:1px solid #E1ECEC;vertical-align:top}" +
    "th{color:#557277;font-size:11px;text-transform:uppercase;letter-spacing:.06em}.num{text-align:right;font-variant-numeric:tabular-nums}" +
    ".sub{color:#557277;font-size:11px}ul{padding-left:18px}footer{margin-top:28px;color:#557277;font-size:11px}" +
    "</style></head><body>" +
    "<header><h1>" + esc(input.groupName) + "</h1><p>" + expenses.length + " expenses · total " + cur + " " + money(total) + "</p></header>" +
    "<h2>Who pays whom</h2><ul>" + owes + "</ul>" +
    '<h2>Expenses</h2><table><thead><tr><th>Date</th><th>Description</th><th>Paid by</th><th class="num">' + cur + "</th></tr></thead><tbody>" + rows + "</tbody></table>" +
    "<footer>Made with Split Mate on " + esc(input.generatedOn) + ". Foreign amounts use the rate on the day of each payment.</footer>" +
    "</body></html>";
}
