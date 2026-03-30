import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
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
import { AmountText, formatAmount } from "@/components/AmountText";
import { Avatar } from "@/components/Avatar";
import { EmptyState } from "@/components/EmptyState";
import { useApp } from "@/context/AppContext";
import { useTheme } from "@/hooks/useTheme";
import { timeAgo } from "@/utils/format";

function GroupCard({ groupId }: { groupId: string }) {
  const { colors } = useTheme();
  const { getGroupById, getMemberById, getGroupBalances, currentUser } = useApp();

  const group = getGroupById(groupId);
  if (!group) return null;

  const debts = getGroupBalances(groupId);
  const myDebt = debts.find(d => d.fromId === currentUser.id);
  const myCredit = debts.find(d => d.toId === currentUser.id);
  const netBalance = (myCredit?.amount ?? 0) - (myDebt?.amount ?? 0);
  const isSettled = Math.abs(netBalance) < 0.01;

  const otherMembers = group.memberIds
    .filter(id => id !== currentUser.id)
    .slice(0, 3)
    .map(id => getMemberById(id))
    .filter(Boolean);

  return (
    <Pressable
      style={({ pressed }) => [
        styles.groupCard,
        { backgroundColor: colors.cardBg, opacity: pressed ? 0.92 : 1 },
      ]}
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        router.push({ pathname: "/group/[id]", params: { id: groupId } });
      }}
    >
      <View style={styles.groupCardLeft}>
        <Text style={styles.groupEmoji}>{group.emoji}</Text>
        <View style={styles.groupInfo}>
          <Text style={[styles.groupName, { color: colors.text }]} numberOfLines={1}>
            {group.name}
          </Text>
          <View style={styles.avatarRow}>
            {otherMembers.map((m, i) =>
              m ? (
                <Avatar
                  key={m.id}
                  name={m.name}
                  color={m.avatarColor}
                  size={20}
                  style={{ marginRight: 4 }}
                />
              ) : null
            )}
            <Text style={[styles.memberCount, { color: colors.textSecondary }]}>
              {group.memberIds.length} people
            </Text>
          </View>
        </View>
      </View>
      <View style={styles.groupCardRight}>
        {isSettled ? (
          <Text style={[styles.settledLabel, { color: colors.textTertiary }]}>Settled</Text>
        ) : (
          <>
            <Text
              style={[
                styles.balanceLabel,
                { color: netBalance > 0 ? colors.positive : colors.negative },
              ]}
            >
              {netBalance > 0 ? "you are owed" : "you owe"}
            </Text>
            <AmountText
              amount={Math.abs(netBalance)}
              currency={group.currency}
              style={[
                styles.balanceAmount,
                { color: netBalance > 0 ? colors.positive : colors.negative },
              ]}
            />
          </>
        )}
      </View>
    </Pressable>
  );
}

export default function GroupsScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { groups, getTotalOwed } = useApp();
  const { youOwe, youAreOwed } = useMemo(() => getTotalOwed(), [getTotalOwed]);

  const activeGroups = groups.filter(g => !g.isArchived);

  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const bottomPad = Platform.OS === "web" ? 34 : 0;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topPad + 16, backgroundColor: colors.headerBg }]}>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Groups</Text>
        <Pressable
          style={[styles.addBtn, { backgroundColor: colors.primary }]}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            router.push("/group/new");
          }}
        >
          <Feather name="plus" size={20} color="#fff" />
        </Pressable>
      </View>

      {(youOwe > 0 || youAreOwed > 0) && (
        <View style={[styles.summaryBar, { backgroundColor: colors.surface }]}>
          {youOwe > 0 && (
            <View style={styles.summaryItem}>
              <Text style={[styles.summaryLabel, { color: colors.textSecondary }]}>You owe</Text>
              <Text style={[styles.summaryAmount, { color: colors.negative }]}>
                {formatAmount(youOwe)}
              </Text>
            </View>
          )}
          {youOwe > 0 && youAreOwed > 0 && (
            <View style={[styles.divider, { backgroundColor: colors.border }]} />
          )}
          {youAreOwed > 0 && (
            <View style={styles.summaryItem}>
              <Text style={[styles.summaryLabel, { color: colors.textSecondary }]}>
                You are owed
              </Text>
              <Text style={[styles.summaryAmount, { color: colors.positive }]}>
                {formatAmount(youAreOwed)}
              </Text>
            </View>
          )}
        </View>
      )}

      <FlatList
        data={activeGroups}
        keyExtractor={item => item.id}
        contentContainerStyle={[
          styles.listContent,
          { paddingBottom: bottomPad + 100 },
        ]}
        ListEmptyComponent={
          <EmptyState
            icon="users"
            title="No groups yet"
            subtitle="Create a group to start splitting expenses with friends"
          />
        }
        renderItem={({ item }) => <GroupCard groupId={item.id} />}
        showsVerticalScrollIndicator={false}
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
    paddingHorizontal: 20,
    paddingBottom: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  headerTitle: { fontSize: 28, fontFamily: "Inter_700Bold" },
  addBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
  },
  summaryBar: {
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
  summaryItem: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 14,
  },
  summaryLabel: { fontSize: 12, fontFamily: "Inter_500Medium", marginBottom: 2 },
  summaryAmount: { fontSize: 18, fontFamily: "Inter_700Bold" },
  divider: { width: 1, marginVertical: 10 },
  listContent: { padding: 16 },
  groupCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 16,
    borderRadius: 16,
    marginBottom: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  groupCardLeft: { flexDirection: "row", alignItems: "center", flex: 1, gap: 12 },
  groupEmoji: { fontSize: 28 },
  groupInfo: { flex: 1 },
  groupName: { fontSize: 16, fontFamily: "Inter_600SemiBold", marginBottom: 4 },
  avatarRow: { flexDirection: "row", alignItems: "center", gap: 2 },
  memberCount: { fontSize: 12, fontFamily: "Inter_400Regular", marginLeft: 2 },
  groupCardRight: { alignItems: "flex-end", minWidth: 80 },
  settledLabel: { fontSize: 13, fontFamily: "Inter_500Medium" },
  balanceLabel: { fontSize: 11, fontFamily: "Inter_400Regular", marginBottom: 2 },
  balanceAmount: { fontSize: 16, fontFamily: "Inter_700Bold" },
});
