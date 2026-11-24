import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import React, { useState } from "react";
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { CURRENCY_LIST, Currency, useApp } from "@/context/AppContext";
import { CurrencyPickerModal } from "@/components/CurrencyPickerModal";
import { useTheme } from "@/hooks/useTheme";

export default function PreferencesScreen({ onBack }: { onBack?: () => void } = {}) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { defaultCurrency, setDefaultCurrency } = useApp();
  const [showCurrencyPicker, setShowCurrencyPicker] = useState(false);
  const topPad = insets.top;

  const selectedCurrencyInfo = CURRENCY_LIST.find(c => c.code === defaultCurrency);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topPad + 8 }]}>
        <Pressable
          style={({ pressed }) => [styles.backBtn, { opacity: pressed ? 0.6 : 1 }]}
          onPress={() => onBack ? onBack() : router.back()}
          hitSlop={8}
         accessibilityRole="button" accessibilityLabel="Back">
          <Feather name="arrow-left" size={22} color={colors.text} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Default currency</Text>
        <View style={styles.backBtn} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>
        <View style={[styles.section, { shadowColor: colors.shadow }]}>
          {/* Default currency */}
          <Pressable
            style={({ pressed }) => [styles.row, { backgroundColor: colors.surface, opacity: pressed ? 0.85 : 1 }]}
            onPress={() => setShowCurrencyPicker(true)}
          >
            <View style={[styles.rowIcon, { backgroundColor: colors.accentTint }]}>
              <Feather name="globe" size={18} color={colors.accent} />
            </View>
            <Text style={[styles.rowLabel, { color: colors.text, flex: 1 }]}>Default Currency</Text>
            <Text style={[styles.rowValue, { color: colors.textSecondary }]}>
              {selectedCurrencyInfo ? `${selectedCurrencyInfo.flag}  ${defaultCurrency}` : defaultCurrency}
            </Text>
            <Feather name="chevron-right" size={18} color={colors.textTertiary} />
          </Pressable>
        </View>
      </ScrollView>

      <CurrencyPickerModal
        visible={showCurrencyPicker}
        onClose={() => setShowCurrencyPicker(false)}
        value={defaultCurrency}
        onChange={(code: Currency) => { setDefaultCurrency(code); setShowCurrencyPicker(false); }}
        title="Default Currency"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  backBtn: { width: 36, height: 36, alignItems: "center", justifyContent: "center" },
  headerTitle: { fontSize: 17, fontFamily: "Inter_600SemiBold" },
  section: {
    marginHorizontal: 16,
    marginTop: 16,
    borderRadius: 14,
    overflow: "hidden",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 13,
    gap: 12,
  },
  rowIcon: {
    width: 34, height: 34, borderRadius: 9,
    alignItems: "center", justifyContent: "center",
  },
  rowLabel: { fontSize: 15, fontFamily: "Inter_500Medium" },
  rowSub: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 1 },
  rowValue: { fontSize: 14, fontFamily: "Inter_400Regular" },
});
