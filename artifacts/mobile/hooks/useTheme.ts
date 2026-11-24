import { THEMES } from "@/constants/themes";
import { useThemeContext } from "@/context/ThemeContext";

export function useTheme() {
  const { isDark, toggleDark } = useThemeContext();
  const colors = THEMES.ocean[isDark ? "dark" : "light"];
  const refreshIndicatorColor = isDark ? colors.switchOff : colors.primaryDark;
  return { colors, isDark, toggleDark, refreshIndicatorColor };
}
