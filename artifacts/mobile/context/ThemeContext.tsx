import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { createContext, useContext, useEffect, useState } from "react";
import { useColorScheme } from "react-native";

type ThemeMode = "system" | "light" | "dark";

interface ThemeContextType {
  mode: ThemeMode;
  isDark: boolean;
  toggleDark: () => void;
}

const ThemeContext = createContext<ThemeContextType>({
  mode: "system",
  isDark: false,
  toggleDark: () => {},
});

const STORAGE_KEY = "@spliteasy_theme";

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const systemScheme = useColorScheme();
  const [mode, setModeState] = useState<ThemeMode>("system");

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((val) => {
      if (val === "light" || val === "dark" || val === "system") {
        setModeState(val);
      }
    });
  }, []);

  const isDark = mode === "system" ? systemScheme === "dark" : mode === "dark";

  const toggleDark = () => {
    const next: ThemeMode = isDark ? "light" : "dark";
    setModeState(next);
    AsyncStorage.setItem(STORAGE_KEY, next);
  };

  return (
    <ThemeContext.Provider value={{ mode, isDark, toggleDark }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useThemeContext() {
  return useContext(ThemeContext);
}
