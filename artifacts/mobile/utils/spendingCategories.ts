/**
 * Broad, Splitwise-style spending buckets shared by the group Itemization
 * card and the spending-by-category chart. Transport sub-types (flight/car/
 * train/...) are auto-detected elsewhere (services/ai.ts) but folded back
 * into "transport" here so both views stay high-level.
 */
export const ITEMIZATION_CATEGORIES = [
  "food",
  "transport",
  "accommodation",
  "entertainment",
  "utilities",
  "shopping",
  "health",
  "other",
] as const;

export type ItemizationCategory = (typeof ITEMIZATION_CATEGORIES)[number];

export const ITEMIZATION_LABELS: Record<string, string> = {
  food: "Food & Drink",
  transport: "Transport",
  accommodation: "Accommodation",
  entertainment: "Activities",
  utilities: "Bills",
  shopping: "Shopping",
  health: "Health",
  other: "Miscellaneous",
};

const TRANSPORT_SUBCATEGORIES = new Set(["flight", "car", "train", "bus", "bicycle", "ferry"]);
const FOOD_AND_BEVERAGE_ALIASES = new Set([
  "food",
  "foods",
  "beverage",
  "beverages",
  "drink",
  "drinks",
  "f&b",
  "food & beverage",
  "food and beverage",
  "food-beverage",
]);
const WATER_BILL_CONTEXT = /\b(?:water|electricity|sewage|gas|internet|wifi)\s+(?:bill|utility|account|service|payment)\b/i;
const UTILITY_PROVIDER = /\b(?:dewa|sewa|addc|fewa|etisalat|du)\b/i;

/** Standalone drinking water belongs with food and beverages, not household bills. */
export function isFoodAndBeverageDescription(description: string | undefined): boolean {
  if (!description) return false;
  const value = description.trim();
  return /\b(?:bottled|drinking|water bottle|water)\s+water\b|\bwater\b/i.test(value)
    && !WATER_BILL_CONTEXT.test(value)
    && !UTILITY_PROVIDER.test(value);
}

export function mainItemizationCategory(raw: string | undefined, description?: string): string {
  if (!raw) return "other";
  const normalized = raw.trim().toLowerCase();
  if (FOOD_AND_BEVERAGE_ALIASES.has(normalized)) return "food";
  if (normalized === "utilities" && isFoodAndBeverageDescription(description)) return "food";
  if (TRANSPORT_SUBCATEGORIES.has(normalized)) return "transport";
  return (ITEMIZATION_CATEGORIES as readonly string[]).includes(normalized) ? normalized : "other";
}

/**
 * How an expense's amount divides across itemisation categories. A receipt with mixed
 * lines (e.g. groceries plus household items) carries a breakdown; anything else counts
 * fully towards its own category.
 */
export function categoryShares(
  category: string | undefined,
  description: string | undefined,
  breakdown?: Record<string, number> | null,
): { category: string; fraction: number }[] {
  if (breakdown) {
    const totals: Record<string, number> = {};
    for (const [key, value] of Object.entries(breakdown)) {
      const amount = Number(value);
      if (!Number.isFinite(amount) || amount <= 0) continue;
      const main = mainItemizationCategory(key);
      totals[main] = (totals[main] ?? 0) + amount;
    }
    const sum = Object.values(totals).reduce((total, value) => total + value, 0);
    if (sum > 0) return Object.entries(totals).map(([main, value]) => ({ category: main, fraction: value / sum }));
  }
  return [{ category: mainItemizationCategory(category, description), fraction: 1 }];
}
