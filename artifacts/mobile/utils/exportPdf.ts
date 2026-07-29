import * as FileSystem from "expo-file-system/legacy";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";

import type { Expense, Group, Member, Settlement } from "@/context/AppContext";

interface PdfExportOptions {
  group: Group;
  expenses: Expense[];
  settlements: Settlement[];
  members: Member[];
  getMemberById: (id: string) => Member | undefined;
  /** Outstanding debts from getGroupBalances */
  debts: Array<{ fromId: string; toId: string; amount: number }>;
}

function safe(m: Member | undefined) {
  return m?.name ?? "Unknown";
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function fmtMoney(amount: number, currency: string) {
  return `${currency} ${amount.toFixed(2)}`;
}

/** Pastel avatar colour → use as a chip background */
const AVATAR_COLORS: Record<string, string> = {
  "#6C63FF": "#EDE9FF",
  "#FF6584": "#FFE4EB",
  "#43AA8B": "#D6F5EC",
  "#F9844A": "#FEEDE3",
  "#4CC9F0": "#DFF5FD",
  "#F72585": "#FFD6F0",
  "#7209B7": "#EDCEFF",
  "#3A0CA3": "#DCDAFF",
};
function avatarBg(color: string) {
  return AVATAR_COLORS[color] ?? "#F0F0F5";
}

// ── SVG logo (Y-shaped node, matches app icon) ───────────────────────────────
const LOGO_SVG = `
<svg width="48" height="48" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
  <rect width="100" height="100" rx="22" fill="white"/>
  <circle cx="50" cy="28" r="10" fill="#6C63FF"/>
  <circle cx="22" cy="72" r="10" fill="#43AA8B"/>
  <circle cx="78" cy="72" r="10" fill="#4CC9F0"/>
  <line x1="50" y1="38" x2="50" y2="60" stroke="#6C63FF" stroke-width="5" stroke-linecap="round"/>
  <line x1="50" y1="60" x2="22" y2="72" stroke="#43AA8B" stroke-width="5" stroke-linecap="round"/>
  <line x1="50" y1="60" x2="78" y2="72" stroke="#4CC9F0" stroke-width="5" stroke-linecap="round"/>
</svg>`.trim();

const LOGO_DATA_URI = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(LOGO_SVG)}`;

// ── HTML template ────────────────────────────────────────────────────────────
function buildHtml(opts: PdfExportOptions): string {
  const { group, expenses, settlements, members, getMemberById, debts } = opts;
  const exportedAt = fmtDateTime(new Date().toISOString());

  // ── Members ──────────────────────────────────────────────────────────────
  const memberRows = members
    .filter(m => group.memberIds.includes(m.id))
    .map(m => {
      const bg = avatarBg(m.avatarColor);
      const initials = m.name.split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2);
      const isAdmin = (group.adminIds ?? []).includes(m.id);
      return `
        <span class="member-chip" style="background:${bg}">
          <span class="member-avatar" style="background:${m.avatarColor}">${initials}</span>
          ${m.name}${isAdmin ? ' <span class="admin-badge">Admin</span>' : ""}
        </span>`;
    })
    .join("");

  // ── Balances ─────────────────────────────────────────────────────────────
  const balanceRows = debts.length === 0
    ? `<tr><td colspan="3" class="empty-cell">✓ All settled up</td></tr>`
    : debts.map(d => `
        <tr>
          <td>${safe(getMemberById(d.fromId))}</td>
          <td class="arrow">→</td>
          <td>${safe(getMemberById(d.toId))}</td>
          <td class="amount">${fmtMoney(d.amount, group.currency)}</td>
        </tr>`).join("");

  // ── Expenses ─────────────────────────────────────────────────────────────
  const totalExpenses = expenses.reduce((s, e) => s + e.amount, 0);
  const expenseRows = expenses.length === 0
    ? `<tr><td colspan="5" class="empty-cell">No expenses recorded</td></tr>`
    : expenses.map((e, i) => {
        const payer = getMemberById(e.paidById);
        const payerInit = payer ? payer.name.split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2) : "?";
        const payerBg = payer ? avatarBg(payer.avatarColor) : "#F0F0F5";
        const payerColor = payer?.avatarColor ?? "#999";
        const splits = (e.splits ?? [])
          .map(s => {
            const m = getMemberById(s.memberId);
            return m ? `${m.name.split(" ")[0]}: ${e.currency} ${s.amount.toFixed(2)}` : "";
          })
          .filter(Boolean)
          .join(" · ");
        return `
          <tr class="${i % 2 === 0 ? "row-even" : "row-odd"}">
            <td class="date-cell">${fmtDate(e.createdAt)}</td>
            <td>
              <div class="expense-name">${e.description}</div>
              ${e.category ? `<div class="expense-cat">${e.category}</div>` : ""}
              ${splits ? `<div class="splits">${splits}</div>` : ""}
            </td>
            <td class="amount">${fmtMoney(e.amount, e.currency)}</td>
            <td>
              <span class="payer-chip" style="background:${payerBg}">
                <span class="payer-dot" style="background:${payerColor}">${payerInit}</span>
                ${payer?.name.split(" ")[0] ?? "?"}
              </span>
            </td>
          </tr>`;
      }).join("");

  // ── Settlements ───────────────────────────────────────────────────────────
  const settlementRows = settlements.length === 0
    ? `<tr><td colspan="4" class="empty-cell">No settlements recorded</td></tr>`
    : settlements.map((s, i) => `
        <tr class="${i % 2 === 0 ? "row-even" : "row-odd"}">
          <td class="date-cell">${fmtDate(s.createdAt)}</td>
          <td>${safe(getMemberById(s.fromId))}</td>
          <td class="arrow">→</td>
          <td>${safe(getMemberById(s.toId))}</td>
          <td class="amount">${fmtMoney(s.amount, s.currency)}</td>
        </tr>`).join("");

  // ── Group info pills ──────────────────────────────────────────────────────
  const typeLabel = {
    trip: "✈️ Trip", home: "🏠 Home", friends: "👫 Friends",
    couple: "💑 Couple", other: "📦 Other",
  }[group.type] ?? group.type;

  const infoPills = [
    `<span class="pill">${typeLabel}</span>`,
    `<span class="pill">💰 ${group.currency}</span>`,
    `<span class="pill">📅 Created ${fmtDate(group.createdAt)}</span>`,
    group.startDate ? `<span class="pill">🗓 ${fmtDate(group.startDate)} → ${group.endDate ? fmtDate(group.endDate) : "open"}</span>` : "",
    group.isEnded ? `<span class="pill ended-pill">⏹ Ended ${group.endedAt ? fmtDate(group.endedAt) : ""}</span>` : "",
  ].filter(Boolean).join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
    font-size: 12px; color: #1a1a2e; background: #fff;
    padding: 32px 36px;
  }

  /* ── Header ── */
  .header {
    display: flex; align-items: center; gap: 14px;
    padding-bottom: 18px; border-bottom: 2px solid #6C63FF; margin-bottom: 20px;
  }
  .logo { width: 48px; height: 48px; border-radius: 12px; box-shadow: 0 2px 8px rgba(108,99,255,.2); }
  .brand { flex: 1; }
  .brand-name { font-size: 20px; font-weight: 700; color: #6C63FF; letter-spacing: -0.3px; }
  .brand-sub  { font-size: 11px; color: #888; margin-top: 1px; }
  .export-meta { text-align: right; font-size: 10px; color: #aaa; line-height: 1.6; }

  /* ── Group title ── */
  .group-header { display: flex; align-items: flex-start; gap: 14px; margin-bottom: 14px; }
  .group-emoji { font-size: 36px; line-height: 1; }
  .group-title { font-size: 22px; font-weight: 700; color: #1a1a2e; }
  .group-pills { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 6px; }
  .pill {
    display: inline-block; padding: 3px 10px; border-radius: 20px;
    background: #f0eeff; color: #5a52cc; font-size: 10px; font-weight: 600;
  }
  .ended-pill { background: #FFF3CD; color: #856404; }

  /* ── Members ── */
  .section { margin-bottom: 22px; }
  .section-title {
    font-size: 11px; font-weight: 700; letter-spacing: 0.8px;
    text-transform: uppercase; color: #6C63FF;
    margin-bottom: 10px; padding-bottom: 4px;
    border-bottom: 1px solid #e8e4ff;
  }
  .members-wrap { display: flex; flex-wrap: wrap; gap: 8px; }
  .member-chip {
    display: inline-flex; align-items: center; gap: 6px;
    padding: 4px 10px 4px 4px; border-radius: 20px;
    font-size: 11px; font-weight: 600; color: #333;
  }
  .member-avatar {
    width: 22px; height: 22px; border-radius: 11px;
    display: inline-flex; align-items: center; justify-content: center;
    font-size: 9px; font-weight: 700; color: #fff;
  }
  .admin-badge {
    display: inline-block; font-size: 8px; font-weight: 700;
    background: #6C63FF; color: #fff;
    padding: 1px 5px; border-radius: 6px; margin-left: 2px;
  }

  /* ── Tables ── */
  table { width: 100%; border-collapse: collapse; font-size: 11px; }
  th {
    text-align: left; padding: 8px 10px;
    background: #6C63FF; color: #fff;
    font-size: 10px; font-weight: 700; letter-spacing: 0.4px;
  }
  th:first-child { border-radius: 8px 0 0 0; }
  th:last-child  { border-radius: 0 8px 0 0; }
  td { padding: 7px 10px; vertical-align: top; }
  .row-even { background: #fafafa; }
  .row-odd  { background: #fff; }
  tr:last-child td:first-child { border-radius: 0 0 0 8px; }
  tr:last-child td:last-child  { border-radius: 0 0 8px 0; }
  .date-cell { color: #888; white-space: nowrap; font-size: 10px; }
  .amount { font-weight: 700; color: #1a1a2e; white-space: nowrap; text-align: right; }
  .arrow  { color: #6C63FF; font-weight: 700; text-align: center; }
  .empty-cell { text-align: center; color: #43AA8B; font-weight: 600; padding: 14px; }
  .expense-name { font-weight: 600; }
  .expense-cat  { font-size: 10px; color: #888; margin-top: 1px; }
  .splits       { font-size: 9px; color: #aaa; margin-top: 2px; line-height: 1.4; }
  .payer-chip {
    display: inline-flex; align-items: center; gap: 4px;
    padding: 2px 7px 2px 3px; border-radius: 12px; font-size: 10px; font-weight: 600;
  }
  .payer-dot {
    width: 16px; height: 16px; border-radius: 8px;
    display: inline-flex; align-items: center; justify-content: center;
    font-size: 7px; font-weight: 700; color: #fff;
  }
  .table-wrap {
    border-radius: 8px; overflow: hidden;
    box-shadow: 0 1px 4px rgba(0,0,0,.07);
  }

  /* ── Summary bar ── */
  .summary-bar {
    display: flex; gap: 12px; margin-bottom: 18px;
  }
  .summary-card {
    flex: 1; padding: 12px 14px; border-radius: 10px;
    background: #f0eeff; border: 1px solid #e0d8ff;
  }
  .summary-card.green { background: #d6f5ec; border-color: #b2e8d5; }
  .summary-label { font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.6px; color: #888; }
  .summary-value { font-size: 16px; font-weight: 700; color: #1a1a2e; margin-top: 2px; }

  /* ── Footer ── */
  .footer {
    margin-top: 28px; padding-top: 14px; border-top: 1px solid #eee;
    display: flex; justify-content: space-between; align-items: center;
    font-size: 10px; color: #bbb;
  }
  .footer-brand { font-weight: 700; color: #6C63FF; }

  /* ── Page break ── */
  .page-break { page-break-before: always; margin-top: 28px; }
</style>
</head>
<body>

  <!-- Header -->
  <div class="header">
    <img class="logo" src="${LOGO_DATA_URI}" alt="SplitEasy"/>
    <div class="brand">
      <div class="brand-name">SplitEasy</div>
      <div class="brand-sub">Group Expense Report</div>
    </div>
    <div class="export-meta">
      Exported<br/>${exportedAt}
    </div>
  </div>

  <!-- Group title -->
  <div class="section">
    <div class="group-header">
      <span class="group-emoji">${group.emoji}</span>
      <div>
        <div class="group-title">${group.name}</div>
        <div class="group-pills">${infoPills}</div>
      </div>
    </div>
  </div>

  <!-- Summary bar -->
  <div class="summary-bar">
    <div class="summary-card">
      <div class="summary-label">Members</div>
      <div class="summary-value">${members.filter(m => group.memberIds.includes(m.id)).length}</div>
    </div>
    <div class="summary-card">
      <div class="summary-label">Expenses</div>
      <div class="summary-value">${expenses.length}</div>
    </div>
    <div class="summary-card">
      <div class="summary-label">Total Spent</div>
      <div class="summary-value">${fmtMoney(totalExpenses, group.currency)}</div>
    </div>
    <div class="summary-card green">
      <div class="summary-label">Settlements</div>
      <div class="summary-value">${settlements.length}</div>
    </div>
  </div>

  <!-- Members -->
  <div class="section">
    <div class="section-title">Members</div>
    <div class="members-wrap">${memberRows}</div>
  </div>

  <!-- Outstanding balances -->
  <div class="section">
    <div class="section-title">Outstanding Balances</div>
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Owes</th><th></th><th>To</th><th style="text-align:right">Amount</th>
          </tr>
        </thead>
        <tbody>${balanceRows}</tbody>
      </table>
    </div>
  </div>

  <!-- Expenses -->
  <div class="section page-break">
    <div class="section-title">Expenses (${expenses.length})</div>
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Date</th><th>Description</th>
            <th style="text-align:right">Amount</th><th>Paid By</th>
          </tr>
        </thead>
        <tbody>${expenseRows}</tbody>
      </table>
    </div>
  </div>

  <!-- Settlements -->
  <div class="section">
    <div class="section-title">Settlements (${settlements.length})</div>
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Date</th><th>From</th><th></th><th>To</th>
            <th style="text-align:right">Amount</th>
          </tr>
        </thead>
        <tbody>${settlementRows}</tbody>
      </table>
    </div>
  </div>

  <!-- Footer -->
  <div class="footer">
    <span class="footer-brand">SplitEasy</span>
    <span>${group.name} · ${fmtDate(group.createdAt)} → ${exportedAt}</span>
    <span>splitEasy.app</span>
  </div>

</body>
</html>`;
}

// ── Public export function ────────────────────────────────────────────────────
export async function exportGroupToPdf(opts: PdfExportOptions): Promise<void> {
  const html = buildHtml(opts);

  // Render HTML → PDF via expo-print
  const { uri: pdfUri } = await Print.printToFileAsync({ html, base64: false });

  // Move to a stable cache path with a readable name
  const slug = opts.group.name.replace(/[^a-z0-9]/gi, "_").toLowerCase();
  const destUri = `${FileSystem.cacheDirectory}${slug}_report.pdf`;
  await FileSystem.moveAsync({ from: pdfUri, to: destUri });

  const available = await Sharing.isAvailableAsync();
  if (available) {
    await Sharing.shareAsync(destUri, {
      mimeType: "application/pdf",
      dialogTitle: `Export PDF — ${opts.group.name}`,
      UTI: "com.adobe.pdf",
    });
  } else {
    throw new Error("Sharing is not available on this platform.");
  }
}
