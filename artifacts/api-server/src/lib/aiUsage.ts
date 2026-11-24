import { aiUsageTable, db } from "@workspace/db";
import { gte, sql } from "drizzle-orm";
import { logger } from "./logger";

/**
 * Records every Claude call (receipt scans, the morning briefing, store reviews) with
 * its tokens and cost, so the war room can show what the AI costs per day and feature.
 *
 * Prices are USD per million tokens. Claude Haiku 5.5: $0.10 input, $0.50 output.
 * Update PRICES when the model or Anthropic's price list changes.
 */
const PRICES: Record<string, { input: number; output: number }> = {
  "claude-haiku-5-5": { input: 0.1, output: 0.5 },
};
const FALLBACK_PRICE = { input: 0.1, output: 0.5 };
const DAY_MS = 24 * 60 * 60 * 1000;

export type AiFeature = "receipts" | "digest" | "reviews";

type Usage =
  | {
      input_tokens?: number | null;
      output_tokens?: number | null;
      cache_creation_input_tokens?: number | null;
      cache_read_input_tokens?: number | null;
    }
  | null
  | undefined;

export function aiCostUsd(model: string, inputTokens: number, outputTokens: number): number {
  const price = PRICES[model] ?? FALLBACK_PRICE;
  return (inputTokens * price.input + outputTokens * price.output) / 1_000_000;
}

/** Saves one call's usage. Never throws: a failed write must not break a receipt scan. */
export function recordAiUsage(feature: AiFeature, model: string, usage: Usage): void {
  if (!usage) return;
  const inputTokens =
    (usage.input_tokens ?? 0) + (usage.cache_creation_input_tokens ?? 0) + (usage.cache_read_input_tokens ?? 0);
  const outputTokens = usage.output_tokens ?? 0;
  const costMicros = Math.round(aiCostUsd(model, inputTokens, outputTokens) * 1_000_000);
  db.insert(aiUsageTable)
    .values({ feature, model, inputTokens, outputTokens, costMicros })
    .catch((err: unknown) => logger.warn({ err }, "AI usage: could not record"));
}

export type AiCosts = {
  today: number;
  week: number;
  month: number;
  byFeature: { feature: string; today: number; week: number; month: number; calls: number }[];
};

/** USD spent today (UTC), in the last 7 days and in the last 30 days, overall and per feature. */
export async function aiCosts(): Promise<AiCosts> {
  const now = Date.now();
  const startToday = new Date(now);
  startToday.setUTCHours(0, 0, 0, 0);
  const weekAgo = new Date(now - 7 * DAY_MS).toISOString();
  const monthAgo = new Date(now - 30 * DAY_MS);
  const c = aiUsageTable.createdAt;
  const rows = await db
    .select({
      feature: aiUsageTable.feature,
      today: sql<number>`coalesce(sum(${aiUsageTable.costMicros}) filter (where ${c} >= ${startToday.toISOString()}::timestamptz), 0)::float8`,
      week: sql<number>`coalesce(sum(${aiUsageTable.costMicros}) filter (where ${c} >= ${weekAgo}::timestamptz), 0)::float8`,
      month: sql<number>`coalesce(sum(${aiUsageTable.costMicros}), 0)::float8`,
      calls: sql<number>`count(*)::int`,
    })
    .from(aiUsageTable)
    .where(gte(c, monthAgo))
    .groupBy(aiUsageTable.feature);
  const byFeature = rows
    .map((r) => ({
      feature: r.feature,
      today: Number(r.today) / 1_000_000,
      week: Number(r.week) / 1_000_000,
      month: Number(r.month) / 1_000_000,
      calls: Number(r.calls),
    }))
    .sort((a, b) => b.month - a.month);
  const total = (key: "today" | "week" | "month") => byFeature.reduce((sum, f) => sum + f[key], 0);
  return { today: total("today"), week: total("week"), month: total("month"), byFeature };
}
