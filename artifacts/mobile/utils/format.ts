/**
 * Displays when something happened as an actual date rather than
 * relative time ("3w ago"). Today -> time, this year -> "May 3",
 * older -> "May 3, 2025". Name kept so all call sites update at once.
 */
export function timeAgo(dateStr: string): string {
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return "";
  const now = new Date();
  if (d.toDateString() === now.toDateString()) {
    return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  }
  const sameYear = d.getFullYear() === now.getFullYear();
  return d.toLocaleDateString(
    undefined,
    sameYear
      ? { month: "short", day: "numeric" }
      : { month: "short", day: "numeric", year: "numeric" }
  );
}

function parseDateValue(dateStr: string): Date {
  // Date-only values must be parsed as local midnight; parsing YYYY-MM-DD
  // directly is UTC-based and can display the previous day in some timezones.
  return /^\d{4}-\d{2}-\d{2}$/.test(dateStr)
    ? new Date(`${dateStr}T00:00:00`)
    : new Date(dateStr);
}

export function toDateOnly(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function dateOnlyFromDateTime(dateStr: string): string {
  const date = new Date(dateStr);
  return isNaN(date.getTime()) ? "" : toDateOnly(date);
}

/**
 * Normalize a persisted date value to the calendar-date format used by the
 * date picker. Legacy data may contain a full ISO timestamp.
 */
export function normalizeDateOnly(value: string | null | undefined): string {
  if (!value) return "";
  const candidate = value.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(candidate)) return "";
  const date = new Date(`${candidate}T00:00:00`);
  if (Number.isNaN(date.getTime())) return "";
  const [year, month, day] = candidate.split("-").map(Number);
  return date.getFullYear() === year &&
    date.getMonth() + 1 === month &&
    date.getDate() === day
    ? candidate
    : "";
}

export function formatDate(dateStr: string, locale?: string): string {
  return parseDateValue(dateStr).toLocaleDateString(locale, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function formatScheduleDate(dateStr: string): string {
  const date = parseDateValue(dateStr);
  if (isNaN(date.getTime())) return dateStr;
  const month = date.toLocaleDateString("en-US", { month: "short" });
  return `${date.getDate()}-${month}-${date.getFullYear()}`;
}

export function formatExpenseDate(
  paymentDate: string | null | undefined,
  createdAt: string,
): string {
  return paymentDate ? formatDate(paymentDate) : timeAgo(createdAt);
}

/**
 * Format a monetary amount compactly for list rows.
 * - Never abbreviates below 10,000.
 * - Switches to compact notation (e.g. "$38.6K") only when the
 *   full string would exceed 11 characters.
 * Pass the pre-looked-up symbol (e.g. CURRENCY_SYMBOLS[code] ?? code).
 */
export function formatActivityAmount(amount: number, symbol: string, decimals = 2): string {
  // Always format with comma grouping
  const normal = `${symbol}${amount.toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })}`;
  if (amount < 10_000 || normal.length <= 11) return normal;
  try {
    const compact = new Intl.NumberFormat(undefined, {
      notation: "compact" as any,
      maximumFractionDigits: 1,
    }).format(amount);
    return `${symbol}${compact}`;
  } catch {
    if (amount >= 1_000_000) return `${symbol}${(amount / 1_000_000).toFixed(1)}M`;
    return `${symbol}${(amount / 1_000).toFixed(1)}K`;
  }
}
