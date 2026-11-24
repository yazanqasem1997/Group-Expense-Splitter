---
name: Ended group lifecycle
description: The relationship between ending, archiving, restoring, and settle-up reminders.
---

Ending a group archives it immediately, but archiving must not suppress reminders for balances that are still unsettled. Restoring an ended group brings it back for manual access; it remains ended unless explicitly changed by a future lifecycle action.

**Why:** Users need closed periods out of the active group list while still receiving the configured settle-up reminders until every balance is settled.

**How to apply:** Keep ended groups distinguishable from groups archived independently when deciding whether reminder scheduling should continue.