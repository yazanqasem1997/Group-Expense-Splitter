---
name: Scroll-to-top on active tab re-press
description: How to wire bottom-nav tab presses to scroll-to-top only when the tab is already active.
---

**Rule:** Never use `listeners={{ tabPress: () => scrollRegistry.trigger(tab) }}` — that fires on every press including when *navigating to* the tab, causing accidental scroll-to-top on first visit. Also remove `useScrollToTop` from all tab screens to avoid a competing double-scroll.

**Why:** The old approach caused the list to jump to top whenever the user switched *to* a tab, not just when they were already there and tapped again.

**How to apply (Classic Tabs layout):**
```tsx
listeners={({ navigation }) => ({
  tabPress: () => { if (navigation.isFocused()) scrollRegistry.trigger("tabName"); },
})}
```

**How to apply (NativeTabs layout — usePathname):**
```tsx
const pathname = usePathname();
const activeSegment = pathname.split("/").filter(Boolean).pop() ?? "";

const TAB_PATHS = { index: "", activity: "activity", analytics: "analytics", ... };

<AnyTrigger name="activity" onPress={() => {
  if (activeSegment === TAB_PATHS["activity"]) scrollRegistry.trigger("activity");
}}>
```

**Also remove** `useScrollToTop(listRef)` calls from all five tab screens — they register a second scroll-to-top listener that fights with scrollRegistry.
