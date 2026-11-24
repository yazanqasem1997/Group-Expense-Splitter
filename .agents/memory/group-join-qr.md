---
name: Group join QR
description: Product behavior and consent rules for group QR invitations.
---

A group QR is a group-membership invite, not a friend request. Scanning previews the group; after sign-in, the recipient explicitly joins the group. A server-issued opaque token grants access, and refreshing the link invalidates the previous token.

**Why:** The user confirmed that scanning a group QR should take someone directly to joining the group, without requiring a friend request first.

**How to apply:** Preserve the separation between friend relationships and group membership. Do not add the scanner as a friend or reveal group data beyond the join preview before acceptance.
