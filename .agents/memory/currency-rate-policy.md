---
name: Locked transaction exchange rates
description: Product policy for stable historical currency conversions and recurring expenses
---

Each expense or settlement should use the exchange rate from the date it occurs and keep that rate permanently for historical totals, balances, settlements, and exports. A recurring template must not own one permanent rate; each generated occurrence receives its own occurrence-date rate.

**Why:** Revaluing old transactions with the latest daily rate makes settled balances and historical reports change without a new transaction. A group-creation rate is also inaccurate for expenses added months later.

**How to apply:** Keep original amount and currency, store the locked converted amount plus rate timestamp/source, and use refreshed daily rates only for new transactions or explicitly labeled current-value views. Offline-created transactions should be marked estimated until synchronization confirms the rate.