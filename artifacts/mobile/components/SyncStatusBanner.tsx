import React from "react";
import { Animated, Easing, Pressable, StyleSheet, Text, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useApp } from "@/context/AppContext";

/**
 * Persistent slim banner shown when the device is offline or the last
 * mutation couldn't reach the server.
 *
 * • Offline  → amber bar, "will sync automatically" messaging, no dismiss
 * • Sync-err → dark amber bar, retry + dismiss buttons
 *
 * Auto-resolves: the AppContext's periodic retry clears `isOffline` and
 * `syncStatus` as soon as the server responds successfully.
 */
export function SyncStatusBanner() {
  const { syncStatus, isOffline, clearSyncError, retrySync } = useApp();
  const insets = useSafeAreaInsets();

  const visible = isOffline || syncStatus === "error";
  if (!visible) return null;

  const topPad = insets.top > 0 ? insets.top + 2 : 8;

  if (isOffline) {
    return (
      <View style={[styles.banner, styles.offlineBanner, { paddingTop: topPad }]}>
        <Feather name="wifi-off" size={13} color="#FDE68A" style={styles.icon} />
        <Text style={styles.message} numberOfLines={1}>
          You're offline — changes won't save until you reconnect
        </Text>
        <View style={styles.autoChip}>
          <Feather name="refresh-cw" size={10} color="#FDE68A" />
          <Text style={styles.autoText}>Auto</Text>
        </View>
      </View>
    );
  }

  // syncStatus === 'error' but we're not fully offline (server returned an error)
  return (
    <View style={[styles.banner, styles.errorBanner, { paddingTop: topPad }]}>
      <Feather name="alert-circle" size={13} color="#FDE68A" style={styles.icon} />
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
    paddingHorizontal: 14,
    paddingBottom: 8,
    zIndex: 999,
  },
  offlineBanner: {
    backgroundColor: "#92400E",
  },
  errorBanner: {
    backgroundColor: "#7C3F00",
  },
  icon: {
    marginRight: 7,
    flexShrink: 0,
  },
  message: {
    flex: 1,
    fontSize: 12,
    color: "#FDE68A",
    fontWeight: "500",
  },
  autoChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 10,
    backgroundColor: "rgba(253,230,138,0.18)",
    marginLeft: 8,
    flexShrink: 0,
  },
  autoText: {
    fontSize: 11,
    color: "#FDE68A",
    fontWeight: "600",
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
