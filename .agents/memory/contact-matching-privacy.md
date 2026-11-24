---
name: Contact matching privacy
description: User-approved limits for finding existing Split Mate users from device contacts.
---

When contact discovery is used, request device permission after the user taps the feature. Send only email addresses to the authenticated API for one-time matching; keep contact names and phone numbers on-device. Do not retain or log submitted email lists, and do not automatically add or invite matches.

**Why:** The user explicitly approved a permission-based, one-time email matching flow and specified that the contact list must not be stored or logged.

**How to apply:** Preserve these limits in any future contact-sync, friend-suggestion, or address-book feature.
