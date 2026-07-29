/**
 * AuthBridge
 *
 * Glue between Clerk auth and the rest of the app. Rendered once inside the
 * root layout (under ClerkProvider). It has no UI of its own — it wires:
 *
 *   1. The API client's bearer-token getter to Clerk's session token, so all
 *      generated API hooks send `Authorization: Bearer <token>` on mobile.
 *   2. Expo push-token registration once the user is signed in.
 *   3. Notification tap → in-app deep-link routing (cold start + warm).
 *
 * No secret values are read or printed here; the Clerk token is passed opaquely
 * to the shared API client and never logged.
 */

import { useAuth } from "@clerk/expo";
import * as Notifications from "expo-notifications";
import { router } from "expo-router";
import React, { useEffect, useRef } from "react";
import { Platform } from "react-native";

import { setAuthTokenGetter } from "@workspace/api-client-react";

import {
  configureNotificationHandler,
  registerPushToken,
  resolveNotificationRoute,
} from "@/services/pushNotifications";

configureNotificationHandler();

export function AuthBridge() {
  const { isLoaded, isSignedIn, getToken } = useAuth();
  const didRegisterPushRef = useRef(false);

  // 1. Keep the shared API client's token getter pointed at Clerk. When the
  //    user is signed out, return null so no stale Authorization header leaks.
  useEffect(() => {
    setAuthTokenGetter(() => (isSignedIn ? getToken() : null));
    return () => setAuthTokenGetter(null);
  }, [isSignedIn, getToken]);

  // 2. Register the Expo push token once per signed-in session.
  useEffect(() => {
    if (!isLoaded) return;

    if (!isSignedIn) {
      didRegisterPushRef.current = false;
      return;
    }

    if (didRegisterPushRef.current) return;
    didRegisterPushRef.current = true;

    void registerPushToken(() => getToken());
  }, [isLoaded, isSignedIn, getToken]);

  // 3. Handle notification taps. On web this API is unavailable, so bail early.
  useEffect(() => {
    if (Platform.OS === "web") return;

    let cancelled = false;

    // Cold start: the app was launched by tapping a notification.
    void Notifications.getLastNotificationResponseAsync().then((response) => {
      if (cancelled || !response) return;
      const data = response.notification.request.content.data as
        | Record<string, unknown>
        | undefined;
      const route = resolveNotificationRoute(data);
      if (route) router.push(route);
    });

    // Warm: a notification was tapped while the app was already running.
    const subscription = Notifications.addNotificationResponseReceivedListener(
      (response) => {
        const data = response.notification.request.content.data as
          | Record<string, unknown>
          | undefined;
        const route = resolveNotificationRoute(data);
        if (route) router.push(route);
      },
    );

    return () => {
      cancelled = true;
      subscription.remove();
    };
  }, []);

  return null;
}
