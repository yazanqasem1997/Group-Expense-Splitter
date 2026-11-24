import { Feather, Ionicons } from "@expo/vector-icons";
import React from "react";
import { StyleSheet, View } from "react-native";
import { ReceiptSvgIcon } from "./ReceiptSvgIcon";
import { resolveIconKey } from "@/utils/expenseIcons";

export type CategoryConfig = {
  icon: string;
  color: string;
  bg: string;
  iconFamily?: "feather" | "ionicons";
};

export const BUILTIN_CATEGORY_CONFIG: Record<string, CategoryConfig> = {
  // ── Main categories ──────────────────────────────────────────────────────
  food:          { icon: "restaurant-outline", color: "#E07228", bg: "#FFF3E8", iconFamily: "ionicons" },
  transport:     { icon: "navigation",    color: "#3070CC", bg: "#EBF3FF" },
  accommodation: { icon: "home",          color: "#7040D0", bg: "#F3F0FF" },
  entertainment: { icon: "film",          color: "#C43888", bg: "#FFF0F6" },
  utilities:     { icon: "zap",           color: "#C88800", bg: "#FFFBEB" },
  shopping:      { icon: "shopping-bag",  color: "#0A9460", bg: "#EDFAF3" },
  health:        { icon: "heart",         color: "#CC3030", bg: "#FFF0F0" },
  other:         { icon: "receipt",       color: "#5A6070", bg: "#F3F4F6" },

  // ── Transport sub-categories (auto-detected, share transport colors) ──────
  flight:        { icon: "airplane-outline",  color: "#3070CC", bg: "#EBF3FF", iconFamily: "ionicons" },
  car:           { icon: "car-outline",       color: "#3070CC", bg: "#EBF3FF", iconFamily: "ionicons" },
  train:         { icon: "train-outline",     color: "#3070CC", bg: "#EBF3FF", iconFamily: "ionicons" },
  bus:           { icon: "bus-outline",       color: "#3070CC", bg: "#EBF3FF", iconFamily: "ionicons" },
  bicycle:       { icon: "bicycle-outline",   color: "#3070CC", bg: "#EBF3FF", iconFamily: "ionicons" },
  ferry:         { icon: "boat-outline",      color: "#3070CC", bg: "#EBF3FF", iconFamily: "ionicons" },
  taxi:          { icon: "car-sport-outline", color: "#3070CC", bg: "#EBF3FF", iconFamily: "ionicons" },
  fuel:          { icon: "flame-outline",     color: "#3070CC", bg: "#EBF3FF", iconFamily: "ionicons" },
  parking:       { icon: "pin-outline",       color: "#3070CC", bg: "#EBF3FF", iconFamily: "ionicons" },

  // ── Food & Beverage sub-categories (share food colors) ────────────────────
  water:         { icon: "water-outline",     color: "#E07228", bg: "#FFF3E8", iconFamily: "ionicons" },
  coffee:        { icon: "coffee",            color: "#E07228", bg: "#FFF3E8" },
  "soft-drink":  { icon: "cafe-outline",      color: "#E07228", bg: "#FFF3E8", iconFamily: "ionicons" },
  alcohol:       { icon: "wine-outline",      color: "#E07228", bg: "#FFF3E8", iconFamily: "ionicons" },
  groceries:     { icon: "basket-outline",    color: "#E07228", bg: "#FFF3E8", iconFamily: "ionicons" },
  dessert:       { icon: "ice-cream-outline", color: "#E07228", bg: "#FFF3E8", iconFamily: "ionicons" },

  // ── Accommodation sub-categories (share accommodation colors) ─────────────
  "home-stay":   { icon: "bed-outline",       color: "#7040D0", bg: "#F3F0FF", iconFamily: "ionicons" },

  // ── Entertainment sub-categories (share entertainment colors) ─────────────
  cinema:        { icon: "film-outline",           color: "#C43888", bg: "#FFF0F6", iconFamily: "ionicons" },
  museum:        { icon: "map",                    color: "#C43888", bg: "#FFF0F6" },
  music:         { icon: "musical-notes-outline",  color: "#C43888", bg: "#FFF0F6", iconFamily: "ionicons" },
  sports:        { icon: "barbell-outline",        color: "#C43888", bg: "#FFF0F6", iconFamily: "ionicons" },
  nightlife:     { icon: "beer-outline",           color: "#C43888", bg: "#FFF0F6", iconFamily: "ionicons" },
  tour:          { icon: "map",                    color: "#C43888", bg: "#FFF0F6" },
  ticket:        { icon: "ticket-outline",         color: "#C43888", bg: "#FFF0F6", iconFamily: "ionicons" },

  // ── Shopping sub-categories (share shopping colors) ────────────────────────
  clothing:      { icon: "shirt-outline",           color: "#0A9460", bg: "#EDFAF3", iconFamily: "ionicons" },
  electronics:   { icon: "phone-portrait-outline",  color: "#0A9460", bg: "#EDFAF3", iconFamily: "ionicons" },
  gift:          { icon: "gift",                    color: "#0A9460", bg: "#EDFAF3" },

  // ── Health sub-categories (share health colors) ────────────────────────────
  pharmacy:        { icon: "medkit-outline",  color: "#CC3030", bg: "#FFF0F0", iconFamily: "ionicons" },
  medical:         { icon: "medkit-outline",  color: "#CC3030", bg: "#FFF0F0", iconFamily: "ionicons" },
  salon:           { icon: "cut-outline",     color: "#CC3030", bg: "#FFF0F0", iconFamily: "ionicons" },
  spa:             { icon: "sparkles-outline", color: "#CC3030", bg: "#FFF0F0", iconFamily: "ionicons" },
  laundry:         { icon: "shirt-outline",   color: "#CC3030", bg: "#FFF0F0", iconFamily: "ionicons" },
  "personal-care": { icon: "sparkles-outline", color: "#CC3030", bg: "#FFF0F0", iconFamily: "ionicons" },

  // ── Utilities sub-categories (share utilities colors) ──────────────────────
  internet:        { icon: "wifi-outline",  color: "#C88800", bg: "#FFFBEB", iconFamily: "ionicons" },
  phone:           { icon: "call-outline",  color: "#C88800", bg: "#FFFBEB", iconFamily: "ionicons" },
  gas:             { icon: "flame-outline", color: "#C88800", bg: "#FFFBEB", iconFamily: "ionicons" },
};

