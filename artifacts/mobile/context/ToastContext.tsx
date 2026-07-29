import React, {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
} from "react";
import {
  Animated,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export type ToastType = "success" | "info" | "warning";

export interface ToastAction {
  label: string;
  onPress: () => void;
}

interface ToastItem {
  id: string;
  message: string;
  type: ToastType;
  action?: ToastAction;
}

interface ToastContextValue {
  showToast: (message: string, type?: ToastType, action?: ToastAction) => void;
}

const ToastContext = createContext<ToastContextValue>({ showToast: () => {} });

export function useToast() {
  return useContext(ToastContext);
}

const TYPE_COLORS: Record<ToastType, string> = {
  success: "#10B981",
  info: "#3B82F6",
  warning: "#F59E0B",
};

const TYPE_BG: Record<ToastType, string> = {
  success: "#ECFDF5",
  info: "#EFF6FF",
  warning: "#FFFBEB",
};

function ToastBanner({ toast, onDone }: { toast: ToastItem; onDone: () => void }) {
  const insets = useSafeAreaInsets();
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(-20)).current;
  const dismissed = useRef(false);

  const dismiss = useCallback((duration: number) => {
    if (dismissed.current) return;
    dismissed.current = true;
    Animated.parallel([
      Animated.timing(opacity, { toValue: 0, duration, useNativeDriver: true }),
      Animated.timing(translateY, { toValue: -20, duration, useNativeDriver: true }),
    ]).start(onDone);
  }, [opacity, translateY, onDone]);

  React.useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: true }),
      Animated.timing(translateY, { toValue: 0, duration: 200, useNativeDriver: true }),
    ]).start();

    // Keep actionable toasts (Undo) around longer so the user can react.
    const lifespan = toast.action ? 4500 : 2600;
    const timer = setTimeout(() => dismiss(250), lifespan);

    return () => clearTimeout(timer);
  }, []);

  const topPad = Platform.OS === "web" ? 16 : insets.top + 8;

  return (
    <Animated.View
      style={[
        styles.banner,
        {
          top: topPad,
          opacity,
          transform: [{ translateY }],
          backgroundColor: TYPE_BG[toast.type],
          borderLeftColor: TYPE_COLORS[toast.type],
        },
      ]}
      pointerEvents={toast.action ? "auto" : "none"}
    >
      <View style={[styles.dot, { backgroundColor: TYPE_COLORS[toast.type] }]} />
      <Text style={[styles.message, { color: TYPE_COLORS[toast.type] }]} numberOfLines={2}>
        {toast.message}
      </Text>
      {toast.action && (
        <Pressable
          hitSlop={8}
          style={({ pressed }) => [
            styles.actionBtn,
            { borderColor: TYPE_COLORS[toast.type], opacity: pressed ? 0.6 : 1 },
          ]}
          onPress={() => {
            toast.action?.onPress();
            dismiss(150);
          }}
        >
          <Text style={[styles.actionText, { color: TYPE_COLORS[toast.type] }]}>
            {toast.action.label}
          </Text>
        </Pressable>
      )}
    </Animated.View>
  );
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const counterRef = useRef(0);

  const showToast = useCallback((message: string, type: ToastType = "info", action?: ToastAction) => {
    const id = String(++counterRef.current);
    setToasts(prev => [...prev.slice(-2), { id, message, type, action }]);
  }, []);

  const remove = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <View style={styles.container} pointerEvents="box-none">
        {toasts.map(t => (
          <ToastBanner key={t.id} toast={t} onDone={() => remove(t.id)} />
        ))}
      </View>
    </ToastContext.Provider>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    zIndex: 9999,
  } as any,
  banner: {
    position: "absolute",
    left: 16,
    right: 16,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderRadius: 12,
    borderLeftWidth: 4,
    gap: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 10,
    elevation: 6,
  },
  dot: { width: 8, height: 8, borderRadius: 4 },
  message: { flex: 1, fontSize: 13, fontFamily: "Inter_500Medium" },
  actionBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1.5,
  },
  actionText: { fontSize: 12, fontFamily: "Inter_700Bold" },
});
