---
name: Currency type — now open string + CURRENCY_LIST
description: Currency is no longer a 56-member union; it's string + a CURRENCY_LIST export for pickers.
---

**Rule:** `Currency = string`. All world currencies (~155) live in `CURRENCY_LIST: CurrencyInfo[]` exported from `context/AppContext.tsx`. `CURRENCY_SYMBOLS` is derived from that list via `Object.fromEntries`.

**Why:** The original 56-member union blocked adding any currency not in the list, and maintaining it as a literal union was fragile. Expanding to `string` with a CURRENCY_LIST lookup table gives full ISO 4217 coverage and makes all pickers data-driven.

**How to apply:**
- Import `CURRENCY_LIST` for any currency picker UI (account settings, group creation, etc.)
- The old `CURRENCY_SYMBOLS` record still works — it now covers all 155 currencies
- `formatAmount(amount, currency)` accepts any string currency code; unknown codes fall back to `"CODE "` prefix
- `CurrencyInfo` interface: `{ code, label, flag, symbol }`
