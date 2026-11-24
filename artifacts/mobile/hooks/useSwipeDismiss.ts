import { Gesture } from "react-native-gesture-handler";
import { runOnJS, useAnimatedStyle, useSharedValue, withSpring, withTiming } from "react-native-reanimated";

/**
 * Swipe-down-to-dismiss for bottom sheets / dropdown-style modals.
 *
 * Built on react-native-gesture-handler (not the plain RN PanResponder):
 * PanResponder's touch-responder negotiation is unreliable on the web preview
 * (a mousedown outside the drag zone, or any ancestor that claims the
 * responder on press, silently swallows the whole gesture), while
 * gesture-handler recognizes the pan natively on every platform including
 * web. Wrap the draggable zone (handle + title row, or a picker header) in a
 * `GestureDetector` with the returned `gesture` — never the whole
 * ScrollView/FlatList area, so list scrolling isn't hijacked. Apply the
 * returned `style` to the sheet's outermost `Animated.View` (imported from
 * `react-native-reanimated`, not `react-native`).
 */
export function useSwipeDismiss(onDismiss: () => void) {
  const translateY = useSharedValue(0);

  const gesture = Gesture.Pan()
    .activeOffsetY(8)
    .failOffsetX([-16, 16])
    .onUpdate(e => {
      if (e.translationY > 0) translateY.value = e.translationY;
    })
    .onEnd(e => {
      if (e.translationY > 110 || e.velocityY > 900) {
        translateY.value = withTiming(900, { duration: 200 }, finished => {
          if (finished) runOnJS(onDismiss)();
        });
      } else {
        translateY.value = withSpring(0, { damping: 20, stiffness: 250 });
      }
    })
    .onFinalize(() => {
      // Safety net: if the gesture is cancelled/interrupted mid-drag without
      // hitting onEnd's dismiss threshold, always settle back to closed=0.
    });

  const style = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  function reset() {
    translateY.value = 0;
  }

  return { gesture, style, reset };
}
