---
name: Group icon categorization
description: The compatibility rule for showing richer group icon categories without changing persisted group data.
---

Group icons should be inferred from the group name first, with the existing group type and legacy emoji as fallbacks. Keep the stored emoji field unchanged so old groups, invitations, QR links, and server payloads remain compatible.

**Why:** The app already persists emoji strings and the backend contract depends on them, but the modern UI needs distinct monochrome icons for names such as flats, bills, and destinations.

**How to apply:** Reuse the shared group icon resolver for group lists, creation previews, detail headers, invites, recurring groups, and member-facing group chips. Add keyword categories before changing the data model.