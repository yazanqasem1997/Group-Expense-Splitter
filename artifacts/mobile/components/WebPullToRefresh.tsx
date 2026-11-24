import { useFocusEffect } from "expo-router";
import React, { useCallback, useRef, useState } from "react";
import { ActivityIndicator, Platform, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const TRIGGER = 70;
const MAX = 110;

/** True when nothing under the finger is scrolled away from its top. */
function atTop(target: EventTarget | null): boolean {
  let el = target as HTMLElement | null;
  while (el && el !== document.body) {
    if (el.scrollTop > 0) return false;
    el = el.parentElement;
  }
  return true;
}

/**
 * Pull-to-refresh for the browser build. React Native's RefreshControl does
 * nothing on the web, so this watches a downward drag that starts while the
 * list is at its top, shows a spinner that follows the finger, and calls
 * onRefresh once the pull passes the trigger point. Renders nothing on iOS/Android.
 */
export function WebPullToRefresh({ onRefresh, refreshing }: { onRefresh: () => unknown; refreshing: boolean }) {
  const insets = useSafeAreaInsets();
  const [pull, setPull] = useState(0);
  const start = useRef<number | null>(null);
  const pullRef = useRef(0);
  const refreshRef = useRef(onRefresh);
  refreshRef.current = onRefresh;

  useFocusEffect(
    useCallback(() => {
      if (Platform.OS !== "web") return;
      const down = (e: TouchEvent) => {
        start.current = e.touches.length === 1 && atTop(e.target) ? e.touches[0].clientY : null;
      };
      const move = (e: TouchEvent) => {
        if (start.current == null) return;
        const dy = e.touches[0].clientY - start.current;
        if (dy <= 0) { start.current = null; pullRef.current = 0; setPull(0); return; }
        const d = Math.min(MAX, dy * 0.5);
        pullRef.current = d;
        setPull(d);
      };
      const up = () => {
        if (start.current != null && pullRef.current >= TRIGGER * 0.5 + 20) void refreshRef.current();
        start.current = null;
        pullRef.current = 0;
        setPull(0);
      };
      window.addEventListener("touchstart", down, { passive: true });
      window.addEventListener("touchmove", move, { passive: true });
      window.addEventListener("touchend", up);
      window.addEventListener("touchcancel", up);
      return () => {
        window.removeEventListener("touchstart", down);
        window.removeEventListener("touchmove", move);
        window.removeEventListener("touchend", up);
        window.removeEventListener("touchcancel", up);
      };
    }, []),
  );

  if (Platform.OS !== "web") return null;
  const show = refreshing || pull > 8;
  if (!show) return null;
  const offset = refreshing ? 40 : pull * 0.6;
  return (
    <View pointerEvents="none" style={[styles.wrap, { top: insets.top + 4 + offset, opacity: refreshing ? 1 : Math.min(1, pull / 55) }]}>
      <View style={styles.bubble}>
        <ActivityIndicator size="small" color="#04404A" animating={refreshing || pull >= TRIGGER * 0.5 + 20} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: "absolute", left: 0, right: 0, alignItems: "center", zIndex: 100 },
  bubble: { width: 36, height: 36, borderRadius: 18, backgroundColor: "#FFFFFF", alignItems: "center", justifyContent: "center", shadowColor: "#000", shadowOpacity: 0.18, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 4 },
});
