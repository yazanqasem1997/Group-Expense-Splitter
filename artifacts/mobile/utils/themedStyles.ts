import { useMemo } from "react";
import { useTheme } from "@/hooks/useTheme";

// Light colours used by the plans and payment screens, and what they become in dark mode.
const BG: Record<string, string> = {
  "#FFFFFF": "#0C1523", "#F4F8F8": "#0C1523", "#F1F5F5": "#1A2A44", "#E6F4F4": "#123A48",
  "#FFF4DC": "#3A2A0A", "#FFF8E8": "#3A2A0A", "#FFF7E6": "#3A2A0A", "#04404A": "#0E8A8F",
};
const BORDER: Record<string, string> = { "#D3E2E3": "#33486A", "#E3ECEC": "#33486A", "#04404A": "#4FB3BA" };
const TEXT: Record<string, string> = { "#0B2A2E": "#E8F1FA", "#557277": "#A3B8D0", "#04404A": "#CFE6EA", "#9A6200": "#F5C66B" };

function swap(value: unknown, map: Record<string, string>) {
  return typeof value === "string" && map[value.toUpperCase()] ? map[value.toUpperCase()] : value;
}

/** Returns the same styles in light mode, and dark-mode versions of the fixed light colours otherwise. */
export function darkify<T extends Record<string, object>>(styles: T, isDark: boolean): T {
  if (!isDark) return styles;
  const out: Record<string, object> = {};
  for (const [name, style] of Object.entries(styles)) {
    const s: Record<string, unknown> = { ...(style as Record<string, unknown>) };
    if ("backgroundColor" in s) s.backgroundColor = swap(s.backgroundColor, BG);
    for (const k of ["borderColor", "borderTopColor", "borderBottomColor"]) if (k in s) s[k] = swap(s[k], BORDER);
    if ("color" in s) s.color = swap(s.color, TEXT);
    out[name] = s;
  }
  return out as T;
}

export function useThemedStyles<T extends Record<string, object>>(styles: T): T {
  const { isDark } = useTheme();
  return useMemo(() => darkify(styles, isDark), [styles, isDark]);
}

/** Icon / inline colour that flips for dark mode. */
export function useInk() {
  const { isDark, colors } = useTheme();
  return { isDark, ink: isDark ? "#CFE6EA" : "#04404A", page: isDark ? colors.background : "#FFFFFF" };
}
