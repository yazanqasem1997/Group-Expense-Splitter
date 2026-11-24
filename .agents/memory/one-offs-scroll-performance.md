---
name: One-Offs scroll performance
description: Constraints for preserving smooth scrolling in the One-Offs feed.
---

The One-Offs feed must let FlatList own normal vertical gestures. Any pull-to-refresh fallback must be non-capturing, and decorative background motion should not run continuously behind the list. Feed rows should avoid per-item shadows when smoothness is the priority.

**Why:** The combination of a screen-wide capturing responder, animated ambient orbs, and card shadows made scrolling feel jittery on the mobile feed.

**How to apply:** Prefer native RefreshControl and non-capturing gesture fallbacks. Keep background decoration static while the feed is visible, and profile any new row-level visual effects before adding them.