import { Feather } from "@expo/vector-icons";
import React, { useMemo, useState } from "react";
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ChartSeries, LineChartSvg } from "@/components/LineChartSvg";
import { Currency, CURRENCY_SYMBOLS, useApp } from "@/context/AppContext";
import { useTheme } from "@/hooks/useTheme";

type Period = "7D" | "1M" | "3M" | "All";
const PERIODS: Period[] = ["7D", "1M", "3M", "All"];

function periodMs(period: Period): number | null {
  const MS = { "7D": 7, "1M": 30, "3M": 90 };
  if (period === "All") return null;
  return Date.now() - MS[period] * 24 * 60 * 60 * 1000;
}

export default function AnalyticsScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const {
    expenses,
    groups,
    currentUser,
    defaultCurrency,
    convertAmount,
    exchangeRates,
  } = useApp();

  const [period, setPeriod] = useState<Period>("1M");
  const [selectedGroupId, setSelectedGroupId] = useState<string>("all");
  const [displayCurrency, setDisplayCurrency] = useState<Currency | null>(null);

  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const chartWidth = width - 32;

  const activeCurrency: Currency = displayCurrency ?? defaultCurrency;

  const filteredExpenses = useMemo(() => {
    const cutoff = periodMs(period);
    return expenses.filter(e => {
      const ts = new Date(e.createdAt).getTime();
      const inPeriod = cutoff === null || ts >= cutoff;
      const inGroup = selectedGroupId === "all" || e.groupId === selectedGroupId;
      return inPeriod && inGroup;
    });
  }, [expenses, period, selectedGroupId]);

  const hasRates = Object.keys(exchangeRates).length > 0;

  function toDisplay(amount: number, groupId: string): number {
    const group = groups.find(g => g.id === groupId);
    if (!group) return amount;
    if (!hasRates) return amount;
    return convertAmount(amount, group.currency, activeCurrency);
  }

  const myExpenses = useMemo(
    () => filteredExpenses.filter(e => e.paidById === currentUser.id),
    [filteredExpenses, currentUser]
  );

  const totalSpent = useMemo(
    () => myExpenses.reduce((s, e) => s + toDisplay(e.amount, e.groupId), 0),
    [myExpenses, activeCurrency, hasRates]
  );

  const totalGroup = useMemo(
    () => filteredExpenses.reduce((s, e) => s + toDisplay(e.amount, e.groupId), 0),
    [filteredExpenses, activeCurrency, hasRates]
  );

  const myShareTotal = useMemo(
    () =>
      filteredExpenses.reduce((s, e) => {
        const split = e.splits.find(sp => sp.memberId === currentUser.id);
        return s + toDisplay(split?.amount ?? 0, e.groupId);
      }, 0),
    [filteredExpenses, currentUser, activeCurrency, hasRates]
  );

  const chartSeries: ChartSeries[] = useMemo(() => {
    const sorted = [...myExpenses].sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    );
    let cum = 0;
    const points = sorted.map(e => {
      cum += toDisplay(e.amount, e.groupId);
      return { timestamp: new Date(e.createdAt).getTime(), value: cum };
    });
    if (points.length === 0) return [];
    return [{ label: "Amount paid by you", color: colors.primary, points }];
  }, [myExpenses, activeCurrency, hasRates, colors.primary]);

  const categoryTotals = useMemo(() => {
    const map: Record<string, number> = {};
    myExpenses.forEach(e => {
      map[e.category] = (map[e.category] ?? 0) + toDisplay(e.amount, e.groupId);
    });
    return Object.keys(map)
      .map(cat => ({ cat, total: map[cat] }))
      .sort((a, b) => b.total - a.total);
  }, [myExpenses, activeCurrency, hasRates]);

  const CATEGORY_COLORS: Record<string, string> = {
    food: colors.accent,
    transport: colors.teal,
    accommodation: colors.primary,
    entertainment: "#9B59B6",
    utilities: "#E67E22",
    shopping: "#E91E63",
    health: colors.success,
    other: colors.textTertiary,
  };

  const sym = CURRENCY_SYMBOLS[activeCurrency] ?? "$";

  const availableCurrencies = useMemo(() => {
    const set = new Set<Currency>();
    set.add(defaultCurrency);
    groups.forEach(g => set.add(g.currency));
    return [...set];
  }, [groups, defaultCurrency]);

  const showCurrencyPicker = availableCurrencies.length > 1;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topPad + 16, backgroundColor: colors.headerBg }]}>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Analytics</Text>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.content, { paddingBottom: Platform.OS === "web" ? 134 : 100 }]}
      >
        {/* Group filter */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterRow}
        >
          <Pressable
            style={[
              styles.chip,
              {
                backgroundColor: selectedGroupId === "all" ? colors.primary : colors.surface,
                borderColor: selectedGroupId === "all" ? colors.primary : colors.border,
              },
            ]}
            onPress={() => setSelectedGroupId("all")}
          >
            <Text
              style={[
                styles.chipText,
                { color: selectedGroupId === "all" ? "#fff" : colors.textSecondary },
              ]}
            >
              All Groups
            </Text>
          </Pressable>
          {groups.map(g => (
            <Pressable
              key={g.id}
              style={[
                styles.chip,
                {
                  backgroundColor: selectedGroupId === g.id ? colors.primary : colors.surface,
                  borderColor: selectedGroupId === g.id ? colors.primary : colors.border,
                },
              ]}
              onPress={() => setSelectedGroupId(g.id)}
            >
              <Text style={styles.chipEmoji}>{g.emoji}</Text>
              <Text
                style={[
                  styles.chipText,
                  { color: selectedGroupId === g.id ? "#fff" : colors.textSecondary },
                ]}
              >
                {g.name}
              </Text>
            </Pressable>
          ))}
        </ScrollView>

        {/* Period filter */}
        <View style={[styles.periodBar, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          {PERIODS.map(p => (
            <Pressable
              key={p}
              style={[
                styles.periodBtn,
                period === p && { backgroundColor: colors.primary, borderRadius: 8 },
              ]}
              onPress={() => setPeriod(p)}
            >
              <Text
                style={[
                  styles.periodText,
                  { color: period === p ? "#fff" : colors.textSecondary },
                ]}
              >
                {p}
              </Text>
            </Pressable>
          ))}
        </View>

        {/* Currency toggle */}
        {showCurrencyPicker && (
          <View style={[styles.currencyRow, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Feather name="globe" size={13} color={colors.textTertiary} />
            <Text style={[styles.currencyLabel, { color: colors.textTertiary }]}>View in</Text>
            {availableCurrencies.map(c => {
              const active = c === activeCurrency;
              return (
                <Pressable
                  key={c}
                  style={[
                    styles.currencyChip,
                    {
                      backgroundColor: active ? colors.primary : colors.background,
                      borderColor: active ? colors.primary : colors.border,
                    },
                  ]}
                  onPress={() => setDisplayCurrency(c)}
                >
                  <Text style={[styles.currencyChipText, { color: active ? "#fff" : colors.textSecondary }]}>
                    {CURRENCY_SYMBOLS[c]}{c}
                  </Text>
                </Pressable>
              );
            })}
            {!hasRates && (
              <Text style={[styles.ratesNote, { color: colors.textTertiary }]}>· rates offline</Text>
            )}
          </View>
        )}

        {/* Summary cards */}
        <View style={styles.summaryRow}>
          <View style={[styles.summaryCard, { backgroundColor: colors.surface }]}>
            <View style={[styles.summaryIcon, { backgroundColor: colors.primaryLight }]}>
              <Feather name="credit-card" size={18} color={colors.primary} />
            </View>
            <Text style={[styles.summaryLabel, { color: colors.textSecondary }]}>You paid</Text>
            <Text style={[styles.summaryValue, { color: colors.text }]}>
              {sym}{totalSpent.toFixed(0)}
            </Text>
          </View>
          <View style={[styles.summaryCard, { backgroundColor: colors.surface }]}>
            <View style={[styles.summaryIcon, { backgroundColor: colors.tealTint }]}>
              <Feather name="pie-chart" size={18} color={colors.teal} />
            </View>
            <Text style={[styles.summaryLabel, { color: colors.textSecondary }]}>Your share</Text>
            <Text style={[styles.summaryValue, { color: colors.text }]}>
              {sym}{myShareTotal.toFixed(0)}
            </Text>
          </View>
          <View style={[styles.summaryCard, { backgroundColor: colors.surface }]}>
            <View style={[styles.summaryIcon, { backgroundColor: colors.accentTint }]}>
              <Feather name="users" size={18} color={colors.accent} />
            </View>
            <Text style={[styles.summaryLabel, { color: colors.textSecondary }]}>Group total</Text>
            <Text style={[styles.summaryValue, { color: colors.text }]}>
              {sym}{totalGroup.toFixed(0)}
            </Text>
          </View>
        </View>

        {/* Spending chart */}
        <View style={[styles.chartCard, { backgroundColor: colors.surface }]}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Spending over time</Text>
          <Text style={[styles.sectionSub, { color: colors.textSecondary }]}>
            Cumulative amount you paid · {period === "All" ? "All time" : `Last ${period}`}
          </Text>
          <LineChartSvg
            series={chartSeries}
            width={chartWidth - 32}
            height={200}
            formatY={v => `${sym}${v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v.toFixed(0)}`}
            textColor={colors.textTertiary}
            gridColor={colors.border}
            legendTextColor={colors.textSecondary}
            emptyText="No payments in this period"
          />
        </View>

        {/* Category breakdown */}
        {categoryTotals.length > 0 && (
          <View style={[styles.chartCard, { backgroundColor: colors.surface }]}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>By category</Text>
            {categoryTotals.map(({ cat, total }) => {
              const pct = totalSpent > 0 ? total / totalSpent : 0;
              const barColor = CATEGORY_COLORS[cat] ?? colors.textTertiary;
              const label = cat.charAt(0).toUpperCase() + cat.slice(1);
              return (
                <View key={cat} style={styles.catRow}>
                  <Text style={[styles.catLabel, { color: colors.text }]}>{label}</Text>
                  <View style={styles.catBarWrap}>
                    <View
                      style={[
                        styles.catBar,
                        { backgroundColor: barColor, width: `${Math.max(pct * 100, 2)}%` as any },
                      ]}
                    />
                    <View style={[styles.catBarBg, { backgroundColor: colors.border }]} />
                  </View>
                  <Text style={[styles.catValue, { color: colors.textSecondary }]}>
                    {sym}{total.toFixed(0)}
                  </Text>
                </View>
              );
            })}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    paddingHorizontal: 20,
    paddingBottom: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  headerTitle: { fontSize: 28, fontFamily: "Inter_700Bold" },
  content: { paddingTop: 16, gap: 12 },
  filterRow: { paddingHorizontal: 16, gap: 8 },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
  },
  chipEmoji: { fontSize: 14 },
  chipText: { fontSize: 13, fontFamily: "Inter_500Medium" },
  periodBar: {
    flexDirection: "row",
    marginHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1,
    padding: 4,
  },
  periodBtn: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 8,
  },
  periodText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  currencyRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginHorizontal: 16,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 12,
    borderWidth: 1,
  },
  currencyLabel: { fontSize: 12, fontFamily: "Inter_500Medium", marginRight: 2 },
  currencyChip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
  },
  currencyChipText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  ratesNote: { fontSize: 11, fontFamily: "Inter_400Regular", marginLeft: 2 },
  summaryRow: {
    flexDirection: "row",
    marginHorizontal: 16,
    gap: 10,
  },
  summaryCard: {
    flex: 1,
    borderRadius: 14,
    padding: 12,
    gap: 6,
    alignItems: "flex-start",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  summaryIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 2,
  },
  summaryLabel: { fontSize: 11, fontFamily: "Inter_400Regular" },
  summaryValue: { fontSize: 18, fontFamily: "Inter_700Bold" },
  chartCard: {
    marginHorizontal: 16,
    borderRadius: 16,
    padding: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  sectionTitle: { fontSize: 15, fontFamily: "Inter_600SemiBold", marginBottom: 2 },
  sectionSub: { fontSize: 12, fontFamily: "Inter_400Regular", marginBottom: 14 },
  catRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 12,
  },
  catLabel: { width: 90, fontSize: 13, fontFamily: "Inter_500Medium" },
  catBarWrap: { flex: 1, height: 8, borderRadius: 4, overflow: "hidden", position: "relative" },
  catBarBg: { ...StyleSheet.absoluteFillObject, borderRadius: 4 },
  catBar: { height: 8, borderRadius: 4, zIndex: 1 },
  catValue: { width: 52, textAlign: "right", fontSize: 12, fontFamily: "Inter_500Medium" },
});
