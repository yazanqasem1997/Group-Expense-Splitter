---
name: Dependency security overrides
description: Security overrides in the pnpm workspace with Expo compatibility constraints
---

Use exact patched versions in pnpm security overrides when a dependency has a major-version boundary. Broad `>=` audit fixes can silently select a new major and break framework tooling.

**Why:** Expo SDK 57 requires Babel 7, but an automatically generated Babel security override selected Babel 8 and stopped Expo autolinking until it was constrained to patched Babel 7.

**How to apply:** After `pnpm audit --fix`, review every override against framework major-version requirements, reinstall, and run the affected build/bundle before considering the audit fix complete.