# Tally — remaining work

This repo already contains reviewed, committed changes (commits `142b1ad`, `5e3f44e`): currency-picker fixed height, chart flat-line fix, audit-trail persistence, FAB overlap fix, real dates, Settings→Account rename, expanded auto-categorisation vocabulary, receipt scanning removed, keyboard-dismiss-on-drag everywhere, Scheduled/Payments collapsed by default, rates next-update label, user-facing SplitEasy→Tally rename. **Do not redo or restyle any of that.** First run `pnpm install && pnpm run typecheck` and confirm it passes before touching anything.

File paths: mobile app in `artifacts/mobile`, API in `artifacts/api-server`, DB schema in `lib/db/src/schema`.

## Hard constraints

1. **Do not change the main tab bar** (`app/(tabs)/_layout.tsx`): five tabs — Activity, Stats, Groups, Friends, Account — keep their order, icons, and names. Only item 2 below may touch this file.
2. **New screens are pushed stack screens** (like `app/recurring.tsx`), never new tabs. The user completes the task and goes back.
3. Preserve existing data models and split/money logic unless a change explicitly requires it.
4. Both tab layouts exist for a reason (`NativeTabLayout` for iOS liquid glass, `ClassicTabLayout` otherwise). Any tab-bar behaviour change must work in both.

## Functional items

**1. Recurring expenses entry point.** Recurring lives at the stack screen `app/recurring.tsx` (a redirect remains at `app/(tabs)/recurring.tsx`). Restore a visible entry point where it previously lived so it's reachable the way it used to be, opening the stack screen with a back button.

**2. Scroll-to-top on tab re-tap — currently only works on the Account tab.** Each tab screen registers a callback with `hooks/scrollRegistry.ts`; `app/(tabs)/_layout.tsx` triggers it on tab press. All five screens register correctly — the bug is in the layout's trigger path. In `NativeTabLayout`, `onPress` is forced onto `NativeTabs.Trigger` via an `as any` cast, which strongly suggests the prop isn't supported and never fires; replace with a supported re-select/press event if expo-router's native tabs expose one, otherwise trigger from a pathname-change effect or fall back to `ClassicTabLayout`. In `ClassicTabLayout`, verify `tabPress` listeners fire when the tab is already focused on each platform. Confirm `ref={listRef}` is attached to the rendered FlatList in `index.tsx` and `activity.tsx`. Acceptance test: on each of the five tabs, scroll down, tap the active tab's icon, confirm scroll to top — in both layouts.

**3. Members behind a button** (`app/group/[id].tsx`). Don't render the member list inline; add a **Members** button that pushes a member-list screen. Declutter only.

**4. Balance summary redesign** (`app/group/[id].tsx`). Remove the owe/owed box container entirely — no border, no fill, no card. Replace with a typographic block directly on the screen background at the top: small quiet uppercase label ("YOU ARE OWED" / "YOU OWE"); the amount below it, large, tabular figures, one semantic colour — teal `#129B82` owed, orange `#EE7B30` owing, neutral when settled ("All settled up"); one secondary line ("across 3 people"), tappable to open the per-person breakdown `renderBalances()` already produces. Generous whitespace and at most one faint hairline before the list. Apply the same treatment to any equivalent summary elsewhere.

**5. Participant selection** (`app/expense/new.tsx`). Default: everyone in the group is included. Under **Split** at the bottom, list members with tick checkboxes, all ticked; unticking removes them and the split recalculates.

**6. Single vs recurring toggle** (`app/expense/new.tsx`). The inline `isRecurring` block with frequency/day/time fields is the clutter. Replace with a small **Single | Recurring** toggle (Single default); choosing Recurring pushes a separate settings screen (frequency, day, time, start/end) whose values return to the form. Remove the inline recurring fields entirely.

**7. Category icon placement.** Auto-categorisation (`services/ai.ts`, already expanded) assigns every payment a category, falling back to the "other" receipt icon. Once a category resolves, remove the category text line from the entry form and list rows and show only the `CategoryIcon` next to the currency symbol — the icon replaces the line.

**8. Flatten payment rows** (group list and `app/(tabs)/activity.tsx`). Entries are boxed cards taking too much vertical space. Restyle Splitwise-flat: no border, no card background, no shadow; rows on the screen background separated by a single faint hairline; tighter vertical padding. Also verify no "General" label renders in any list row.

