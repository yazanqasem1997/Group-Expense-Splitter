---
name: Offline row indicators
description: How expense and one-off rows communicate offline or failed synchronization
---

Do not show sync markers on individual expense or one-off rows. Show offline/sync status only through the app-level banner.

**Why:** The user wants one clear offline status instead of repeated row-level “Not synced” labels, and the client does not identify which individual mutation is pending.

**How to apply:** Keep the existing top-level banner as the sole sync-status display. Do not add development-only row badges.

The banner itself belongs in normal layout flow inside the shared tab header, below the title row. It should not be mounted globally as an absolute overlay because tab header content varies by screen and can be covered.

**Why:** A fixed global offset cannot account for each tab’s safe-area inset and header contents, so it eventually overlaps titles or controls.

**How to apply:** Use the inline banner variant from `TabHeader` for the main tabs; reserve an overlay variant only for screens that explicitly reserve space for it.