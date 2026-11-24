---
name: Expo auth bootstrap ordering
description: Prevents Expo Go startup races between Clerk session restoration and authenticated API bootstrap.
---

The mobile app must install the shared API client's Clerk bearer-token getter from the same provider that starts the authenticated bootstrap, before the bootstrap effect is registered. Do not rely on a sibling bridge component's passive effect to be ready first.

**Why:** Expo Go native startup can run the initial `/api/me/bootstrap` request before a sibling `AuthBridge` effect has installed the getter. The API then returns 401, while generic error handling incorrectly marks the device offline and shifts the app layout.

**How to apply:** Keep token wiring in `AppProvider` next to its `useAuth()` lifecycle. Treat 401/403 responses as authentication/permission failures rather than network-offline state; only network or transient failures should show the offline banner.