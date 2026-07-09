import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { createContext, useContext, useEffect, useState } from "react";
import { useColorScheme } from "react-native";
import { ThemeId } from "@/constants/themes";

type DarkMode = "system" | "light" | "dark";

interface ThemeContextType {
  isDark: boolean;
  toggleDark: () => void;
  themeId: ThemeId;
  setTheme: (id: ThemeId) => void;
}

const ThemeContext = createContext<ThemeContextType>({
  isDark: false,
  toggleDark: () => {},
  themeId: "ocean",
  setTheme: () => {},
});

const DARK_KEY   = "@spliteasy_darkmode";
const THEME_KEY  = "@spliteasy_themeid";

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const systemScheme = useColorScheme();
  const [mode, setMode] = useState<DarkMode>("system");
  const [themeId, setThemeId] = useState<ThemeId>("ocean");

  useEffect(() => {
    Promise.all([
      AsyncStorage.getItem(DARK_KEY),
      AsyncStorage.getItem(THEME_KEY),
    ]).then(([darkVal, themeVal]) => {
      if (darkVal === "light" || darkVal === "dark" || darkVal === "system") setMode(darkVal);
      if (themeVal) setThemeId(themeVal as ThemeId);
    });
  }, []);

  const isDark = mode === "system" ? systemScheme === "dark" : mode === "dark";

  const toggleDark = () => {
    const next: DarkMode = isDark ? "light" : "dark";
    setMode(next);
    AsyncStorage.setItem(DARK_KEY, next);
  };

  const setTheme = (id: ThemeId) => {
    setThemeId(id);
    AsyncStorage.setItem(THEME_KEY, id);
  };

  return (
    <ThemeContext.Provider value={{ isDark, toggleDark, themeId, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useThemeContext() {
  return useContext(ThemeContext);
}
