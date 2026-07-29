---
name: Production Backend Architecture
description: Summary of the production backend built for SplitEasy — schema, routes, auth, idempotency, recurring scheduler, and known gaps.
---

# Production Backend — SplitEasy

## Database schema (lib/db/src/schema/)
One file per domain, all re-exported from `index.ts`:
`users`, `groups`, `group_members`, `group_invitations`, `expenses`, `expense_splits`, `expense_comments`, `settlements`, `recurring_expenses`, `group_messages`, `notifications`, `device_tokens`, `audit_log`, `idempotency_keys`, `import_jobs`.

## API routes (artifacts/api-server/src/routes/)
All protected by `requireAuth`. Full CRUD for: groups/members/invitations, expenses/comments, settlements, recurring (+`/recurring/run`), messages, notifications, device-tokens, imports. `/api/me/bootstrap` returns full user state in one call.

## Idempotency (lib/idempotency.ts)
**Atomic pending-reservation protocol** — insert pending row → execute handler → update with response. Concurrent losers poll until response stored, then replay. Stale locks (>30s) stolen via conditional UPDATE. Concurrency validated by 8-worker test script (`pnpm --filter @workspace/scripts run validate:idempotency`).

## Authorization (lib/authz.ts)
`getMembership(groupId, userId)` returns owner/admin/member status; used on every route. Invitation accept/decline validates recipient email against authenticated user. Messages/comments derive actor `memberKey` from authenticated membership — body `memberKey` is validated not impersonated.

## CORS
Strict origin allowlist in `app.ts`: dev domain (`REPLIT_DEV_DOMAIN`), internal app domain, localhost variants, and Expo dev domain. `credentials: true` never reflects arbitrary origins.

## Recurring scheduler (lib/recurringScheduler.ts)
`setInterval` every 5 min, scoped to all groups of a service-account user or all active schedules. Uses PostgreSQL advisory lock so concurrent instances don't double-fire. `runDueRecurring` is also callable via `POST /recurring/run` for on-demand trigger.

## Member identity model
Backend `memberKey` is **group-scoped**. Mobile uses `stableAppId(m)`: `m.userId` for registered users (cross-group stable), `m.memberKey` for guests. `memberKeyMap` (appId → {groupId: memberKey}) is returned in bootstrap and used when building server payloads. **Never use memberKey as a global user id.**

## Known gaps (follow-up tasks proposed)
- Push delivery: tokens stored but server never dispatches Expo push messages (task #35).
- Group chat reads: POSTs go to server, but list reads are still local (task #36).
- No automated backend tests for financial correctness (task #37).
