import { Feather } from "@expo/vector-icons";
import { router, useFocusEffect } from "expo-router";
import React, { useEffect, useRef, useState, useCallback } from "react";
import { Animated, Dimensions, Easing, Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AccountScreenContent } from "@/app/(tabs)/account";
import AppearanceScreen from "@/app/settings/appearance";
import ExchangeRatesScreen from "@/app/settings/exchange-rates";
import NotificationsScreen from "@/app/settings/notifications";
import PreferencesScreen from "@/app/settings/preferences";
import SecurityScreen from "@/app/settings/security";
import { useAccountDrawer } from "@/context/AccountDrawerContext";
import { useTheme } from "@/hooks/useTheme";

const SCREEN_WIDTH = Dimensions.get("window").width;
const DRAWER_WIDTH = Math.round(SCREEN_WIDTH * 0.86);

type SubRoute =
  | "home"
  | "/settings/notifications"
  | "/settings/appearance"
  | "/settings/security"
  | "/settings/preferences"
  | "/settings/exchange-rates";

const SUB_TITLES: Record<SubRoute, string> = {
  "home": "Account",
  "/settings/notifications": "Notifications",
  "/settings/appearance": "Appearance",
  "/settings/security": "Security",
  "/settings/preferences": "Preferences",
  "/settings/exchange-rates": "Exchange Rates",
};

