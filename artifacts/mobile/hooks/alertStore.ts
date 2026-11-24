import React from "react";
import { Alert as RNAlert, Platform as RNPlatform } from "react-native";
export type AlertButtonStyle = "default" | "cancel" | "destructive";

export interface AlertButton {
  text: string;
  style?: AlertButtonStyle;
  onPress?: () => void;
  /** Optional Feather icon name — used by the grouped action-sheet renderer. */
  icon?: string;
}

export interface AlertConfig {
  title: string;
  message?: string;
  buttons: AlertButton[];
  /**
   * Presentation mode:
   * - "alert" (default): centered modal card with side-by-side / stacked buttons.
   * - "sheet": bottom action sheet with icon-led rows (grouped options).
   */
  variant?: "alert" | "sheet";
}

type Listener = (config: AlertConfig | null) => void;

let _current: AlertConfig | null = null;
let nativeAlertDepth = 0;
/** Call while a Modal/sheet is open so alerts shown from it still appear on top. */
export function useNativeAlertsWhile(open: boolean) {
  // eslint-disable-next-line react-hooks/rules-of-hooks
  React.useEffect(() => {
    if (!open) return;
    nativeAlertDepth += 1;
    return () => { nativeAlertDepth -= 1; };
  }, [open]);
}
const _listeners = new Set<Listener>();

function notify() {
  _listeners.forEach(l => l(_current));
}

export function showAlert(
  title: string,
  message?: string,
  buttons?: AlertButton[]
) {
  // Native alert always shows above sheets/modals (the in-app one sat underneath and froze the screen).
  // In-app styled alert everywhere, except while a sheet/modal that would cover
  // it is open (that froze the screen before) - then fall back to the native one.
  if (RNPlatform.OS !== "web" && nativeAlertDepth > 0) {
    RNAlert.alert(title, message, (buttons ?? [{ text: "OK" }]) as never);
    return;
  }
  _current = {
    title,
    message,
    buttons: buttons ?? [{ text: "OK" }],
    variant: "alert",
  };
  notify();
}

/**
 * Presents a bottom action sheet with icon-led rows. Use for grouped
 * options menus (e.g. Group Options). A cancel button is appended
 * automatically if none is provided.
 */
export function showActionSheet(
  title: string,
  buttons: AlertButton[],
  message?: string
) {
  const hasCancel = buttons.some(b => b.style === "cancel");
  _current = {
    title,
    message,
    buttons: hasCancel ? buttons : [...buttons, { text: "Cancel", style: "cancel" }],
    variant: "sheet",
  };
  notify();
}

export function dismissAlert() {
  _current = null;
  notify();
}

export function subscribeAlert(listener: Listener): () => void {
  _listeners.add(listener);
  return () => { _listeners.delete(listener); };
}

export function getCurrentAlert() {
  return _current;
}
