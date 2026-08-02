import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  FlatList,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { scrollRegistry } from "@/hooks/scrollRegistry";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AmountText, formatAmount } from "@/components/AmountText";
import { Avatar } from "@/components/Avatar";
import { EmptyState } from "@/components/EmptyState";
import { GroupInvitation, useApp } from "@/context/AppContext";
import { api } from "@/services/apiSync";
import { useTheme } from "@/hooks/useTheme";
import { timeAgo } from "@/utils/format";

function BalanceBreakdownModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { colors } = useTheme();
  const { groups, getGroupBalances, getMemberById, currentUser, convertCurrency, exchangeRates } = useApp();
  const insets = useSafeAreaInsets();
  const [expandedGroupId, setExpandedGroupId] = useState<string | null>(null);
  const ratesAvailable = Object.keys(exchangeRates).length > 0;

  const breakdown = useMemo(() => {
    return groups
      .filter(g => !g.isArchived)
      .map(g => {
        const debts = getGroupBalances(g.id);
        const creditRelations = debts.filter(d => d.toId === currentUser.id);
        const debtRelations = debts.filter(d => d.fromId === currentUser.id);
        const youAreOwed = creditRelations.reduce((s, d) => s + d.amount, 0);
        const youOwe = debtRelations.reduce((s, d) => s + d.amount, 0);
        const net = youAreOwed - youOwe;
        return { group: g, net, youAreOwed, youOwe, debts };
      })
      .filter(r => Math.abs(r.net) > 0.005);
  }, [groups, getGroupBalances, currentUser.id]);

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={bsStyles.backdrop} onPress={onClose} />
      <View style={[bsStyles.sheet, { backgroundColor: colors.surface, paddingBottom: insets.bottom + 16 }]}>
        <View style={[bsStyles.sheetHeader, { borderBottomColor: colors.border }]}>
          <View style={[bsStyles.handle, { backgroundColor: colors.border }]} />
          <Text style={[bsStyles.sheetTitle, { color: colors.text }]}>Balance Breakdown</Text>
          {!ratesAvailable && (
            <Text style={[bsStyles.ratesNote, { color: colors.textTertiary }]}>
              ≈ Using 1:1 rates (no connection)
            </Text>
          )}
          <Pressable style={bsStyles.closeBtn} onPress={onClose}>
            <Feather name="x" size={18} color={colors.textSecondary} />
          </Pressable>
        </View>

        <ScrollView showsVerticalScrollIndicator={false} style={bsStyles.scroll}>
          {breakdown.map(({ group, net, debts }) => {
            const isExpanded = expandedGroupId === group.id;
            const isPositive = net >= 0;
            return (
              <View key={group.id}>
                <Pressable
                  style={[bsStyles.groupRow, { borderBottomColor: colors.border }]}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    setExpandedGroupId(isExpanded ? null : group.id);
                  }}
                >
                  <View style={[bsStyles.groupEmojiWrap, { backgroundColor: (isPositive ? colors.positive : colors.negative) + "18" }]}>
                    <Text style={bsStyles.groupEmoji}>{group.emoji}</Text>
                  </View>
                  <View style={bsStyles.groupInfo}>
                    <Text style={[bsStyles.groupName, { color: colors.text }]} numberOfLines={1}>{group.name}</Text>
                    <Text style={[bsStyles.groupSub, { color: colors.textSecondary }]}>
                      {isPositive ? "Owed to you" : "You owe"} · {debts.filter(d => d.toId === currentUser.id || d.fromId === currentUser.id).length} {debts.length === 1 ? "person" : "people"}
                    </Text>
                  </View>
                  <View style={bsStyles.groupRight}>
                    <Text style={[bsStyles.groupAmount, { color: isPositive ? colors.positive : colors.negative }]}>
                      {isPositive ? "+" : "-"}{formatAmount(Math.abs(net), group.currency)}
                    </Text>
                    <Feather name={isExpanded ? "chevron-up" : "chevron-down"} size={14} color={colors.textTertiary} style={{ marginTop: 3 }} />
                  </View>
                </Pressable>

                {isExpanded && debts
                  .filter(d => d.toId === currentUser.id || d.fromId === currentUser.id)
                  .map((d, i) => {
                    const isOwedToMe = d.toId === currentUser.id;
                    const other = getMemberById(isOwedToMe ? d.fromId : d.toId);
                    return (
                      <Pressable
                        key={i}
                        style={[bsStyles.memberRow, { backgroundColor: colors.inputBg, borderBottomColor: colors.border }]}
                        onPress={() => { onClose(); router.push({ pathname: "/group/[id]", params: { id: group.id } }); }}
                      >
                        <View style={[bsStyles.memberAvatar, { backgroundColor: other?.avatarColor ?? colors.border }]}>
                          <Text style={bsStyles.memberInitial}>{(other?.name ?? "?")[0].toUpperCase()}</Text>
                        </View>
                        <Text style={[bsStyles.memberName, { color: colors.textSecondary }]}>
                          {isOwedToMe ? (other?.name ?? "?") + " owes you" : "You owe " + (other?.name ?? "?")}
                        </Text>
                        <Text style={[bsStyles.memberAmount, { color: isOwedToMe ? colors.positive : colors.negative }]}>
                          {formatAmount(d.amount, group.currency)}
                        </Text>
                      </Pressable>
                    );
                  })}
              </View>
            );
          })}

          {breakdown.length === 0 && (
            <View style={bsStyles.emptyState}>
              <Feather name="check-circle" size={32} color={colors.success} />
              <Text style={[bsStyles.emptyText, { color: colors.textSecondary }]}>All settled up!</Text>
            </View>
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}

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

function GroupCard({ groupId, query }: { groupId: string; query: string }) {
  const { colors } = useTheme();
  const { getGroupById, getMemberById, getGroupBalances, currentUser, syncStatus, isOffline, recurringExpenses } = useApp();
  const group = getGroupById(groupId);
  if (!group) return null;

  const showSyncWarning = isOffline || syncStatus === "error";

  // Find the nearest active recurring expense for this group
  const nextRecurring = recurringExpenses
    .filter(r => r.isActive && r.groupId === groupId)
    .sort((a, b) => new Date(a.nextDueAt).getTime() - new Date(b.nextDueAt).getTime())[0];
  const daysUntilRecurring = nextRecurring
    ? Math.ceil((new Date(nextRecurring.nextDueAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
    : null;

  const debts = getGroupBalances(groupId);
  const totalCredit = debts.filter(d => d.toId === currentUser.id).reduce((s, d) => s + d.amount, 0);
  const totalDebt = debts.filter(d => d.fromId === currentUser.id).reduce((s, d) => s + d.amount, 0);
  const netBalance = totalCredit - totalDebt;
  const isSettled = Math.abs(netBalance) < 0.01;
  const accentColor = isSettled ? colors.border : netBalance > 0 ? colors.positive : colors.negative;

  const otherMembers = group.memberIds
    .filter(id => id !== currentUser.id)
    .slice(0, 4)
    .map(id => getMemberById(id))
    .filter(Boolean);

  function highlight(text: string) {
    if (!query) return <Text style={[styles.groupName, { color: colors.text }]} numberOfLines={1}>{text}</Text>;
    const idx = text.toLowerCase().indexOf(query.toLowerCase());
    if (idx === -1) return <Text style={[styles.groupName, { color: colors.text }]} numberOfLines={1}>{text}</Text>;
    return (
      <Text style={[styles.groupName, { color: colors.text }]} numberOfLines={1}>
        {text.slice(0, idx)}
        <Text style={{ backgroundColor: colors.primary + "30", color: colors.primary }}>{text.slice(idx, idx + query.length)}</Text>
        {text.slice(idx + query.length)}
      </Text>
    );
  }

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
      <View style={[styles.cardAccent, { backgroundColor: accentColor }]} />
      <View style={styles.groupCardInner}>
        <View style={[styles.emojiWrap, { backgroundColor: accentColor + "18" }]}>
          <Text style={styles.groupEmoji}>{group.emoji}</Text>
        </View>
        <View style={styles.groupInfo}>
          {highlight(group.name)}
          <View style={styles.avatarRow}>
            {otherMembers.map(m =>
              m ? <Avatar key={m.id} name={m.name} color={m.avatarColor} size={18} imageUri={m.photo} style={{ marginRight: -4 }} /> : null
            )}
            <Text style={[styles.memberCount, { color: colors.textSecondary }]}>
              {" "}{group.memberIds.length} {group.memberIds.length === 1 ? "person" : "people"}
            </Text>
            {daysUntilRecurring !== null && (
              <View style={{ flexDirection: "row", alignItems: "center", marginLeft: 6 }}>
                <Feather name="repeat" size={10} color={daysUntilRecurring <= 1 ? colors.danger : daysUntilRecurring <= 3 ? colors.warning : colors.textTertiary} />
                <Text style={{ fontSize: 10, color: daysUntilRecurring <= 1 ? colors.danger : daysUntilRecurring <= 3 ? colors.warning : colors.textTertiary, marginLeft: 2, fontWeight: "500" }}>
                  {daysUntilRecurring <= 0 ? "due today" : daysUntilRecurring === 1 ? "tmrw" : `${daysUntilRecurring}d`}
                </Text>
              </View>
            )}
          </View>
        </View>
        <View style={styles.groupCardRight}>
          {showSyncWarning && (
            <Feather name="wifi-off" size={12} color={colors.warning} style={{ marginBottom: 4 }} />
          )}
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
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const { groups, expenses, settlements, recurringExpenses, getTotalOwed, getPendingInvitesForCurrentUser, getMemberById, getGroupBalances, convertCurrency, currentUser, unarchiveGroup, checkAndAddRecurring, fetchExchangeRates } = useApp();
  const { youOwe, youAreOwed, currency: totalCurrency } = useMemo(() => getTotalOwed(), [getTotalOwed]);

  const [refreshing, setRefreshing] = useState(false);
  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    checkAndAddRecurring();
    await fetchExchangeRates().catch(() => {});
    setRefreshing(false);
  }, [checkAndAddRecurring, fetchExchangeRates]);

  const { retrySync } = useApp();
  const [seeding, setSeeding] = useState(false);
  const handleSeedData = useCallback(async () => {
    setSeeding(true);
    try {
      await api.seedDemoData();
      await retrySync();
    } catch {
      // Silent — user can pull-to-refresh manually
    } finally {
      setSeeding(false);
    }
  }, [retrySync]);

  const [query, setQuery] = useState("");
  const [showBreakdown, setShowBreakdown] = useState(false);
  const [showSort, setShowSort] = useState(false);
  const [sortBy, setSortBy] = useState<"balance" | "name" | "recent" | "activity">("balance");
  const listRef = useRef<FlatList>(null);
  useEffect(() => {
    scrollRegistry.register("index", () => {
      listRef.current?.scrollToOffset({ offset: 0, animated: true });
    });
    return () => scrollRegistry.unregister("index");
  }, []);
  const searchRef = useRef<TextInput>(null);

  const archivedGroups = groups.filter(g => g.isArchived);
  const [lifecycleTab, setLifecycleTab] = useState<"active" | "ended" | "settled" | "archived">("active");

  const { activeGroups, endedGroups, settledGroups } = useMemo(() => {
    const nonArchived = groups.filter(g => !g.isArchived);
    const settled = nonArchived.filter(g => getGroupBalances(g.id).length === 0 && expenses.some(e => e.groupId === g.id));
    const settledIds = new Set(settled.map(g => g.id));
    const ended = nonArchived.filter(g => !!g.isEnded && !settledIds.has(g.id));
    const endedIds = new Set(ended.map(g => g.id));
    const active = nonArchived.filter(g => !g.isEnded && !settledIds.has(g.id));
    return { activeGroups: active, endedGroups: ended, settledGroups: settled };
  }, [groups, getGroupBalances, expenses]);
  const pendingInvites = getPendingInvitesForCurrentUser();
  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const bottomPad = Platform.OS === "web" ? 34 : 0;
  const netBalance = youAreOwed - youOwe;
  const hasBalance = youOwe > 0 || youAreOwed > 0;
  const isSearching = query.trim().length > 0;

  const filteredGroups = useMemo(() => {
    // When searching, search across all non-archived groups
    if (isSearching) {
      const q = query.toLowerCase().trim();
      return [...activeGroups, ...endedGroups, ...settledGroups].filter(g => {
        if (g.name.toLowerCase().includes(q)) return true;
        return g.memberIds.some(id => getMemberById(id)?.name.toLowerCase().includes(q));
      });
    }

    // Pick the correct bucket
    let list: typeof activeGroups = [];
    switch (lifecycleTab) {
      case "active":  list = [...activeGroups]; break;
      case "ended":   list = [...endedGroups]; break;
      case "settled": list = [...settledGroups]; break;
      case "archived": list = [...archivedGroups]; break;
    }

    // Apply sort only to active tab
    if (lifecycleTab === "active") {
      if (sortBy === "name") {
        list.sort((a, b) => a.name.localeCompare(b.name));
      } else if (sortBy === "recent") {
        const lastActivity = (g: typeof list[0]) => {
          const dates = [
            new Date(g.createdAt).getTime(),
            ...expenses.filter(e => e.groupId === g.id).map(e => new Date(e.createdAt).getTime()),
            ...settlements.filter(s => s.groupId === g.id).map(s => new Date(s.createdAt).getTime()),
          ];
          return Math.max(...dates);
        };
        list.sort((a, b) => lastActivity(b) - lastActivity(a));
      } else if (sortBy === "activity") {
        const lastTxn = (g: typeof list[0]) => {
          const dates = [
            ...expenses.filter(e => e.groupId === g.id).map(e => new Date(e.createdAt).getTime()),
            ...settlements.filter(s => s.groupId === g.id).map(s => new Date(s.createdAt).getTime()),
          ];
          return dates.length > 0 ? Math.max(...dates) : 0;
        };
        list.sort((a, b) => lastTxn(b) - lastTxn(a));
      } else {
        list.sort((a, b) => {
          const netFor = (g: typeof a) => {
            const d = getGroupBalances(g.id);
            const credit = d.filter(r => r.toId === currentUser.id).reduce((s, r) => s + convertCurrency(r.amount, g.currency), 0);
            const debt = d.filter(r => r.fromId === currentUser.id).reduce((s, r) => s + convertCurrency(r.amount, g.currency), 0);
            return credit - debt;
          };
          return Math.abs(netFor(b)) - Math.abs(netFor(a));
        });
      }
    }
    return list;
  }, [activeGroups, endedGroups, settledGroups, archivedGroups, lifecycleTab, query, isSearching, getMemberById, sortBy, getGroupBalances, convertCurrency, currentUser.id, expenses, settlements]);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: topPad + 14, backgroundColor: colors.headerBg }]}>
        <View style={styles.headerTopRow}>
          <Text style={[styles.headerTitle, { color: colors.text }]}>
            Groups
            {pendingInvites.length > 0 && !isSearching && (
              <Text style={[styles.headerTitle, { color: colors.primary }]}> ·</Text>
            )}
          </Text>
          {pendingInvites.length > 0 && !isSearching && (
            <View style={[styles.badge, { backgroundColor: colors.primary }]}>
              <Text style={styles.badgeText}>{pendingInvites.length}</Text>
            </View>
          )}
          <View style={{ flex: 1 }} />
          <Pressable
            style={[styles.headerIconBtn, { backgroundColor: colors.surface }]}
            onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); router.push("/recurring"); }}
          >
            <Feather name="repeat" size={19} color={colors.textSecondary} />
          </Pressable>
          <Pressable
            style={[styles.addBtn, { backgroundColor: colors.primary, shadowColor: colors.primary }]}
            onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); router.push("/group/new"); }}
          >
            <Feather name="plus" size={22} color="#fff" />
          </Pressable>
        </View>

        {/* Search bar */}
        <View style={[styles.searchBar, { backgroundColor: colors.surface, borderColor: isSearching ? colors.primary : "transparent" }]}>
          <Feather name="search" size={16} color={isSearching ? colors.primary : colors.textTertiary} />
          <TextInput
            ref={searchRef}
            style={[styles.searchInput, { color: colors.text }]}
            placeholder="Search groups or members…"
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

        {/* Lifecycle tab strip */}
        {!isSearching && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.lifecycleTabRow}
          >
            {(([
              { id: "active",   label: "Active",   count: activeGroups.length   },
              { id: "ended",    label: "Ended",    count: endedGroups.length    },
              { id: "settled",  label: "Settled",  count: settledGroups.length  },
              { id: "archived", label: "Archived", count: archivedGroups.length },
            ] as { id: "active" | "ended" | "settled" | "archived"; label: string; count: number }[])).map(tab => {
              const active = lifecycleTab === tab.id;
              return (
                <Pressable
                  key={tab.id}
                  style={[
                    styles.lifecycleTab,
                    {
                      backgroundColor: active ? colors.primary : colors.surface,
                      borderColor: active ? colors.primary : colors.border,
                    },
                  ]}
                  onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setLifecycleTab(tab.id); }}
                >
                  <Text style={[styles.lifecycleTabLabel, { color: active ? "#fff" : colors.text }]}>
                    {tab.label}
                  </Text>
                  {tab.count > 0 && (
                    <View style={[styles.lifecycleTabBadge, { backgroundColor: active ? "rgba(255,255,255,0.25)" : colors.primary + "20" }]}>
                      <Text style={[styles.lifecycleTabBadgeText, { color: active ? "#fff" : colors.primary }]}>
                        {tab.count}
                      </Text>
                    </View>
                  )}
                </Pressable>
              );
            })}
          </ScrollView>
        )}
      </View>


      <FlatList
        ref={listRef}
        data={filteredGroups}
        keyExtractor={item => item.id}
        contentContainerStyle={[styles.listContent, { paddingBottom: bottomPad + 100 }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={colors.primary}
            colors={[colors.primary]}
          />
        }
        ListHeaderComponent={
          isSearching ? (
            /* Search mode: just show result count */
            <View style={styles.searchResultHeader}>
              <Text style={[styles.searchResultText, { color: colors.textSecondary }]}>
                {filteredGroups.length === 0
                  ? "No groups match"
                  : `${filteredGroups.length} group${filteredGroups.length !== 1 ? "s" : ""} found`}
              </Text>
            </View>
          ) : (
            <>
              {/* Hero balance card — gradient */}
              {hasBalance && (() => {
                const isPositive = netBalance >= 0;
                const gradColors: [string, string, string] = isPositive
                  ? isDark
                    ? [colors.surfaceElevated, colors.primaryDark, colors.primaryDark]
                    : [colors.primary, "#0EA5E9", colors.teal]
                  : isDark
                    ? ["#2A0E0E", "#3D1515", "#3D1515"]
                    : [colors.danger, "#DC2626", "#991B1B"];
                return (
                  <Pressable
                    onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setShowBreakdown(true); }}
                    style={({ pressed }) => ({ opacity: pressed ? 0.92 : 1 })}
                  >
                    <LinearGradient
                      colors={gradColors}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={styles.heroCard}
                    >
                      {/* Decorative circles */}
                      <View style={styles.heroCircle1} />
                      <View style={styles.heroCircle2} />

                      <View style={styles.heroDotRow}>
                        <View style={styles.heroDot} />
                        <Text style={styles.heroLabelWhite}>
                          {youOwe > 0 && youAreOwed > 0 ? "Your net balance" : youAreOwed > 0 ? "You are owed" : "You owe"}
                        </Text>
                      </View>
                      <Text style={styles.heroAmountWhite}>
                        {formatAmount(Math.abs(netBalance), totalCurrency)}
                      </Text>

                      {/* Breakdown pills when both owed and owe */}
                      {youOwe > 0 && youAreOwed > 0 && (
                        <View style={styles.heroPillRow}>
                          <View style={styles.heroPill}>
                            <Feather name="arrow-down-left" size={11} color="rgba(255,255,255,0.9)" />
                            <Text style={styles.heroPillText}>{formatAmount(youAreOwed, totalCurrency)}</Text>
                          </View>
                          <View style={styles.heroPill}>
                            <Feather name="arrow-up-right" size={11} color="rgba(255,255,255,0.9)" />
                            <Text style={styles.heroPillText}>{formatAmount(youOwe, totalCurrency)}</Text>
                          </View>
                        </View>
                      )}

                      {/* Tap hint */}
                      <View style={styles.heroTapHint}>
                        <Text style={styles.heroTapHintText}>See breakdown</Text>
                        <Feather name="chevron-right" size={12} color="rgba(255,255,255,0.7)" />
                      </View>
                    </LinearGradient>
                  </Pressable>
                );
              })()}

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

              {/* Recurring expenses quick-access */}
              {lifecycleTab === "active" && (() => {
                const activeCount = recurringExpenses.filter(r => r.isActive).length;
                const totalCount = recurringExpenses.length;
                if (totalCount === 0) return (
                  <Pressable
                    style={[styles.recurringBanner, { backgroundColor: colors.surface, borderColor: colors.border }]}
                    onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); router.push("/recurring"); }}
                  >
                    <View style={[styles.recurringIconWrap, { backgroundColor: colors.tealTint }]}>
                      <Feather name="repeat" size={15} color={colors.teal} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.recurringBannerTitle, { color: colors.text }]}>Recurring Expenses</Text>
                      <Text style={[styles.recurringBannerSub, { color: colors.textTertiary }]}>Automate regular splits</Text>
                    </View>
                    <Feather name="chevron-right" size={16} color={colors.textTertiary} />
                  </Pressable>
                );
                // Find the next due schedule
                const active = recurringExpenses.filter(r => r.isActive).sort((a, b) => new Date(a.nextDueAt).getTime() - new Date(b.nextDueAt).getTime());
                const next = active[0];
                const nextLabel = next ? (() => {
                  const d = new Date(next.nextDueAt);
                  const now = new Date();
                  const diffMs = d.getTime() - now.getTime();
                  const diffDays = Math.ceil(diffMs / 86400000);
                  if (diffDays <= 0) return "Due today";
                  if (diffDays === 1) return "Due tomorrow";
                  if (diffDays <= 7) return `Due in ${diffDays}d`;
                  return `Due ${d.toLocaleDateString(undefined, { month: "short", day: "numeric" })}`;
                })() : null;
                return (
                  <Pressable
                    style={[styles.recurringBanner, { backgroundColor: colors.surface, borderColor: colors.teal + "30" }]}
                    onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); router.push("/recurring"); }}
                  >
                    <View style={[styles.recurringIconWrap, { backgroundColor: colors.tealTint }]}>
                      <Feather name="repeat" size={15} color={colors.teal} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.recurringBannerTitle, { color: colors.text }]}>
                        {activeCount} active {activeCount === 1 ? "schedule" : "schedules"}
                        {totalCount > activeCount ? <Text style={{ color: colors.textTertiary }}> · {totalCount - activeCount} paused</Text> : null}
                      </Text>
                      {nextLabel && (
                        <Text style={[styles.recurringBannerSub, { color: colors.textTertiary }]}>
                          {(() => { const g = groups.find(gr => gr.id === next.groupId); return g ? `${g.emoji} ${g.name} · ` : ""; })()}{next.description} · {nextLabel}
                        </Text>
                      )}
                    </View>
                    <Feather name="chevron-right" size={16} color={colors.textTertiary} />
                  </Pressable>
                );
              })()}

              {/* Section label */}
              {activeGroups.length > 0 && (
                <View style={styles.sectionLabelRow}>
                  <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>
                    {activeGroups.length} {activeGroups.length === 1 ? "group" : "groups"}
                  </Text>
                  <Pressable
                    style={[styles.sectionSortBtn, { backgroundColor: colors.primary + "14" }]}
                    onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setShowSort(true); }}
                  >
                    <Feather name="sliders" size={11} color={colors.primary} />
                    <Text style={[styles.sectionSort, { color: colors.primary }]}>
                      {sortBy === "balance" ? "Balance" : sortBy === "name" ? "Name" : sortBy === "recent" ? "Recent" : "Activity"}
                    </Text>
                  </Pressable>
                </View>
              )}
            </>
          )
        }
        ListEmptyComponent={
          isSearching ? (
            <View style={styles.searchResultHeader}>
              <Text style={[styles.searchResultText, { color: colors.textSecondary }]}>No groups match</Text>
            </View>
          ) : lifecycleTab === "active" ? (
            pendingInvites.length === 0 ? (
              <View style={{ alignItems: "center" }}>
                <EmptyState
                  icon="users"
                  title="No active groups"
                  subtitle="Create a group to start splitting expenses with friends"
                />
                <Pressable
                  onPress={handleSeedData}
                  disabled={seeding}
                  style={({ pressed }) => ({
                    marginTop: 4,
                    paddingHorizontal: 20,
                    paddingVertical: 11,
                    borderRadius: 12,
                    backgroundColor: seeding ? colors.cardBg : colors.primary,
                    opacity: pressed || seeding ? 0.75 : 1,
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 8,
                  })}
                >
                  <Feather name="zap" size={15} color="#fff" />
                  <Text style={{ color: "#fff", fontWeight: "600", fontSize: 14 }}>
                    {seeding ? "Loading sample data…" : "Try with sample data"}
                  </Text>
                </Pressable>
                <Text style={{ fontSize: 12, color: colors.textTertiary, marginTop: 8, textAlign: "center", paddingHorizontal: 32 }}>
                  Loads 3 demo groups with expenses, members, and settlements
                </Text>
              </View>
            ) : null
          ) : lifecycleTab === "ended" ? (
            <EmptyState icon="flag" title="No ended groups" subtitle="Groups you end will appear here until settled" />
          ) : lifecycleTab === "settled" ? (
            <EmptyState icon="check-circle" title="Nothing settled yet" subtitle="Groups with all balances cleared appear here" />
          ) : (
            <EmptyState icon="archive" title="No archived groups" subtitle="Archived groups are hidden from your main view" />
          )
        }
        renderItem={({ item }) => <GroupCard groupId={item.id} query={query} />}
        ListFooterComponent={null}
      />

      <BalanceBreakdownModal visible={showBreakdown} onClose={() => setShowBreakdown(false)} />

      {/* Sort picker */}
      <Modal visible={showSort} animationType="fade" transparent onRequestClose={() => setShowSort(false)}>
        <Pressable style={bsStyles.backdrop} onPress={() => setShowSort(false)} />
        <View style={[sortStyles.sheet, { backgroundColor: colors.surface }]}>
          <Text style={[sortStyles.title, { color: colors.textSecondary }]}>SORT GROUPS BY</Text>
          {(["balance", "name", "recent", "activity"] as const).map(opt => {
            const label = opt === "balance" ? "Highest balance" : opt === "name" ? "Name (A–Z)" : opt === "recent" ? "Most recent" : "Last activity";
            const icon = opt === "balance" ? "trending-up" : opt === "name" ? "type" : opt === "recent" ? "clock" : "zap";
            const active = sortBy === opt;
            return (
              <Pressable
                key={opt}
                style={[sortStyles.option, active && { backgroundColor: colors.primary + "10" }]}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setSortBy(opt);
                  setShowSort(false);
                }}
              >
                <View style={[sortStyles.optionIcon, { backgroundColor: active ? colors.primary + "18" : colors.inputBg }]}>
                  <Feather name={icon as "trending-up"} size={15} color={active ? colors.primary : colors.textSecondary} />
                </View>
                <Text style={[sortStyles.optionLabel, { color: active ? colors.primary : colors.text }]}>{label}</Text>
                {active && <Feather name="check" size={16} color={colors.primary} />}
              </Pressable>
            );
          })}
        </View>
      </Modal>
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
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 2,
    gap: 10,
  },
  headerTopRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 4 },
  headerTitle: { fontSize: 30, fontFamily: "Inter_800ExtraBold", letterSpacing: -0.8 },
  badge: {
    minWidth: 22, height: 22, borderRadius: 11,
    alignItems: "center", justifyContent: "center", paddingHorizontal: 5,
  },
  badgeText: { fontSize: 11, fontFamily: "Inter_700Bold", color: "#fff" },
  addBtn: {
    width: 42, height: 42, borderRadius: 13,
    alignItems: "center", justifyContent: "center",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.30, shadowRadius: 8, elevation: 6,
  },
  headerIconBtn: {
    width: 38, height: 38, borderRadius: 12,
    alignItems: "center", justifyContent: "center",
  },
  searchBar: {
    flexDirection: "row", alignItems: "center", gap: 9,
    height: 46, borderRadius: 14, borderWidth: 1.5,
    paddingHorizontal: 13,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06, shadowRadius: 8, elevation: 2,
  },
  searchInput: {
    flex: 1, fontSize: 15, fontFamily: "Inter_400Regular",
  },
  clearBtn: {
    width: 20, height: 20, borderRadius: 10,
    alignItems: "center", justifyContent: "center",
  },
  searchResultHeader: { paddingBottom: 10, paddingHorizontal: 4 },
  searchResultText: { fontSize: 13, fontFamily: "Inter_500Medium" },

  listContent: { padding: 16, gap: 2 },
  recurringBanner: {
    flexDirection: "row", alignItems: "center", gap: 12,
    paddingHorizontal: 14, paddingVertical: 12,
    borderRadius: 14, borderWidth: 1,
    marginBottom: 8,
  },
  recurringIconWrap: {
    width: 34, height: 34, borderRadius: 10,
    alignItems: "center", justifyContent: "center",
  },
  recurringBannerTitle: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  recurringBannerSub: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 1 },
  lifecycleTabRow: { gap: 8, paddingHorizontal: 2 },
  lifecycleTab: {
    flexDirection: "row", alignItems: "center", gap: 6,
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1.5,
  },
  lifecycleTabLabel: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  lifecycleTabBadge: {
    minWidth: 20, height: 20, borderRadius: 10,
    alignItems: "center", justifyContent: "center", paddingHorizontal: 5,
  },
  lifecycleTabBadgeText: { fontSize: 10, fontFamily: "Inter_700Bold" },

  /* Gradient hero card */
  heroCard: {
    borderRadius: 20, marginBottom: 16, overflow: "hidden",
    padding: 22,
    shadowColor: "#000", shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.18, shadowRadius: 16, elevation: 8,
  },
  heroCircle1: {
    position: "absolute", top: -35, right: -35,
    width: 120, height: 120, borderRadius: 60,
    backgroundColor: "rgba(255,255,255,0.10)",
  },
  heroCircle2: {
    position: "absolute", bottom: -25, left: 50,
    width: 90, height: 90, borderRadius: 45,
    backgroundColor: "rgba(255,255,255,0.07)",
  },
  heroDotRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 },
  heroDot: {
    width: 8, height: 8, borderRadius: 4,
    backgroundColor: "rgba(255,255,255,0.75)",
  },
  heroLabelWhite: {
    fontSize: 13, fontFamily: "Inter_500Medium",
    color: "rgba(255,255,255,0.85)", letterSpacing: 0.2,
  },
  heroAmountWhite: {
    fontSize: 40, fontFamily: "Inter_800ExtraBold",
    color: "#FFFFFF", letterSpacing: -1.2, lineHeight: 46,
  },
  heroPillRow: { flexDirection: "row", gap: 8, marginTop: 14 },
  heroPill: {
    flexDirection: "row", alignItems: "center", gap: 5,
    backgroundColor: "rgba(255,255,255,0.18)",
    borderRadius: 8, paddingHorizontal: 11, paddingVertical: 5,
    borderWidth: 1, borderColor: "rgba(255,255,255,0.22)",
  },
  heroPillText: { fontSize: 12, fontFamily: "Inter_600SemiBold", color: "#FFFFFF" },

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

  sectionLabelRow: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    marginBottom: 10, marginTop: 2, paddingHorizontal: 2,
  },
  sectionLabel: { fontSize: 11.5, fontFamily: "Inter_700Bold", textTransform: "uppercase", letterSpacing: 1 },
  sectionSortBtn: {
    flexDirection: "row", alignItems: "center", gap: 5,
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20,
  },
  sectionSort: { fontSize: 12.5, fontFamily: "Inter_600SemiBold" },

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

  settledBadge: {
    flexDirection: "row", alignItems: "center", gap: 4,
    paddingHorizontal: 9, paddingVertical: 5, borderRadius: 10, borderWidth: 1,
  },
  settledBadgeText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  archivedSection: { marginTop: 6, marginBottom: 8 },
  archivedPill: {
    flexDirection: "row", alignItems: "center", gap: 7,
    alignSelf: "flex-start", paddingHorizontal: 13, paddingVertical: 9,
    borderRadius: 20, borderWidth: 1, marginBottom: 8,
  },
  archivedPillText: { fontSize: 13, fontFamily: "Inter_500Medium" },
  archivedCard: {
    flexDirection: "row", alignItems: "center", gap: 12,
    borderRadius: 14, padding: 12, marginBottom: 8, borderWidth: 1, opacity: 0.8,
  },
  archivedEmoji: {
    width: 42, height: 42, borderRadius: 12,
    alignItems: "center", justifyContent: "center", flexShrink: 0,
  },
  archivedInfo: { flex: 1 },
  archivedName: { fontSize: 14, fontFamily: "Inter_500Medium", marginBottom: 3 },
  archivedMeta: { fontSize: 11.5, fontFamily: "Inter_400Regular" },
  unarchiveBtn: {
    flexDirection: "row", alignItems: "center", gap: 5,
    paddingHorizontal: 10, paddingVertical: 7, borderRadius: 10, borderWidth: 1,
  },
  unarchiveBtnText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  heroTapHint: {
    flexDirection: "row", alignItems: "center", gap: 4,
    marginTop: 12, alignSelf: "flex-start",
  },
  heroTapHintText: {
    fontSize: 11.5, fontFamily: "Inter_500Medium",
    color: "rgba(255,255,255,0.70)",
  },
});

