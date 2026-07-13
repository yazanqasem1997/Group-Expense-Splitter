import { Feather } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import React, { useEffect, useRef } from "react";
import {
  Animated,
  Platform,
  Pressable,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Circle, Defs, LinearGradient as SvgGradient, Path, Stop } from "react-native-svg";

const AUTH_KEY = "@spliteasy_logged_in";

function ForkIcon({ size = 64 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 64 64">
      <Defs>
        <SvgGradient id="stem" x1="32" y1="48" x2="32" y2="24" gradientUnits="userSpaceOnUse">
          <Stop offset="0" stopColor="#8BBAD4" />
          <Stop offset="1" stopColor="#2B7BE0" />
        </SvgGradient>
        <SvgGradient id="lb" x1="32" y1="24" x2="14" y2="8" gradientUnits="userSpaceOnUse">
          <Stop offset="0" stopColor="#2B7BE0" />
          <Stop offset="1" stopColor="#1A6FD8" />
        </SvgGradient>
        <SvgGradient id="rb" x1="32" y1="24" x2="50" y2="8" gradientUnits="userSpaceOnUse">
          <Stop offset="0" stopColor="#18C4AC" />
          <Stop offset="1" stopColor="#14B09A" />
        </SvgGradient>
      </Defs>
      <Path d="M32 48 L32 26" stroke="url(#stem)" strokeWidth="4.5" strokeLinecap="round" />
      <Path d="M32 26 Q32 20 14 10" stroke="url(#lb)" strokeWidth="4.5" strokeLinecap="round" fill="none" />
      <Path d="M32 26 Q32 20 50 10" stroke="url(#rb)" strokeWidth="4.5" strokeLinecap="round" fill="none" />
      <Circle cx="14" cy="9" r="5.5" fill="#2B7BE0" />
      <Circle cx="50" cy="9" r="5.5" fill="#18C4AC" />
      <Circle cx="32" cy="50" r="4" fill="#7AAAC8" />
      <Circle cx="32" cy="26" r="3" fill="#7AAAC8" opacity="0.7" />
    </Svg>
  );
}

function GoogleIcon() {
  return (
    <View style={styles.googleIconWrap}>
      <Text style={styles.googleGlyph}>G</Text>
    </View>
  );
}