interface CategoryIconProps {
  category: string;
  /** Free-text expense/item description, used to pick a more specific icon (e.g. "water" instead of the generic Bills icon). */
  description?: string;
  size?: number;
  /** Override tile border-radius. Defaults to size/4 (squircle). Pass 4 for nearly-square. */
  borderRadius?: number;
}

export function CategoryIcon({ category, description, size = 36, borderRadius }: CategoryIconProps) {
  const iconKey = resolveIconKey(category, description);
  const config = BUILTIN_CATEGORY_CONFIG[iconKey] ?? BUILTIN_CATEGORY_CONFIG[category] ?? BUILTIN_CATEGORY_CONFIG.other;
  // "other" (including legacy records saved with category="other") and
  // unknown categories use the custom SVG receipt icon. Feather does not
  // provide a "receipt" glyph, so sending the built-in config through Feather
  // produces a warning on every row and can crash some native icon builds.
  const isReceipt = iconKey === "other";
  return (
    <View
      style={[
        styles.container,
        {
          width: size,
          height: size,
          borderRadius: borderRadius ?? size / 4,
          backgroundColor: "transparent",
          borderWidth: 1,
          borderColor: config.color + "55",
        },
      ]}
    >
      {isReceipt ? (
        <ReceiptSvgIcon size={size * 0.56} color={config.color} />
      ) : config.iconFamily === "ionicons" ? (
        <Ionicons name={config.icon as any} size={size * 0.52} color={config.color} />
      ) : (
        <Feather name={config.icon as any} size={size * 0.48} color={config.color} />
      )}
    </View>
  );
}

export function getCategoryConfig(category: string): CategoryConfig {
  return BUILTIN_CATEGORY_CONFIG[category] ?? BUILTIN_CATEGORY_CONFIG.other;
}

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    justifyContent: "center",
  },
});
