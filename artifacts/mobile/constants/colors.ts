export type AccentId = "ocean" | "teal" | "violet" | "sunset" | "forest" | "rose";

export const ACCENT_META: Record<AccentId, { label: string; lightPrimary: string; darkPrimary: string }> = {
  ocean:  { label: "Ocean",  lightPrimary: "#1763A6", darkPrimary: "#4B9FE0" },
  teal:   { label: "Teal",   lightPrimary: "#0D9488", darkPrimary: "#2DD4BF" },
  violet: { label: "Violet", lightPrimary: "#7C3AED", darkPrimary: "#A78BFA" },
  sunset: { label: "Sunset", lightPrimary: "#EA580C", darkPrimary: "#FB923C" },
  forest: { label: "Forest", lightPrimary: "#0D9488", darkPrimary: "#2DD4BF" },
  rose:   { label: "Rose",   lightPrimary: "#E11D48", darkPrimary: "#FB7185" },
};

type AccentOverride = {
  primary: string;
  primaryDark: string;
  primaryLight: string;
  tint: string;
  tabIconSelected: string;
};

export const ACCENTS: Record<AccentId, { light: AccentOverride; dark: AccentOverride }> = {
  ocean: {
    light: { primary: "#1763A6", primaryDark: "#0B3C66", primaryLight: "#E8F1FA", tint: "#1763A6", tabIconSelected: "#1763A6" },
    dark:  { primary: "#4B9FE0", primaryDark: "#1763A6", primaryLight: "#0C1E33", tint: "#4B9FE0", tabIconSelected: "#4B9FE0" },
  },
  teal: {
    light: { primary: "#0D9488", primaryDark: "#0F766E", primaryLight: "#F0FDFA", tint: "#0D9488", tabIconSelected: "#0D9488" },
    dark:  { primary: "#2DD4BF", primaryDark: "#0D9488", primaryLight: "#042F2E", tint: "#2DD4BF", tabIconSelected: "#2DD4BF" },
  },
  violet: {
    light: { primary: "#7C3AED", primaryDark: "#5B21B6", primaryLight: "#EDE9FE", tint: "#7C3AED", tabIconSelected: "#7C3AED" },
    dark:  { primary: "#A78BFA", primaryDark: "#7C3AED", primaryLight: "#1E1037", tint: "#A78BFA", tabIconSelected: "#A78BFA" },
  },
  sunset: {
    light: { primary: "#EA580C", primaryDark: "#C2410C", primaryLight: "#FFF7ED", tint: "#EA580C", tabIconSelected: "#EA580C" },
    dark:  { primary: "#FB923C", primaryDark: "#EA580C", primaryLight: "#1C0900", tint: "#FB923C", tabIconSelected: "#FB923C" },
  },
  forest: {
    light: { primary: "#0D9488", primaryDark: "#0F766E", primaryLight: "#ECFDF5", tint: "#0D9488", tabIconSelected: "#0D9488" },
    dark:  { primary: "#2DD4BF", primaryDark: "#0D9488", primaryLight: "#022C22", tint: "#2DD4BF", tabIconSelected: "#2DD4BF" },
  },
  rose: {
    light: { primary: "#E11D48", primaryDark: "#BE123C", primaryLight: "#FFF1F2", tint: "#E11D48", tabIconSelected: "#E11D48" },
    dark:  { primary: "#FB7185", primaryDark: "#E11D48", primaryLight: "#1F0010", tint: "#FB7185", tabIconSelected: "#FB7185" },
  },
};

const base = {
  light: {
    text: "#16202C",
    textSecondary: "#6B7785",
    textTertiary: "#A0AEBB",
    background: "#F2F7FB",
    surface: "#FFFFFF",
    surfaceElevated: "#FFFFFF",
    border: "#E2E8EF",
    switchOff: "#CBD5E1",
    primary: "#1763A6",
    primaryDark: "#0B3C66",
    primaryLight: "#E8F1FA",
    teal: "#0D9488",
    tealLight: "#2DD4BF",
    tealTint: "#DFF4EE",
    accent: "#EE7B30",
    accentDark: "#C25A18",
    accentTint: "#FCEEE1",
    danger: "#D64545",
    dangerLight: "#FDF0F0",
    success: "#0D9488",
    successLight: "#E6F7F2",
    warning: "#D48A00",
    warningLight: "#FFF8E1",
    tint: "#1763A6",
    tabIconDefault: "#A0AEBB",
    tabIconSelected: "#1763A6",
    positive: "#0D9488",
    negative: "#D64545",
    shadow: "rgba(22, 32, 44, 0.08)",
    overlay: "rgba(22, 32, 44, 0.5)",
    tabBar: "#FFFFFF",
    tabBarBorder: "#E2E8EF",
    headerBg: "#FFFFFF",
    cardBg: "#FFFFFF",
    inputBg: "#F4F7FA",
    inputBorder: "#E2E8EF",
    accent1: "#1763A6",
    accent1Light: "#E8F1FA",
    accent2: "#0D9488",
    accent2Light: "#DFF4EE",
    accent3: "#EE7B30",
    accent3Light: "#FCEEE1",
    avatarColors: [
      "#1763A6", "#0D9488", "#EE7B30", "#D64545",
      "#0D9488", "#0B3C66", "#2DD4BF", "#C25A18",
    ],
  },
  dark: {
    text: "#E8F1FA",
    textSecondary: "#A3B8D0",
    textTertiary: "#6E85A3",
    background: "#0C1523",
    surface: "#1A2A44",
    surfaceElevated: "#22344F",
    border: "#33486A",
    switchOff: "#44506A",
    primary: "#4B9FE0",
    primaryDark: "#1763A6",
    primaryLight: "#0C1E33",
    teal: "#2DD4BF",
    tealLight: "#0D9488",
    tealTint: "#0A1F1C",
    accent: "#EE7B30",
    accentDark: "#C25A18",
    accentTint: "#2A1608",
    danger: "#E06060",
    dangerLight: "#1F0E0E",
    success: "#2DD4BF",
    successLight: "#0A1F19",
    warning: "#F0A500",
    warningLight: "#1A1400",
    tint: "#4B9FE0",
    tabIconDefault: "#6E85A3",
    tabIconSelected: "#4B9FE0",
    positive: "#2DD4BF",
    negative: "#E06060",
    shadow: "rgba(0, 0, 0, 0.5)",
    overlay: "rgba(0, 0, 0, 0.75)",
    tabBar: "#1A2A44",
    tabBarBorder: "#33486A",
    headerBg: "#1A2A44",
    cardBg: "#1A2A44",
    inputBg: "#0C1523",
    inputBorder: "#33486A",
    accent1: "#4B9FE0",
    accent1Light: "#0C1E33",
    accent2: "#2DD4BF",
    accent2Light: "#0A1F1C",
    accent3: "#EE7B30",
    accent3Light: "#2A1608",
    avatarColors: [
      "#4B9FE0", "#2DD4BF", "#EE7B30", "#E06060",
      "#2DD4BF", "#1763A6", "#0D9488", "#C25A18",
    ],
  },
};

export default base;
