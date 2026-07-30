import React from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useApp } from "@/context/AppContext";
import { useTheme } from "@/hooks/useTheme";

/**
 * Slim persistent banner shown when the last mutation couldn't reach the
 * server (network failure). It stays visible until the user retries
 * successfully or dismisses it — unlike a toast, which fades after a few
 * seconds.
 */
export function SyncStatusBanner() {
  const { syncStatus, clearSyncError, retrySync } = useApp();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  if (syncStatus !== "error") return null;

  return (
    <View
      style={[
        styles.banner,
        {
          backgroundColor: "#7C3F00",
          paddingTop: insets.top > 0 ? insets.top + 4 : 8,
        },
      ]}
    >
      <Feather name="wifi-off" size={13} color="#FDE68A" style={styles.icon} />
      <Text style={styles.message} numberOfLines={1}>
        Last change wasn't saved — check your connection
      </Text>
      <Pressable
        onPress={retrySync}
        hitSlop={8}
        style={({ pressed }) => [styles.retryBtn, pressed && { opacity: 0.7 }]}
      >
        <Text style={styles.retryText}>Retry</Text>
      </Pressable>
      <Pressable
        onPress={clearSyncError}
        hitSlop={8}
        style={({ pressed }) => [styles.closeBtn, pressed && { opacity: 0.7 }]}
      >
        <Feather name="x" size={14} color="#FDE68A" />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingBottom: 8,
    zIndex: 999,
  },
  icon: {
    marginRight: 6,
    flexShrink: 0,
  },
  message: {
    flex: 1,
    fontSize: 12,
    color: "#FDE68A",
    fontWeight: "500",
  },
  retryBtn: {
    marginLeft: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
    backgroundColor: "rgba(253,230,138,0.2)",
    flexShrink: 0,
  },
  retryText: {
    fontSize: 12,
    color: "#FDE68A",
    fontWeight: "600",
  },
  closeBtn: {
    marginLeft: 6,
    flexShrink: 0,
  },
});
