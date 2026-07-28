---
name: AppAlert layering fix
description: Why AppAlert must use RN Modal component, not an absolute-positioned View
---

AppAlert was originally an absolute-positioned View with zIndex:9999/elevation:99.
This failed whenever a React Native `Modal` was open (e.g. settle/settle-all sheets in group/[id].tsx), because RN Modals render in a native overlay layer that sits above *all* Views regardless of zIndex.

**Fix applied:** Rewrote AppAlert to use `<Modal visible={!!config} transparent animationType="fade" statusBarTranslucent>`. Because it's a native Modal too, it competes in the same native layer and wins since it's mounted later in the tree (at root, as a sibling of AppProvider).

**Why:** React Native's Modal component uses a native portal; no CSS/RN z-index stack can override it. The only way to layer above a Modal is with another Modal.

**How to apply:** Any future global overlay (sheets, toasts rendered as overlays, etc.) that must appear above in-screen Modals should use RN Modal with transparent=true, not an absolute View.
