---
name: AppContext server-authority migration
description: How AppContext was migrated from AsyncStorage authority to the production API while preserving its public interface.
---

# AppContext Server-Authority Migration

## Architecture
`AppContext` public method signatures unchanged. Server truth is the authority; AsyncStorage is cache/offline fallback only.

Key flow: `isSignedIn` (Clerk) → one-time legacy import (if real data detected) → `GET /api/me/bootstrap` → `applyBootstrap` → hydrate all state.

## Key helpers
- `refreshFromServer()` — calls bootstrap, applies, returns success bool. Called after every mutation (refresh-on-success) and on foreground resume.
- `runServerSync(fn, opts)` — fire-and-forget wrapper: optimistic update → server call → refresh. On failure: user-safe toast (`showToast(..., "warning")`) + rollback via re-fetch.
- `apiSync.ts` (`artifacts/mobile/services/apiSync.ts`) — all DTO↔app type mappings, idempotency key generation, `toUserMessage` error extraction, mutation wrappers.

## One-time legacy migration
Reads `spliteasy_data_v3` → runs `isRealUserSnapshot` to exclude seeded demo groups → POSTs to `POST /api/imports` with a persisted idempotency key → sets `migrated` flag. Never auto-imports demo defaults.

## Local-only (intentionally not migrated)
- Device/UI prefs: simplify-debts toggle, exchange rates, custom categories.
- Expense reactions (no server field).
- Audit log (client-computed from local data).
- Push/local notification inbox (Expo only; server side is device-token + notification table).
- Group messages list (server receives POSTs, but list reads are still local — task #36).
- `addMember` standalone (members are created only within groups server-side).

## Toast type
`ToastType = "success" | "info" | "warning"` — there is no "danger" or "error" variant. Error toasts must use `"warning"`.

## Stale export
`CURRENT_USER_ID_EXPORT` still exports `"user_current"` for backward compat with `friends.tsx`. Prefer `currentUser.id` (from `/me`) at runtime.
