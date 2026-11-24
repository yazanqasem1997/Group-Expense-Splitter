import React from "react";
import Svg, { Defs, LinearGradient, Path, Rect, Stop } from "react-native-svg";
import { useId } from "react";

type BrandMarkProps = {
  size?: number;
  /** Colour of the left half of the receipt. */
  primary?: string;
  /** Colour of the right half of the receipt. */
  secondary?: string;
  /** Colour of the printed lines on the receipt (match the background). */
  detail?: string;
  /** Kept for backwards compatibility; the mark has no outline. */
  outline?: string;
  /** Draw the full app-icon tile (teal gradient square) behind the mark. */
  tile?: boolean;
};

// A receipt torn down the middle: one half each.
const LEFT = "M 32 31 Q 32 24 39 24 L 57 24 L 57 96 L 51 90 L 45 96 L 39 90 L 32 96 Z";
const RIGHT = "M 63 24 L 81 24 Q 88 24 88 31 L 88 96 L 82 90 L 76 96 L 69 90 L 63 96 Z";
const LINES = [
  [39, 38], [39, 50], [69, 38], [69, 50],
];

/** Split Mate's mark: a receipt torn in two, one half per person. */
export function BrandMark({
  size = 72,
  primary = "#0E8A8F",
  secondary = "#F5A524",
  detail = "#FFFFFF",
  tile = false,
}: BrandMarkProps) {
  const gradientId = `split-mate-tile-${useId().replace(/:/g, "")}`;
  const left = tile ? "#FFFFFF" : primary;
  const right = tile ? "#F5A524" : secondary;
  const lines = tile ? "#0E7C86" : detail;

  return (
    <Svg width={size} height={size} viewBox="0 0 120 120" accessibilityLabel="Split Mate logo">
      {tile && (
        <>
          <Defs>
            <LinearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
              <Stop offset="0" stopColor="#04404A" />
              <Stop offset="1" stopColor="#18B6A4" />
            </LinearGradient>
          </Defs>
          <Rect x="0" y="0" width="120" height="120" rx="28" fill={`url(#${gradientId})`} />
        </>
      )}
      <Path d={LEFT} fill={left} />
      <Path d={RIGHT} fill={right} />
      {LINES.map(([x, y]) => (
        <Rect key={`${x}-${y}`} x={x} y={y} width="12" height="5" rx="2.5" fill={lines} opacity={0.35} />
      ))}
    </Svg>
  );
}
