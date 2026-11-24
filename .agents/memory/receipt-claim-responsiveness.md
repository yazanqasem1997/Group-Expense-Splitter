---
name: Receipt claim responsiveness
description: Interaction pattern for assigning receipt line items to group members.
---

Receipt member-claim chips should update optimistically on tap rather than waiting for the API response. Async claim responses must be guarded per item so a slower earlier response cannot overwrite a newer rapid tap; failed requests should roll back only the affected item.

**Why:** Receipt claim requests can take long enough for the UI to feel broken, and users often tap several members before the first request completes.

**How to apply:** Keep the server request authoritative, but render the local claim state immediately, track the latest mutation per item, merge the server result only when it is still current, and preserve unrelated item edits during rollback.