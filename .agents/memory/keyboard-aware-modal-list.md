---
name: Keyboard-aware fixed-height list inside a Modal
description: A FlatList with a fixed pixel height inside a transparent bottom-sheet Modal does not shrink for the on-screen keyboard by default; results get hidden behind it.
---

## Symptom
A search/results `FlatList` given a fixed `height` (e.g. `height: 380`) inside a bottom-sheet-style `Modal` (backdrop `Pressable` + sheet as siblings, sheet anchored to the bottom) stays that height when the keyboard opens. Since the Modal itself doesn't resize for the keyboard, the bottom portion of the list ends up rendered underneath/behind the keyboard.

## Fix
1. Wrap the sheet content in `KeyboardAvoidingView` (`behavior="padding"` on iOS, `undefined`/`"height"` on Android) so the sheet is pushed up.
2. Also track keyboard height explicitly via `Keyboard.addListener("keyboardWillShow"/"keyboardDidShow", e => setKeyboardHeight(e.endCoordinates.height))` and compute the list's max height as `Math.min(originalMax, windowHeight - keyboardHeight - reservedHeaderHeight)`, applying it as the FlatList's `style.height`. `KeyboardAvoidingView` alone doesn't shrink a fixed-height child that would overflow the remaining space — you need both.

**Why:** discovered while fixing SplitEasy's `CurrencyPickerModal` search results being hidden under the keyboard.
**How to apply:** any bottom-sheet Modal with a search input + fixed-height results list.