export function AccountDrawer() {
  const { isOpen, openDrawer, closeDrawer } = useAccountDrawer();
  // Reopen the account panel when coming back from a page opened from it (Terms, Privacy).
  const reopenOnReturn = useRef(false);
  useFocusEffect(
    useCallback(() => {
      if (reopenOnReturn.current) {
        reopenOnReturn.current = false;
        openDrawer();
      }
    }, [openDrawer]),
  );
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const slideX = useRef(new Animated.Value(DRAWER_WIDTH)).current;
  const ambientMotion = useRef(new Animated.Value(0)).current;
  const accountScrollOffset = useRef(0);
  const [visible, setVisible] = useState(false);
  const [subRoute, setSubRoute] = useState<SubRoute>("home");

  useEffect(() => {
    if (isOpen) {
      setVisible(true);
      Animated.spring(slideX, {
        toValue: 0,
        useNativeDriver: true,
        damping: 22,
        stiffness: 160,
        mass: 0.8,
      }).start();
    } else {
      Animated.timing(slideX, {
        toValue: DRAWER_WIDTH,
        duration: 220,
        useNativeDriver: true,
      }).start(() => {
        setVisible(false);
        setSubRoute("home");
        accountScrollOffset.current = 0;
      });
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const ambientLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(ambientMotion, {
          toValue: 1,
          duration: 15000,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(ambientMotion, {
          toValue: 0,
          duration: 15000,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ]),
    );
    ambientLoop.start();
    return () => ambientLoop.stop();
  }, [ambientMotion, isOpen]);

  const backdropOpacity = slideX.interpolate({
    inputRange: [0, DRAWER_WIDTH],
    outputRange: [1, 0],
    extrapolate: "clamp",
  });
  const primaryOrbStyle = {
    opacity: ambientMotion.interpolate({
      inputRange: [0, 0.5, 1],
      outputRange: [0.1, 0.16, 0.1],
    }),
    transform: [
      { translateX: ambientMotion.interpolate({ inputRange: [0, 1], outputRange: [0, 26] }) },
      { translateY: ambientMotion.interpolate({ inputRange: [0, 1], outputRange: [0, 18] }) },
      { scale: ambientMotion.interpolate({ inputRange: [0, 1], outputRange: [1, 1.07] }) },
    ],
  };
  const secondaryOrbStyle = {
    opacity: ambientMotion.interpolate({
      inputRange: [0, 0.5, 1],
      outputRange: [0.06, 0.1, 0.06],
    }),
    transform: [
      { translateX: ambientMotion.interpolate({ inputRange: [0, 1], outputRange: [0, -30] }) },
      { translateY: ambientMotion.interpolate({ inputRange: [0, 1], outputRange: [0, 22] }) },
      { scale: ambientMotion.interpolate({ inputRange: [0, 1], outputRange: [1.06, 1.01] }) },
    ],
  };

  function handleNavigate(path: string) {
    setSubRoute(path as SubRoute);
  }

  function handleBack() {
    setSubRoute("home");
  }

  function handleClose() {
    closeDrawer();
  }

  function handleMainNavigate(path: string, params?: Record<string, string>) {
    reopenOnReturn.current = path.startsWith("/legal");
    closeDrawer();
    setTimeout(() => {
      if (params) {
        router.push({ pathname: path as any, params });
      } else {
        router.push(path as any);
      }
    }, 260);
  }

  function renderContent() {
    const onBack = handleBack;
    switch (subRoute) {
      case "/settings/appearance":
        return <AppearanceScreen onBack={onBack} />;
      case "/settings/notifications":
        return <NotificationsScreen onBack={onBack} />;
      case "/settings/security":
        return <SecurityScreen onBack={onBack} />;
      case "/settings/preferences":
        return <PreferencesScreen onBack={onBack} />;
      case "/settings/exchange-rates":
        return <ExchangeRatesScreen onBack={onBack} />;
      default:
        return (
          <AccountScreenContent
            inDrawer
            onNavigate={handleNavigate}
            onClose={handleClose}
            onMainNavigate={handleMainNavigate}
            initialScrollOffset={accountScrollOffset.current}
            onScrollPositionChange={offset => {
              accountScrollOffset.current = offset;
            }}
          />
        );
    }
  }

  // Settings screens carry their own safe-area top padding via useSafeAreaInsets.
  // The "home" view has no header so the panel provides paddingTop.
  const isSubRoute = subRoute !== "home";

  if (!visible && !isOpen) return null;

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={closeDrawer}>
      {/* Dim backdrop */}
      <Animated.View
        style={[StyleSheet.absoluteFill, styles.backdrop, { opacity: backdropOpacity }]}
      />
      <Pressable style={StyleSheet.absoluteFill} onPress={closeDrawer} />

      {/* Sliding panel */}
      <Animated.View
        style={[
          styles.panel,
           {
             backgroundColor: colors.background,
             paddingTop: isSubRoute ? 0 : insets.top,
             shadowColor: colors.shadow,
           },
          { transform: [{ translateX: slideX }] },
        ]}
      >
        <View pointerEvents="none" style={styles.ambientLayer}>
          <Animated.View
            style={[styles.ambientOrbPrimary, { backgroundColor: colors.primary }, primaryOrbStyle]}
          />
          <Animated.View
            style={[styles.ambientOrbSecondary, { backgroundColor: colors.teal }, secondaryOrbStyle]}
          />
        </View>

        {/* Drawer header — only shown on home; sub-screens render their own */}
        {!isSubRoute && (
          <View style={[styles.drawerHeader, { borderBottomColor: colors.border }]}>
            <Text style={[styles.drawerTitle, { color: colors.text }]}>Account</Text>
            <Pressable
              onPress={closeDrawer}
              hitSlop={12}
              style={[styles.closeBtn, { backgroundColor: colors.inputBg }]}
             accessibilityRole="button" accessibilityLabel="Close">
              <Feather name="x" size={18} color={colors.textSecondary} />
            </Pressable>
          </View>
        )}

        {renderContent()}
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { backgroundColor: "rgba(0,0,0,0.45)" },
  panel: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    width: DRAWER_WIDTH,
    overflow: "hidden",
    borderTopLeftRadius: 28,
    borderBottomLeftRadius: 28,
    shadowOffset: { width: -8, height: 0 },
    shadowOpacity: 0.18,
    shadowRadius: 24,
    elevation: 16,
  },
  ambientLayer: {
    ...StyleSheet.absoluteFill,
    overflow: "hidden",
  },
  ambientOrbPrimary: {
    position: "absolute",
    width: 280,
    height: 280,
    borderRadius: 140,
    top: -150,
    right: -120,
  },
  ambientOrbSecondary: {
    position: "absolute",
    width: 240,
    height: 240,
    borderRadius: 120,
    bottom: 70,
    left: -140,
  },
  drawerHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  drawerTitle: { fontSize: 26, lineHeight: 32, letterSpacing: -0.5, fontFamily: "Inter_700Bold" },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
});
