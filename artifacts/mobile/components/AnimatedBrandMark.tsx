import React, { useEffect, useRef, useState } from "react";
import { AccessibilityInfo, Animated, Easing } from "react-native";
import Svg, { Path, Rect } from "react-native-svg";

const LEFT = "M 32 31 Q 32 24 39 24 L 57 24 L 57 96 L 51 90 L 45 96 L 39 90 L 32 96 Z";
const RIGHT = "M 63 24 L 81 24 Q 88 24 88 31 L 88 96 L 82 90 L 76 96 L 69 90 L 63 96 Z";
const LINES: [number, number][] = [[39, 38], [69, 38], [39, 50], [69, 50]];
const OUTLINE = 260; // longer than each half's outline, so the dash fully hides it at the start

type Props = {
  size?: number;
  primary?: string;
  secondary?: string;
  detail?: string;
  /** Accepted for parity with BrandMark; unused. */
  outline?: string;
  delay?: number;
  onDone?: () => void;
};

/**
 * The "Draw" intro: the torn-receipt outline draws itself, fills with colour,
 * then the item lines tick in like a bill being written (about 1.6s).
 * Progress is mirrored into React state (plain SVG props), which renders the same
 * on iOS, Android and web. With Reduce Motion on, the finished logo shows at once.
 */
export function AnimatedBrandMark({
  size = 72,
  primary = "#0E8A8F",
  secondary = "#F5A524",
  detail = "#FFFFFF",
  delay = 0,
  onDone,
}: Props) {
  const progress = useRef(new Animated.Value(0)).current;
  const [p, setP] = useState(0);

  useEffect(() => {
    let cancelled = false;
    let animation: Animated.CompositeAnimation | null = null;
    const id = progress.addListener(({ value }) => setP(value));
    AccessibilityInfo.isReduceMotionEnabled?.()
      .catch(() => false)
      .then(reduce => {
        if (cancelled) return;
        if (reduce) {
          progress.setValue(1);
          onDone?.();
          return;
        }
        animation = Animated.sequence([
          Animated.delay(delay),
          Animated.timing(progress, { toValue: 1, duration: 1650, easing: Easing.linear, useNativeDriver: false }),
        ]);
        animation.start(({ finished }) => { if (finished) onDone?.(); });
      });
    return () => {
      cancelled = true;
      animation?.stop();
      progress.removeListener(id);
    };
    // Plays once per mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // One 1650ms timeline: outline 0-950ms, fill 950-1270ms, item lines 1270-1650ms.
  const ms = p * 1650;
  const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  const clamp = (t: number) => Math.min(1, Math.max(0, t));
  const draw = ease(clamp(ms / 950));
  const fill = clamp((ms - 950) / 320);
  const dashOffset = OUTLINE * (1 - draw);

  return (
    <Svg width={size} height={size} viewBox="0 0 120 120" accessibilityLabel="Split Mate logo">
      {[[LEFT, primary], [RIGHT, secondary]].map(([d, color]) => (
        <Path
          key={d}
          d={d}
          fill={color}
          fillOpacity={fill}
          stroke={color}
          strokeWidth={2.5}
          strokeLinejoin="round"
          strokeDasharray={`${OUTLINE} ${OUTLINE}`}
          strokeDashoffset={dashOffset}
        />
      ))}
      {LINES.map(([x, y], i) => {
        const w = 12 * clamp((ms - 1270 - i * 70) / 170);
        return w > 0 ? <Rect key={`${x}-${y}`} x={x} y={y} width={w} height={5} rx={2.5} fill={detail} opacity={0.35} /> : null;
      })}
    </Svg>
  );
}
