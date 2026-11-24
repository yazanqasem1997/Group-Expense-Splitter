---
name: Cross-platform exports
description: Platform-specific behavior required for Excel and PDF exports in the Expo app.
---

Browser exports cannot rely on native cache directories or Expo Sharing. Excel must download the generated Blob through an anchor, and PDF must print a dedicated window containing the generated HTML because Expo's web print implementation prints the current page and ignores the supplied HTML.

Native exports can use the legacy Expo FileSystem API and Expo Sharing, but PDF cache destinations should be deleted idempotently before moving a newly generated file so repeated exports do not fail on an existing filename.

**Why:** The same export code path behaves differently across Expo web and native platforms, and the failure mode is otherwise just a generic export error.

**How to apply:** Branch on `Platform.OS` before native file operations; keep the native sharing path unchanged except for storage guards and safe replacement.