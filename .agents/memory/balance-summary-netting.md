---
name: Balance summary netting
description: How global owed and due totals should handle settled cycles in a group's pairwise debt graph.
---

Global owed/due summaries must use the same per-group balances shown in the UI, net the member's position within each group, and only then convert currencies and combine groups. Do not independently rebuild the summary from raw expenses and settlements.

**Why:** Settlements can create cycles in raw expense-level pairs, while separate rounding and currency-conversion paths can leave a small global remainder even when every group card shows settled.

**How to apply:** Read each non-archived group's displayed debt relations, net the current member's edges, convert each non-zero group net to the preferred currency, then total owed and due separately. Preserve genuine non-zero group balances.
