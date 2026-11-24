import { AppState } from "react-native";
import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import React, { ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  Easing,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { Avatar } from "@/components/Avatar";
import { AnimatedBrandMark } from "@/components/AnimatedBrandMark";
import { BRAND_COLORS, BRAND_GRADIENT, PRODUCT_TAGLINE, SPLIT_MARK_COLORS } from "@/constants/brand";
import { useApp } from "@/context/AppContext";
import { useBiometric } from "@/context/BiometricContext";
import { useTheme } from "@/hooks/useTheme";

type AppLaunchGateProps = {
  children: ReactNode;
  isSignedIn: boolean;
};

function timeGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

/**
 * Gives each signed-in session a short, branded welcome moment. When app lock
 * is on, the same surface becomes the unlock screen and never reveals content
 * until LocalAuthentication succeeds.
 */
export function AppLaunchGate({ children, isSignedIn }: AppLaunchGateProps) {
  const { colors, isDark } = useTheme();
  const { currentUser } = useApp();
  const {
    biometricAvailable,
    biometricEnabled,
    biometricType,
    isLocked,
    isReady,
    unlock,
    unlockWithPasscode,
  } = useBiometric();

  const [isVisible, setIsVisible] = useState(isSignedIn);
  const [unlocking, setUnlocking] = useState(false);
  const [unlockError, setUnlockError] = useState("");

  const logoScale = useRef(new Animated.Value(0.32)).current;
  const logoSpin = useRef(new Animated.Value(0)).current;
  const avatarY = useRef(new Animated.Value(24)).current;
  const contentOpacity = useRef(new Animated.Value(0)).current;
  const overlayOpacity = useRef(new Animated.Value(1)).current;
  const orbOne = useRef(new Animated.Value(0)).current;
  const orbTwo = useRef(new Animated.Value(0)).current;

  const greeting = useMemo(() => timeGreeting(), []);
  const firstName = currentUser.name?.trim().split(/\s+/)[0] || "there";
  const locked = isReady && biometricEnabled && isLocked;
  const lockMethod = biometricAvailable ? (biometricType || "biometrics") : "device passcode";

  useEffect(() => {
    if (!isSignedIn) {
      setIsVisible(false);
      return;
    }

    setIsVisible(true);
    setUnlockError("");
    overlayOpacity.setValue(1);
    logoScale.setValue(0.32);
    logoSpin.setValue(0);
    avatarY.setValue(24);
    contentOpacity.setValue(0);

    const enter = Animated.parallel([
      Animated.spring(logoScale, {
        toValue: 1,
        tension: 58,
        friction: 7,
        useNativeDriver: true,
      }),
      Animated.timing(logoSpin, {
        toValue: 0,
        duration: 700,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.sequence([
        Animated.delay(260),
        Animated.parallel([
          Animated.spring(avatarY, {
            toValue: 0,
            tension: 70,
            friction: 11,
            useNativeDriver: true,
          }),
          Animated.timing(contentOpacity, {
            toValue: 1,
            duration: 420,
            useNativeDriver: true,
          }),
        ]),
      ]),
    ]);

    enter.start();

    let hideTimer: ReturnType<typeof setTimeout> | undefined;
    if (isReady && !locked) {
      hideTimer = setTimeout(() => {
        Animated.timing(overlayOpacity, {
          toValue: 0,
          duration: 420,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }).start(({ finished }) => {
          if (finished) setIsVisible(false);
        });
      }, 1000);
    }

    return () => {
      enter.stop();
      if (hideTimer) clearTimeout(hideTimer);
    };
  }, [
    avatarY,
    contentOpacity,
    isReady,
    isSignedIn,
    locked,
    logoScale,
    logoSpin,
    overlayOpacity,
  ]);

  useEffect(() => {
    const firstOrb = Animated.loop(
      Animated.sequence([
        Animated.timing(orbOne, { toValue: 1, duration: 5000, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(orbOne, { toValue: 0, duration: 5000, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ]),
    );
    const secondOrb = Animated.loop(
      Animated.sequence([
        Animated.timing(orbTwo, { toValue: 1, duration: 6400, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(orbTwo, { toValue: 0, duration: 6400, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ]),
    );
    firstOrb.start();
    secondOrb.start();
    return () => {
      firstOrb.stop();
      secondOrb.stop();
    };
  }, [orbOne, orbTwo]);

  const handleUnlock = useCallback(async (allowDeviceFallback = false) => {
    setUnlocking(true);
    setUnlockError("");
    const success = allowDeviceFallback
      ? await unlockWithPasscode()
      : await unlock();
    setUnlocking(false);
    if (!success) {
      setUnlockError("We couldn't verify you. Try again or use your device passcode.");
    }
  }, [unlock, unlockWithPasscode]);

  // Ask for Face ID straight away when the lock screen appears.
  const autoPrompted = useRef(false);
  useEffect(() => {
    if (!locked) { autoPrompted.current = false; return; }
    if (Platform.OS === "web" || !biometricAvailable || autoPrompted.current || AppState.currentState !== "active") return;
    const t = setTimeout(() => {
      autoPrompted.current = true;
      void handleUnlock(false);
    }, 450);
    return () => clearTimeout(t);
  }, [locked, biometricAvailable, handleUnlock]);

  useEffect(() => {
    if (Platform.OS === "web") return;
    const sub = AppState.addEventListener("change", state => {
      if (state === "active" && locked && biometricAvailable && !unlocking) void handleUnlock(false);
    });
    return () => sub.remove();
  }, [locked, biometricAvailable, unlocking, handleUnlock]);

  if (!isSignedIn) return <>{children}</>;

  const orbOneStyle = {
    transform: [
      { translateX: orbOne.interpolate({ inputRange: [0, 1], outputRange: [-44, 50] }) },
      { translateY: orbOne.interpolate({ inputRange: [0, 1], outputRange: [-28, 40] }) },
      { scale: orbOne.interpolate({ inputRange: [0, 1], outputRange: [0.95, 1.14] }) },
    ],
  };
  const orbTwoStyle = {
    transform: [
      { translateX: orbTwo.interpolate({ inputRange: [0, 1], outputRange: [42, -46] }) },
      { translateY: orbTwo.interpolate({ inputRange: [0, 1], outputRange: [32, -38] }) },
      { scale: orbTwo.interpolate({ inputRange: [0, 1], outputRange: [1.1, 0.9] }) },
    ],
  };

  return (
    <View style={styles.root}>
      {children}
      {isVisible ? (
        <Animated.View
          style={[StyleSheet.absoluteFill, styles.overlay, { opacity: overlayOpacity }]}
          accessibilityViewIsModal
        >
          <LinearGradient
            colors={BRAND_GRADIENT}
            locations={[0, 0.54, 1]}
            style={StyleSheet.absoluteFill}
          />
            <Animated.View style={[styles.orb, styles.orbOne, { backgroundColor: BRAND_COLORS.silver }, orbOneStyle]} />
            <Animated.View style={[styles.orb, styles.orbTwo, { backgroundColor: BRAND_COLORS.silverBright }, orbTwoStyle]} />
          <View style={styles.grid} />

          <View style={styles.content}>
            <Animated.View
              style={{
                transform: [
                  { scale: logoScale },
                  {
                    rotate: logoSpin.interpolate({
                      inputRange: [-0.22, 0],
                      outputRange: ["-18deg", "0deg"],
                    }),
                  },
                ],
              }}
            >
              <View style={styles.logoShell}>
                <AnimatedBrandMark
                  size={90}
                  primary={SPLIT_MARK_COLORS.primary}
                  secondary={SPLIT_MARK_COLORS.secondary}
                  detail={SPLIT_MARK_COLORS.seam}
                  outline={SPLIT_MARK_COLORS.outline}
                />
              </View>
            </Animated.View>

            <Animated.View
              style={[
                styles.welcomeBlock,
                { opacity: contentOpacity, transform: [{ translateY: avatarY }] },
              ]}
            >
              <View
                style={[
                  styles.avatarShell,
                  {
                    borderColor: isDark ? colors.border : "rgba(255,255,255,0.75)",
                    backgroundColor: isDark ? "rgba(255,255,255,0.04)" : "rgba(255,255,255,0.1)",
                    shadowColor: isDark ? colors.shadow : "#001B36",
                  },
                ]}
              >
                <Avatar
                  name={currentUser.name || "You"}
                  color={currentUser.avatarColor || colors.primary}
                  imageUri={currentUser.photo}
                  size={91}
                />
              </View>
              <Text style={styles.greeting}>{greeting},</Text>
              <Text style={styles.name} numberOfLines={1}>{firstName}</Text>
              <Text style={styles.subtitle}>
                {!isReady
                  ? "Getting everything ready"
                  : locked
                    ? `Unlock with ${lockMethod} to continue`
                     : PRODUCT_TAGLINE}
              </Text>

              {locked ? (
                <View style={styles.lockActions}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Unlock with ${lockMethod}`}
                       onPress={() => handleUnlock(false)}
                    disabled={unlocking}
                    style={({ pressed }) => [
                      styles.unlockButton,
                      { opacity: pressed || unlocking ? 0.84 : 1 },
                    ]}
                  >
                    <Feather name={biometricType === "Face ID" ? "camera" : "lock"} size={18} color={colors.primaryDark} />
                    <Text style={[styles.unlockText, { color: colors.primaryDark }]}>
                      {unlocking ? "Verifying…" : `Unlock with ${lockMethod}`}
                    </Text>
                  </Pressable>
                  {Platform.OS !== "web" && (unlockError || !biometricAvailable) ? (
                    <Pressable
                      accessibilityRole="button"
                       onPress={() => handleUnlock(true)}
                      disabled={unlocking}
                      style={({ pressed }) => [styles.passcodeButton, { opacity: pressed || unlocking ? 0.65 : 1 }]}
                    >
                      <Text style={styles.passcodeText}>Try again</Text>
                    </Pressable>
                  ) : null}
                  {unlockError ? <Text style={styles.unlockError}>{unlockError}</Text> : null}
                </View>
              ) : null}
            </Animated.View>
          </View>
        </Animated.View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  overlay: {
    zIndex: 999,
    overflow: "hidden",
  },
  orb: {
    position: "absolute",
    width: 300,
    height: 300,
    borderRadius: 150,
    opacity: 0.2,
  },
  orbOne: { top: -120, left: -100 },
  orbTwo: { right: -125, bottom: -110 },
  grid: {
    ...StyleSheet.absoluteFill,
    opacity: 0.16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.35)",
    transform: [{ scale: 1.45 }, { rotate: "-18deg" }],
  },
  content: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 28,
    gap: 36,
  },
  logoShell: {
    width: 112,
    height: 112,
    borderRadius: 38,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: SPLIT_MARK_COLORS.tile,
    borderWidth: 0,
    borderColor: "transparent",
    transform: [{ translateY: -16 }],
    shadowColor: "#001B36",
    shadowOffset: { width: 0, height: 18 },
    shadowOpacity: 0.28,
    shadowRadius: 26,
    elevation: 9,
  },
  welcomeBlock: {
    alignItems: "center",
    width: "100%",
  },
  avatarShell: {
    width: 94,
    height: 94,
    borderRadius: 47,
    borderWidth: 1.5,
    padding: 0,
    backgroundColor: "rgba(255,255,255,0.1)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 22,
    shadowColor: "#001B36",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.18,
    shadowRadius: 12,
    elevation: 4,
  },
  greeting: {
    color: "rgba(255,255,255,0.78)",
    fontSize: 17,
    fontFamily: "Inter_500Medium",
    letterSpacing: 0.2,
  },
  name: {
    color: "#FFFFFF",
    fontSize: 34,
    lineHeight: 42,
    fontFamily: "Inter_700Bold",
    letterSpacing: -0.8,
    maxWidth: "100%",
  },
  subtitle: {
    color: "rgba(255,255,255,0.82)",
    fontSize: 15,
    lineHeight: 22,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    marginTop: 10,
  },
  lockActions: {
    width: "100%",
    alignItems: "center",
    marginTop: 28,
    gap: 12,
  },
  unlockButton: {
    minHeight: 52,
    width: "100%",
    borderRadius: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 9,
    backgroundColor: "#FFFFFF",
    shadowColor: "#001B36",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 14,
    elevation: 5,
  },
  unlockText: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
  },
  passcodeButton: {
    minHeight: 36,
    paddingHorizontal: 12,
    justifyContent: "center",
  },
  passcodeText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontFamily: "Inter_500Medium",
  },
  unlockError: {
    color: "#FFFFFF",
    fontSize: 12,
    lineHeight: 18,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
  },
});