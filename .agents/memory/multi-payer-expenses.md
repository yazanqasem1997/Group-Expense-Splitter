---
name: Multi-payer expenses
description: How expenses represent and account for more than one person paying.
---

Expenses retain a primary payer for compatibility with existing records and UI, while split rows can carry each selected payer's actual `paid` amount. When any split has an explicit paid amount, balance calculations must use those amounts instead of treating the primary payer as having paid the entire expense.

**Why:** The expense schema has a single primary payer field, but receipt and expense flows can record multiple contributors. Ignoring split-level paid amounts makes the UI appear correct while producing incorrect debts and payment summaries.

**How to apply:** Validate that explicit paid amounts are non-negative and sum to the expense total. Use proportional payer allocation when deriving pairwise debts, and fall back to the primary payer for legacy expenses without explicit paid amounts.