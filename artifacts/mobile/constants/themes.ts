export type ThemeId = "ocean" | "teal" | "violet" | "sunset" | "forest" | "rose";

export interface ColorPalette {
  text: string;
  textSecondary: string;
  textTertiary: string;
  background: string;
  surface: string;
  surfaceElevated: string;
  border: string;
  switchOff: string;
  primary: string;
  primaryDark: string;
  primaryLight: string;
  teal: string;
  tealLight: string;
  tealTint: string;
  accent: string;
  accentDark: string;
  accentTint: string;
  danger: string;
  dangerLight: string;
  success: string;
  successLight: string;
  warning: string;
  warningLight: string;
  tint: string;
  tabIconDefault: string;
  tabIconSelected: string;
  positive: string;
  negative: string;
  shadow: string;
  overlay: string;
  tabBar: string;
  tabBarBorder: string;
  headerBg: string;
  cardBg: string;
  inputBg: string;
  inputBorder: string;
  accent1: string;
  accent1Light: string;
  accent2: string;
  accent2Light: string;
  accent3: string;
  accent3Light: string;
  avatarColors: string[];
}

export const THEME_META: Record<ThemeId, { label: string; lightSwatch: string; darkSwatch: string }> = {
  ocean:  { label: "Ocean",  lightSwatch: "#1763A6", darkSwatch: "#4B9FE0" },
  teal:   { label: "Teal",   lightSwatch: "#0D9488", darkSwatch: "#2DD4BF" },
  violet: { label: "Violet", lightSwatch: "#7C3AED", darkSwatch: "#A78BFA" },
  sunset: { label: "Sunset", lightSwatch: "#EA580C", darkSwatch: "#FB923C" },
  forest: { label: "Forest", lightSwatch: "#0D9488", darkSwatch: "#2DD4BF" },
  rose:   { label: "Rose",   lightSwatch: "#E11D48", darkSwatch: "#FB7185" },
};

export const THEME_ORDER: ThemeId[] = ["ocean", "teal", "violet", "sunset", "forest", "rose"];

const shared = {
  danger: "#D64545",
  dangerLight: "#FDF0F0",
  success: "#0D9488",
  successLight: "#E6F7F2",
  warning: "#D48A00",
  warningLight: "#FFF8E1",
  positive: "#0D9488",
  negative: "#D64545",
};

const sharedDark = {
  danger: "#E06060",
  dangerLight: "#1F0E0E",
  success: "#2DD4BF",
  successLight: "#0A1F19",
  warning: "#F0A500",
  warningLight: "#1A1400",
  positive: "#2DD4BF",
  negative: "#E06060",
};

