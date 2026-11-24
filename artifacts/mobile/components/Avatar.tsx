import React, { useEffect, useState } from "react";
import { Image, StyleSheet, Text, View } from "react-native";

interface AvatarProps {
  name: string;
  color: string;
  size?: number;
  fontSize?: number;
  style?: object;
  imageUri?: string;
}

export function Avatar({ name, color, size = 40, fontSize, style, imageUri }: AvatarProps) {
  const [imageFailed, setImageFailed] = useState(false);
  useEffect(() => setImageFailed(false), [imageUri]);
  const initials = name
    .split(" ")
    .map(n => n[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  const computedFontSize = fontSize ?? Math.max(size * 0.36, 10);

  const resolvedImageUri = imageUri?.startsWith("/api/")
    ? `https://${process.env.EXPO_PUBLIC_DOMAIN}${imageUri}`
    : imageUri;

  if (resolvedImageUri && !imageFailed) {
    return (
      <View
        style={[
          styles.container,
          { width: size, height: size, borderRadius: size / 2, backgroundColor: color },
          style,
        ]}
      >
        <Image
          source={{ uri: resolvedImageUri }}
          style={{ width: size, height: size, borderRadius: size / 2 }}
          resizeMode="cover"
          onError={() => setImageFailed(true)}
        />
      </View>
    );
  }

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
    overflow: "hidden",
  },
  text: {
    color: "#FFFFFF",
    fontFamily: "Inter_600SemiBold",
    includeFontPadding: false,
  },
});
