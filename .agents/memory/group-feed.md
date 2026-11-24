---
name: Group feed architecture
description: How the group detail expenses tab combines expenses and settlements, and where audit log lives
---

## FeedItem union type
`group/[id].tsx` defines:
```ts
type FeedItem =
  | { type: "expense"; id: string; createdAt: string; data: Expense }
  | { type: "settlement"; id: string; createdAt: string; data: Settlement };
```
`feedItems` memo combines `groupExpenses` + `groupSettlements`, sorted descending by `createdAt`. The FlatList renders `renderExpenseItem` or `renderSettlementItem` based on `item.type`.

## Not-involved badge
`renderExpenseItem` checks `isInvolved = youPaid || !!myShare`. When false, shows a "Not involved" pill (eye-off icon). Net amount row is hidden for non-involved rows.

## Audit log
`AuditEntry` type lives in `AppContext.tsx`. `Expense.auditLog?: AuditEntry[]` and `DirectPayment.auditLog?: AuditEntry[]` (one-off payments) both use it — same shape, same "synthetic created entry" backfill trick for pre-audit-logging records.
- `addExpense` always appends a "created" entry (changedBy = addedBy or currentUser.id). `addDirectPayment` mirrors this.
- `updateExpense` appends an "updated" entry when `!updates.reactions && !updates.comments`, with `fieldChanges` diff for tracked fields: description, amount, paidById, splitType, category, notes. `updateDirectPayment` mirrors this for: reason, amount, currency, category, comments.
- Shown in `expense/[id].tsx` in a "Change History" section above Comments (full-screen carousel). For one-off payments there's no detail screen, so history renders inline in the edit bottom-sheet (`analytics.tsx` `PaymentFormContent`, condensed vertical list, not carousel).

## Trip dates
`Group` now has: `startDate?: string`, `endDate?: string`, `tripStartReminderDays?: number`, `settleUpReminderDays?: number`.
Trip groups show a tappable date banner (calendar icon) below the stats bar. Tapping opens a Modal with YYYY-MM-DD text inputs and reminder day settings. Saved via `updateGroup`.
