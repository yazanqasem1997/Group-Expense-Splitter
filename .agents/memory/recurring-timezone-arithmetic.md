---
name: Recurring timezone arithmetic
description: Durable rules for recurring schedules across calendar dates, creator timezones, DST, and legacy records.
---

Recurring schedules are anchored to the creator's stored IANA timezone. Advance weekly, custom, monthly, and quarterly schedules as calendar dates, then convert the next date to an instant using the timezone's actual offset. Do not advance by fixed 24-hour milliseconds or use a member's timezone. Records without a timezone use UTC as the deterministic compatibility fallback.

**Why:** Fixed-duration advancement drifts across daylight-saving transitions and month lengths, while one schedule must create exactly one group expense per occurrence regardless of member locations.

**How to apply:** Keep the server scheduler, foreground check, background task, and UI previews on the same date-only helpers. When deriving a timezone offset with `Intl`, include hour/minute/second parts as well as the calendar date.

Combined month/week/day intervals apply calendar months first, followed by week and day offsets; legacy frequency and custom-day records retain their existing fallback behavior.

**Why:** Users can now compose a recurrence such as 1 month, 2 weeks, and 3 days without losing calendar-month behavior or breaking schedules created before the interval controls existed.

**How to apply:** Keep compound interval fields synchronized across the mobile model, API, database, foreground/background processors, and schedule previews.