import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router, useLocalSearchParams } from "expo-router";
import React, { useMemo, useState } from "react";
import {
  Alert,
  FlatList,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AmountText, formatAmount } from "@/components/AmountText";
import { Avatar } from "@/components/Avatar";
import { CategoryIcon } from "@/components/CategoryIcon";
import { EmptyState } from "@/components/EmptyState";
import { ChartSeries, LineChartSvg } from "@/components/LineChartSvg";
import { Expense, Settlement, useApp } from "@/context/AppContext";
import { useTheme } from "@/hooks/useTheme";
import { timeAgo } from "@/utils/format";

type Tab = "expenses" | "balances" | "charts";

export default function GroupDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const {
    getGroupById,
    getMemberById,
    getGroupExpenses,
    getGroupSettlements,
    getGroupBalances,
    currentUser,
    deleteGroup,
    addSettlement,
  } = useApp();

  const [tab, setTab] = useState<Tab>("expenses");
  const { width } = useWindowDimensions();

  const group = getGroupById(id);
  const groupExpenses = getGroupExpenses(id);
  const groupSettlements = getGroupSettlements(id);
  const debts = useMemo(() => getGroupBalances(id), [id, getGroupBalances]);

  const chartSeries: ChartSeries[] = useMemo(() => {
    if (!group || groupExpenses.length === 0) return [];
    const sorted = [...groupExpenses].sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    );
    return group.memberIds.map(memberId => {
      const member = getMemberById(memberId);
      let cumulative = 0;
      const points: { timestamp: number; value: number }[] = [];
      sorted.forEach(expense => {
        if (expense.paidById === memberId) cumulative += expense.amount;
        points.push({ timestamp: new Date(expense.createdAt).getTime(), value: cumulative });
      });
      return {
        label: member?.isCurrentUser ? "You" : (member?.name?.split(" ")[0] ?? "?"),
        color: member?.avatarColor ?? "#ccc",
        points,
      };
    }).filter(s => s.points.some(p => p.value > 0));
  }, [group, groupExpenses, getMemberById]);

  const topPad = Platform.OS === "web" ? 67 : insets.top;

  if (!group) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <Text style={{ color: colors.text }}>Group not found</Text>
      </View>
    );
  }

  const totalExpenses = groupExpenses.reduce((s, e) => s + e.amount, 0);
  const myDebts = debts.filter(d => d.fromId === currentUser.id);
  const myCredits = debts.filter(d => d.toId === currentUser.id);

  function handleDeleteGroup() {
    Alert.alert("Delete Group", "This will delete all expenses in this group. Continue?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => {
          deleteGroup(id);
          router.back();
        },
      },
    ]);
  }

  function handleSettleUp(fromId: string, toId: string, amount: number) {
    Alert.alert(
      "Settle Up",
      `Record payment of ${formatAmount(amount, group.currency)} from ${getMemberById(fromId)?.name} to ${getMemberById(toId)?.name}?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Confirm",
          onPress: () => {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            addSettlement({
              groupId: id,
              fromId,
              toId,
              amount,
              currency: group.currency,
            });
          },
        },
      ]
    );
  }

  function renderExpenseItem(expense: Expense) {
    const payer = getMemberById(expense.paidById);
    const youPaid = expense.paidById === currentUser.id;
    const myShare = expense.splits.find(s => s.memberId === currentUser.id);
    const netForMe = youPaid ? expense.amount - (myShare?.amount ?? 0) : -(myShare?.amount ?? 0);

    return (
      <Pressable
        style={({ pressed }) => [
          styles.expenseRow,
          { backgroundColor: colors.surface, opacity: pressed ? 0.92 : 1 },
        ]}
        onPress={() =>
          router.push({ pathname: "/expense/[id]", params: { id: expense.id } })
        }
      >
        <CategoryIcon category={expense.category} size={40} />
        <View style={styles.expenseBody}>
          <Text style={[styles.expenseName, { color: colors.text }]} numberOfLines={1}>
            {expense.description}
          </Text>
          <Text style={[styles.expenseMeta, { color: colors.textSecondary }]}>
            {youPaid ? "You" : payer?.name ?? "Someone"} paid •{" "}
            {timeAgo(expense.createdAt)}
          </Text>
        </View>
        <View style={styles.expenseRight}>
          <AmountText
            amount={expense.amount}
            currency={group.currency}
            style={[styles.expenseTotal, { color: colors.text }]}
          />
          <Text
            style={[
              styles.expenseNet,
              { color: netForMe >= 0 ? colors.positive : colors.negative },
            ]}
          >
            {netForMe >= 0 ? "+" : "-"}
            {formatAmount(Math.abs(netForMe), group.currency)}
          </Text>
        </View>
      </Pressable>
    );
  }

  function renderBalances() {
    if (debts.length === 0) {
      return (
        <View style={styles.settledCard}>
          <View style={[styles.settledIcon, { backgroundColor: colors.successLight }]}>
            <Feather name="check-circle" size={28} color={colors.success} />
          </View>
          <Text style={[styles.settledTitle, { color: colors.text }]}>All settled up!</Text>
          <Text style={[styles.settledSub, { color: colors.textSecondary }]}>
            No outstanding balances in this group
          </Text>
        </View>
      );
    }

    return (
      <ScrollView showsVerticalScrollIndicator={false}>
        {debts.map(debt => {
          const from = getMemberById(debt.fromId);
          const to = getMemberById(debt.toId);
          const isMyDebt = debt.fromId === currentUser.id;
          const isMyCredit = debt.toId === currentUser.id;

          return (
            <View key={`${debt.fromId}_${debt.toId}`} style={[styles.debtCard, { backgroundColor: colors.surface }]}>
              <Avatar name={from?.name ?? ""} color={from?.avatarColor ?? "#ccc"} size={40} />
              <View style={styles.debtBody}>
                <Text style={[styles.debtText, { color: colors.text }]}>
                  <Text style={{ fontFamily: "Inter_600SemiBold" }}>
                    {isMyDebt ? "You" : from?.name}
                  </Text>
                  {" owes "}
                  <Text style={{ fontFamily: "Inter_600SemiBold" }}>
                    {isMyCredit ? "you" : to?.name}
                  </Text>
                </Text>
                <AmountText
                  amount={debt.amount}
                  currency={group.currency}
                  style={[styles.debtAmount, { color: isMyCredit ? colors.positive : isMyDebt ? colors.negative : colors.text }]}
                />
              </View>
              {(isMyDebt || isMyCredit) && (
                <Pressable
                  style={[styles.settleBtn, { backgroundColor: colors.primary }]}
                  onPress={() => handleSettleUp(debt.fromId, debt.toId, debt.amount)}
                >
                  <Text style={styles.settleBtnText}>Settle</Text>
                </Pressable>
              )}
            </View>
          );
        })}
      </ScrollView>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topPad + 8, backgroundColor: colors.headerBg }]}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Feather name="arrow-left" size={24} color={colors.text} />
        </Pressable>
        <View style={styles.headerCenter}>
          <Text style={styles.groupEmoji}>{group.emoji}</Text>
          <Text style={[styles.groupName, { color: colors.text }]} numberOfLines={1}>
            {group.name}
          </Text>
        </View>
        <Pressable
          onPress={() =>
            Alert.alert(group.name, "Group options", [
              {
                text: "Add Expense",
                onPress: () =>
                  router.push({ pathname: "/expense/new", params: { groupId: id } }),
              },
              { text: "Delete Group", style: "destructive", onPress: handleDeleteGroup },
              { text: "Cancel", style: "cancel" },
            ])
          }
        >
          <Feather name="more-horizontal" size={24} color={colors.text} />
        </Pressable>
      </View>

      <View style={[styles.statsBar, { backgroundColor: colors.surface }]}>
        <View style={styles.statItem}>
          <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Total</Text>
          <Text style={[styles.statValue, { color: colors.text }]}>
            {formatAmount(totalExpenses, group.currency)}
          </Text>
        </View>
        <View style={[styles.statDivider, { backgroundColor: colors.border }]} />
        <View style={styles.statItem}>
          <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Expenses</Text>
          <Text style={[styles.statValue, { color: colors.text }]}>{groupExpenses.length}</Text>
        </View>
        <View style={[styles.statDivider, { backgroundColor: colors.border }]} />
        <View style={styles.statItem}>
          <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Members</Text>
          <Text style={[styles.statValue, { color: colors.text }]}>{group.memberIds.length}</Text>
        </View>
      </View>

      <View style={[styles.members, { backgroundColor: colors.surface }]}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.memberList}>
          {group.memberIds.map(mid => {
            const m = getMemberById(mid);
            if (!m) return null;
            return (
              <View key={mid} style={styles.memberChip}>
                <Avatar name={m.name} color={m.avatarColor} size={32} />
                <Text style={[styles.memberName, { color: colors.textSecondary }]} numberOfLines={1}>
                  {m.isCurrentUser ? "You" : m.name.split(" ")[0]}
                </Text>
              </View>
            );
          })}
        </ScrollView>
      </View>

      <View style={[styles.tabBar, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        {(["expenses", "balances", "charts"] as Tab[]).map(t => (
          <Pressable
            key={t}
            style={[styles.tabItem, tab === t && { borderBottomColor: colors.primary, borderBottomWidth: 2 }]}
            onPress={() => setTab(t)}
          >
            <Text
              style={[
                styles.tabLabel,
                { color: tab === t ? colors.primary : colors.textSecondary },
              ]}
            >
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </Text>
          </Pressable>
        ))}
      </View>

      {tab === "expenses" ? (
        <FlatList
          data={groupExpenses}
          keyExtractor={item => item.id}
          contentContainerStyle={[styles.listContent, { paddingBottom: Platform.OS === "web" ? 134 : 100 }]}
          ListEmptyComponent={
            <EmptyState
              icon="credit-card"
              title="No expenses yet"
              subtitle="Add your first expense to start splitting"
            />
          }
          renderItem={({ item }) => renderExpenseItem(item)}
          showsVerticalScrollIndicator={false}
        />
      ) : tab === "balances" ? (
        <View style={[styles.listContent, { paddingBottom: Platform.OS === "web" ? 134 : 100 }]}>
          {renderBalances()}
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={[styles.listContent, { paddingBottom: Platform.OS === "web" ? 134 : 100, gap: 16 }]}
          showsVerticalScrollIndicator={false}
        >
          <View style={[styles.chartCard, { backgroundColor: colors.surface }]}>
            <Text style={[styles.chartTitle, { color: colors.text }]}>Cumulative spending</Text>
            <Text style={[styles.chartSub, { color: colors.textSecondary }]}>
              Amount paid per person over time
            </Text>
            <LineChartSvg
              series={chartSeries}
              width={width - 64}
              height={220}
              formatY={v =>
                v >= 1000
                  ? `${v >= 10000 ? (v / 1000).toFixed(0) : (v / 1000).toFixed(1)}k`
                  : v.toFixed(0)
              }
              textColor={colors.textTertiary}
              gridColor={colors.border}
              legendTextColor={colors.textSecondary}
              emptyText="Add expenses to see spending trends"
            />
          </View>

          <View style={[styles.chartCard, { backgroundColor: colors.surface }]}>
            <Text style={[styles.chartTitle, { color: colors.text }]}>Per-member totals</Text>
            {group.memberIds.map(memberId => {
              const member = getMemberById(memberId);
              const paid = groupExpenses
                .filter(e => e.paidById === memberId)
                .reduce((s, e) => s + e.amount, 0);
              const pct = totalExpenses > 0 ? paid / totalExpenses : 0;
              if (!member) return null;
              return (
                <View key={memberId} style={styles.memberBar}>
                  <View style={styles.memberBarLabel}>
                    <View style={[styles.memberBarDot, { backgroundColor: member.avatarColor }]} />
                    <Text style={[styles.memberBarName, { color: colors.text }]}>
                      {member.isCurrentUser ? "You" : member.name.split(" ")[0]}
                    </Text>
                  </View>
                  <View style={[styles.memberBarTrack, { backgroundColor: colors.border }]}>
                    <View
                      style={[
                        styles.memberBarFill,
                        { backgroundColor: member.avatarColor, width: `${Math.max(pct * 100, paid > 0 ? 2 : 0)}%` as any },
                      ]}
                    />
                  </View>
                  <Text style={[styles.memberBarValue, { color: colors.textSecondary }]}>
                    {formatAmount(paid, group.currency)}
                  </Text>
                </View>
              );
            })}
          </View>
        </ScrollView>
      )}

      <Pressable
        style={[styles.fab, { backgroundColor: colors.primary }]}
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          router.push({ pathname: "/expense/new", params: { groupId: id } });
        }}
      >
        <Feather name="plus" size={24} color="#fff" />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingBottom: 12,
    gap: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  backBtn: { padding: 4 },
  headerCenter: { flex: 1, flexDirection: "row", alignItems: "center", gap: 8 },
  groupEmoji: { fontSize: 22 },
  groupName: { fontSize: 18, fontFamily: "Inter_700Bold", flex: 1 },
  statsBar: {
    flexDirection: "row",
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: 14,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  statItem: { flex: 1, alignItems: "center", paddingVertical: 12 },
  statLabel: { fontSize: 11, fontFamily: "Inter_400Regular", marginBottom: 2 },
  statValue: { fontSize: 16, fontFamily: "Inter_700Bold" },
  statDivider: { width: 1, marginVertical: 8 },
  members: {
    marginHorizontal: 16,
    marginTop: 10,
    borderRadius: 14,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  memberList: { paddingHorizontal: 14, paddingVertical: 12, gap: 12 },
  memberChip: { alignItems: "center", gap: 4, maxWidth: 52 },
  memberName: { fontSize: 11, fontFamily: "Inter_400Regular", textAlign: "center" },
  tabBar: {
    flexDirection: "row",
    marginTop: 10,
    borderBottomWidth: 1,
  },
  tabItem: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: 2,
    borderBottomColor: "transparent",
  },
  tabLabel: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  listContent: { padding: 16 },
  expenseRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    borderRadius: 16,
    marginBottom: 10,
    gap: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  expenseBody: { flex: 1 },
  expenseName: { fontSize: 15, fontFamily: "Inter_500Medium", marginBottom: 3 },
  expenseMeta: { fontSize: 12, fontFamily: "Inter_400Regular" },
  expenseRight: { alignItems: "flex-end" },
  expenseTotal: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  expenseNet: { fontSize: 12, fontFamily: "Inter_500Medium", marginTop: 2 },
  settledCard: {
    alignItems: "center",
    paddingVertical: 48,
    paddingHorizontal: 32,
    gap: 12,
  },
  settledIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  settledTitle: { fontSize: 18, fontFamily: "Inter_700Bold" },
  settledSub: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center" },
  debtCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    borderRadius: 16,
    marginBottom: 10,
    gap: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  debtBody: { flex: 1 },
  debtText: { fontSize: 14, fontFamily: "Inter_400Regular", lineHeight: 20 },
  debtAmount: { fontSize: 16, fontFamily: "Inter_700Bold", marginTop: 2 },
  settleBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
  },
  settleBtnText: { color: "#fff", fontSize: 13, fontFamily: "Inter_600SemiBold" },
  fab: {
    position: "absolute",
    bottom: Platform.OS === "web" ? 118 : 84,
    right: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 8,
  },
  chartCard: {
    borderRadius: 16,
    padding: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  chartTitle: { fontSize: 15, fontFamily: "Inter_600SemiBold", marginBottom: 2 },
  chartSub: { fontSize: 12, fontFamily: "Inter_400Regular", marginBottom: 14 },
  memberBar: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 12 },
  memberBarLabel: { width: 56, flexDirection: "row", alignItems: "center", gap: 6 },
  memberBarDot: { width: 8, height: 8, borderRadius: 4 },
  memberBarName: { fontSize: 12, fontFamily: "Inter_500Medium", flex: 1 },
  memberBarTrack: { flex: 1, height: 8, borderRadius: 4, overflow: "hidden" },
  memberBarFill: { height: 8, borderRadius: 4 },
  memberBarValue: { width: 64, textAlign: "right", fontSize: 12, fontFamily: "Inter_500Medium" },
});
