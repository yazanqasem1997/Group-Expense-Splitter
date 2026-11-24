---
name: Activity deletion details
description: How deleted transactions remain inspectable from the Activity feed
---

Activity can outlive the expense or payment record it references, so deletion notifications must carry a snapshot of the deleted transaction and the deleting member ID when they are created. Deleted snapshots should open the branded detail modal rather than a plain text alert.

**Why:** Once a record is removed from the active arrays, routing by its ID can only fall back to the group and cannot show the user what was deleted or who removed it; a generic alert also breaks the visual language used by expense and payment details.

**How to apply:** Keep deleted expense, settlement, and one-off payment snapshots plus `deletedById` in their notification payloads and route them to the shared Activity deleted-detail presentation when the source record no longer exists.