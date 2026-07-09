import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import React, { useMemo } from "react";
import {
  FlatList,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AmountText, formatAmount } from "@/components/AmountText";
import { Avatar } from "@/components/Avatar";
import { EmptyState } from "@/components/EmptyState";
import { GroupInvitation, useApp } from "@/context/AppContext";
import { useTheme } from "@/hooks/useTheme";
import { timeAgo } from "@/utils/format";

function InviteCard({ invite }: { invite: GroupInvitation }) {
  const { colors } = useTheme();
  const { acceptInvitation, declineInvitation } = useApp();
  return (
    <View style={[styles.inviteCard, { backgroundColor: colors.surface, borderColor: colors.primary + "30" }]}>
      <View style={[styles.inviteAccent, { backgroundColor: colors.primary + "18" }]}>
        <Text style={styles.inviteEmoji}>{invite.groupEmoji}</Text>
      </View>
      <View style={styles.inviteInfo}>
        <Text style={[styles.inviteGroupName, { color: colors.text }]} numberOfLines={1}>
          {invite.groupName}
        </Text>
        <View style={styles.inviteMetaRow}>
          <View style={[styles.inviteAvatarDot, { backgroundColor: invite.inviterAvatarColor }]} />
          <Text style={[styles.inviteMeta, { color: colors.textSecondary }]}>
            {invite.inviterName} · {timeAgo(invite.createdAt)}
          </Text>
        </View>
      </View>
      <View style={styles.inviteActions}>
        <Pressable
          style={[styles.inviteBtn, styles.inviteDeclineBtn, { borderColor: colors.border }]}
          onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); declineInvitation(invite.id); }}
        >
          <Feather name="x" size={15} color={colors.textSecondary} />
        </Pressable>
        <Pressable
          style={[styles.inviteBtn, styles.inviteAcceptBtn, { backgroundColor: colors.primary }]}
          onPress={() => { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); acceptInvitation(invite.id); }}
        >
          <Feather name="check" size={14} color="#fff" />
          <Text style={[styles.inviteBtnText, { color: "#fff" }]}>Join</Text>
        </Pressable>
      </View>
    </View>
  );
}

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
  const accentColor = isSettled ? colors.border : netBalance > 0 ? colors.positive : colors.negative;

  const otherMembers = group.memberIds
    .filter(id => id !== currentUser.id)
    .slice(0, 4)
    .map(id => getMemberById(id))
    .filter(Boolean);

  return (
    <Pressable
      style={({ pressed }) => [
        styles.groupCard,
        { backgroundColor: colors.cardBg, opacity: pressed ? 0.93 : 1 },
      ]}
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        router.push({ pathname: "/group/[id]", params: { id: groupId } });
      }}
    >
      {/* Colored left accent */}
      <View style={[styles.cardAccent, { backgroundColor: accentColor }]} />

      <View style={styles.groupCardInner}>
        <View style={[styles.emojiWrap, { backgroundColor: accentColor + "18" }]}>
          <Text style={styles.groupEmoji}>{group.emoji}</Text>
        </View>

        <View style={styles.groupInfo}>
          <Text style={[styles.groupName, { color: colors.text }]} numberOfLines={1}>{group.name}</Text>
          <View style={styles.avatarRow}>
            {otherMembers.map(m =>
              m ? (
                <Avatar key={m.id} name={m.name} color={m.avatarColor} size={18} style={{ marginRight: -4 }} />
              ) : null
            )}
            <Text style={[styles.memberCount, { color: colors.textSecondary }]}>
              {" "}{group.memberIds.length} {group.memberIds.length === 1 ? "person" : "people"}
            </Text>
          </View>
        </View>

        <View style={styles.groupCardRight}>
          {isSettled ? (
            <View style={[styles.settledPill, { backgroundColor: colors.successLight }]}>
              <Feather name="check" size={11} color={colors.success} />
              <Text style={[styles.settledLabel, { color: colors.success }]}>Settled</Text>
            </View>
          ) : (
            <>
              <Text style={[styles.balanceLabel, { color: netBalance > 0 ? colors.positive : colors.negative }]}>
                {netBalance > 0 ? "owed to you" : "you owe"}
              </Text>
              <AmountText
                amount={Math.abs(netBalance)}
                currency={group.currency}
                style={[styles.balanceAmount, { color: netBalance > 0 ? colors.positive : colors.negative }]}
              />
            </>
          )}
        </View>
      </View>
    </Pressable>
  );
}

