import { Feather } from "@expo/vector-icons";
import React from "react";
import { StyleSheet, View } from "react-native";
import { ExpenseCategory } from "@/context/AppContext";

const CATEGORY_CONFIG: Record<ExpenseCategory, { icon: string; color: string; bg: string }> = {
  food: { icon: "coffee", color: "#F97316", bg: "#FFF3E8" },
  transport: { icon: "navigation", color: "#3B82F6", bg: "#EBF3FF" },
  accommodation: { icon: "home", color: "#8B5CF6", bg: "#F3F0FF" },
  entertainment: { icon: "film", color: "#EC4899", bg: "#FFF0F6" },
  utilities: { icon: "zap", color: "#F59E0B", bg: "#FFFBEB" },
  shopping: { icon: "shopping-bag", color: "#10B981", bg: "#EDFAF3" },
  health: { icon: "heart", color: "#EF4444", bg: "#FFF0F0" },
  other: { icon: "more-horizontal", color: "#6B7280", bg: "#F3F4F6" },
};

interface CategoryIconProps {
  category: ExpenseCategory;
  size?: number;
}

export function CategoryIcon({ category, size = 36 }: CategoryIconProps) {
  const config = CATEGORY_CONFIG[category] ?? CATEGORY_CONFIG.other;
  return (
    <View
      style={[
        styles.container,
        { width: size, height: size, borderRadius: size / 4, backgroundColor: config.bg },
      ]}
    >
      <Feather name={config.icon as any} size={size * 0.5} color={config.color} />
    </View>
  );
}

export function getCategoryConfig(category: ExpenseCategory) {
  return CATEGORY_CONFIG[category] ?? CATEGORY_CONFIG.other;
}

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    justifyContent: "center",
  },
});
