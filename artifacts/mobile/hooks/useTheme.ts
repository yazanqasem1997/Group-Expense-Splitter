import { THEMES, ThemeId } from "@/constants/themes";
import { useThemeContext } from "@/context/ThemeContext";

export function useTheme() {
  const { isDark, toggleDark, themeId, setTheme } = useThemeContext();
  const colors = THEMES[themeId][isDark ? "dark" : "light"];
  return { colors, isDark, toggleDark, themeId, setTheme };
}
