---
name: Public route auth loading
description: Keep unauthenticated landing and legal pages usable while Clerk resolves session state.
---

Public landing and legal routes should render while Clerk is initializing; only protected routes should wait for a loaded auth state.

**Why:** A stalled or slow Clerk session check otherwise makes the whole Expo preview appear blank or permanently stuck on a spinner, including pages that do not require authentication.

**How to apply:** When changing the root Expo auth gate, allow the base route and public legal routes through during auth loading, while retaining the loading gate for protected routes. On web, keep landing animation layers visible in their initial frame and do not block the public app on bundled-font loading, so the preview cannot remain blank or spinner-only during startup.