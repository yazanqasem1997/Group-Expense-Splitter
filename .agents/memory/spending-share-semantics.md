---
name: Spending share semantics
description: Product meaning for per-person spending analytics and payment comparisons
---

Per-person expense analytics must use each expense's assigned split amount to show who ultimately bears the cost. Amount paid is a separate cash-flow measure and must not be presented as the person's spending share.

**Why:** One person may pay the full bill for a group and later be reimbursed, so payer totals alone can falsely imply that person consumed the spending.

**How to apply:** Use assigned shares for pie/donut and person trend views. Show paid and assigned share as separate comparable values, then calculate paid minus share as Gets back or Owes.