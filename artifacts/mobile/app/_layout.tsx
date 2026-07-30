import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  useFonts,
} from "@expo-google-fonts/inter";
import { ClerkLoaded, ClerkLoading, ClerkProvider } from "@clerk/expo";
import { tokenCache } from "@clerk/expo/token-cache";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import React, { useEffect } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { setBaseUrl } from "@workspace/api-client-react";

import { AppAlert } from "@/components/AppAlert";
import { AuthBridge } from "@/components/AuthBridge";
import { SyncStatusBanner } from "@/components/SyncStatusBanner";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { AppProvider } from "@/context/AppContext";
import { BiometricProvider, useBiometric } from "@/context/BiometricContext";
import { ThemeProvider } from "@/context/ThemeContext";
import { ToastProvider } from "@/context/ToastContext";

// Expo bundles run outside the web proxy, so the generated API client needs an
// absolute base URL to reach the API server. The deployment domain is injected
// at build time and differs across dev/preview/prod.
const domain = process.env.EXPO_PUBLIC_DOMAIN;
if (domain) setBaseUrl(`https://${domain}`);

// Clerk publishable key is a public value provisioned by Replit-managed Clerk.
// It is safe to read (not a secret) and is never logged here.
const publishableKey = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY;
// Empty in dev (Clerk hits dev FAPI directly), auto-populated in prod.
const proxyUrl = process.env.EXPO_PUBLIC_CLERK_PROXY_URL || undefined;

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

function ClerkLoadingScreen() {
  return (
    <View style={lockStyles.container}>
      <ActivityIndicator size="large" color="#4B9FE0" />
    </View>
  );
}

function ConfigError() {
  return (
    <View style={lockStyles.container}>
      <Text style={lockStyles.title}>Auth is not configured</Text>
      <Text style={lockStyles.sub}>
        Missing Clerk publishable key. Please try again later.
      </Text>
    </View>
  );
}

function RootLayoutNav() {
  const { isLocked } = useBiometric();
  if (isLocked) return <LockScreen />;

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="group/[id]" options={{ headerShown: false }} />
      <Stack.Screen name="group/new" options={{ headerShown: false, presentation: "modal" }} />
      <Stack.Screen name="group/qr/[id]" options={{ headerShown: false }} />
      <Stack.Screen name="expense/new" options={{ headerShown: false, presentation: "modal" }} />
      <Stack.Screen name="expense/[id]" options={{ headerShown: false }} />
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

  if (!publishableKey) {
    return (
      <SafeAreaProvider>
        <ConfigError />
      </SafeAreaProvider>
    );
  }

  return (
    <SafeAreaProvider>
      <ErrorBoundary>
        <ClerkProvider
          publishableKey={publishableKey}
          tokenCache={tokenCache}
          proxyUrl={proxyUrl}
        >
          <QueryClientProvider client={queryClient}>
            <GestureHandlerRootView style={{ flex: 1 }}>
              <KeyboardProvider>
                <ToastProvider>
                  <ThemeProvider>
                    <ClerkLoading>
                      <ClerkLoadingScreen />
                    </ClerkLoading>
                    <ClerkLoaded>
                      <AuthBridge />
                      <AppProvider>
                        <SyncStatusBanner />
                        <BiometricProvider>
                          <RootLayoutNav />
                        </BiometricProvider>
                      </AppProvider>
                      <AppAlert />
                    </ClerkLoaded>
                  </ThemeProvider>
                </ToastProvider>
              </KeyboardProvider>
            </GestureHandlerRootView>
          </QueryClientProvider>
        </ClerkProvider>
      </ErrorBoundary>
    </SafeAreaProvider>
  );
}
