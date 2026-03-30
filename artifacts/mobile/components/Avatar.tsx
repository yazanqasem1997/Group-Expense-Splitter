import React from "react";
import { StyleSheet, Text, View } from "react-native";

interface AvatarProps {
  name: string;
  color: string;
  size?: number;
  fontSize?: number;
  style?: object;
}

export function Avatar({ name, color, size = 40, fontSize, style }: AvatarProps) {
  const initials = name
    .split(" ")
    .map(n => n[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  const computedFontSize = fontSize ?? Math.max(size * 0.36, 10);

  return (
    <View
      style={[
        styles.container,
        { width: size, height: size, borderRadius: size / 2, backgroundColor: color },
        style,
      ]}
    >
      <Text style={[styles.text, { fontSize: computedFontSize }]}>{initials}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    justifyContent: "center",
  },
  text: {
    color: "#FFFFFF",
    fontFamily: "Inter_600SemiBold",
    includeFontPadding: false,
  },
});
