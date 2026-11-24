---
name: Settled group recurring expenses
description: Settling current balances does not stop active recurring schedules.
---

**Rule:** Settlement clears current balances, but active recurring expenses continue. Users must pause or delete them manually if they no longer want future expenses. Warn users in the settle-up flow when the group has active recurring expenses.

**Why:** Settling current dues does not necessarily mean shared rent, subscriptions, or other scheduled costs have ended. Automatically stopping them could silently omit expected expenses.

**How to apply:** Keep recurring schedules active after settlement. In both individual payment and group-wide settle-up flows, show a warning only when that group has active schedules, directing users to manage them in the Recurring tab.
