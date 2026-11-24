import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Haptics from "expo-haptics";
import React, { useEffect, useRef, useState } from "react";
import { Animated, Dimensions, Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "@/hooks/useTheme";

/**
 * First-run coach marks: a light dim with one small bubble at a time that
 * points at the real control. Shown once, skippable, never blocks the app.
 */
const KEY = "introSeen:v2";

type Step = { title: string; body: string; target: "fab" | "tab0" | "tab2" };
const STEPS: Step[] = [
  { title: "Start here", body: "Tap + to create a group, then add your first expense.", target: "fab" },
  { title: "Your friends", body: "Add friends by contacts, email or QR code.", target: "tab2" },
  { title: "Activity", body: "Everything that changes shows up here.", target: "tab0" },
];

export function IntroGuide() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [visible, setVisible] = useState(false);
  const [i, setI] = useState(0);
  const fade = useRef(new Animated.Value(0)).current;
  const bob = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    AsyncStorage.getItem(KEY).then(v => { if (!v) setTimeout(() => setVisible(true), 900); }).catch(() => {});
  }, []);

  useEffect(() => {
    if (!visible) return;
    fade.setValue(0);
    Animated.timing(fade, { toValue: 1, duration: 220, useNativeDriver: true }).start();
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(bob, { toValue: 1, duration: 600, useNativeDriver: true }),
      Animated.timing(bob, { toValue: 0, duration: 600, useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [visible, i, fade, bob]);

  function close() {
    setVisible(false);
    AsyncStorage.setItem(KEY, "1").catch(() => {});
  }
  function next() {
    Haptics.selectionAsync().catch(() => {});
    if (i >= STEPS.length - 1) close(); else setI(i + 1);
  }

  if (!visible) return null;
  const step = STEPS[i];
  const { width } = Dimensions.get("window");
  const tabBarTop = insets.bottom + 78;
  const pos =
    step.target === "fab"
      ? { bottom: tabBarTop + 92, right: 20, arrowRight: 28 }
      : step.target === "tab2"
      ? { bottom: tabBarTop + 6, right: 20, arrowRight: width / 6 - 28 }
      : { bottom: tabBarTop + 6, left: 20, arrowLeft: width / 6 - 28 };
  const translateY = bob.interpolate({ inputRange: [0, 1], outputRange: [0, -5] });

  return (
    <Modal visible transparent animationType="none" onRequestClose={close}>
      <Pressable style={[StyleSheet.absoluteFill, { backgroundColor: "rgba(8,20,24,0.45)" }]} onPress={next} accessibilityLabel="Next tip" />
      <Animated.View
        pointerEvents="box-none"
        style={[s.bubbleWrap, { bottom: pos.bottom, left: (pos as any).left, right: (pos as any).right, opacity: fade, transform: [{ translateY }] }]}
      >
        <View style={[s.bubble, { backgroundColor: colors.surface }]}>
          <Text style={[s.title, { color: colors.text }]}>{step.title}</Text>
          <Text style={[s.body, { color: colors.textSecondary }]}>{step.body}</Text>
          <View style={s.row}>
            <Pressable onPress={close} hitSlop={10} accessibilityRole="button">
              <Text style={[s.skip, { color: colors.textTertiary }]}>Skip</Text>
            </Pressable>
            <Text style={[s.count, { color: colors.textTertiary }]}>{i + 1} of {STEPS.length}</Text>
            <Pressable onPress={next} style={[s.btn, { backgroundColor: colors.primary }]} accessibilityRole="button">
              <Text style={s.btnText}>{i >= STEPS.length - 1 ? "Got it" : "Next"}</Text>
            </Pressable>
          </View>
        </View>
        <View style={[s.arrow, { backgroundColor: colors.surface, left: (pos as any).arrowLeft, right: (pos as any).arrowRight }]} />
      </Animated.View>
    </Modal>
  );
}

const s = StyleSheet.create({
  bubbleWrap: { position: "absolute", maxWidth: 300 },
  bubble: { borderRadius: 16, padding: 16, gap: 6, shadowColor: "#000", shadowOpacity: 0.18, shadowRadius: 16, shadowOffset: { width: 0, height: 6 }, elevation: 6 },
  title: { fontSize: 16, fontFamily: "Inter_700Bold" },
  body: { fontSize: 14, lineHeight: 20, fontFamily: "Inter_400Regular" },
  row: { flexDirection: "row", alignItems: "center", marginTop: 8, gap: 12 },
  skip: { fontSize: 14, fontFamily: "Inter_500Medium" },
  count: { flex: 1, textAlign: "center", fontSize: 12, fontFamily: "Inter_400Regular" },
  btn: { paddingHorizontal: 16, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center" },
  btnText: { color: "#fff", fontSize: 14, fontFamily: "Inter_600SemiBold" },
  arrow: { position: "absolute", bottom: -7, width: 16, height: 16, transform: [{ rotate: "45deg" }] },
});
