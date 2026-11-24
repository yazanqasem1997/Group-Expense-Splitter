---
name: Native notification gestures
description: Durable interaction rules for notification swipes and keyboard-adjacent comment inputs.
---

Use the installed native gesture-handler swipe component for notification actions. Do not recreate horizontal deletion gestures with `PanResponder` inside a vertical list.

**Why:** Custom responders repeatedly produced lag, gesture conflicts, and exposed action-layer artifacts while scrolling. Native gesture handling coordinates horizontal and vertical gestures correctly.

**How to apply:** A completed left swipe should perform deletion directly. For input bars above the software keyboard, use zero keyboard offset and remove safe-area bottom padding while the keyboard is visible.