import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import React, { useCallback, useMemo, useRef, useState } from "react";
import {
  FlatList,
  Platform,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AmountText } from "@/components/AmountText";
import { Avatar } from "@/components/Avatar";
import { CategoryIcon } from "@/components/CategoryIcon";
import { EmptyState } from "@/components/EmptyState";
import { Expense, Settlement, useApp } from "@/context/AppContext";
import { useTheme } from "@/hooks/useTheme";
import { timeAgo } from "@/utils/format";

type ActivityItem =
  | { type: "expense"; data: Expense }
  | { type: "settlement"; data: Settlement };

type TypeFilter = "all" | "expenses" | "settlements";

const TYPE_FILTERS: { value: TypeFilter; label: string; icon: string }[] = [
  { value: "all",         label: "All",         icon: "list"        },
  { value: "expenses",    label: "Expenses",    icon: "credit-card" },
  { value: "settlements", label: "Settled",     icon: "check-circle"},
];

export default function ActivityScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { expenses, settlements, getMemberById, getGroupById, currentUser, checkAndAddRecurring, fetchExchangeRates } = useApp();

  const [refreshing, setRefreshing] = useState(false);
  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    checkAndAddRecurring();
    await fetchExchangeRates().catch(() => {});
    setRefreshing(false);
  }, [checkAndAddRecurring, fetchExchangeRates]);

  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const searchRef = useRef<TextInput>(null);

  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const isSearching = query.trim().length > 0;
  const q = query.toLowerCase().trim();

  const allItems: ActivityItem[] = useMemo(() => {
    const all: ActivityItem[] = [
      ...expenses.map(e => ({ type: "expense" as const, data: e })),
      ...settlements.map(s => ({ type: "settlement" as const, data: s })),
    ];
    return all.sort(
      (a, b) => new Date(b.data.createdAt).getTime() - new Date(a.data.createdAt).getTime()
    );
  }, [expenses, settlements]);

  const filteredItems = useMemo(() => {
    return allItems.filter(item => {
      // Type filter
      if (typeFilter === "expenses" && item.type !== "expense") return false;
      if (typeFilter === "settlements" && item.type !== "settlement") return false;

      // Text search
      if (!q) return true;

      if (item.type === "expense") {
        const e = item.data;
        const group = getGroupById(e.groupId);
        const payer = getMemberById(e.paidById);
        return (
          e.description.toLowerCase().includes(q) ||
          (group?.name.toLowerCase().includes(q) ?? false) ||
          (payer?.name.toLowerCase().includes(q) ?? false) ||
          e.category.toLowerCase().includes(q)
        );
      } else {
        const s = item.data;
        const from = getMemberById(s.fromId);
        const to = getMemberById(s.toId);
        const group = getGroupById(s.groupId);
        return (
          (from?.name.toLowerCase().includes(q) ?? false) ||
          (to?.name.toLowerCase().includes(q) ?? false) ||
          (group?.name.toLowerCase().includes(q) ?? false)
        );
      }
    });
  }, [allItems, q, typeFilter, getGroupById, getMemberById]);

  const expenseCount = allItems.filter(i => i.type === "expense").length;
  const settlementCount = allItems.filter(i => i.type === "settlement").length;

  function highlightText(text: string, style: object) {
    if (!q) return <Text style={style} numberOfLines={1}>{text}</Text>;
    const idx = text.toLowerCase().indexOf(q);
    if (idx === -1) return <Text style={style} numberOfLines={1}>{text}</Text>;
    return (
      <Text style={style} numberOfLines={1}>
        {text.slice(0, idx)}
        <Text style={{ backgroundColor: colors.primary + "30", color: colors.primary }}>
          {text.slice(idx, idx + q.length)}
        </Text>
        {text.slice(idx + q.length)}
      </Text>
    );
  }

  function renderExpense(expense: Expense) {
    const payer = getMemberById(expense.paidById);
    const group = getGroupById(expense.groupId);
    const myShare = expense.splits.find(s => s.memberId === currentUser.id);
    const youPaid = expense.paidById === currentUser.id;

    return (
      <Pressable
        style={({ pressed }) => [
          styles.card,
          { backgroundColor: colors.surface, opacity: pressed ? 0.92 : 1 },
        ]}
        onPress={() => router.push({ pathname: "/expense/[id]", params: { id: expense.id } })}
      >
        <CategoryIcon category={expense.category} size={40} />
        <View style={styles.cardBody}>
          {highlightText(expense.description, [styles.cardTitle, { color: colors.text }])}
          <View style={styles.cardMetaRow}>
            {payer && (
              <Avatar name={payer.name} color={payer.avatarColor} size={14} style={{ marginRight: 4 }} />
            )}
            <Text style={[styles.cardMeta, { color: colors.textSecondary }]} numberOfLines={1}>
              {youPaid ? "You" : payer?.name ?? "Someone"} · {highlightText(group?.name ?? "", [styles.cardMeta, { color: colors.textSecondary }])}
            </Text>
            <Text style={[styles.cardMeta, { color: colors.textTertiary }]}> · {timeAgo(expense.createdAt)}</Text>
          </View>
        </View>
        <View style={styles.cardRight}>
          {youPaid ? (
            <>
              <Text style={[styles.cardLabel, { color: colors.textTertiary }]}>you paid</Text>
              <AmountText
                amount={expense.amount}
                currency={expense.currency}
                style={[styles.cardAmount, { color: colors.positive }]}
              />
            </>
          ) : myShare ? (
            <>
              <Text style={[styles.cardLabel, { color: colors.textTertiary }]}>your share</Text>
              <AmountText
                amount={myShare.amount}
                currency={expense.currency}
                style={[styles.cardAmount, { color: colors.negative }]}
              />
            </>
          ) : null}
        </View>
      </Pressable>
    );
  }

  function renderSettlement(settlement: Settlement) {
    const from = getMemberById(settlement.fromId);
    const to = getMemberById(settlement.toId);
    const group = getGroupById(settlement.groupId);
    const isFromMe = settlement.fromId === currentUser.id;
    const isToMe = settlement.toId === currentUser.id;
    const title = isFromMe
      ? `You paid ${to?.name}`
      : isToMe
      ? `${from?.name} paid you`
      : `${from?.name} paid ${to?.name}`;

    return (
      <View style={[styles.card, { backgroundColor: colors.surface }]}>
        <View style={[styles.settlementIcon, { backgroundColor: colors.successLight }]}>
          <Feather name="check" size={20} color={colors.success} />
        </View>
        <View style={styles.cardBody}>
          {highlightText(title, [styles.cardTitle, { color: colors.text }])}
          <View style={styles.cardMetaRow}>
            <Text style={[styles.cardMeta, { color: colors.textSecondary }]} numberOfLines={1}>
              {group?.name}
            </Text>
            <Text style={[styles.cardMeta, { color: colors.textTertiary }]}> · {timeAgo(settlement.createdAt)}</Text>
          </View>
        </View>
        <AmountText
          amount={settlement.amount}
          currency={settlement.currency}
          style={[styles.cardAmount, { color: colors.success }]}
        />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: topPad + 14, backgroundColor: colors.headerBg }]}>
        <View style={styles.headerTopRow}>
          <Text style={[styles.headerTitle, { color: colors.text }]}>Activity</Text>
          <View style={{ flex: 1 }} />
          <View style={[styles.countPill, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.countText, { color: colors.textSecondary }]}>
              {filteredItems.length} item{filteredItems.length !== 1 ? "s" : ""}
            </Text>
          </View>
        </View>

        {/* Search bar */}
        <View style={[styles.searchBar, { backgroundColor: colors.inputBg, borderColor: isSearching ? colors.primary : colors.border }]}>
          <Feather name="search" size={16} color={isSearching ? colors.primary : colors.textTertiary} />
          <TextInput
            ref={searchRef}
            style={[styles.searchInput, { color: colors.text }]}
            placeholder="Search expenses, groups, people…"
            placeholderTextColor={colors.textTertiary}
            value={query}
            onChangeText={setQuery}
            returnKeyType="search"
            autoCapitalize="none"
            autoCorrect={false}
            clearButtonMode="never"
          />
          {isSearching && (
            <Pressable onPress={() => { setQuery(""); searchRef.current?.blur(); }}>
              <View style={[styles.clearBtn, { backgroundColor: colors.textTertiary + "30" }]}>
                <Feather name="x" size={11} color={colors.textTertiary} />
              </View>
            </Pressable>
          )}
        </View>

        {/* Type filter chips */}
        <View style={styles.filterRow}>
          {TYPE_FILTERS.map(f => {
            const active = typeFilter === f.value;
            const count = f.value === "all" ? allItems.length : f.value === "expenses" ? expenseCount : settlementCount;
            return (
              <Pressable
                key={f.value}
                style={[
                  styles.filterChip,
                  {
                    backgroundColor: active ? colors.primary : colors.surface,
                    borderColor: active ? colors.primary : colors.border,
                  },
                ]}
                onPress={() => setTypeFilter(f.value)}
              >
                <Feather name={f.icon as any} size={12} color={active ? "#fff" : colors.textSecondary} />
                <Text style={[styles.filterChipText, { color: active ? "#fff" : colors.textSecondary }]}>
                  {f.label}
                </Text>
                <View style={[styles.filterCount, { backgroundColor: active ? "rgba(255,255,255,0.25)" : colors.border }]}>
                  <Text style={[styles.filterCountText, { color: active ? "#fff" : colors.textTertiary }]}>{count}</Text>
                </View>
              </Pressable>
            );
          })}
        </View>
      </View>

      <FlatList
        data={filteredItems}
        keyExtractor={item =>
          item.type === "expense" ? `exp_${item.data.id}` : `set_${item.data.id}`
        }
        contentContainerStyle={[styles.listContent, { paddingBottom: Platform.OS === "web" ? 134 : 100 }]}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={colors.primary}
            colors={[colors.primary]}
          />
        }
        ListEmptyComponent={
          isSearching || typeFilter !== "all" ? (
            <View style={styles.noResults}>
              <View style={[styles.noResultsIcon, { backgroundColor: colors.surface }]}>
                <Feather name="search" size={28} color={colors.textTertiary} />
              </View>
              <Text style={[styles.noResultsTitle, { color: colors.text }]}>No results</Text>
              <Text style={[styles.noResultsSub, { color: colors.textSecondary }]}>
                {isSearching
                  ? `Nothing matched "${query}"`
                  : `No ${typeFilter} yet`}
              </Text>
            </View>
          ) : (
            <EmptyState
              icon="activity"
              title="No activity yet"
              subtitle="Add expenses to a group to see your activity here"
            />
          )
        }
        renderItem={({ item }) =>
          item.type === "expense"
            ? renderExpense(item.data)
            : renderSettlement(item.data)
        }
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    paddingHorizontal: 16,
    paddingBottom: 14,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 3,
    gap: 10,
  },
  headerTopRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: 4 },
  headerTitle: { fontSize: 30, fontFamily: "Inter_700Bold", letterSpacing: -0.5 },
  countPill: {
    paddingHorizontal: 10, paddingVertical: 4,
    borderRadius: 10, borderWidth: 1,
  },
  countText: { fontSize: 12, fontFamily: "Inter_500Medium" },
  searchBar: {
    flexDirection: "row", alignItems: "center", gap: 9,
    height: 44, borderRadius: 14, borderWidth: 1,
    paddingHorizontal: 13,
  },
  searchInput: {
    flex: 1, fontSize: 15, fontFamily: "Inter_400Regular",
  },
  clearBtn: {
    width: 20, height: 20, borderRadius: 10,
    alignItems: "center", justifyContent: "center",
  },
  filterRow: { flexDirection: "row", gap: 7, paddingHorizontal: 2 },
  filterChip: {
    flexDirection: "row", alignItems: "center", gap: 5,
    paddingHorizontal: 11, paddingVertical: 7,
    borderRadius: 20, borderWidth: 1,
  },
  filterChipText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  filterCount: {
    minWidth: 18, height: 18, borderRadius: 9,
    alignItems: "center", justifyContent: "center", paddingHorizontal: 4,
  },
  filterCountText: { fontSize: 10, fontFamily: "Inter_700Bold" },

  listContent: { padding: 16, gap: 2 },
  card: {
    flexDirection: "row", alignItems: "center",
    padding: 14, borderRadius: 16, marginBottom: 10, gap: 12,
    shadowColor: "#000", shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06, shadowRadius: 8, elevation: 2,
  },
  cardBody: { flex: 1, minWidth: 0 },
  cardTitle: { fontSize: 15, fontFamily: "Inter_500Medium", marginBottom: 4 },
  cardMetaRow: { flexDirection: "row", alignItems: "center" },
  cardMeta: { fontSize: 12, fontFamily: "Inter_400Regular" },
  cardRight: { alignItems: "flex-end" },
  cardLabel: { fontSize: 10, fontFamily: "Inter_400Regular", marginBottom: 2 },
  cardAmount: { fontSize: 15, fontFamily: "Inter_700Bold" },
  settlementIcon: {
    width: 40, height: 40, borderRadius: 12,
    alignItems: "center", justifyContent: "center", flexShrink: 0,
  },
  noResults: { alignItems: "center", paddingTop: 60, gap: 12 },
  noResultsIcon: {
    width: 64, height: 64, borderRadius: 20,
    alignItems: "center", justifyContent: "center",
  },
  noResultsTitle: { fontSize: 17, fontFamily: "Inter_600SemiBold" },
  noResultsSub: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center", maxWidth: 260 },
});
