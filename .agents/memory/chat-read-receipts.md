---
name: Chat read receipts
description: How group chat delivery and read state are represented across the server and mobile UI
---

The API stores group-message authors and read cursors by group-scoped `memberKey`, while the mobile UI compares against stable app member IDs. Every sync must map server member keys back to app IDs before rendering ticks or reader names.

**Why:** Registered users can have a stable user ID that differs from their group membership key; comparing the raw server key to `group.memberIds` silently makes valid receipts look unread or anonymous.

**How to apply:** Pass the current app-to-server member key map into message/read sync methods, map both message authors and read-cursor keys, and use the stable app ID for optimistic local read updates.