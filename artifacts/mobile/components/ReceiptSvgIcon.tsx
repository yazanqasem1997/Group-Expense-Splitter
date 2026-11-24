import React from "react";
import Svg, { Path, Line } from "react-native-svg";

interface Props {
  size?: number;
  color?: string;
}

/**
 * Custom receipt icon matching the reference design:
 * zigzag torn edges top & bottom, dollar sign in upper-right,
 * horizontal content lines in the lower body.
 */
export function ReceiptSvgIcon({ size = 24, color = "#5A6070" }: Props) {
  const sw = 5.5; // stroke width in viewBox units (scales with the SVG)
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      {/* ── Receipt outline with zigzag torn edges ─────────────────────── */}
      <Path
        d={[
          // Top edge — peaks pointing UP (y=2), valleys at y=8
          "M10,8",
          "L16,2 L21,8 L27,2 L33,8 L39,2 L44,8",
          "L50,2 L56,8 L62,2 L67,8 L73,2 L79,8 L85,2 L90,8",
          // Right side straight down
          "L90,92",
          // Bottom edge — peaks pointing DOWN (y=98), valleys at y=92
          "L85,98 L79,92 L73,98 L67,92 L62,98 L56,92",
          "L50,98 L44,92 L39,98 L33,92 L27,98 L21,92 L16,98 L10,92",
          // Left side closes back to start
          "Z",
        ].join(" ")}
        stroke={color}
        strokeWidth={sw}
        fill="none"
        strokeLinejoin="miter"
      />

      {/* ── Dollar sign — vertical stem ─────────────────────────────────── */}
      <Line
        x1="69" y1="12" x2="69" y2="47"
        stroke={color} strokeWidth={sw} strokeLinecap="round"
      />

      {/* ── Dollar sign — S-curve ───────────────────────────────────────── */}
      <Path
        d="M78,21 C78,16 73,14 69,16 C65,18 64,24 70,27 C76,30 77,36 73,39 C69,42 62,41 62,36"
        stroke={color}
        strokeWidth={sw}
        fill="none"
        strokeLinecap="round"
      />

      {/* ── Content lines (lower body) ──────────────────────────────────── */}
      {/* Short line on top row (leaves room for dollar sign on the right) */}
      <Line x1="18" y1="54" x2="57" y2="54" stroke={color} strokeWidth={sw} strokeLinecap="round" />
      {/* Full-width lines */}
      <Line x1="18" y1="64" x2="75" y2="64" stroke={color} strokeWidth={sw} strokeLinecap="round" />
      <Line x1="18" y1="74" x2="75" y2="74" stroke={color} strokeWidth={sw} strokeLinecap="round" />
      {/* Short bottom line */}
      <Line x1="18" y1="83" x2="55" y2="83" stroke={color} strokeWidth={sw} strokeLinecap="round" />
    </Svg>
  );
}
