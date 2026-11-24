import React, { useEffect, useRef, useState } from "react";
import { AccessibilityInfo, Animated, Easing, Text, TextProps } from "react-native";

type Props = TextProps & {
  value: number;
  format: (value: number) => string;
  duration?: number;
};

/**
 * Text that counts smoothly from its previous value to the new one, so a
 * balance visibly "ticks" when an expense or payment changes it. Screen
 * readers get the final value, and Reduce Motion skips the animation.
 */
export function AnimatedAmount({ value, format, duration = 650, ...textProps }: Props) {
  const anim = useRef(new Animated.Value(value)).current;
  const [display, setDisplay] = useState(value);
  const reduceMotion = useRef(false);

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled?.()
      .then(enabled => { reduceMotion.current = !!enabled; })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const id = anim.addListener(({ value: next }) => setDisplay(next));
    return () => anim.removeListener(id);
  }, [anim]);

  useEffect(() => {
    if (reduceMotion.current) {
      anim.setValue(value);
      setDisplay(value);
      return;
    }
    const animation = Animated.timing(anim, {
      toValue: value,
      duration,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    });
    animation.start(({ finished }) => { if (finished) setDisplay(value); });
    return () => animation.stop();
  }, [value, duration, anim]);

  return (
    <Text {...textProps} accessibilityLabel={format(value)}>
      {format(display)}
    </Text>
  );
}
