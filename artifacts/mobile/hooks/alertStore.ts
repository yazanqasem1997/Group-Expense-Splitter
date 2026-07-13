export type AlertButtonStyle = "default" | "cancel" | "destructive";

export interface AlertButton {
  text: string;
  style?: AlertButtonStyle;
  onPress?: () => void;
}

export interface AlertConfig {
  title: string;
  message?: string;
  buttons: AlertButton[];
}

type Listener = (config: AlertConfig | null) => void;

let _current: AlertConfig | null = null;
const _listeners = new Set<Listener>();

function notify() {
  _listeners.forEach(l => l(_current));
}

export function showAlert(
  title: string,
  message?: string,
  buttons?: AlertButton[]
) {
  _current = {
    title,
    message,
    buttons: buttons ?? [{ text: "OK" }],
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
