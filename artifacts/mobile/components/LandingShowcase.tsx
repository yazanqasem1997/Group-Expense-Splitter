import React, { useEffect, useRef } from "react";
import { AccessibilityInfo, Animated, Easing, Platform, StyleSheet, Text, View } from "react-native";

const nativeDriver = Platform.OS !== "web";

const CARDS = [
  { emoji: "🍕", title: "Friday pizza", detail: "Split 4 ways", amount: "AED 186.00", tag: "You're owed 139.50", tone: "#B7F0E8", tilt: "-4deg", offset: -18 },
  { emoji: "✈️", title: "Bali trip", detail: "6 people · 3 currencies", amount: "USD 2,340", tag: "All settled", tone: "#FDE7B0", tilt: "3deg", offset: 22 },
  { emoji: "🏠", title: "Rent & bills", detail: "Every month", amount: "AED 4,200", tag: "Auto-split", tone: "#FDE68A", tilt: "-2deg", offset: -8 },
];

/**
 * Floating "glass" expense cards on the sign-in screen: a quick picture of
 * what the app does before anyone signs up. Decorative; hidden from screen readers.
 */
export function LandingShowcase({ count = CARDS.length, delay = 0 }: { count?: number; delay?: number } = {}) {
  const floats = useRef(CARDS.map(() => new Animated.Value(0))).current;
  const enter = useRef(CARDS.map(() => new Animated.Value(0))).current;

  useEffect(() => {
    let loops: Animated.CompositeAnimation[] = [];
    let cancelled = false;
    AccessibilityInfo.isReduceMotionEnabled?.()
      .catch(() => false)
      .then(reduce => {
        if (cancelled) return;
        Animated.sequence([Animated.delay(delay), Animated.stagger(
          140,
          enter.map(v => Animated.spring(v, { toValue: 1, tension: 60, friction: 9, useNativeDriver: nativeDriver })),
        )]).start();
        if (reduce) return;
        loops = floats.map((v, i) =>
          Animated.loop(
            Animated.sequence([
              Animated.timing(v, { toValue: 1, duration: 2600 + i * 500, easing: Easing.inOut(Easing.sin), useNativeDriver: nativeDriver }),
              Animated.timing(v, { toValue: 0, duration: 2600 + i * 500, easing: Easing.inOut(Easing.sin), useNativeDriver: nativeDriver }),
            ]),
          ),
        );
        loops.forEach(l => l.start());
      });
    return () => {
      cancelled = true;
      loops.forEach(l => l.stop());
    };
  }, [floats, enter]);

  return (
    <View style={styles.wrap} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" pointerEvents="none">
      {CARDS.slice(0, count).map((card, i) => {
        const translateY = Animated.add(
          floats[i].interpolate({ inputRange: [0, 1], outputRange: [0, -8] }),
          enter[i].interpolate({ inputRange: [0, 1], outputRange: [40, 0] }),
        );
        return (
          <Animated.View
            key={card.title}
            style={[
              styles.card,
              {
                opacity: enter[i],
                transform: [{ translateX: card.offset }, { translateY }, { rotate: card.tilt }],
                zIndex: CARDS.length - i,
              },
            ]}
          >
            <View style={styles.emojiBubble}>
              <Text style={styles.emoji}>{card.emoji}</Text>
            </View>
            <View style={styles.cardBody}>
              <Text style={styles.cardTitle} numberOfLines={1}>{card.title}</Text>
              <Text style={styles.cardDetail} numberOfLines={1}>{card.detail}</Text>
            </View>
            <View style={styles.cardRight}>
              <Text style={styles.cardAmount}>{card.amount}</Text>
              <View style={[styles.tag, { backgroundColor: card.tone }]}>
                <Text style={styles.tagText}>{card.tag}</Text>
              </View>
            </View>
          </Animated.View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { width: "100%", maxWidth: 380, alignSelf: "center", gap: 10, marginTop: 8, marginBottom: 4, paddingHorizontal: 8 },
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.14)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.28)",
    shadowColor: "#120B5C",
    shadowOpacity: 0.25,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
  },
  emojiBubble: {
    width: 40,
    height: 40,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.92)",
  },
  emoji: { fontSize: 20 },
  cardBody: { flex: 1, minWidth: 0 },
  cardTitle: { color: "#FFFFFF", fontSize: 15, fontFamily: "Inter_600SemiBold" },
  cardDetail: { color: "rgba(255,255,255,0.72)", fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
  cardRight: { alignItems: "flex-end", gap: 5 },
  cardAmount: { color: "#FFFFFF", fontSize: 14, fontFamily: "Inter_700Bold" },
  tag: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 },
  tagText: { color: "#04404A", fontSize: 10.5, fontFamily: "Inter_600SemiBold" },
});
