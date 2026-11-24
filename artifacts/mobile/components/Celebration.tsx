import { Feather } from "@expo/vector-icons";
import React, { useEffect, useMemo, useRef } from "react";
import {
  AccessibilityInfo,
  Animated,
  Easing,
  Platform,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { useTheme } from "@/hooks/useTheme";

const PIECES = 28;
const PALETTE = ["#14b8a6", "#0D9488", "#f59e0b", "#3b82f6", "#ec4899", "#a855f7"];
const nativeDriver = Platform.OS !== "web";

type Props = {
  visible: boolean;
  onDone: () => void;
  title?: string;
  subtitle?: string;
};

/**
 * A short confetti burst plus a "settled up" badge. Purely decorative:
 * it never blocks touches and removes itself after ~1.8s.
 */
export function Celebration({ visible, onDone, title = "All settled up", subtitle = "Every balance in this group is now zero." }: Props) {
  const { colors } = useTheme();
  const { width, height } = useWindowDimensions();
  const progress = useRef(new Animated.Value(0)).current;
  const badge = useRef(new Animated.Value(0)).current;

  const pieces = useMemo(
    () =>
      Array.from({ length: PIECES }, (_, i) => {
        const angle = (Math.PI * 2 * i) / PIECES + Math.random() * 0.4;
        const spread = 90 + Math.random() * Math.min(width, 420) * 0.45;
        return {
          dx: Math.cos(angle) * spread,
          rise: -(60 + Math.random() * 140),
          fall: height * (0.35 + Math.random() * 0.25),
          spin: (Math.random() > 0.5 ? 1 : -1) * (360 + Math.random() * 540),
          size: 6 + Math.random() * 6,
          round: Math.random() > 0.6,
          color: PALETTE[i % PALETTE.length],
        };
      }),
    // New random layout each time the burst is shown.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [visible, width, height],
  );

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    progress.setValue(0);
    badge.setValue(0);
    AccessibilityInfo.isReduceMotionEnabled?.()
      .catch(() => false)
      .then(reduce => {
        if (cancelled) return;
        AccessibilityInfo.announceForAccessibility?.(title);
        Animated.parallel([
          Animated.timing(progress, {
            toValue: reduce ? 0 : 1,
            duration: reduce ? 0 : 1500,
            easing: Easing.out(Easing.quad),
            useNativeDriver: nativeDriver,
          }),
          Animated.sequence([
            Animated.spring(badge, { toValue: 1, friction: 6, tension: 120, useNativeDriver: nativeDriver }),
            Animated.delay(900),
            Animated.timing(badge, { toValue: 0, duration: 260, useNativeDriver: nativeDriver }),
          ]),
        ]).start(() => { if (!cancelled) onDone(); });
      });
    return () => { cancelled = true; };
  }, [visible, progress, badge, onDone, title]);

  if (!visible) return null;

  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.root]}>
      {pieces.map((p, i) => {
        const translateX = progress.interpolate({ inputRange: [0, 1], outputRange: [0, p.dx] });
        const translateY = progress.interpolate({ inputRange: [0, 0.3, 1], outputRange: [0, p.rise, p.fall] });
        const rotate = progress.interpolate({ inputRange: [0, 1], outputRange: ["0deg", `${p.spin}deg`] });
        const opacity = progress.interpolate({ inputRange: [0, 0.05, 0.75, 1], outputRange: [0, 1, 1, 0] });
        return (
          <Animated.View
            key={i}
            style={[
              styles.piece,
              {
                width: p.size,
                height: p.round ? p.size : p.size * 1.8,
                borderRadius: p.round ? p.size / 2 : 2,
                backgroundColor: p.color,
                opacity,
                transform: [{ translateX }, { translateY }, { rotate }],
              },
            ]}
          />
        );
      })}
      <Animated.View
        style={[
          styles.badge,
          {
            backgroundColor: colors.surface ?? colors.cardBg,
            borderColor: colors.border,
            shadowColor: colors.shadow ?? "#000",
            opacity: badge,
            transform: [{ scale: badge.interpolate({ inputRange: [0, 1], outputRange: [0.8, 1] }) }],
          },
        ]}
      >
        <View style={[styles.badgeIcon, { backgroundColor: colors.tealTint ?? colors.successLight }]}>
          <Feather name="check" size={22} color={colors.teal ?? colors.success} />
        </View>
        <Text style={[styles.badgeTitle, { color: colors.text }]}>{title}</Text>
        <Text style={[styles.badgeSub, { color: colors.textSecondary }]}>{subtitle}</Text>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { alignItems: "center", justifyContent: "center", zIndex: 1000, elevation: 1000 },
  piece: { position: "absolute", top: "42%", left: "50%" },
  badge: {
    alignItems: "center",
    paddingHorizontal: 24,
    paddingVertical: 18,
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    shadowOpacity: 0.18,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    maxWidth: 300,
  },
  badgeIcon: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center", marginBottom: 10 },
  badgeTitle: { fontSize: 18, fontFamily: "Inter_700Bold", textAlign: "center" },
  badgeSub: { fontSize: 13, marginTop: 4, textAlign: "center" },
});
