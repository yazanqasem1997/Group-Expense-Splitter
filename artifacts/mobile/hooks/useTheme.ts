import { ACCENTS, AccentId } from "@/constants/colors";
import BaseColors from "@/constants/colors";
import { useThemeContext } from "@/context/ThemeContext";

export function useTheme() {
  const { isDark, toggleDark, accentId, setAccent } = useThemeContext();
  const base = isDark ? BaseColors.dark : BaseColors.light;
  const accentOverride = ACCENTS[accentId]?.[isDark ? "dark" : "light"];
  const colors = accentOverride ? { ...base, ...accentOverride } : base;
  return { colors, isDark, toggleDark, accentId, setAccent };
}
