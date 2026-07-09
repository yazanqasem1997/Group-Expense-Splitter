import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  useFonts,
} from "@expo-google-fonts/inter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import React, { useEffect } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { ErrorBoundary } from "@/components/ErrorBoundary";
import { AppProvider } from "@/context/AppContext";
import { BiometricProvider, useBiometric } from "@/context/BiometricContext";
import { ThemeProvider } from "@/context/ThemeContext";
import { ToastProvider } from "@/context/ToastContext";

SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient();

function LockScreen() {
  const { unlock, biometricType } = useBiometric();
  return (
    <View style={lockStyles.container}>
      <View style={lockStyles.iconWrap}>
        <Text style={lockStyles.lockIcon}>🔐</Text>
      </View>
      <Text style={lockStyles.title}>SplitEasy is locked</Text>
      <Text style={lockStyles.sub}>Use {biometricType || "biometrics"} to unlock</Text>
      <Pressable style={lockStyles.btn} onPress={unlock}>
        <Text style={lockStyles.btnText}>Unlock</Text>
      </Pressable>
    </View>
  );
}

const lockStyles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0C1523", alignItems: "center", justifyContent: "center", gap: 16 },
  iconWrap: { width: 88, height: 88, borderRadius: 24, backgroundColor: "#1C2B44", alignItems: "center", justifyContent: "center", marginBottom: 8 },
  lockIcon: { fontSize: 44 },
  title: { fontSize: 24, fontFamily: "Inter_700Bold", color: "#E8F1FA" },
  sub: { fontSize: 15, fontFamily: "Inter_400Regular", color: "#8BA3BE" },
  btn: { marginTop: 12, backgroundColor: "#4B9FE0", paddingHorizontal: 40, paddingVertical: 14, borderRadius: 14 },
  btnText: { fontSize: 16, fontFamily: "Inter_600SemiBold", color: "#fff" },
});

function RootLayoutNav() {
  const { isLocked } = useBiometric();
  if (isLocked) return <LockScreen />;

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="group/[id]" options={{ headerShown: false }} />
      <Stack.Screen name="group/new" options={{ headerShown: false, presentation: "modal" }} />
      <Stack.Screen name="group/qr/[id]" options={{ headerShown: false }} />
      <Stack.Screen name="expense/new" options={{ headerShown: false, presentation: "modal" }} />
      <Stack.Screen name="expense/[id]" options={{ headerShown: false }} />
      <Stack.Screen name="recurring" options={{ headerShown: false }} />
    </Stack>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });

  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) return null;

  return (
    <SafeAreaProvider>
      <ErrorBoundary>
        <QueryClientProvider client={queryClient}>
          <GestureHandlerRootView style={{ flex: 1 }}>
            <KeyboardProvider>
              <ToastProvider>
                <ThemeProvider>
                  <AppProvider>
                    <BiometricProvider>
                      <RootLayoutNav />
                    </BiometricProvider>
                  </AppProvider>
                </ThemeProvider>
              </ToastProvider>
            </KeyboardProvider>
          </GestureHandlerRootView>
        </QueryClientProvider>
      </ErrorBoundary>
    </SafeAreaProvider>
  );
}
