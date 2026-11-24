import { Feather } from "@expo/vector-icons";
import React, { useCallback, useEffect, useState } from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  AlertButton,
  AlertConfig,
  dismissAlert,
  subscribeAlert,
} from "@/hooks/alertStore";
import { useTheme } from "@/hooks/useTheme";

export function AppAlert() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [config, setConfig] = useState<AlertConfig | null>(null);

  useEffect(() => {
    const unsub = subscribeAlert(setConfig);
    return () => { unsub(); };
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

  const hasCancelButton = config?.buttons.some(b => b.style === "cancel") ?? false;
  const isSheet = config?.variant === "sheet";

  return (
    <Modal
      visible={!!config}
      transparent
      animationType={isSheet ? "slide" : "fade"}
      statusBarTranslucent
      onRequestClose={() => { if (hasCancelButton) dismiss(); }}
    >
      <Pressable
        style={isSheet ? styles.sheetOverlay : styles.overlay}
        onPress={() => hasCancelButton && dismiss()}
      >
        {isSheet && config
          ? renderSheet(config, colors, insets.bottom, handleButton)
          : config
          ? renderAlert(config, colors, handleButton)
          : null}
      </Pressable>
    </Modal>
  );
}

function renderAlert(
  config: AlertConfig,
  colors: ReturnType<typeof useTheme>["colors"],
  handleButton: (onPress?: () => void) => void
) {
  const stacked = config.buttons.length > 2;
  return (
    <Pressable style={[styles.card, { backgroundColor: colors.surface }]} onPress={e => e.stopPropagation()}>
      <Text style={[styles.title, { color: colors.text }]}>
        {config.title}
      </Text>
      {!!config.message && (
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
        {config.buttons.map((btn, i) => {
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
  );
}

function renderSheet(
  config: AlertConfig,
  colors: ReturnType<typeof useTheme>["colors"],
  bottomInset: number,
  handleButton: (onPress?: () => void) => void
) {
  const actionButtons = config.buttons.filter(b => b.style !== "cancel");
  const cancelButton = config.buttons.find(b => b.style === "cancel");

  return (
    <Pressable
      style={[styles.sheet, { backgroundColor: colors.surface, paddingBottom: bottomInset + 12 }]}
      onPress={e => e.stopPropagation()}
    >
      <View style={[styles.sheetHandle, { backgroundColor: colors.border }]} />
      <View style={styles.sheetHeader}>
        <Text style={[styles.sheetTitle, { color: colors.text }]} numberOfLines={1}>
          {config.title}
        </Text>
        {!!config.message && (
          <Text style={[styles.sheetMessage, { color: colors.textSecondary }]}>
            {config.message}
          </Text>
        )}
      </View>

      <ScrollView
        style={styles.sheetScroll}
        contentContainerStyle={styles.sheetScrollContent}
        showsVerticalScrollIndicator={false}
      >
        {actionButtons.map((btn, i) => {
          const isDestructive = btn.style === "destructive";
          const tint = isDestructive ? "#F4615C" : colors.primary;
          const icon = btn.icon ?? defaultIconFor(btn, isDestructive);
          return (
            <Pressable
              key={i}
              style={({ pressed }) => [
                styles.sheetRow,
                { backgroundColor: pressed ? colors.background : "transparent" },
                i < actionButtons.length - 1 && {
                  borderBottomWidth: StyleSheet.hairlineWidth,
                  borderBottomColor: colors.border,
                },
              ]}
              onPress={() => handleButton(btn.onPress)}
            >
              <View style={[styles.sheetIconWrap, { backgroundColor: (isDestructive ? "#F4615C" : colors.primary) + "18" }]}>
                <Feather name={icon as "circle"} size={17} color={tint} />
              </View>
              <Text
                style={[
                  styles.sheetRowText,
                  { color: isDestructive ? "#F4615C" : colors.text },
                ]}
              >
                {btn.text}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <Pressable
        style={({ pressed }) => [
          styles.sheetCancel,
          { backgroundColor: colors.background, opacity: pressed ? 0.8 : 1 },
        ]}
        onPress={() => handleButton(cancelButton?.onPress)}
      >
        <Text style={[styles.sheetCancelText, { color: colors.textSecondary }]}>
          {cancelButton?.text ?? "Cancel"}
        </Text>
      </Pressable>
    </Pressable>
  );
}

function defaultIconFor(btn: AlertButton, isDestructive: boolean): string {
  if (isDestructive) return "trash-2";
  return "chevron-right";
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

  // Action sheet variant
  sheetOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "flex-end",
  },
  sheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 10,
    paddingHorizontal: 12,
    maxHeight: "80%",
  },
  sheetHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    alignSelf: "center",
    marginBottom: 12,
  },
  sheetHeader: {
    paddingHorizontal: 8,
    paddingBottom: 10,
    gap: 3,
  },
  sheetTitle: {
    fontSize: 17,
    fontFamily: "Inter_700Bold",
  },
  sheetMessage: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    lineHeight: 18,
  },
  sheetScroll: {
    flexGrow: 0,
  },
  sheetScrollContent: {
    paddingVertical: 2,
  },
  sheetRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingVertical: 13,
    paddingHorizontal: 8,
    borderRadius: 12,
  },
  sheetIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  sheetRowText: {
    flex: 1,
    fontSize: 16,
    fontFamily: "Inter_500Medium",
  },
  sheetCancel: {
    marginTop: 10,
    height: 50,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  sheetCancelText: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
  },
});
