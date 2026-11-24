import { reportClientError } from "@workspace/api-client-react";
import { Platform } from "react-native";
import * as Sentry from "@sentry/react-native";

// Sentry is on only when a DSN is configured (EXPO_PUBLIC_SENTRY_DSN).
const SENTRY_DSN = process.env.EXPO_PUBLIC_SENTRY_DSN;
let sentryOn = false;

let installed = false;
let lastSent = 0;

/** Sends an error to the server: at most one every 5 seconds, and it never throws. */
export function reportError(error: unknown, context: Record<string, unknown> = {}): void {
  const now = Date.now();
  if (now - lastSent < 5000) return;
  lastSent = now;
  const err = error instanceof Error ? error : new Error(String(error));
  if (sentryOn) { try { Sentry.captureException(err, { extra: context }); } catch {} }
  reportClientError({
    message: err.message || "Unknown error",
    stack: err.stack?.slice(0, 8000),
    context: { platform: Platform.OS, ...context },
  }).catch(() => {});
}

type GlobalHandler = (error: unknown, isFatal?: boolean) => void;

/** Also catches errors outside React rendering (event handlers, promises in callbacks). */
export function installCrashReporter(): void {
  if (installed) return;
  installed = true;
  if (SENTRY_DSN) {
    try {
      Sentry.init({ dsn: SENTRY_DSN, tracesSampleRate: 0, sendDefaultPii: false, enableAutoSessionTracking: true });
      sentryOn = true;
    } catch {}
  }
  const utils = (globalThis as unknown as {
    ErrorUtils?: { getGlobalHandler: () => GlobalHandler; setGlobalHandler: (handler: GlobalHandler) => void };
  }).ErrorUtils;
  if (!utils) return;
  const previous = utils.getGlobalHandler();
  utils.setGlobalHandler((error, isFatal) => {
    reportError(error, { fatal: !!isFatal, source: "global" });
    previous(error, isFatal);
  });
}
