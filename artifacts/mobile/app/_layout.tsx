import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  useFonts,
} from "@expo-google-fonts/inter";
import { ClerkProvider, useAuth } from "@clerk/expo";
import { tokenCache } from "@clerk/expo/token-cache";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Redirect, router, Stack, useSegments } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import React, { useEffect } from "react";
import {
  ActivityIndicator,
  Platform,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { setBaseUrl } from "@workspace/api-client-react";

import { AppAlert } from "@/components/AppAlert";
import { AppLaunchGate } from "@/components/AppLaunchGate";
import { AuthBridge } from "@/components/AuthBridge";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { installCrashReporter, reportError } from "@/utils/crashReporter";

import { noteFirstOpen } from "@/utils/reviewPrompt";
installCrashReporter();
void noteFirstOpen();
import { AppProvider } from "@/context/AppContext";
import { BiometricProvider } from "@/context/BiometricContext";
import { SoundEffectsProvider } from "@/context/SoundEffectsContext";
import { ThemeProvider } from "@/context/ThemeContext";
import { ToastProvider } from "@/context/ToastContext";
import { takePendingFriendInvite } from "@/utils/friendInvite";
import { takePendingGroupInvite } from "@/utils/groupInvite";

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

const lockStyles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F5F6F8", alignItems: "center", justifyContent: "center", gap: 16 },
  title: { fontSize: 24, fontFamily: "Inter_700Bold", color: "#17191F" },
  sub: { fontSize: 15, fontFamily: "Inter_400Regular", color: "#667085" },
});

function ClerkLoadingScreen() {
  return (
    <View style={lockStyles.container}>
      <ActivityIndicator size="large" color="#4B9FE0" />
    </View>
  );
}

function ClerkGate({ children }: { children: React.ReactNode }) {
  const { isLoaded } = useAuth();
  const segments = useSegments();
  const routeKey = segments.join("/");
  const isPublicRoute =
    routeKey === "" ||
    routeKey === "index" ||
    routeKey === "legal/terms" ||
    routeKey === "legal/privacy" ||
    routeKey === "add-friend" ||
    routeKey === "group/join";

  if (!isLoaded && !isPublicRoute) {
    return <ClerkLoadingScreen />;
  }

  return <>{children}</>;
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
  const { isLoaded: authLoaded, isSignedIn } = useAuth();
  const segments = useSegments();
  const routeKey = segments.join("/");
  const isOnLandingRoute = routeKey === "" || routeKey === "index";
  const isOnPublicLegalRoute =
    routeKey === "legal/terms" || routeKey === "legal/privacy";
  // The friend invite screen stores its code before sending signed-out users to sign in.
  const isOnFriendInviteRoute = routeKey === "add-friend";
  const isOnGroupJoinRoute = routeKey === "group/join";

  useEffect(() => {
    if (!authLoaded || !isSignedIn) return;
    let cancelled = false;
    void takePendingFriendInvite().then((code) => {
      if (code && !cancelled) router.push({ pathname: "/add-friend", params: { code } });
    }).catch(() => {});
    void takePendingGroupInvite().then((code) => {
      if (code && !cancelled) router.push({ pathname: "/group/join", params: { code } });
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [authLoaded, isSignedIn]);

  if (authLoaded && !isSignedIn && !isOnLandingRoute && !isOnPublicLegalRoute && !isOnFriendInviteRoute && !isOnGroupJoinRoute) {
    return <Redirect href="/" />;
  }

  return (
    <AppLaunchGate isSignedIn={!!isSignedIn}>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="group/[id]" options={{ headerShown: false }} />
        <Stack.Screen name="group/new" options={{ headerShown: false, presentation: "modal" }} />
        <Stack.Screen name="group/qr/[id]" options={{ headerShown: false }} />
        <Stack.Screen name="group/join" options={{ headerShown: false }} />
        <Stack.Screen name="expense/new" options={{ headerShown: false, presentation: "modal" }} />
        <Stack.Screen name="expense/[id]" options={{ headerShown: false }} />
        <Stack.Screen name="receipt/new" options={{ headerShown: false, presentation: "modal" }} />
        <Stack.Screen name="receipt/[id]" options={{ headerShown: false }} />
        <Stack.Screen name="settlement/[id]" options={{ headerShown: false }} />
        <Stack.Screen name="activity/deleted" options={{ headerShown: false, presentation: "modal" }} />
        <Stack.Screen name="recurring" options={{ headerShown: false }} />
        <Stack.Screen name="group/members" options={{ headerShown: false }} />
        <Stack.Screen name="settings/notifications" options={{ headerShown: false }} />
        <Stack.Screen name="settings/appearance" options={{ headerShown: false }} />
        <Stack.Screen name="settings/security" options={{ headerShown: false }} />
        <Stack.Screen name="settings/preferences" options={{ headerShown: false }} />
        <Stack.Screen name="settings/exchange-rates" options={{ headerShown: false }} />
        <Stack.Screen name="legal/terms" options={{ headerShown: false }} />
        <Stack.Screen name="legal/privacy" options={{ headerShown: false }} />
        <Stack.Screen name="add-friend" options={{ headerShown: false, presentation: "modal" }} />
      </Stack>
    </AppLaunchGate>
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

  // The web preview can render with the platform fallback font while bundled
  // fonts finish loading. Keeping this gate on web can leave the preview on a
  // permanent spinner even though the route and auth providers are healthy.
  if (Platform.OS !== "web" && !fontsLoaded && !fontError) {
    return (
      <View style={lockStyles.container}>
        <ActivityIndicator size="large" color="#4B9FE0" />
      </View>
    );
  }

  if (!publishableKey) {
    return (
      <SafeAreaProvider>
        <ConfigError />
      </SafeAreaProvider>
    );
  }

  return (
    <SafeAreaProvider>
      <ErrorBoundary onError={(error, componentStack) => reportError(error, { componentStack, source: "render" })}>
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
                    <SoundEffectsProvider>
                      <ClerkGate>
                        <AuthBridge />
                        <AppProvider>
                          <BiometricProvider>
                            <RootLayoutNav />
                          </BiometricProvider>
                        </AppProvider>
                        <AppAlert />
                      </ClerkGate>
                    </SoundEffectsProvider>
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
