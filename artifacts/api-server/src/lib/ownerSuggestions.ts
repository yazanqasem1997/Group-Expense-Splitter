import { db, ownerSuggestionsTable } from "@workspace/db";
import { inArray } from "drizzle-orm";

/** Statuses that still need the owner's attention or work. */
const OPEN = ["pending", "approved", "planned"];

const key = (title: string) => title.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

export type NewSuggestion = { source?: string; reportId?: string | null; title: string; reason: string; change: string };

/**
 * Adds suggestions to the war room, skipping any whose title matches one that is still
 * open, so the same issue isn't raised again every morning. Returns how many were added.
 */
export async function addSuggestions(rows: NewSuggestion[]): Promise<number> {
  if (!rows.length) return 0;
  const open = await db
    .select({ title: ownerSuggestionsTable.title })
    .from(ownerSuggestionsTable)
    .where(inArray(ownerSuggestionsTable.status, OPEN));
  const seen = new Set(open.map((r) => key(r.title)));
  const fresh = rows.filter((r) => {
    const k = key(r.title);
    if (!k || seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  if (fresh.length) await db.insert(ownerSuggestionsTable).values(fresh);
  return fresh.length;
}
