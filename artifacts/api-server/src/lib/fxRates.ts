import { eq } from "drizzle-orm";
import { db, groupsTable } from "@workspace/db";

/**
 * Locks an exchange rate onto each expense and settlement for the day it happened,
 * so balances in a group's currency never move afterwards.
 * Today: open.er-api.com (166 currencies, cached for 6 hours).
 * Past dates: frankfurter (ECB reference rates, about 30 currencies), plus the Gulf
 * currencies' fixed USD pegs. Anything else falls back to today's rate.
 */
type Rates = Record<string, number>;

const USD_PEGS: Rates = { AED: 3.6725, SAR: 3.75, QAR: 3.64, OMR: 0.3845, BHD: 0.376, JOD: 0.709, SVC: 8.75 };
const LATEST_TTL_MS = 6 * 60 * 60 * 1000;
let latest: { at: number; rates: Rates } | null = null;
const historical = new Map<string, Rates>();

async function fetchJson(url: string): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    const res = await fetch(url, { signal: controller.signal });
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function clean(input: unknown): Rates | null {
  if (!input || typeof input !== "object") return null;
  const out: Rates = {};
  for (const [code, value] of Object.entries(input as Record<string, unknown>)) {
    if (/^[A-Z]{3}$/.test(code) && typeof value === "number" && Number.isFinite(value) && value > 0) out[code] = value;
  }
  return out;
}

async function latestRates(): Promise<Rates | null> {
  if (latest && Date.now() - latest.at < LATEST_TTL_MS) return latest.rates;
  const data = (await fetchJson("https://open.er-api.com/v6/latest/USD")) as { rates?: unknown } | null;
  const rates = clean(data?.rates);
  if (rates && rates.USD === 1 && Object.keys(rates).length > 30) {
    latest = { at: Date.now(), rates: { ...USD_PEGS, ...rates } };
  }
  return latest?.rates ?? null; // a stale table beats none
}

async function ratesOn(date: string): Promise<Rates | null> {
  const cached = historical.get(date);
  if (cached) return cached;
  const data = (await fetchJson("https://api.frankfurter.dev/v1/" + date + "?base=USD")) as { rates?: unknown } | null;
  const rates = clean(data?.rates);
  if (!rates || Object.keys(rates).length < 10) return null;
  const table = { ...USD_PEGS, ...rates, USD: 1 };
  if (historical.size > 1000) historical.clear();
  historical.set(date, table);
  return table;
}

const today = () => new Date().toISOString().slice(0, 10);

/** Units of `to` per 1 unit of `from` on `date` (YYYY-MM-DD; today when missing). Null if unknown. */
export async function rateOn(from: string, to: string, date?: string | null): Promise<number | null> {
  if (from === to) return 1;
  let table: Rates | null = null;
  if (date && /^\d{4}-\d{2}-\d{2}$/.test(date) && date < today()) {
    const past = await ratesOn(date);
    if (past && (from === "USD" || past[from]) && (to === "USD" || past[to])) table = past;
  }
  table ??= await latestRates();
  if (!table) return null;
  const fromRate = from === "USD" ? 1 : table[from];
  const toRate = to === "USD" ? 1 : table[to];
  return fromRate && toRate ? toRate / fromRate : null;
}

export type LockedRate = { fxRate: string | null; fxRateCurrency: string | null };

/** The rate to store on a record. Null when it is already in the group currency or no rate is known. */
export async function lockRate(currency: string, groupCurrency: string, date?: string | null): Promise<LockedRate> {
  if (currency === groupCurrency) return { fxRate: null, fxRateCurrency: null };
  const rate = await rateOn(currency, groupCurrency, date);
  return rate ? { fxRate: String(rate), fxRateCurrency: groupCurrency } : { fxRate: null, fxRateCurrency: null };
}

export async function groupCurrencyOf(groupId: string): Promise<string> {
  const [row] = await db.select({ currency: groupsTable.currency }).from(groupsTable).where(eq(groupsTable.id, groupId)).limit(1);
  return row?.currency ?? "USD";
}
