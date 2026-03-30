import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import React, { useMemo } from "react";
import {
  FlatList,
  Platform,
  Pressable,
  StyleSheet,
  Text,
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

export default function ActivityScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { expenses, settlements, getMemberById, getGroupById, currentUser } = useApp();

  const items: ActivityItem[] = useMemo(() => {
    const all: ActivityItem[] = [
      ...expenses.map(e => ({ type: "expense" as const, data: e })),
      ...settlements.map(s => ({ type: "settlement" as const, data: s })),
    ];
    return all.sort(
      (a, b) =>
        new Date(b.data.createdAt).getTime() - new Date(a.data.createdAt).getTime()
    );
  }, [expenses, settlements]);

  const topPad = Platform.OS === "web" ? 67 : insets.top;

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
        onPress={() =>
          router.push({ pathname: "/expense/[id]", params: { id: expense.id } })
        }
      >
        <CategoryIcon category={expense.category} size={40} />
        <View style={styles.cardBody}>
          <Text style={[styles.cardTitle, { color: colors.text }]} numberOfLines={1}>
            {expense.description}
          </Text>
          <Text style={[styles.cardMeta, { color: colors.textSecondary }]}>
            {youPaid ? "You" : payer?.name ?? "Someone"} paid •{" "}
            {group?.name} • {timeAgo(expense.createdAt)}
          </Text>
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

    return (
      <View style={[styles.card, { backgroundColor: colors.surface }]}>
        <View style={[styles.settlementIcon, { backgroundColor: colors.successLight }]}>
          <Feather name="check" size={20} color={colors.success} />
        </View>
        <View style={styles.cardBody}>
          <Text style={[styles.cardTitle, { color: colors.text }]} numberOfLines={1}>
            {isFromMe
              ? `You paid ${to?.name}`
              : isToMe
              ? `${from?.name} paid you`
              : `${from?.name} paid ${to?.name}`}
          </Text>
          <Text style={[styles.cardMeta, { color: colors.textSecondary }]}>
            {group?.name} • {timeAgo(settlement.createdAt)}
          </Text>
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
      <View style={[styles.header, { paddingTop: topPad + 16, backgroundColor: colors.headerBg }]}>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Activity</Text>
      </View>
      <FlatList
        data={items}
        keyExtractor={item =>
          item.type === "expense" ? `exp_${item.data.id}` : `set_${item.data.id}`
        }
        contentContainerStyle={[styles.listContent, { paddingBottom: Platform.OS === "web" ? 134 : 100 }]}
        ListEmptyComponent={
          <EmptyState
            icon="activity"
            title="No activity yet"
            subtitle="Add expenses to a group to see your activity here"
          />
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
    paddingHorizontal: 20,
    paddingBottom: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  headerTitle: { fontSize: 28, fontFamily: "Inter_700Bold" },
  listContent: { padding: 16 },
  card: {
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
  cardBody: { flex: 1 },
  cardTitle: { fontSize: 15, fontFamily: "Inter_500Medium", marginBottom: 3 },
  cardMeta: { fontSize: 12, fontFamily: "Inter_400Regular" },
  cardRight: { alignItems: "flex-end" },
  cardLabel: { fontSize: 10, fontFamily: "Inter_400Regular", marginBottom: 2 },
  cardAmount: { fontSize: 15, fontFamily: "Inter_700Bold" },
  settlementIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
});
