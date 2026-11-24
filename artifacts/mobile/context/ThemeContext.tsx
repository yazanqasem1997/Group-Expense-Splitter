import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { createContext, useContext, useEffect, useState } from "react";
import { useColorScheme } from "react-native";
type DarkMode = "system" | "light" | "dark";

interface ThemeContextType {
  isDark: boolean;
  toggleDark: () => void;
}

const ThemeContext = createContext<ThemeContextType>({
  isDark: false,
  toggleDark: () => {},
});

// Versioned so the old system/dark default does not override the new Light
// startup default for users who already opened the app before this change.
const DARK_KEY   = "@spliteasy_appearance_mode_v2";

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const systemScheme = useColorScheme();
  // Start new sessions in Light mode. A previously saved explicit choice is
  // still restored below, so this only changes the default for new installs.
  const [mode, setMode] = useState<DarkMode>("light");

  useEffect(() => {
    Promise.all([
      AsyncStorage.getItem(DARK_KEY),
    ]).then(([darkVal]) => {
      if (darkVal === "light" || darkVal === "dark" || darkVal === "system") setMode(darkVal);
    });
  }, []);

  const isDark = mode === "system" ? systemScheme === "dark" : mode === "dark";

  const toggleDark = () => {
    const next: DarkMode = isDark ? "light" : "dark";
    setMode(next);
    AsyncStorage.setItem(DARK_KEY, next);
  };

  return (
    <ThemeContext.Provider value={{ isDark, toggleDark }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useThemeContext() {
  return useContext(ThemeContext);
}
