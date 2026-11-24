---
name: AsyncStorage UI responsiveness
description: Keep large local JSON persistence from blocking React Native modal, keyboard, and touch interactions.
---

When a mutation rewrites a growing AsyncStorage collection, do not stringify and persist the full collection inside a React state updater or the immediate interaction handler. Update in-memory state first and defer serialization until the current interaction completes.

**Why:** `JSON.stringify` runs synchronously on the JavaScript thread. Large payment histories can therefore make an edit sheet appear frozen even when the mutation itself is correct.

**How to apply:** Use an interaction-safe deferred write for local-only collections that are persisted as full JSON snapshots. Keep the state update free of storage side effects so React can render and dismiss the UI immediately.