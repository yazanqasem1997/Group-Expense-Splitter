export type AccentId = "ocean" | "teal" | "violet" | "sunset" | "forest" | "rose";

export const ACCENT_META: Record<AccentId, { label: string; lightPrimary: string; darkPrimary: string }> = {
  ocean:  { label: "Ocean",  lightPrimary: "#1763A6", darkPrimary: "#4B9FE0" },
  teal:   { label: "Teal",   lightPrimary: "#0D9488", darkPrimary: "#2DD4BF" },
  violet: { label: "Violet", lightPrimary: "#7C3AED", darkPrimary: "#A78BFA" },
  sunset: { label: "Sunset", lightPrimary: "#EA580C", darkPrimary: "#FB923C" },
  forest: { label: "Forest", lightPrimary: "#059669", darkPrimary: "#34D399" },
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
    light: { primary: "#059669", primaryDark: "#047857", primaryLight: "#ECFDF5", tint: "#059669", tabIconSelected: "#059669" },
    dark:  { primary: "#34D399", primaryDark: "#059669", primaryLight: "#022C22", tint: "#34D399", tabIconSelected: "#34D399" },
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
    background: "#F4F7FA",
    surface: "#FFFFFF",
    surfaceElevated: "#FFFFFF",
    border: "#E2E8EF",
    switchOff: "#CBD5E1",
    primary: "#1763A6",
    primaryDark: "#0B3C66",
    primaryLight: "#E8F1FA",
    teal: "#129B82",
    tealLight: "#37BFA0",
    tealTint: "#DFF4EE",
    accent: "#EE7B30",
    accentDark: "#C25A18",
    accentTint: "#FCEEE1",
    danger: "#D64545",
    dangerLight: "#FDF0F0",
    success: "#1B9E77",
    successLight: "#E6F7F2",
    warning: "#D48A00",
    warningLight: "#FFF8E1",
    tint: "#1763A6",
    tabIconDefault: "#A0AEBB",
    tabIconSelected: "#1763A6",
    positive: "#1B9E77",
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
    accent2: "#129B82",
    accent2Light: "#DFF4EE",
    accent3: "#EE7B30",
    accent3Light: "#FCEEE1",
    avatarColors: [
      "#1763A6", "#129B82", "#EE7B30", "#D64545",
      "#1B9E77", "#0B3C66", "#37BFA0", "#C25A18",
    ],
  },
  dark: {
    text: "#E8F1FA",
    textSecondary: "#8BA3BE",
    textTertiary: "#4E6580",
    background: "#0C1523",
    surface: "#152035",
    surfaceElevated: "#1C2B44",
    border: "#253650",
    switchOff: "#374151",
    primary: "#4B9FE0",
    primaryDark: "#1763A6",
    primaryLight: "#0C1E33",
    teal: "#37BFA0",
    tealLight: "#129B82",
    tealTint: "#0A1F1C",
    accent: "#EE7B30",
    accentDark: "#C25A18",
    accentTint: "#2A1608",
    danger: "#E06060",
    dangerLight: "#1F0E0E",
    success: "#2DC891",
    successLight: "#0A1F19",
    warning: "#F0A500",
    warningLight: "#1A1400",
    tint: "#4B9FE0",
    tabIconDefault: "#4E6580",
    tabIconSelected: "#4B9FE0",
    positive: "#2DC891",
    negative: "#E06060",
    shadow: "rgba(0, 0, 0, 0.5)",
    overlay: "rgba(0, 0, 0, 0.75)",
    tabBar: "#152035",
    tabBarBorder: "#253650",
    headerBg: "#152035",
    cardBg: "#152035",
    inputBg: "#0C1523",
    inputBorder: "#253650",
    accent1: "#4B9FE0",
    accent1Light: "#0C1E33",
    accent2: "#37BFA0",
    accent2Light: "#0A1F1C",
    accent3: "#EE7B30",
    accent3Light: "#2A1608",
    avatarColors: [
      "#4B9FE0", "#37BFA0", "#EE7B30", "#E06060",
      "#2DC891", "#1763A6", "#129B82", "#C25A18",
    ],
  },
};

export default base;
