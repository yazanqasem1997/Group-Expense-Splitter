import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { createContext, useContext, useEffect, useState } from "react";
import { useColorScheme } from "react-native";
import { AccentId } from "@/constants/colors";

type ThemeMode = "system" | "light" | "dark";

interface ThemeContextType {
  mode: ThemeMode;
  isDark: boolean;
  toggleDark: () => void;
  accentId: AccentId;
  setAccent: (id: AccentId) => void;
}

const ThemeContext = createContext<ThemeContextType>({
  mode: "system",
  isDark: false,
  toggleDark: () => {},
  accentId: "ocean",
  setAccent: () => {},
});

const THEME_KEY = "@spliteasy_theme";
const ACCENT_KEY = "@spliteasy_accent";

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const systemScheme = useColorScheme();
  const [mode, setModeState] = useState<ThemeMode>("system");
  const [accentId, setAccentId] = useState<AccentId>("ocean");

  useEffect(() => {
    Promise.all([
      AsyncStorage.getItem(THEME_KEY),
      AsyncStorage.getItem(ACCENT_KEY),
    ]).then(([themeVal, accentVal]) => {
      if (themeVal === "light" || themeVal === "dark" || themeVal === "system") {
        setModeState(themeVal);
      }
      if (accentVal) setAccentId(accentVal as AccentId);
    });
  }, []);

  const isDark = mode === "system" ? systemScheme === "dark" : mode === "dark";

  const toggleDark = () => {
    const next: ThemeMode = isDark ? "light" : "dark";
    setModeState(next);
    AsyncStorage.setItem(THEME_KEY, next);
  };

  const setAccent = (id: AccentId) => {
    setAccentId(id);
    AsyncStorage.setItem(ACCENT_KEY, id);
  };

  return (
    <ThemeContext.Provider value={{ mode, isDark, toggleDark, accentId, setAccent }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useThemeContext() {
  return useContext(ThemeContext);
}
