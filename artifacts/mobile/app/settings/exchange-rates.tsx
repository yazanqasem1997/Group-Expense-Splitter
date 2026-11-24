import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import React from "react";
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useApp } from "@/context/AppContext";
import { useTheme } from "@/hooks/useTheme";

export default function ExchangeRatesScreen({ onBack }: { onBack?: () => void } = {}) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { exchangeRates, ratesUpdated } = useApp();
  const topPad = insets.top;

  const hasRates = Object.keys(exchangeRates).length > 0;

  function formatRatesUpdated() {
    if (!ratesUpdated) return "Not yet loaded";
    const d = new Date(ratesUpdated);
    const diff = Math.floor((Date.now() - d.getTime()) / 60000);
    if (diff < 1) return "Just now";
    if (diff < 60) return `${diff}m ago`;
    if (diff < 1440) return `${Math.floor(diff / 60)}h ago`;
    return d.toLocaleDateString();
  }

  function ratesNextUpdateLabel() {
    if (!ratesUpdated) return "";
    const dueMs = new Date(ratesUpdated).getTime() + 24 * 60 * 60 * 1000 - Date.now();
    if (dueMs <= 0) return "Updates on next app open";
    const mins = Math.ceil(dueMs / 60000);
    if (mins < 60) return `Updates in ${mins}m`;
    return `Updates in ${Math.ceil(mins / 60)}h`;
  }

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
        <Text style={[styles.headerTitle, { color: colors.text }]}>Exchange Rates</Text>
        <View style={styles.backBtn} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>
        <View style={[styles.section, { shadowColor: colors.shadow }]}>
          <View style={[styles.row, { backgroundColor: colors.surface }]}>
            <View style={[styles.rowIcon, { backgroundColor: colors.primaryLight }]}>
              <Feather name="refresh-cw" size={18} color={colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.rowLabel, { color: colors.text }]}>Live Rates</Text>
              <Text style={[styles.rowSub, { color: colors.textSecondary }]}>
                {hasRates
                  ? `Updated ${formatRatesUpdated()}${ratesNextUpdateLabel() ? ` · ${ratesNextUpdateLabel()}` : ""}`
                  : "Not yet loaded"}
              </Text>
            </View>
          </View>
        </View>

        {hasRates && (
          <Text style={[styles.hint, { color: colors.textTertiary }]}>
            Rates are refreshed automatically every 24 hours when you open the app.
            {"\n"}The source is ExchangeRate-API's open daily USD feed. Rates are used
            {"\n"}only for displaying conversions in mixed-currency groups; original
            {"\n"}expense amounts remain stored in their original currency.
          </Text>
        )}
      </ScrollView>
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
  refreshBtn: {
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8,
    minWidth: 68, alignItems: "center",
  },
  refreshBtnText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  hint: {
    fontSize: 13, fontFamily: "Inter_400Regular",
    lineHeight: 19, textAlign: "center",
    marginHorizontal: 28, marginTop: 20,
  },
});