export default function LandingScreen() {
  const insets = useSafeAreaInsets();

  useEffect(() => {
    AsyncStorage.getItem(AUTH_KEY).then((val) => {
      if (val === "true") router.replace("/(tabs)");
    });
  }, []);

  const logoScale = useRef(new Animated.Value(0.25)).current;
  const logoOpacity = useRef(new Animated.Value(0)).current;
  const titleY = useRef(new Animated.Value(28)).current;
  const titleOpacity = useRef(new Animated.Value(0)).current;
  const taglineOpacity = useRef(new Animated.Value(0)).current;
  const pillsOpacity = useRef(new Animated.Value(0)).current;
  const btnsY = useRef(new Animated.Value(56)).current;
  const btnsOpacity = useRef(new Animated.Value(0)).current;
  const footerOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const run = (delay: number, anims: Animated.CompositeAnimation[]) =>
      Animated.sequence([Animated.delay(delay), Animated.parallel(anims)]).start();

    run(180, [
      Animated.spring(logoScale, { toValue: 1, tension: 55, friction: 7, useNativeDriver: true }),
      Animated.timing(logoOpacity, { toValue: 1, duration: 420, useNativeDriver: true }),
    ]);
    run(420, [
      Animated.timing(titleOpacity, { toValue: 1, duration: 360, useNativeDriver: true }),
      Animated.spring(titleY, { toValue: 0, tension: 80, friction: 12, useNativeDriver: true }),
    ]);
    run(680, [
      Animated.timing(taglineOpacity, { toValue: 1, duration: 380, useNativeDriver: true }),
    ]);
    run(860, [
      Animated.timing(pillsOpacity, { toValue: 1, duration: 360, useNativeDriver: true }),
    ]);
    run(1020, [
      Animated.timing(btnsOpacity, { toValue: 1, duration: 400, useNativeDriver: true }),
      Animated.spring(btnsY, { toValue: 0, tension: 65, friction: 10, useNativeDriver: true }),
    ]);
    run(1500, [
      Animated.timing(footerOpacity, { toValue: 1, duration: 380, useNativeDriver: true }),
    ]);
  }, []);

  async function handleLogin(_method: string) {
    await AsyncStorage.setItem(AUTH_KEY, "true");
    router.replace("/(tabs)");
  }

  return (
    <LinearGradient
      colors={["#2B7BE0", "#1AAEC0", "#18C4AC"]}
      locations={[0, 0.52, 1]}
      style={styles.root}
    >
      <StatusBar barStyle="light-content" />

      <View style={[styles.hero, { paddingTop: insets.top + 52 }]}>
        <Animated.View style={{ opacity: logoOpacity, transform: [{ scale: logoScale }] }}>
          <View style={styles.logoContainer}>
            <View style={styles.logoBadge}>
              <ForkIcon size={64} />
            </View>
            <View style={styles.logoGlow} />
          </View>
        </Animated.View>

        <Animated.View style={[styles.titleWrap, { opacity: titleOpacity, transform: [{ translateY: titleY }] }]}>
          <Text style={styles.appName}>SplitEasy</Text>
        </Animated.View>

        <Animated.Text style={[styles.tagline, { opacity: taglineOpacity }]}>
          Split expenses.{"\n"}No drama.
        </Animated.Text>

        <Animated.View style={[styles.pills, { opacity: pillsOpacity }]}>
          {["Groups", "Settle Up", "Multi-Currency", "Recurring"].map((label) => (
            <View key={label} style={styles.pill}>
              <Text style={styles.pillText}>{label}</Text>
            </View>
          ))}
        </Animated.View>
      </View>

      <Animated.View
        style={[
          styles.authSection,
          { paddingBottom: insets.bottom + 20, opacity: btnsOpacity, transform: [{ translateY: btnsY }] },
        ]}
      >
        {Platform.OS === "ios" && (
          <Pressable
            style={({ pressed }) => [styles.btn, styles.appleBtn, pressed && styles.pressed]}
            onPress={() => handleLogin("apple")}
          >
            <Text style={styles.appleGlyph}></Text>
            <Text style={[styles.btnText, styles.appleBtnText]}>Continue with Apple</Text>
          </Pressable>
        )}

        <Pressable
          style={({ pressed }) => [styles.btn, styles.googleBtn, pressed && styles.pressed]}
          onPress={() => handleLogin("google")}
        >
          <GoogleIcon />
          <Text style={[styles.btnText, styles.googleBtnText]}>Continue with Google</Text>
        </Pressable>

        <Pressable
          style={({ pressed }) => [styles.btn, styles.emailBtn, pressed && styles.pressed]}
          onPress={() => handleLogin("email")}
        >
          <Feather name="mail" size={18} color="rgba(255,255,255,0.85)" />
          <Text style={[styles.btnText, styles.emailBtnText]}>Continue with Email</Text>
        </Pressable>

        <View style={styles.dividerRow}>
          <View style={styles.dividerLine} />
          <Text style={styles.dividerLabel}>or</Text>
          <View style={styles.dividerLine} />
        </View>

        <Pressable
          style={({ pressed }) => [styles.btn, styles.phoneBtn, pressed && styles.pressed]}
          onPress={() => handleLogin("phone")}
        >
          <Feather name="phone" size={18} color="rgba(255,255,255,0.55)" />
          <Text style={[styles.btnText, styles.phoneBtnText]}>Use Phone Number</Text>
        </Pressable>

        <Animated.Text style={[styles.footer, { opacity: footerOpacity }]}>
          By continuing you agree to our{" "}
          <Text style={styles.footerLink}>Terms of Service</Text>
          {"  "}and{"  "}
          <Text style={styles.footerLink}>Privacy Policy</Text>
        </Animated.Text>
      </Animated.View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },

  hero: {
    flex: 1,
    alignItems: "center",
    paddingHorizontal: 24,
  },

  logoContainer: { alignItems: "center", justifyContent: "center", marginBottom: 24 },
  logoBadge: {
    width: 112,
    height: 112,
    borderRadius: 32,
    backgroundColor: "#ffffff",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.22,
    shadowRadius: 28,
    elevation: 18,
  },
  logoGlow: {
    position: "absolute",
    width: 144,
    height: 144,
    borderRadius: 72,
    backgroundColor: "rgba(255,255,255,0.18)",
    zIndex: -1,
  },

  titleWrap: { marginBottom: 10 },
  appName: {
    fontSize: 44,
    fontFamily: "Inter_700Bold",
    color: "#ffffff",
    letterSpacing: -1.4,
    textShadowColor: "rgba(0,0,0,0.1)",
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 6,
  },

  tagline: {
    fontSize: 20,
    fontFamily: "Inter_400Regular",
    color: "rgba(255,255,255,0.78)",
    textAlign: "center",
    lineHeight: 29,
    marginBottom: 24,
  },

  pills: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    justifyContent: "center",
  },
  pill: {
    backgroundColor: "rgba(255,255,255,0.18)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.28)",
    borderRadius: 20,
    paddingHorizontal: 13,
    paddingVertical: 5,
  },
  pillText: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
    color: "rgba(255,255,255,0.9)",
  },

  authSection: {
    paddingHorizontal: 20,
    gap: 10,
  },

  btn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    height: 54,
    borderRadius: 15,
    gap: 10,
  },
  pressed: { opacity: 0.82 },
  btnText: { fontSize: 16, fontFamily: "Inter_600SemiBold" },

  appleBtn: { backgroundColor: "#ffffff" },
  appleBtnText: { color: "#111827" },
  appleGlyph: { fontSize: 20, color: "#111827", lineHeight: 24 },

  googleBtn: { backgroundColor: "#ffffff" },
  googleBtnText: { color: "#1F2937" },
  googleIconWrap: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: "#4285F4",
    alignItems: "center",
    justifyContent: "center",
  },
  googleGlyph: { fontSize: 13, fontFamily: "Inter_700Bold", color: "#fff" },

  emailBtn: {
    backgroundColor: "rgba(255,255,255,0.18)",
    borderWidth: 1.5,
    borderColor: "rgba(255,255,255,0.35)",
  },
  emailBtnText: { color: "#ffffff" },

  phoneBtn: {
    backgroundColor: "transparent",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
  },
  phoneBtnText: { color: "rgba(255,255,255,0.55)" },

  dividerRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 8, marginVertical: 2 },
  dividerLine: { flex: 1, height: 1, backgroundColor: "rgba(255,255,255,0.2)" },
  dividerLabel: { fontSize: 12, fontFamily: "Inter_400Regular", color: "rgba(255,255,255,0.45)" },

  footer: {
    fontSize: 11.5,
    fontFamily: "Inter_400Regular",
    color: "rgba(255,255,255,0.38)",
    textAlign: "center",
    lineHeight: 18,
    marginTop: 4,
  },
  footerLink: { color: "rgba(255,255,255,0.65)", fontFamily: "Inter_500Medium" },
});
