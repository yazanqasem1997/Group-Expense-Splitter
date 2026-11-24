---
name: Account deletion policy
description: The product decision for scheduled account deletion and shared-group retention.
---

Account deletion is scheduled immediately, recoverable only during a 30-day recovery window, and permanent afterward. Signing in during that window restores the account; after finalization, the user must sign up again.

Groups owned by the deleting user and their shared records are permanently deleted. Membership in groups owned by other users is detached while those groups and their shared records remain.

**Why:** This preserves other owners' shared financial history while honoring deletion of the user's owned data.

**How to apply:** Keep client copy, server cleanup, recovery behavior, and future deletion emails consistent with this policy. Do not silently change shared-group retention without an explicit product decision.