const bsStyles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.35)",
  },
  sheet: {
    position: "absolute", left: 0, right: 0, bottom: 0,
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    maxHeight: "80%",
    shadowColor: "#000", shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.12, shadowRadius: 20, elevation: 20,
  },
  sheetHeader: {
    paddingHorizontal: 20, paddingTop: 12, paddingBottom: 14,
    borderBottomWidth: 1,
    alignItems: "center",
  },
  handle: {
    width: 36, height: 4, borderRadius: 2, marginBottom: 14,
  },
  sheetTitle: { fontSize: 17, fontFamily: "Inter_700Bold", letterSpacing: -0.3 },
  ratesNote: { fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 3 },
  closeBtn: {
    position: "absolute", right: 16, top: 16,
    width: 30, height: 30, alignItems: "center", justifyContent: "center",
  },
  scroll: { maxHeight: "100%" },

  groupRow: {
    flexDirection: "row", alignItems: "center", gap: 12,
    paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: StyleSheet.hairlineWidth,
  },
  groupEmojiWrap: {
    width: 44, height: 44, borderRadius: 13,
    alignItems: "center", justifyContent: "center", flexShrink: 0,
  },
  groupEmoji: { fontSize: 22 },
  groupInfo: { flex: 1 },
  groupName: { fontSize: 15, fontFamily: "Inter_600SemiBold", marginBottom: 2 },
  groupSub: { fontSize: 12, fontFamily: "Inter_400Regular" },
  groupRight: { alignItems: "flex-end", gap: 3 },
  groupAmount: { fontSize: 16, fontFamily: "Inter_700Bold", letterSpacing: -0.3 },

  memberRow: {
    flexDirection: "row", alignItems: "center", gap: 10,
    paddingHorizontal: 24, paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  memberAvatar: {
    width: 30, height: 30, borderRadius: 15,
    alignItems: "center", justifyContent: "center", flexShrink: 0,
  },
  memberInitial: { fontSize: 12, fontFamily: "Inter_700Bold", color: "#fff" },
  memberName: { flex: 1, fontSize: 13, fontFamily: "Inter_400Regular" },
  memberAmount: { fontSize: 14, fontFamily: "Inter_600SemiBold", letterSpacing: -0.2 },

  emptyState: {
    alignItems: "center", justifyContent: "center",
    gap: 12, paddingVertical: 40,
  },
  emptyText: { fontSize: 15, fontFamily: "Inter_500Medium" },
});

const sortStyles = StyleSheet.create({
  sheet: {
    position: "absolute", left: 20, right: 20,
    top: "50%", marginTop: -100,
    borderRadius: 20,
    paddingVertical: 8,
    shadowColor: "#000", shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.18, shadowRadius: 24, elevation: 24,
  },
  title: {
    fontSize: 10.5, fontFamily: "Inter_700Bold", letterSpacing: 1,
    paddingHorizontal: 18, paddingTop: 12, paddingBottom: 8,
  },
  option: {
    flexDirection: "row", alignItems: "center", gap: 12,
    paddingHorizontal: 14, paddingVertical: 13, borderRadius: 12, marginHorizontal: 6,
  },
  optionIcon: {
    width: 34, height: 34, borderRadius: 10,
    alignItems: "center", justifyContent: "center",
  },
  optionLabel: { flex: 1, fontSize: 15, fontFamily: "Inter_500Medium" },
});