**9. Account restructure** (`app/(tabs)/account.tsx`). The screen shows only tappable section rows; each pushes its own stack screen with that section's controls. Notifications' four inline items move onto a Notifications page, leaving one row. Apply to every section.

## Deployment readiness

**10. Finish the rename.** User-facing strings and the app display name are done. Still open: Expo config slug and bundle/package identifier (decide these now — painful to change after store submission), and the email/share templates in `artifacts/mobile/server/templates`. The AsyncStorage keys and the `spliteasy://` deep-link scheme were deliberately left; renaming the scheme requires updating QR generation and deep-link handling in `app/group/qr/[id].tsx` in the same change — do it as one coordinated commit or leave the scheme as-is.

**11. Standard Account rows**, grouped, each pushing its own page: **Profile** (name, email, avatar, default currency; Delete account — destructive, confirmed, must actually delete or anonymise the user's Postgres rows, not just the Clerk user; app stores require real deletion). **Preferences** (Notifications page, appearance/theme). **Support** (Contact us, Help/FAQ, Report a problem). **Legal** (Privacy Policy, Terms, third-party licences). **About** (version and build read from Expo config rather than the current hardcoded string; the same runtime copyright line already on the Account footer). Sign out at the bottom, visually separated.

**12. Contact us.** Form (subject picker: Bug / Feature request / Billing / Other; message; prefilled editable email) POSTing to a new authenticated route in `artifacts/api-server/src/routes`, writing to a `support_requests` table added in `lib/db/src/schema`. Auto-attach app version, platform/OS, user id — shown to the user. Success and failure states; mailto fallback. No live chat.

**13. Legal pages.** Privacy Policy and Terms as real in-app scrollable screens with placeholder content covering the standard sections (data collected, storage, processors — note Clerk and the Postgres host — retention, deletion, user obligations, liability, governing law). Banner: "DRAFT — pending legal review". Include "Last updated".

**14. Pre-deployment checklist.** Verify and report each; list anything unfixable as numbered blockers: no secrets or `DATABASE_URL` committed or shipped client-side (Clerk publishable key client-only, secret key server-only in Replit secrets); every route in `artifacts/api-server/src/routes` verifies the Clerk session AND group membership — attempt cross-group access with a second account, confirm 403, list checks per route, and remove or auth-gate `seed.ts` in production; no unhandled rejections, every network call has a visible failure state, no raw errors in the UI; empty states for every list, loading states on every async surface, consistent use of the existing `SyncStatusBanner` offline; icon, adaptive icon, splash at required sizes and correct name/identifier/version in Expo config; debug logging stripped from production builds; accessibility — 44pt touch targets, labels on icon-only buttons, text scales with system font size.

## Visual design

**15. Design brief — refinement, not redesign.** Keep the existing identity and palette (primary blue `#1763A6`, teal `#129B82`, orange `#EE7B30`; Inter is the app face). Before changing files, state back a compact token system: a neutral ramp (background, surface, three text levels, hairline) as hex values; a type scale of ≤5 sizes and 3 weights with stated purposes; a 4pt spacing grid (4/8/12/16/24/32) every margin and padding snaps to; one corner radius and one hairline treatment. All currency amounts use tabular figures — extend the existing `AmountText` component and use it everywhere money renders. Principles: reduce the number of surfaces — prefer whitespace and hairlines over nested boxes and delete any box not earning its keep; hierarchy from size/weight/colour, not borders and fills; saturated colour only where it carries meaning; the same element looks the same everywhere. No gradients, shadows, glassmorphism (the iOS tab-bar blur stays), or decorative animation.

**16. Final polish pass — after everything above.** Maximum polish within the existing identity; completes item 15, never overrides it. Pressed states on everything tappable; light haptics (expo-haptics) on primary actions. Motion with purpose only: layout animation on list row add/remove, smooth expand/collapse for Scheduled/Payments, a brief highlight on a newly added expense row; respect reduced-motion; no idle animation. Skeleton loaders matching final layout where content shape is known. Empty states with one line of copy and a button starting the obvious task. One icon set (Feather), sentence case, buttons named for what they do. Correct keyboard types (decimal pad for amounts), return-key advances fields, pull-to-refresh on every list, safe-area insets on notched devices, dark mode reviewed screen-by-screen against the token system. Finish by walking every screen and fixing anything misaligned or off-grid. The bar: nothing should look like a default.

## Working order

Functional items first (1–9), then deployment (10–14), design last (15–16) so polish isn't applied to screens that are about to change. After the functional items, pause and wait for my review before starting the design work.
