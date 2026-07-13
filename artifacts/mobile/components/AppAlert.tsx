import React, { useCallback, useEffect, useState } from "react";
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import {
  AlertConfig,
  dismissAlert,
  subscribeAlert,
} from "@/hooks/alertStore";
import { useTheme } from "@/hooks/useTheme";

export function AppAlert() {
  const { colors } = useTheme();
  const [config, setConfig] = useState<AlertConfig | null>(null);

  useEffect(() => {
    const unsub = subscribeAlert(setConfig);
    return () => unsub();
  }, []);

  const dismiss = useCallback(() => {
    dismissAlert();
  }, []);

  const handleButton = useCallback(
    (onPress?: () => void) => {
      dismiss();
      onPress?.();
    },
    [dismiss]
  );

  const cancelButton = config?.buttons.find(b => b.style === "cancel");
  const hasCancelButton = !!cancelButton;

  const stacked = (config?.buttons.length ?? 0) > 2;

  return (
    <Modal
      visible={!!config}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={() => hasCancelButton && dismiss()}
    >
      <Pressable
        style={styles.overlay}
        onPress={() => hasCancelButton && dismiss()}
      >
        <Pressable
          style={[styles.card, { backgroundColor: colors.surface }]}
          onPress={e => e.stopPropagation()}
        >
          <Text style={[styles.title, { color: colors.text }]}>
            {config?.title}
          </Text>
          {!!config?.message && (
            <Text style={[styles.message, { color: colors.textSecondary }]}>
              {config.message}
            </Text>
          )}

          <View
            style={[
              styles.buttonRow,
              stacked && styles.buttonColumn,
              { borderTopColor: colors.border },
            ]}
          >
            {config?.buttons.map((btn, i) => {
              const isDestructive = btn.style === "destructive";
              const isCancel = btn.style === "cancel";
              const isLast = i === config.buttons.length - 1;

              const btnColor = isDestructive
                ? "#F4615C"
                : isCancel
                ? colors.textSecondary
                : colors.primary;

              return (
                <Pressable
                  key={i}
                  style={({ pressed }) => [
                    styles.button,
                    stacked ? styles.buttonFull : styles.buttonHalf,
                    !stacked && i < config.buttons.length - 1 && {
                      borderRightWidth: StyleSheet.hairlineWidth,
                      borderRightColor: colors.border,
                    },
                    stacked && !isLast && {
                      borderBottomWidth: StyleSheet.hairlineWidth,
                      borderBottomColor: colors.border,
                    },
                    pressed && { backgroundColor: colors.background + "66" },
                  ]}
                  onPress={() => handleButton(btn.onPress)}
                >
                  <Text
                    style={[
                      styles.buttonText,
                      { color: btnColor },
                      isCancel && styles.buttonTextCancel,
                      isDestructive && styles.buttonTextDestructive,
                    ]}
                  >
                    {btn.text}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    alignItems: "center",
    justifyContent: "center",
    padding: 32,
  },
  card: {
    width: "100%",
    maxWidth: 340,
    borderRadius: 18,
    overflow: "hidden",
  },
  title: {
    fontSize: 17,
    fontFamily: "Inter_700Bold",
    textAlign: "center",
    paddingTop: 22,
    paddingHorizontal: 20,
    paddingBottom: 4,
  },
  message: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    paddingHorizontal: 20,
    paddingBottom: 18,
    lineHeight: 20,
  },
  buttonRow: {
    flexDirection: "row",
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  buttonColumn: {
    flexDirection: "column",
  },
  button: {
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  buttonHalf: {
    flex: 1,
  },
  buttonFull: {
    width: "100%",
  },
  buttonText: {
    fontSize: 16,
    fontFamily: "Inter_500Medium",
  },
  buttonTextCancel: {
    fontFamily: "Inter_400Regular",
    fontSize: 15,
  },
  buttonTextDestructive: {
    fontFamily: "Inter_600SemiBold",
  },
});
