/**
 * Strict search used by Activity, One-Offs and Groups.
 * Every word typed must be the START of a word in one of the given fields
 * (title / description, group name, people involved). Amounts, categories
 * and unrelated group members no longer match.
 */
export function searchMatches(query: string, fields: Array<string | null | undefined>): boolean {
  const clean = (t: string) => t.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
  const tokens = query.trim().split(/\s+/).map(clean).filter(Boolean);
  if (tokens.length === 0) return true;
  const words = fields
    .filter((f): f is string => !!f)
    .join(" ")
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
  return tokens.every(t => words.some(w => w.startsWith(t)));
}
