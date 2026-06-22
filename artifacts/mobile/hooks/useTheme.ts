import Colors from "@/constants/colors";
import { useThemeContext } from "@/context/ThemeContext";

export function useTheme() {
  const { isDark, toggleDark } = useThemeContext();
  const colors = isDark ? Colors.dark : Colors.light;
  return { colors, isDark, toggleDark };
}
