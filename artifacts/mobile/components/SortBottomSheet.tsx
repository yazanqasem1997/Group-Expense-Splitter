import * as Haptics from "expo-haptics";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { useTheme } from "@/hooks/useTheme";

export interface SortOption {
  key: string;
  label: string;
}

interface SortBottomSheetProps {
  visible: boolean;
  selectedKey: string;
  options: SortOption[];
  onSelect: (key: string) => void;
  onClose: () => void;
}

/**
 * Shared sort picker. Its full-width bottom-sheet treatment mirrors the
 * Groups balance breakdown sheet so sorting feels consistent across tabs.
 */
export function SortBottomSheet({
  visible,
  selectedKey,
  options,
  onSelect,
  onClose,
}: SortBottomSheetProps) {
  const { colors } = useTheme();

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlayRoot}>
        <Pressable style={[StyleSheet.absoluteFill, styles.backdrop]} onPress={onClose} />
        <View
          style={[
            styles.sheet,
            {
              backgroundColor: colors.surface,
            },
          ]}
        >
          <View style={styles.sheetHeader}>
            <View style={[styles.handle, { backgroundColor: colors.border }]} />
            <Text style={[styles.title, { color: colors.textSecondary }]}>SORT BY</Text>
            <Pressable style={styles.closeBtn} onPress={onClose} hitSlop={8}>
              <Text style={[styles.closeText, { color: colors.textSecondary }]}>×</Text>
            </Pressable>
          </View>

          {options.map(option => {
            const active = option.key === selectedKey;
            return (
              <Pressable
                key={option.key}
                style={({ pressed }) => [
                  styles.option,
                  {
                    borderBottomColor: colors.border,
                    backgroundColor: active ? colors.primary + "10" : "transparent",
                    opacity: pressed ? 0.7 : 1,
                  },
                ]}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  onSelect(option.key);
                  onClose();
                }}
              >
                <Text style={[styles.optionText, { color: active ? colors.primary : colors.text }]}>
                  {option.label}
                </Text>
                {active && <View style={[styles.selectedDot, { backgroundColor: colors.primary }]} />}
              </Pressable>
            );
          })}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlayRoot: {
    flex: 1,
    justifyContent: "center",
  },
  backdrop: {
    backgroundColor: "rgba(0,0,0,0.35)",
  },
  sheet: {
    marginHorizontal: 20,
    borderRadius: 20,
    maxHeight: "80%",
    paddingVertical: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 12,
  },
  sheetHeader: {
    alignItems: "center",
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    marginTop: 4,
    marginBottom: 12,
  },
  title: {
    alignSelf: "flex-start",
    paddingHorizontal: 18,
    paddingBottom: 8,
    fontSize: 10.5,
    fontFamily: "Inter_700Bold",
    letterSpacing: 1,
  },
  closeBtn: {
    position: "absolute",
    right: 10,
    top: 6,
    width: 30,
    height: 30,
    alignItems: "center",
    justifyContent: "center",
  },
  closeText: {
    fontSize: 27,
    fontFamily: "Inter_400Regular",
    lineHeight: 27,
  },
  option: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginHorizontal: 6,
    paddingHorizontal: 14,
    paddingVertical: 13,
    borderRadius: 12,
  },
  optionText: {
    fontSize: 16,
    fontFamily: "Inter_400Regular",
  },
  selectedDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 4,
  },
});