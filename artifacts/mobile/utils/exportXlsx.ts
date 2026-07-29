import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import * as XLSX from "xlsx";

import { type Expense, type Group, type Member, type Settlement } from "@/context/AppContext";

interface ExportOptions {
  group: Group;
  expenses: Expense[];
  settlements: Settlement[];
  getMemberById: (id: string) => Member | undefined;
}

function safeName(m: Member | undefined) {
  return m?.name ?? "Unknown";
}

export async function exportGroupToXlsx({
  group,
  expenses,
  settlements,
  getMemberById,
}: ExportOptions): Promise<void> {
  // ── Sheet 1: Expenses ───────────────────────────────────────────────────
  const expenseHeader = [
    "Date",
    "Description",
    "Amount",
    "Currency",
    "Paid By",
    "Category",
    "Involved Members",
    "Per-Person Shares",
  ];

  const expenseRows = expenses.map(e => {
    const payer = getMemberById(e.paidById);
    const shares = (e.splits ?? [])
      .map(s => {
        const m = getMemberById(s.memberId);
        return `${safeName(m)}: ${e.currency} ${s.amount.toFixed(2)}`;
      })
      .join("; ");
    const involved = (e.splits ?? [])
      .map(s => safeName(getMemberById(s.memberId)))
      .join(", ");

    return [
      new Date(e.createdAt).toLocaleDateString("en-GB"),
      e.description,
      e.amount,
      e.currency,
      safeName(payer),
      e.category ?? "",
      involved,
      shares,
    ];
  });

  // ── Sheet 2: Settlements ────────────────────────────────────────────────
  const settlementHeader = ["Date", "From", "To", "Amount", "Currency"];
  const settlementRows = settlements.map(s => [
    new Date(s.createdAt).toLocaleDateString("en-GB"),
    safeName(getMemberById(s.fromId)),
    safeName(getMemberById(s.toId)),
    s.amount,
    s.currency,
  ]);

  // ── Sheet 3: Audit Log ──────────────────────────────────────────────────
  const auditHeader = [
    "Date / Time",
    "Expense",
    "Changed By",
    "Action",
    "Field",
    "Old Value",
    "New Value",
  ];

  const auditRows: (string | number)[][] = [];
  expenses.forEach(e => {
    (e.auditLog ?? []).forEach(entry => {
      const changer = getMemberById(entry.changedBy);
      const ts = new Date(entry.changedAt).toLocaleString("en-GB");
      if (entry.fieldChanges?.length) {
        entry.fieldChanges.forEach(fc => {
          auditRows.push([ts, e.description, safeName(changer), entry.action, fc.field, fc.oldValue, fc.newValue]);
        });
      } else {
        auditRows.push([ts, e.description, safeName(changer), entry.action, "—", "—", "—"]);
      }
    });
  });

  // ── Build workbook ──────────────────────────────────────────────────────
  const wb = XLSX.utils.book_new();

  const ws1 = XLSX.utils.aoa_to_sheet([expenseHeader, ...expenseRows]);
  styleHeaderRow(ws1, expenseHeader.length);
  XLSX.utils.book_append_sheet(wb, ws1, "Expenses");

  const ws2 = XLSX.utils.aoa_to_sheet([settlementHeader, ...settlementRows]);
  styleHeaderRow(ws2, settlementHeader.length);
  XLSX.utils.book_append_sheet(wb, ws2, "Settlements");

  if (auditRows.length > 0) {
    const ws3 = XLSX.utils.aoa_to_sheet([auditHeader, ...auditRows]);
    styleHeaderRow(ws3, auditHeader.length);
    XLSX.utils.book_append_sheet(wb, ws3, "Audit Log");
  }

  // ── Write & share ───────────────────────────────────────────────────────
  const base64 = XLSX.write(wb, { type: "base64", bookType: "xlsx" });
  const slug = group.name.replace(/[^a-z0-9]/gi, "_").toLowerCase();
  const filename = `${slug}_expenses.xlsx`;
  const uri = `${FileSystem.cacheDirectory}${filename}`;

  await FileSystem.writeAsStringAsync(uri, base64, {
    encoding: FileSystem.EncodingType.Base64,
  });

  const available = await Sharing.isAvailableAsync();
  if (available) {
    await Sharing.shareAsync(uri, {
      mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      dialogTitle: `Export — ${group.name}`,
      UTI: "com.microsoft.excel.xlsx",
    });
  } else {
    throw new Error("Sharing is not available on this platform.");
  }
}

/** Bold the first row (header) by setting a cell style. Works with SheetJS CE. */
function styleHeaderRow(ws: XLSX.WorkSheet, colCount: number) {
  for (let c = 0; c < colCount; c++) {
    const addr = XLSX.utils.encode_cell({ r: 0, c });
    if (!ws[addr]) continue;
    ws[addr].s = { font: { bold: true }, fill: { fgColor: { rgb: "E8F0FE" } } };
  }
}
