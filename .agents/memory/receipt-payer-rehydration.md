---
name: Receipt payer rehydration
description: Restoring saved payer choices when a linked receipt is reopened.
---

Receipt review is also an edit surface for receipts linked to expenses. When reopening a linked receipt, initialize the payer selection and payment allocation from the linked expense's explicit split-level paid amounts; only use the current user default for a new, unlinked receipt.

**Why:** The receipt session itself does not contain the complete payer allocation. Reinitializing from the current user makes an existing receipt appear to have been paid by the wrong person and can overwrite the saved choice on the next save.

**How to apply:** Find the local expense by its receipt ID after receipt and bootstrap data are available. Initialize once per review session so polling refreshes cannot overwrite active user edits.