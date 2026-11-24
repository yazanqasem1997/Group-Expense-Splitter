---
name: Expense icon vocabulary
description: How per-expense category icons are made specific (e.g. water vs. a generic bills icon) without persisting new fields.
---

Icons shown for an expense/recurring item/settlement are resolved at render time from `(category, description)` via `resolveIconKey` in `artifacts/mobile/utils/expenseIcons.ts`, called from `CategoryIcon`. The stored `category` field and the itemization/chart bucket (`mainItemizationCategory` in `spendingCategories.ts`) are untouched — this is purely a rendering-layer refinement.

**Why:** The stored `category` on an expense is one of 8 broad buckets (food, transport, accommodation, entertainment, utilities, shopping, health, other) plus a few transport sub-types stored directly (flight/car/train/bus/bicycle/ferry). A generic bucket like "utilities" was rendering the same icon (zap) for both an electricity bill and a bottle of water, because the icon lookup keyed directly off the raw category. Fixing categorization alone (already done earlier for the food/water chart bucket) didn't fix the icon, since `CategoryIcon` had its own separate lookup.

**How to apply:** When adding a new specific icon (e.g. a new keyword subtype), add it to the matching `SUBTYPE_MAP` category list in `expenseIcons.ts` and add a matching entry to `BUILTIN_CATEGORY_CONFIG` in `CategoryIcon.tsx` (icon name + family + color, reusing the parent category's color unless a distinct color is intentional). Every `CategoryIcon` call site should pass `description` when one is available (expense description, recurring description, settlement reason) so the finer icon can be resolved; call sites that only have an aggregate category (e.g. the itemization/legend rows) intentionally don't pass a description and keep the generic category icon.

Icon names must be verified against the installed `@expo/vector-icons` glyphmap (Feather/Ionicons) before use — a wrong glyph name renders nothing (silent, no crash). Verify via `node -e "console.log(require('.../glyphmaps/Ionicons.json'))"` if unsure, rather than guessing names from memory.
