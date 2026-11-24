export const ALPHABET_INDEX = [..."ABCDEFGHIJKLMNOPQRSTUVWXYZ", "#"];

/** First letter A–Z (accents removed), or "#" for numbers, symbols, and other scripts. */
export function indexLetter(name: string): string {
  const first = name.trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "").charAt(0).toUpperCase();
  return first >= "A" && first <= "Z" ? first : "#";
}

export function compareNames(a: string, b: string): number {
  const letterA = indexLetter(a);
  const letterB = indexLetter(b);
  // Keep "#" entries after Z so the list order matches the side index.
  if (letterA !== letterB && (letterA === "#" || letterB === "#")) return letterA === "#" ? 1 : -1;
  return a.trim().localeCompare(b.trim(), undefined, { sensitivity: "base" });
}

export type LetterGroup<T> = { letter: string; items: T[] };

/** Sorts items by name and groups them under their index letter. */
export function groupByLetter<T>(items: T[], getName: (item: T) => string): LetterGroup<T>[] {
  const sorted = [...items].sort((a, b) => compareNames(getName(a), getName(b)));
  const groups: LetterGroup<T>[] = [];
  sorted.forEach((item) => {
    const letter = indexLetter(getName(item));
    const last = groups[groups.length - 1];
    if (last && last.letter === letter) last.items.push(item);
    else groups.push({ letter, items: [item] });
  });
  return groups;
}
