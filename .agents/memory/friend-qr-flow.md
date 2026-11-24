---
name: Friend QR flow
description: Privacy and consent rules for adding friends by QR code.
---

Friend QR codes should support both showing one's own code and scanning another user's code. Scanning previews the profile and sends the standard friend request only after the scanner confirms; the recipient must still accept. Do not put a raw email address or account ID in the QR payload.

**Why:** The user chose a complete show-and-scan flow for in-person discovery while keeping the existing friend-request consent model and avoiding exposed account identifiers.

**How to apply:** Preserve the preview, explicit send action, and recipient acceptance if QR handling or deep links are changed.

Friend QR codes encode a public web invite link served by the API, not the raw token, so a regular phone camera reaches an "install first" page. That page opens the app's add-friend deep link, and invites opened before sign-in resume after the user signs in. The download buttons point to Expo Go until Split Mate is published in the app stores; update them when it is.
**Why:** The user wants people without the app to be prompted to download it before becoming friends.

Friends screen layout rule: the user disliked a crowded control area (six separate buttons, and a contacts view with no way back). Keep a single QR entry point with show and scan inside it, keep sent and received requests together in one Requests view, and make contacts a tab that users can leave and return to. The Friends, Requests, and Contacts tabs must stay side-by-side in one horizontal row; the A–Z index is a separate vertical rail.
