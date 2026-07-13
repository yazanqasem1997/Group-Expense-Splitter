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

const AUTH_KEY = "@spliteasy_logged_in";

function AppleIcon() {
  return <Text style={styles.appleGlyph}></Text>;
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
    <LinearGradient colors={["#050C1B", "#0A1A34", "#06111F"]} locations={[0, 0.55, 1]} style={styles.root}>
      <StatusBar barStyle="light-content" />

      <View style={[styles.hero, { paddingTop: insets.top + 52 }]}>
        <Animated.View style={{ opacity: logoOpacity, transform: [{ scale: logoScale }] }}>
          <View style={styles.logoContainer}>
            <LinearGradient
              colors={["#4B9FE0", "#1DB8A6"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.logoGrad}
            >
              <Text style={styles.logoEmoji}>✂️</Text>
            </LinearGradient>
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
            <AppleIcon />
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
          <Feather name="mail" size={18} color="#A8C4E0" />
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
          <Feather name="phone" size={18} color="#8BA3BE" />
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
    gap: 0,
  },

  logoContainer: { alignItems: "center", justifyContent: "center", marginBottom: 24 },
  logoGrad: {
    width: 104,
    height: 104,
    borderRadius: 30,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#4B9FE0",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.55,
    shadowRadius: 24,
    elevation: 16,
  },
  logoEmoji: { fontSize: 48 },
  logoGlow: {
    position: "absolute",
    width: 130,
    height: 130,
    borderRadius: 65,
    backgroundColor: "rgba(75,159,224,0.14)",
    zIndex: -1,
  },

  titleWrap: { marginBottom: 12 },
  appName: {
    fontSize: 42,
    fontFamily: "Inter_700Bold",
    color: "#EEF4FB",
    letterSpacing: -1.2,
  },

  tagline: {
    fontSize: 20,
    fontFamily: "Inter_400Regular",
    color: "#7A99B8",
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
    backgroundColor: "rgba(75,159,224,0.13)",
    borderWidth: 1,
    borderColor: "rgba(75,159,224,0.22)",
    borderRadius: 20,
    paddingHorizontal: 13,
    paddingVertical: 5,
  },
  pillText: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
    color: "#6DAEE8",
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
  appleBtnText: { color: "#050C1B" },
  appleGlyph: { fontSize: 20, color: "#050C1B", lineHeight: 24 },

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
    backgroundColor: "rgba(75,159,224,0.12)",
    borderWidth: 1.5,
    borderColor: "rgba(75,159,224,0.25)",
  },
  emailBtnText: { color: "#A8C4E0" },

  phoneBtn: {
    backgroundColor: "transparent",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  phoneBtnText: { color: "#5E7E9E" },

  dividerRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 8, marginVertical: 2 },
  dividerLine: { flex: 1, height: 1, backgroundColor: "rgba(255,255,255,0.07)" },
  dividerLabel: { fontSize: 12, fontFamily: "Inter_400Regular", color: "#3D5068" },

  footer: {
    fontSize: 11.5,
    fontFamily: "Inter_400Regular",
    color: "#2E4460",
    textAlign: "center",
    lineHeight: 18,
    marginTop: 4,
  },
  footerLink: { color: "#4B7EA8", fontFamily: "Inter_500Medium" },
});
