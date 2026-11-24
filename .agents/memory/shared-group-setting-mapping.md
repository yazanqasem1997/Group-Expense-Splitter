---
name: Shared group setting mapping
description: The client must preserve group-level settings across optimistic updates and server refreshes.
---

For any group setting persisted by the backend, implement both directions in the mobile sync layer: include it in mutation payload builders and map it from server groups back into app state during bootstrap/refresh.

**Why:** An optimistic toggle can appear to work until `refreshFromServer()` replaces local state. If the response mapper omits the field, the UI falls back to its default and silently undoes the user’s change.

**How to apply:** When adding or debugging a group-level setting, trace the full path: screen state → update payload → database/serialized response → bootstrap mapper → derived UI state.