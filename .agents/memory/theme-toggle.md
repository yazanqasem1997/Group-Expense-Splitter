---
name: Theme toggle pattern
description: How in-app dark mode toggle is implemented — ThemeContext with AsyncStorage, not useColorScheme alone
---

`useColorScheme()` from React Native only reads the OS-level setting and cannot be overridden in-app. To support a user-controlled toggle:

1. `context/ThemeContext.tsx` — stores `ThemeMode` ("system" | "light" | "dark") in state, persists to AsyncStorage under `@spliteasy_theme`, exposes `isDark` and `toggleDark`.
2. `hooks/useTheme.ts` — calls `useThemeContext()` instead of `useColorScheme()` directly; returns `{ colors, isDark, toggleDark }`.
3. `ThemeProvider` wraps the whole tree in `app/_layout.tsx` (inside KeyboardProvider, outside AppProvider).
4. Account screen uses a `Switch` component wired to `toggleDark`.

**Why:** System color scheme is read-only from JS; a context layer is the only way to override it.

**How to apply:** Any new screen that needs theme access just calls `useTheme()` — no changes needed elsewhere.
