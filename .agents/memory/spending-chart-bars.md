---
name: Spending chart (group Totals tab)
description: How the group "Group spending" chart (components/GroupSpendingChart.tsx) groups by D/W/M, stacks by category, and handles full-screen landscape.
---

`components/GroupSpendingChart.tsx` renders the main chart on the group "Totals" tab (renamed from "Charts"; tab key in code is still `"charts"`). It replaced the earlier per-member cumulative chart (`components/LineChartSvg.tsx`, deleted) after the user shared a ChatGPT-generated reference screenshot of a Splitwise-style stacked bar chart.

## Data model
- Bars are stacked by **spending category** (Food, Transport, Accommodation, Activities/entertainment, Bills/utilities, Shopping, Health, Miscellaneous/other), not by member. Category bucketing lives in `utils/spendingCategories.ts` (`mainItemizationCategory`, `ITEMIZATION_CATEGORIES`, `ITEMIZATION_LABELS`) — shared by this chart and the Itemization card so labels/colors stay consistent app-wide.
- Bars are **period totals**, not running cumulative totals — a behavior change from the old chart.

## Day / Week / Month grouping
A D/W/M segmented control lets the user pick the bucket size. Default is automatic based on the expense date range (`autoGroupingFor`): ≤31 days → day, ≤~6 months → week, else → month. Manual selection overrides the auto default until the component remounts.
**Why:** matches the reference chart and keeps embedded (non-expanded) bar count low enough to avoid horizontal scrolling.

## Continuous time axis
Buckets are generated across the full range (day mode still pads to full calendar month(s), consistent with the earlier "always show the whole month" requirement) so periods with zero spending still render as an empty gap/column rather than being skipped.

## Legend + full-screen
- Tapping a legend chip hides/shows that category (recomputes stack heights and the Y-axis max).
- The expand icon opens a full-screen `Modal` (`presentationStyle="fullScreen"`) that attempts `expo-screen-orientation` `lockAsync(LANDSCAPE)`; on failure (web, or unsupported devices) it shows a "Rotate your phone for the best view" hint instead of crashing. `expo-screen-orientation` was added as a new dependency specifically for this — it's an official Expo SDK module, not a new charting library.
- Grouping and hidden-category state live in the top-level `GroupSpendingChart` component instance, so they persist automatically across opening/closing the full-screen modal (inline chart and modal chart share the same component instance).
