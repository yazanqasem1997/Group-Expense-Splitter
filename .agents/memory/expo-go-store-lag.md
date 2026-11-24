---
name: Expo Go store lag
description: Android store Expo Go can lag the project's latest Expo SDK; use Expo's official SDK-specific APK for physical testing.
---

The Google Play/App Store Expo Go release may support an older SDK than the latest Expo SDK. For Android, Expo provides official SDK-specific APKs at expo.dev/go; this is the correct stock Expo Go path when the store build reports that a project needs a newer Expo Go.

After dependency changes or task merges, the workspace can retain stale Expo 54 symlinks even while the mobile package and lockfile declare SDK 57. Verify the runtime with `pnpm exec expo --version` and the resolved package versions before debugging the phone.

**Why:** Expo Go supports one SDK version per store release, and store rollout timing can leave the latest project SDK ahead of the store build.

**How to apply:** Check the project's `expo` dependency and Expo's compatibility page before changing project dependencies. If installed modules disagree with the manifest, reinstall from the frozen workspace lockfile and restart the mobile workflow. Prefer the official Android APK for the matching SDK; do not add a custom dev client or downgrade unless the user cannot sideload.