export default function GroupsScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { groups, getTotalOwed, getPendingInvitesForCurrentUser, currentUser } = useApp();
  const { youOwe, youAreOwed, currency: totalCurrency } = useMemo(() => getTotalOwed(), [getTotalOwed]);

  const activeGroups = groups.filter(g => !g.isArchived);
  const pendingInvites = getPendingInvitesForCurrentUser();
  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const bottomPad = Platform.OS === "web" ? 34 : 0;
  const netBalance = youAreOwed - youOwe;
  const hasBalance = youOwe > 0 || youAreOwed > 0;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: topPad + 14, backgroundColor: colors.headerBg }]}>
        <View style={styles.headerLeft}>
          <Text style={[styles.headerTitle, { color: colors.text }]}>Groups</Text>
          {pendingInvites.length > 0 && (
            <View style={[styles.badge, { backgroundColor: colors.primary }]}>
              <Text style={styles.badgeText}>{pendingInvites.length}</Text>
            </View>
          )}
        </View>
        <Pressable
          style={[styles.addBtn, { backgroundColor: colors.primary }]}
          onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); router.push("/group/new"); }}
        >
          <Feather name="plus" size={22} color="#fff" />
        </Pressable>
      </View>

      <FlatList
        data={activeGroups}
        keyExtractor={item => item.id}
        contentContainerStyle={[styles.listContent, { paddingBottom: bottomPad + 100 }]}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          <>
            {/* Hero balance card */}
            {hasBalance && (
              <View style={[styles.heroCard, { backgroundColor: colors.surface }]}>
                <View style={styles.heroRow}>
                  {youAreOwed > 0 && (
                    <View style={styles.heroItem}>
                      <View style={[styles.heroIconWrap, { backgroundColor: colors.successLight }]}>
                        <Feather name="arrow-down-left" size={16} color={colors.positive} />
                      </View>
                      <Text style={[styles.heroLabel, { color: colors.textSecondary }]}>You are owed</Text>
                      <Text style={[styles.heroAmount, { color: colors.positive }]}>
                        {formatAmount(youAreOwed, totalCurrency)}
                      </Text>
                    </View>
                  )}
                  {youOwe > 0 && youAreOwed > 0 && (
                    <View style={[styles.heroDivider, { backgroundColor: colors.border }]} />
                  )}
                  {youOwe > 0 && (
                    <View style={styles.heroItem}>
                      <View style={[styles.heroIconWrap, { backgroundColor: colors.dangerLight }]}>
                        <Feather name="arrow-up-right" size={16} color={colors.negative} />
                      </View>
                      <Text style={[styles.heroLabel, { color: colors.textSecondary }]}>You owe</Text>
                      <Text style={[styles.heroAmount, { color: colors.negative }]}>
                        {formatAmount(youOwe, totalCurrency)}
                      </Text>
                    </View>
                  )}
                </View>
                {youOwe > 0 && youAreOwed > 0 && (
                  <View style={[styles.heroNetRow, { borderTopColor: colors.border }]}>
                    <Text style={[styles.heroNetLabel, { color: colors.textSecondary }]}>Net balance</Text>
                    <Text style={[styles.heroNetAmount, { color: netBalance >= 0 ? colors.positive : colors.negative }]}>
                      {netBalance >= 0 ? "+" : ""}{formatAmount(Math.abs(netBalance), totalCurrency)}
                    </Text>
                  </View>
                )}
              </View>
            )}

            {/* Pending invites */}
            {pendingInvites.length > 0 && (
              <View style={styles.invitesSection}>
                <View style={styles.invitesSectionHeader}>
                  <View style={[styles.invitesPill, { backgroundColor: colors.primary + "18" }]}>
                    <Feather name="mail" size={12} color={colors.primary} />
                    <Text style={[styles.invitesSectionTitle, { color: colors.primary }]}>
                      {pendingInvites.length} pending {pendingInvites.length === 1 ? "invite" : "invites"}
                    </Text>
                  </View>
                </View>
                {pendingInvites.map(invite => (
                  <InviteCard key={invite.id} invite={invite} />
                ))}
              </View>
            )}

            {/* Groups section label */}
            {activeGroups.length > 0 && (
              <View style={styles.sectionLabelRow}>
                <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>
                  {activeGroups.length} {activeGroups.length === 1 ? "group" : "groups"}
                </Text>
              </View>
            )}
          </>
        }
        ListEmptyComponent={
          pendingInvites.length === 0 ? (
            <EmptyState
              icon="users"
              title="No groups yet"
              subtitle="Create a group to start splitting expenses with friends"
            />
          ) : null
        }
        renderItem={({ item }) => <GroupCard groupId={item.id} />}
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
    paddingBottom: 18,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 3,
  },
  headerLeft: { flexDirection: "row", alignItems: "center", gap: 9 },
  headerTitle: { fontSize: 30, fontFamily: "Inter_700Bold", letterSpacing: -0.5 },
  badge: {
    minWidth: 22, height: 22, borderRadius: 11,
    alignItems: "center", justifyContent: "center", paddingHorizontal: 5,
  },
  badgeText: { fontSize: 11, fontFamily: "Inter_700Bold", color: "#fff" },
  addBtn: {
    width: 40, height: 40, borderRadius: 20,
    alignItems: "center", justifyContent: "center",
    shadowColor: "#000", shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15, shadowRadius: 4, elevation: 3,
  },
  listContent: { padding: 16, gap: 2 },

  heroCard: {
    borderRadius: 18, marginBottom: 16, overflow: "hidden",
    shadowColor: "#000", shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.08, shadowRadius: 12, elevation: 3,
  },
  heroRow: { flexDirection: "row", paddingVertical: 6 },
  heroItem: { flex: 1, alignItems: "center", paddingVertical: 16, paddingHorizontal: 12 },
  heroIconWrap: {
    width: 34, height: 34, borderRadius: 10,
    alignItems: "center", justifyContent: "center", marginBottom: 8,
  },
  heroLabel: { fontSize: 11, fontFamily: "Inter_500Medium", marginBottom: 4 },
  heroAmount: { fontSize: 22, fontFamily: "Inter_700Bold", letterSpacing: -0.5 },
  heroDivider: { width: 1, marginVertical: 16, alignSelf: "stretch" },
  heroNetRow: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 18, paddingVertical: 10, borderTopWidth: 1,
  },
  heroNetLabel: { fontSize: 12, fontFamily: "Inter_500Medium" },
  heroNetAmount: { fontSize: 14, fontFamily: "Inter_700Bold" },

  invitesSection: { marginBottom: 12 },
  invitesSectionHeader: { marginBottom: 10 },
  invitesPill: {
    flexDirection: "row", alignItems: "center", gap: 5,
    alignSelf: "flex-start", paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20,
  },
  invitesSectionTitle: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  inviteCard: {
    flexDirection: "row", alignItems: "center", gap: 12,
    borderRadius: 16, padding: 14, marginBottom: 8, borderWidth: 1,
    shadowColor: "#000", shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05, shadowRadius: 8, elevation: 2,
  },
  inviteAccent: {
    width: 48, height: 48, borderRadius: 14,
    alignItems: "center", justifyContent: "center", flexShrink: 0,
  },
  inviteEmoji: { fontSize: 24 },
  inviteInfo: { flex: 1 },
  inviteGroupName: { fontSize: 15, fontFamily: "Inter_600SemiBold", marginBottom: 3 },
  inviteMetaRow: { flexDirection: "row", alignItems: "center", gap: 5 },
  inviteAvatarDot: { width: 7, height: 7, borderRadius: 3.5 },
  inviteMeta: { fontSize: 12, fontFamily: "Inter_400Regular" },
  inviteActions: { flexDirection: "row", gap: 7 },
  inviteBtn: {
    height: 36, borderRadius: 10,
    alignItems: "center", justifyContent: "center",
    flexDirection: "row", gap: 4,
  },
  inviteDeclineBtn: { width: 36, borderWidth: 1 },
  inviteAcceptBtn: { paddingHorizontal: 14 },
  inviteBtnText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },

  sectionLabelRow: { flexDirection: "row", alignItems: "center", marginBottom: 8, marginTop: 2 },
  sectionLabel: { fontSize: 12, fontFamily: "Inter_600SemiBold", textTransform: "uppercase", letterSpacing: 0.8 },

  groupCard: {
    flexDirection: "row", borderRadius: 18, marginBottom: 10, overflow: "hidden",
    shadowColor: "#000", shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07, shadowRadius: 10, elevation: 3,
  },
  cardAccent: { width: 4 },
  groupCardInner: { flex: 1, flexDirection: "row", alignItems: "center", padding: 14, gap: 12 },
  emojiWrap: {
    width: 50, height: 50, borderRadius: 15,
    alignItems: "center", justifyContent: "center", flexShrink: 0,
  },
  groupEmoji: { fontSize: 26 },
  groupInfo: { flex: 1 },
  groupName: { fontSize: 16, fontFamily: "Inter_600SemiBold", marginBottom: 5, letterSpacing: -0.2 },
  avatarRow: { flexDirection: "row", alignItems: "center" },
  memberCount: { fontSize: 12, fontFamily: "Inter_400Regular" },
  groupCardRight: { alignItems: "flex-end", minWidth: 88 },
  settledPill: {
    flexDirection: "row", alignItems: "center", gap: 4,
    paddingHorizontal: 8, paddingVertical: 4, borderRadius: 10,
  },
  settledLabel: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  balanceLabel: { fontSize: 11, fontFamily: "Inter_400Regular", marginBottom: 2, textAlign: "right" },
  balanceAmount: { fontSize: 17, fontFamily: "Inter_700Bold", letterSpacing: -0.3, textAlign: "right" },
});
