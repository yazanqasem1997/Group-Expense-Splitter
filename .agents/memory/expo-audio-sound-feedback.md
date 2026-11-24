---
name: Expo audio feedback
description: Bundled short sound effects in the Expo mobile app
---

Use the SDK-matched `expo-audio` package for short in-app confirmation sounds, with local bundled audio assets and a defensive audio-mode setup. Install it from the mobile workspace rather than the monorepo root.

**Why:** The mobile app needs immediate offline-safe feedback, while the generic package installer targets the workspace root and rejects dependency additions in this pnpm monorepo.

**How to apply:** Keep playback non-blocking and failure-tolerant; trigger local effects at mutation time and use bootstrap diffs for events created on another device.