export const THEMES: Record<ThemeId, { light: ColorPalette; dark: ColorPalette }> = {
  ocean: {
    // Split Mate palette: Lagoon Teal. Deep teal primary, green for money owed to you, amber accent.
    light: {
      ...shared,
      danger: "#E5484D", dangerLight: "#FDECEC",
      success: "#0E8A8F", successLight: "#DDF3F2",
      warning: "#F59E0B", warningLight: "#FFF5DF",
      positive: "#0E8A8F", negative: "#E5484D",
      text: "#0B2224", textSecondary: "#557274", textTertiary: "#8FA9AA",
      background: "#F1F7F7", surface: "#FFFFFF", surfaceElevated: "#FFFFFF",
      border: "#DCEBEA", switchOff: "#B9D2D1",
      primary: "#0E8A8F", primaryDark: "#0A6A6E", primaryLight: "#DDF3F2",
      teal: "#0E8A8F", tealLight: "#14B8A6", tealTint: "#DDF3F2",
      accent: "#F5A524", accentDark: "#D48806", accentTint: "#FEF3DC",
      tint: "#0E8A8F", tabIconDefault: "#9DB5B5", tabIconSelected: "#0E8A8F",
      shadow: "rgba(11,34,36,0.10)", overlay: "rgba(11,34,36,0.5)",
      tabBar: "#FFFFFF", tabBarBorder: "#E3EFEE",
      headerBg: "#F1F7F7", cardBg: "#FFFFFF",
      inputBg: "#F3F9F9", inputBorder: "#D6E8E7",
      accent1: "#0E8A8F", accent1Light: "#DDF3F2",
      accent2: "#F5A524", accent2Light: "#FEF3DC",
      accent3: "#0E8A8F", accent3Light: "#DDF3F2",
      avatarColors: ["#0E8A8F","#F5A524","#0E8A8F","#7C5CFF","#E5484D","#0EA5E9","#EC4899","#5B6B6C"],
    },
    dark: {
      ...sharedDark,
      danger: "#FF6B6B", dangerLight: "#2A1012",
      success: "#2DD4BF", successLight: "#0B2B2C",
      warning: "#FBBF24", warningLight: "#2A2008",
      positive: "#2DD4BF", negative: "#FF6B6B",
      text: "#E6F6F5", textSecondary: "#8DB3B2", textTertiary: "#5F8584",
      background: "#061517", surface: "#0D2427", surfaceElevated: "#123033",
      border: "#18383A", switchOff: "#2A4C4D",
      primary: "#1FA99C", primaryDark: "#0E8A8F", primaryLight: "#0F3A3B",
      teal: "#2DD4BF", tealLight: "#0E8A8F", tealTint: "#0B2B2C",
      accent: "#FBBF24", accentDark: "#F5A524", accentTint: "#2A2008",
      tint: "#2FD3C3", tabIconDefault: "#5F8584", tabIconSelected: "#2FD3C3",
      shadow: "rgba(0,0,0,0.5)", overlay: "rgba(0,0,0,0.75)",
      tabBar: "#0D2427", tabBarBorder: "#18383A",
      headerBg: "#061517", cardBg: "#0D2427",
      inputBg: "#08191B", inputBorder: "#18383A",
      accent1: "#2FD3C3", accent1Light: "#0F3A3B",
      accent2: "#FBBF24", accent2Light: "#2A2008",
      accent3: "#2DD4BF", accent3Light: "#0B2B2C",
      avatarColors: ["#2FD3C3","#FBBF24","#2DD4BF","#A78BFA","#FF6B6B","#38BDF8","#F472B6","#8DB3B2"],
    },
  },

  teal: {
    light: {
      ...shared,
      text: "#0D2626", textSecondary: "#4D7575", textTertiary: "#8AADAD",
      background: "#F0FAFA", surface: "#FFFFFF", surfaceElevated: "#FFFFFF",
      border: "#D1EEEE", switchOff: "#A8D5D5",
      primary: "#0D9488", primaryDark: "#0F766E", primaryLight: "#CCFBF1",
      teal: "#0EA5E9", tealLight: "#38BDF8", tealTint: "#E0F2FE",
      accent: "#F59E0B", accentDark: "#D97706", accentTint: "#FEF3C7",
      tint: "#0D9488", tabIconDefault: "#8AADAD", tabIconSelected: "#0D9488",
      shadow: "rgba(13,38,38,0.08)", overlay: "rgba(13,38,38,0.5)",
      tabBar: "#FFFFFF", tabBarBorder: "#D1EEEE",
      headerBg: "#FFFFFF", cardBg: "#FFFFFF",
      inputBg: "#F0FAFA", inputBorder: "#D1EEEE",
      accent1: "#0D9488", accent1Light: "#CCFBF1",
      accent2: "#0EA5E9", accent2Light: "#E0F2FE",
      accent3: "#F59E0B", accent3Light: "#FEF3C7",
      avatarColors: ["#0D9488","#0EA5E9","#F59E0B","#EF4444","#0D9488","#0F766E","#38BDF8","#D97706"],
    },
    dark: {
      ...sharedDark,
      text: "#CCFBF1", textSecondary: "#5EEAD4", textTertiary: "#2DD4BF",
      background: "#061618", surface: "#0C2628", surfaceElevated: "#113335",
      border: "#164040", switchOff: "#1F4F4F",
      primary: "#2DD4BF", primaryDark: "#0D9488", primaryLight: "#042F2E",
      teal: "#38BDF8", tealLight: "#0EA5E9", tealTint: "#082030",
      accent: "#FBBF24", accentDark: "#F59E0B", accentTint: "#1C1500",
      tint: "#2DD4BF", tabIconDefault: "#2DD4BF", tabIconSelected: "#2DD4BF",
      shadow: "rgba(0,0,0,0.6)", overlay: "rgba(0,0,0,0.8)",
      tabBar: "#0C2628", tabBarBorder: "#164040",
      headerBg: "#0C2628", cardBg: "#0C2628",
      inputBg: "#061618", inputBorder: "#164040",
      accent1: "#2DD4BF", accent1Light: "#042F2E",
      accent2: "#38BDF8", accent2Light: "#082030",
      accent3: "#FBBF24", accent3Light: "#1C1500",
      avatarColors: ["#2DD4BF","#38BDF8","#FBBF24","#F87171","#2DD4BF","#0D9488","#0EA5E9","#D97706"],
    },
  },

  violet: {
    light: {
      ...shared,
      text: "#1E0B38", textSecondary: "#5E4B8B", textTertiary: "#9B8CC2",
      background: "#FAF8FF", surface: "#FFFFFF", surfaceElevated: "#FFFFFF",
      border: "#E5DDF8", switchOff: "#C4B5F0",
      primary: "#7C3AED", primaryDark: "#5B21B6", primaryLight: "#EDE9FE",
      teal: "#0D9488", tealLight: "#2DD4BF", tealTint: "#CCFBF1",
      accent: "#EC4899", accentDark: "#BE185D", accentTint: "#FCE7F3",
      tint: "#7C3AED", tabIconDefault: "#9B8CC2", tabIconSelected: "#7C3AED",
      shadow: "rgba(30,11,56,0.08)", overlay: "rgba(30,11,56,0.5)",
      tabBar: "#FFFFFF", tabBarBorder: "#E5DDF8",
      headerBg: "#FFFFFF", cardBg: "#FFFFFF",
      inputBg: "#FAF8FF", inputBorder: "#E5DDF8",
      accent1: "#7C3AED", accent1Light: "#EDE9FE",
      accent2: "#EC4899", accent2Light: "#FCE7F3",
      accent3: "#0D9488", accent3Light: "#CCFBF1",
      avatarColors: ["#7C3AED","#EC4899","#0D9488","#EF4444","#8B5CF6","#5B21B6","#2DD4BF","#BE185D"],
    },
    dark: {
      ...sharedDark,
      text: "#EDE9FE", textSecondary: "#A78BFA", textTertiary: "#6D4FA8",
      background: "#0D0A1E", surface: "#1A1535", surfaceElevated: "#241E47",
      border: "#2D2558", switchOff: "#3D3270",
      primary: "#A78BFA", primaryDark: "#7C3AED", primaryLight: "#1E1037",
      teal: "#2DD4BF", tealLight: "#0D9488", tealTint: "#052521",
      accent: "#F472B6", accentDark: "#EC4899", accentTint: "#2A0D1A",
      tint: "#A78BFA", tabIconDefault: "#6D4FA8", tabIconSelected: "#A78BFA",
      shadow: "rgba(0,0,0,0.6)", overlay: "rgba(0,0,0,0.8)",
      tabBar: "#1A1535", tabBarBorder: "#2D2558",
      headerBg: "#1A1535", cardBg: "#1A1535",
      inputBg: "#0D0A1E", inputBorder: "#2D2558",
      accent1: "#A78BFA", accent1Light: "#1E1037",
      accent2: "#F472B6", accent2Light: "#2A0D1A",
      accent3: "#2DD4BF", accent3Light: "#052521",
      avatarColors: ["#A78BFA","#F472B6","#2DD4BF","#F87171","#C4B5FD","#7C3AED","#0D9488","#EC4899"],
    },
  },

  sunset: {
    light: {
      ...shared,
      text: "#2A1200", textSecondary: "#7A4520", textTertiary: "#C28055",
      background: "#FFF8F4", surface: "#FFFFFF", surfaceElevated: "#FFFFFF",
      border: "#FDDEC8", switchOff: "#F4B08A",
      primary: "#EA580C", primaryDark: "#C2410C", primaryLight: "#FFF7ED",
      teal: "#0D9488", tealLight: "#2DD4BF", tealTint: "#CCFBF1",
      accent: "#EAB308", accentDark: "#CA8A04", accentTint: "#FEF9C3",
      tint: "#EA580C", tabIconDefault: "#C28055", tabIconSelected: "#EA580C",
      shadow: "rgba(42,18,0,0.08)", overlay: "rgba(42,18,0,0.5)",
      tabBar: "#FFFFFF", tabBarBorder: "#FDDEC8",
      headerBg: "#FFFFFF", cardBg: "#FFFFFF",
      inputBg: "#FFF8F4", inputBorder: "#FDDEC8",
      accent1: "#EA580C", accent1Light: "#FFF7ED",
      accent2: "#EAB308", accent2Light: "#FEF9C3",
      accent3: "#0D9488", accent3Light: "#CCFBF1",
      avatarColors: ["#EA580C","#EAB308","#0D9488","#EF4444","#F97316","#C2410C","#2DD4BF","#CA8A04"],
    },
    dark: {
      ...sharedDark,
      text: "#FFEDD5", textSecondary: "#FDB895", textTertiary: "#9A6040",
      background: "#180900", surface: "#271205", surfaceElevated: "#341807",
      border: "#4A2010", switchOff: "#5C2A12",
      primary: "#FB923C", primaryDark: "#EA580C", primaryLight: "#1C0900",
      teal: "#2DD4BF", tealLight: "#0D9488", tealTint: "#042F2E",
      accent: "#FACC15", accentDark: "#EAB308", accentTint: "#1A1300",
      tint: "#FB923C", tabIconDefault: "#9A6040", tabIconSelected: "#FB923C",
      shadow: "rgba(0,0,0,0.6)", overlay: "rgba(0,0,0,0.8)",
      tabBar: "#271205", tabBarBorder: "#4A2010",
      headerBg: "#271205", cardBg: "#271205",
      inputBg: "#180900", inputBorder: "#4A2010",
      accent1: "#FB923C", accent1Light: "#1C0900",
      accent2: "#FACC15", accent2Light: "#1A1300",
      accent3: "#2DD4BF", accent3Light: "#042F2E",
      avatarColors: ["#FB923C","#FACC15","#2DD4BF","#F87171","#FD8A4A","#EA580C","#0D9488","#EAB308"],
    },
  },

  forest: {
    light: {
      ...shared,
      text: "#0A2016", textSecondary: "#3D6B50", textTertiary: "#7FAD8F",
      background: "#F0FDF8", surface: "#FFFFFF", surfaceElevated: "#FFFFFF",
      border: "#C6EED9", switchOff: "#86C9A4",
      primary: "#0D9488", primaryDark: "#0F766E", primaryLight: "#D1FAE5",
      teal: "#0891B2", tealLight: "#22D3EE", tealTint: "#CFFAFE",
      accent: "#CA8A04", accentDark: "#A16207", accentTint: "#FEF9C3",
      tint: "#0D9488", tabIconDefault: "#7FAD8F", tabIconSelected: "#0D9488",
      shadow: "rgba(10,32,22,0.08)", overlay: "rgba(10,32,22,0.5)",
      tabBar: "#FFFFFF", tabBarBorder: "#C6EED9",
      headerBg: "#FFFFFF", cardBg: "#FFFFFF",
      inputBg: "#F0FDF8", inputBorder: "#C6EED9",
      accent1: "#0D9488", accent1Light: "#D1FAE5",
      accent2: "#0891B2", accent2Light: "#CFFAFE",
      accent3: "#CA8A04", accent3Light: "#FEF9C3",
      avatarColors: ["#0D9488","#0891B2","#CA8A04","#EF4444","#0D9488","#0F766E","#22D3EE","#A16207"],
    },
    dark: {
      ...sharedDark,
      text: "#DCFCE7", textSecondary: "#6EE7A8", textTertiary: "#2D6845",
      background: "#071A10", surface: "#0E2C1C", surfaceElevated: "#153B26",
      border: "#1A4830", switchOff: "#235A3A",
      primary: "#2DD4BF", primaryDark: "#0D9488", primaryLight: "#022C22",
      teal: "#22D3EE", tealLight: "#0891B2", tealTint: "#083040",
      accent: "#FACC15", accentDark: "#EAB308", accentTint: "#1A1300",
      tint: "#2DD4BF", tabIconDefault: "#2D6845", tabIconSelected: "#2DD4BF",
      shadow: "rgba(0,0,0,0.6)", overlay: "rgba(0,0,0,0.8)",
      tabBar: "#0E2C1C", tabBarBorder: "#1A4830",
      headerBg: "#0E2C1C", cardBg: "#0E2C1C",
      inputBg: "#071A10", inputBorder: "#1A4830",
      accent1: "#2DD4BF", accent1Light: "#022C22",
      accent2: "#22D3EE", accent2Light: "#083040",
      accent3: "#FACC15", accent3Light: "#1A1300",
      avatarColors: ["#2DD4BF","#22D3EE","#FACC15","#F87171","#2DD4BF","#0D9488","#0891B2","#EAB308"],
    },
  },

  rose: {
    light: {
      ...shared,
      text: "#2D0B18", textSecondary: "#7E3A52", textTertiary: "#BF7A93",
      background: "#FFF5F7", surface: "#FFFFFF", surfaceElevated: "#FFFFFF",
      border: "#FCCDD8", switchOff: "#F4A0B5",
      primary: "#E11D48", primaryDark: "#BE123C", primaryLight: "#FFE4EA",
      teal: "#7C3AED", tealLight: "#A78BFA", tealTint: "#EDE9FE",
      accent: "#EA580C", accentDark: "#C2410C", accentTint: "#FFF7ED",
      tint: "#E11D48", tabIconDefault: "#BF7A93", tabIconSelected: "#E11D48",
      shadow: "rgba(45,11,24,0.08)", overlay: "rgba(45,11,24,0.5)",
      tabBar: "#FFFFFF", tabBarBorder: "#FCCDD8",
      headerBg: "#FFFFFF", cardBg: "#FFFFFF",
      inputBg: "#FFF5F7", inputBorder: "#FCCDD8",
      accent1: "#E11D48", accent1Light: "#FFE4EA",
      accent2: "#7C3AED", accent2Light: "#EDE9FE",
      accent3: "#EA580C", accent3Light: "#FFF7ED",
      avatarColors: ["#E11D48","#7C3AED","#EA580C","#EF4444","#FB7185","#BE123C","#A78BFA","#C2410C"],
    },
    dark: {
      ...sharedDark,
      text: "#FFE4EE", textSecondary: "#FDA4BE", textTertiary: "#8B3055",
      background: "#1A0510", surface: "#2D0C1E", surfaceElevated: "#3D1028",
      border: "#541530", switchOff: "#6B1A3C",
      primary: "#FB7185", primaryDark: "#E11D48", primaryLight: "#1F0010",
      teal: "#A78BFA", tealLight: "#7C3AED", tealTint: "#1E1037",
      accent: "#FB923C", accentDark: "#EA580C", accentTint: "#1C0900",
      tint: "#FB7185", tabIconDefault: "#8B3055", tabIconSelected: "#FB7185",
      shadow: "rgba(0,0,0,0.6)", overlay: "rgba(0,0,0,0.8)",
      tabBar: "#2D0C1E", tabBarBorder: "#541530",
      headerBg: "#2D0C1E", cardBg: "#2D0C1E",
      inputBg: "#1A0510", inputBorder: "#541530",
      accent1: "#FB7185", accent1Light: "#1F0010",
      accent2: "#A78BFA", accent2Light: "#1E1037",
      accent3: "#FB923C", accent3Light: "#1C0900",
      avatarColors: ["#FB7185","#A78BFA","#FB923C","#F87171","#FDA4BE","#E11D48","#7C3AED","#EA580C"],
    },
  },
};
