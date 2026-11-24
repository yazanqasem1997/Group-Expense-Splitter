---
name: Activity tab unread dot relies on client-side heuristic, not server notifications
description: Why the SplitEasy mobile app's Activity-tab red dot needed a bootstrap-diff heuristic instead of trusting the notifications table for cross-device activity.
---

The backend never inserts a `notifications` table row for actions taken by
*other* group members — `artifacts/api-server/src/routes/notifications.ts`
only has read/read-all/device-token routes, no insert route. Every
`AppNotification` a device sees for itself is created locally by
`pushNotif()` in `context/AppContext.tsx`, so it only fires for actions the
current device performed.

**Consequence:** if another member on another device adds an expense or
settlement to a shared group, that expense/settlement syncs into your
`expenses`/`settlements` arrays via the `GET /api/me/bootstrap` poll (every
15s) and shows up as a new row in the Activity feed, but no notification
object is ever created for you — so any "unread" indicator driven purely by
`notifications.some(n => !n.read)` never fires for other people's activity.

**Fix applied:** `applyBootstrap` now diffs incoming `mapped.expenses` /
`mapped.settlements` against what was already known locally
(`stateRef.current`) and calls `setHasNewActivity(true)` when something
genuinely new arrives that this device didn't already have — skipped on the
very first bootstrap (tracked via `hasBootstrappedRef`) so cold start doesn't
flag all existing history as new.

**Why this matters for future work:** any future "properly" server-driven
notification feature (e.g. real push notifications, per-task ref #35) should
insert actual `notifications` rows for other group members when someone
mutates shared group data — at that point this client-side diff heuristic
becomes redundant and could be simplified back to a pure `read` check.

**Related bug found alongside this:** client-only notification IDs come from
a base36 `genId()`, not a Postgres UUID. Marking one of these "read" hits the
server's uuid-typed `notifications.id` column and throws (500, silently
swallowed client-side) — see task #63.
