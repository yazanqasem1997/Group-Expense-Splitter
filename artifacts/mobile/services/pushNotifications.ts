import { emitPush } from "@/utils/pushEvents";
/**
 * pushNotifications.ts
 *
 * Registers the device for Expo push notifications after the user signs in,
 * and forwards the resulting token to the API server so it can deliver
 * settlement reminders and recurring alerts.
 *
 * Everything here is defensive: push is a native-only capability, so it must
 * degrade gracefully on the iOS simulator, Android emulator, and web. No
 * secrets are ever read or logged — the Clerk bearer token is attached by the
 * shared API client's auth-token getter, not by this module.
 */

import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import type { Href } from "expo-router";

// The server route that stores a device's Expo push token. It is optional on
// the backend; if the endpoint is missing we swallow the resulting error so
// sign-in is never blocked by push registration.
const PUSH_TOKEN_PATH = "/api/device-tokens";

let didConfigureHandler = false;
let didConfigureAndroidChannel = false;

/**
 * Configure how notifications behave while the app is foregrounded. Safe to
 * call multiple times — it only performs the work once.
 */
export function configureNotificationHandler(): void {
  if (didConfigureHandler) return;
  didConfigureHandler = true;
  // Chat pushes get a "Reply" action: swipe or long-press the notification to answer.
  Notifications.setNotificationCategoryAsync("chat", [
    {
      identifier: "reply",
      buttonTitle: "Reply",
      textInput: { submitButtonTitle: "Send", placeholder: "Message" },
      options: { opensAppToForeground: false },
    },
  ]).catch(() => {});

  Notifications.setNotificationHandler({
    handleNotification: async (n) => {
      const quiet = (n.request.content.data as { type?: string } | undefined)?.type === "receipt_ready";
      return {
      shouldShowBanner: !quiet,
      shouldShowList: !quiet,
      shouldPlaySound: false,
      shouldSetBadge: true,
      };
    },
  });
  // A push arriving while the app is open triggers one refresh, instead of constant polling.
  Notifications.addNotificationReceivedListener(n => {
    emitPush((n.request.content.data ?? {}) as Record<string, unknown>);
  });
}

async function ensureAndroidChannel(): Promise<void> {
  if (Platform.OS !== "android" || didConfigureAndroidChannel) return;
  didConfigureAndroidChannel = true;
  try {
    await Notifications.setNotificationChannelAsync("default", {
      name: "Default",
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  } catch {
    // Channel setup is best-effort.
  }
}

/** Resolve the EAS project id used to scope the Expo push token, if present. */
function resolveProjectId(): string | undefined {
  const extra = Constants.expoConfig?.extra as
    | { eas?: { projectId?: string } }
    | undefined;
  return (
    extra?.eas?.projectId ??
    (Constants as unknown as { easConfig?: { projectId?: string } }).easConfig
      ?.projectId
  );
}

/**
 * Ask for notification permission (if not already decided) and fetch the Expo
 * push token. Returns `null` when running on a simulator/emulator/web, when
 * permission is denied, or when token acquisition fails (e.g. offline). Never
 * throws.
 */
export async function getExpoPushToken(): Promise<string | null> {
  // Push tokens are only available on physical devices.
  if (Platform.OS === "web" || !Device.isDevice) return null;

  try {
    await ensureAndroidChannel();

    const existing = await Notifications.getPermissionsAsync();
    let status = existing.status;
    if (status !== "granted" && existing.canAskAgain !== false) {
      const requested = await Notifications.requestPermissionsAsync();
      status = requested.status;
    }
    if (status !== "granted") return null;

    const projectId = resolveProjectId();
    const tokenResponse = await Notifications.getExpoPushTokenAsync(
      projectId ? { projectId } : undefined,
    );
    return tokenResponse.data ?? null;
  } catch {
    // Offline, missing credentials, or unsupported environment — no-op.
    return null;
  }
}

/**
 * Register for push notifications and POST the token to the API server.
 *
 * `getAuthToken` supplies the current Clerk session token so the request is
 * authenticated; the value is passed straight through to the Authorization
 * header and never logged. Failures are swallowed so the sign-in flow is
 * unaffected when push is unavailable or the endpoint does not exist.
 */
export async function registerPushToken(
  getAuthToken: () => Promise<string | null>,
): Promise<void> {
  const pushToken = await getExpoPushToken();
  if (!pushToken) return;

  const domain = process.env.EXPO_PUBLIC_DOMAIN;
  if (!domain) return;

  try {
    const authToken = await getAuthToken();
    if (!authToken) return;

    await fetch(`https://${domain}${PUSH_TOKEN_PATH}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify({
        token: pushToken,
        platform: Platform.OS,
      }),
    });
    // We intentionally ignore the response status: the endpoint is optional
    // and a 404 simply means the backend hasn't implemented it yet.
  } catch {
    // Network failure or missing endpoint — degrade gracefully.
  }
}

/**
 * Translate a notification's `data` payload into an in-app route. Returns
 * `null` when the payload does not map to a known destination.
 */
export function resolveNotificationRoute(
  data: Record<string, unknown> | undefined | null,
): Href | null {
  if (data?.type === "comeback") return "/(tabs)";
  if (data?.type === "receipt_ready" && data?.receiptId) return `/receipt/${data.receiptId}?groupId=${data.groupId ?? ""}`;
  if (!data) return null;

  const expenseId = typeof data.expenseId === "string" ? data.expenseId : null;
  const settlementId = typeof data.settlementId === "string" ? data.settlementId : null;
  const groupId = typeof data.groupId === "string" ? data.groupId : null;
  const path = typeof data.path === "string" ? data.path : null;

  if (expenseId) return `/expense/${expenseId}` as Href;
  if (settlementId) return `/settlement/${settlementId}` as Href;
  if (groupId) return `/group/${groupId}` as Href;
  if (path && path.startsWith("/")) return path as Href;
  return null;
}
