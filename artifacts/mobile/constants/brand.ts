export const PRODUCT_NAME = "Split Mate";
export const PRODUCT_TAGLINE = "Split the bill, keep the friendship";
export const SUPPORT_EMAIL = "support@infosplitmate.com";

/** Operator details shown in the legal documents. */
export const OPERATOR_DESCRIPTION = "an individual developer based in the United Arab Emirates";
export const LEGAL_LAST_UPDATED = "November 17, 2026";

export const BRAND_COLORS = {
  teal: "#0E8A8F",
  tealDeep: "#04404A",
  amber: "#F5A524",
  seaGlass: "#7DE3D6",
  indigo: "#5446F0",
  indigoDeep: "#2E22B8",
  violet: "#8B5CF6",
  mint: "#0FB57E",
  mintBright: "#5CF2BF",
  cyan: "#22D3EE",
  pink: "#F472B6",
  // Legacy names still used by older components (orbs on the launch screens).
  silver: "#F5A524",
  silverBright: "#7DE3D6",
  graphite: "#04404A",
  midnight: "#022A31",
} as const;

/** Background of the launch and sign-in screens. */
export const BRAND_GRADIENT = ["#04404A", "#0E7C86", "#18B6A4"] as const;

export const SPLIT_MARK_COLORS = {
  primary: BRAND_COLORS.teal,
  secondary: BRAND_COLORS.amber,
  seam: "#FFFFFF",
  outline: BRAND_COLORS.teal,
  tile: "#FFFFFF",
} as const;

/** Plus, Trip Pass and invite rewards stay hidden until App Store / Google Play purchases are switched on. */
export const PURCHASES_LIVE = false;
