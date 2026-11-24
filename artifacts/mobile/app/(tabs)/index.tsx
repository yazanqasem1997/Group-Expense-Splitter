import { unseenGroupIds, useGroupSeen } from "@/utils/groupSeen";
import { searchMatches } from "@/utils/searchMatch";
import type { ComponentRef } from "react";
import { Feather } from "@expo/vector-icons";
import { TabHeader, TabSearchBar, TAB_SEARCH_SORT_ROW } from "@/components/TabHeader";
import { TideBackdrop } from "@/components/TideBackdrop";
import { WebPullToRefresh } from "@/components/WebPullToRefresh";
import * as Haptics from "expo-haptics";
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
import Animated, {
  cancelAnimation,
  FadeInDown,
  ReduceMotion,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import { scrollRegistry } from "@/hooks/scrollRegistry";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AmountText, formatAmount } from "@/components/AmountText";
import { AnimatedAmount } from "@/components/AnimatedAmount";
import { EmptyState } from "@/components/EmptyState";
import { GroupInvitation, useApp } from "@/context/AppContext";
import { api } from "@/services/apiSync";
import { useTheme } from "@/hooks/useTheme";
import { timeAgo } from "@/utils/format";
import { SortBottomSheet } from "@/components/SortBottomSheet";
import { MonochromeIconTile, groupIconName } from "@/components/MonochromeIconTile";

type GroupSortKey = "date-newest" | "date-oldest" | "amount-highest" | "amount-lowest";

const GROUP_SORT_OPTIONS = [
  { key: "date-newest", label: "Date (newest first)" },
  { key: "date-oldest", label: "Date (oldest first)" },
  { key: "amount-highest", label: "Amount (highest first)" },
  { key: "amount-lowest", label: "Amount (lowest first)" },
] satisfies { key: GroupSortKey; label: string }[];

/** Group cards rise in one after another (120 ms apart) when Home first shows them. */
const cascadeIn = (index: number) =>
  FadeInDown.delay(index < 8 ? index * 120 : 0).duration(380).reduceMotion(ReduceMotion.System);

function hasCurrencyConversionRates(
  rates: Record<string, number>,
  from: string,
  to: string,
): boolean {
  if (from === to) return false;
  const hasRate = (currency: string) =>
    currency === "USD" || (Number.isFinite(rates[currency]) && rates[currency] > 0);
  return hasRate(from) && hasRate(to);
}

function BalanceBreakdownModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { colors } = useTheme();
  const {
    groups, getGroupBalances, getMemberById, currentUser,
    convertCurrency, defaultCurrency, exchangeRates,
  } = useApp();
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
          <Pressable style={bsStyles.closeBtn} onPress={onClose} accessibilityRole="button" accessibilityLabel="Close">
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
                  <MonochromeIconTile
                    icon={groupIconName(group)}
                    color={colors.textSecondary}
                    borderColor={colors.border}
                  />
                  <View style={bsStyles.groupInfo}>
                    <Text style={[bsStyles.groupName, { color: colors.text }]} numberOfLines={1}>{group.name}</Text>
                    <Text style={[bsStyles.groupSub, { color: colors.textSecondary }]}>
                      {debts.filter(d => d.toId === currentUser.id || d.fromId === currentUser.id).length} {debts.length === 1 ? "person" : "people"}
                    </Text>
                  </View>
                  <View style={bsStyles.groupRight}>
                    <View style={bsStyles.amountDirection}>
                      <Feather
                        name={isPositive ? "arrow-down-left" : "arrow-up-right"}
                        size={15}
                        color={isPositive ? colors.positive : colors.negative}
                      />
                      <Text style={[bsStyles.groupAmount, { color: isPositive ? colors.positive : colors.negative }]}>
                        {formatAmount(Math.abs(net), group.currency)}
                      </Text>
                    </View>
                    {hasCurrencyConversionRates(exchangeRates, group.currency, defaultCurrency) && (
                      <Text style={[bsStyles.convertedAmount, { color: colors.textTertiary }]} numberOfLines={1}>
                        ≈ {formatAmount(convertCurrency(Math.abs(net), group.currency), defaultCurrency)}
                      </Text>
                    )}
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
                          {other?.name ?? "Unknown member"}
                        </Text>
                        <Feather
                          name={isOwedToMe ? "arrow-down-left" : "arrow-up-right"}
                          size={14}
                          color={isOwedToMe ? colors.positive : colors.negative}
                        />
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
      <MonochromeIconTile
        icon={groupIconName({ name: invite.groupName, type: invite.groupType, emoji: invite.groupEmoji })}
        size={40}
        color={colors.textSecondary}
        borderColor={colors.border}
      />
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
         accessibilityRole="button" accessibilityLabel="Close">
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
  const { notifications: cardNotifs } = useApp();
  const isNewGroup = cardNotifs.some(n => !n.read && n.type === "member_added" && n.groupId === groupId);
  const { expenses: cardExpenses, settlements: cardSettlements, currentUser: cardMe } = useApp();
  const cardSeen = useGroupSeen();
  const hasUnseen = !isNewGroup && unseenGroupIds(cardSeen, cardExpenses, cardSettlements, cardMe.id).has(groupId);
  const { colors } = useTheme();
  const {
    getGroupById, getGroupBalances, currentUser, syncStatus, isOffline,
    recurringExpenses, defaultCurrency, convertCurrency, exchangeRates,
  } = useApp();
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
  const showPreferredEquivalent = hasCurrencyConversionRates(
    exchangeRates,
    group.currency,
    defaultCurrency,
  );
  const balanceColor = isSettled
    ? colors.textTertiary
    : netBalance > 0
    ? colors.positive
    : colors.negative;

  function highlight(text: string) {
    if (!query) return <Text style={[styles.groupName, { color: colors.text }]} numberOfLines={1}>{text}{isNewGroup ? <Text style={{ color: colors.teal, backgroundColor: colors.tealTint, fontWeight: "700", fontSize: 10, letterSpacing: 0.6, overflow: "hidden", borderRadius: 5 }}>  NEW  </Text> : null}{hasUnseen ? <Text style={{ color: "#E5484D", fontSize: 12 }}>  {"\u25CF"}</Text> : null}</Text>;
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
        {
          backgroundColor: colors.cardBg,
          borderColor: colors.border,
          opacity: pressed ? 0.93 : 1,
        },
      ]}
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        router.push({ pathname: "/group/[id]", params: { id: groupId } });
      }}
    >
      <View style={styles.groupCardInner}>
        <MonochromeIconTile
          icon={groupIconName(group)}
          color={colors.textSecondary}
          borderColor={colors.border}
        />
        <View style={styles.groupInfo}>
          {highlight(group.name)}
          <View style={styles.avatarRow}>
            <Feather name="users" size={15} color={colors.textSecondary} />
            <Text style={[styles.memberCount, { color: colors.textSecondary }]}>
              {group.memberIds.length} {group.memberIds.length === 1 ? "member" : "members"}
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
          <View style={styles.balanceRow}>
            <View style={styles.balanceAmounts}>
              <View style={styles.balanceRow}>
                <Feather
                  name={isSettled ? "minus" : netBalance > 0 ? "arrow-down-left" : "arrow-up-right"}
                  size={15}
                  color={balanceColor}
                />
                <AmountText
                  amount={Math.abs(netBalance)}
                  currency={group.currency}
                  style={[styles.balanceAmount, { color: balanceColor }]}
                />
              </View>
              {showPreferredEquivalent && (
                <Text style={[styles.preferredBalance, { color: colors.textTertiary, display: "none" }]} numberOfLines={1} >
                  ≈ {formatAmount(convertCurrency(Math.abs(netBalance), group.currency), defaultCurrency)}
                </Text>
              )}
            </View>
          </View>
        </View>
      </View>
    </Pressable>
  );
}

export default function GroupsScreen() {
  const { colors, refreshIndicatorColor } = useTheme();
  const insets = useSafeAreaInsets();
  const {
    groups, expenses, settlements, recurringExpenses,
    getTotalOwed, getPendingInvitesForCurrentUser, getMemberById, getGroupBalances,
    convertCurrency, currentUser, unarchiveGroup, checkAndAddRecurring, fetchExchangeRates,
    retrySync,
  } = useApp();
  const { youOwe, youAreOwed, currency: totalCurrency } = useMemo(() => getTotalOwed(), [getTotalOwed]);

  const [refreshing, setRefreshing] = useState(false);
  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      checkAndAddRecurring();
      await Promise.all([
        fetchExchangeRates().catch(() => {}),
        retrySync(),
      ]);
    } finally {
      setRefreshing(false);
    }
  }, [checkAndAddRecurring, fetchExchangeRates, retrySync]);

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
  const [selectedGroupList, setSelectedGroupList] = useState<"active" | "settled" | "archived">("active");
  const [sortBy, setSortBy] = useState<GroupSortKey>("date-newest");
  const listRef = useRef<FlatList>(null);
  useEffect(() => {
    scrollRegistry.register("index", () => {
      listRef.current?.scrollToOffset({ offset: 0, animated: true });
    });
    return () => scrollRegistry.unregister("index");
  }, []);
  const searchRef = useRef<ComponentRef<typeof TextInput>>(null);

  const { activeGroups, endedGroups, settledGroups } = useMemo(() => {
    const nonArchived = groups.filter(g => !g.isArchived);
    const settled = nonArchived.filter(g => getGroupBalances(g.id).length === 0 && expenses.some(e => e.groupId === g.id));
    const settledIds = new Set(settled.map(g => g.id));
    const ended = nonArchived.filter(g => !!g.isEnded && !settledIds.has(g.id));
    const active = nonArchived.filter(g => !g.isEnded && !settledIds.has(g.id));
    return { activeGroups: active, endedGroups: ended, settledGroups: settled };
  }, [groups, getGroupBalances, expenses, settlements]);
  const archivedGroups = useMemo(
    () => groups
      .filter(g => g.isArchived)
      .sort((a, b) => new Date(b.archivedAt ?? b.createdAt).getTime() - new Date(a.archivedAt ?? a.createdAt).getTime()),
    [groups],
  );
  const pendingInvites = getPendingInvitesForCurrentUser();
  const topPad = insets.top;
  const fabBottom = insets.bottom + 90;
  const listBottomPadding = fabBottom + 56 + 12;
  const netBalance = youAreOwed - youOwe;
  const isSearching = query.trim().length > 0;
  const isSortActive = sortBy !== "date-newest";

  // Keep the Groups surface gently alive without competing with balances.
  const backgroundMotion = useSharedValue(0);
  useEffect(() => {
    backgroundMotion.value = withRepeat(
      withTiming(1, { duration: 15000, easing: Easing.inOut(Easing.sin) }),
      -1,
      true,
    );
    return () => cancelAnimation(backgroundMotion);
  }, [backgroundMotion]);

  const orbPrimaryStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: backgroundMotion.value * 34 },
      { translateY: backgroundMotion.value * 20 },
      { scale: 1 + backgroundMotion.value * 0.06 },
    ],
  }));
  const orbSecondaryStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: backgroundMotion.value * -38 },
      { translateY: backgroundMotion.value * 26 },
      { scale: 1.06 - backgroundMotion.value * 0.05 },
    ],
  }));

  // Groups you created sort by when you made them; groups you were added to, by when you were added.
  const { notifications: sortNotifs } = useApp();
  const filteredGroups = useMemo(() => {
    // Search across all non-archived groups, while keeping the selected sort.
    const amountSearchText = (group: typeof activeGroups[0]) => {
      const debts = getGroupBalances(group.id);
      const credit = debts
        .filter(relation => relation.toId === currentUser.id)
        .reduce((sum, relation) => sum + convertCurrency(relation.amount, group.currency), 0);
      const debt = debts
        .filter(relation => relation.fromId === currentUser.id)
        .reduce((sum, relation) => sum + convertCurrency(relation.amount, group.currency), 0);
      const net = credit - debt;
      const expenseAmounts = expenses
        .filter(expense => expense.groupId === group.id)
        .flatMap(expense => [
          expense.amount,
          expense.amount.toFixed(2),
          expense.amount.toLocaleString(),
          formatAmount(expense.amount, expense.currency),
          expense.currency,
        ]);
      return [
        net,
        Math.abs(net),
        net.toFixed(2),
        Math.abs(net).toFixed(2),
        group.currency,
        ...expenseAmounts,
      ].join(" ").toLowerCase();
    };
    const list = (isSearching
      ? [...activeGroups, ...endedGroups, ...settledGroups].filter(g => {
          const q = query.toLowerCase().trim();
          return searchMatches(q, [g.name, ...g.memberIds.map(mid => getMemberById(mid)?.name)]);
        })
      : selectedGroupList === "active"
        ? [...activeGroups]
        : selectedGroupList === "settled"
          ? [...settledGroups]
          : [...archivedGroups]);
    const netFor = (g: typeof list[0]) => {
      const d = getGroupBalances(g.id);
      const credit = d.filter(r => r.toId === currentUser.id).reduce((s, r) => s + convertCurrency(r.amount, g.currency), 0);
      const debt = d.filter(r => r.fromId === currentUser.id).reduce((s, r) => s + convertCurrency(r.amount, g.currency), 0);
      return credit - debt;
    };

    const myDate = (g: { id: string; createdAt: string }) => {
      const added = sortNotifs.find(n => n.type === "member_added" && n.groupId === g.id);
      return new Date(added?.createdAt ?? g.createdAt).getTime();
    };
    if (sortBy === "date-newest") list.sort((a, b) => myDate(b) - myDate(a));
    if (sortBy === "date-oldest") list.sort((a, b) => myDate(a) - myDate(b));
    if (sortBy === "amount-highest") list.sort((a, b) => Math.abs(netFor(b)) - Math.abs(netFor(a)));
    if (sortBy === "amount-lowest") list.sort((a, b) => Math.abs(netFor(a)) - Math.abs(netFor(b)));

    return list;
  }, [sortNotifs, activeGroups, endedGroups, settledGroups, archivedGroups, selectedGroupList, query, isSearching, getMemberById, sortBy, getGroupBalances, convertCurrency, currentUser.id, expenses, settlements]);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>

      <View pointerEvents="none" style={styles.backgroundLayer}>
        <Animated.View style={[styles.backgroundOrbPrimary, { backgroundColor: colors.primary }, orbPrimaryStyle]} />
        <Animated.View style={[styles.backgroundOrbSecondary, { backgroundColor: colors.primaryDark }, orbSecondaryStyle]} />
      </View>

      <TideBackdrop />
      <WebPullToRefresh onRefresh={handleRefresh} refreshing={refreshing} />
      <TabHeader titleColor="#FFFFFF"
        title="Groups"
        topInset={topPad}
        titleAccessory={pendingInvites.length > 0 && !isSearching ? (
          <View style={[styles.badge, { backgroundColor: colors.primary }]}>
            <Text style={styles.badgeText}>{pendingInvites.length}</Text>
          </View>
        ) : null}
      >
        {/* Search bar */}
        <View style={TAB_SEARCH_SORT_ROW}>
          <TabSearchBar
            value={query}
            onChangeText={setQuery}
            inputRef={searchRef}
            placeholder="Search groups or members…"
            style={{ flex: 1 }}
            onClear={() => { setQuery(""); searchRef.current?.blur(); }}
            accessibilityLabel="Groups search"
          />
          <Pressable
            style={[
              styles.sortBtn,
              {
                backgroundColor: isSortActive ? colors.primary : colors.surface,
                borderColor: isSortActive ? colors.primary : colors.border,
              },
            ]}
            onPress={() => setShowSort(true)}
           accessibilityRole="button" accessibilityLabel="Filter">
            <Feather name="sliders" size={17} color={isSortActive ? "#fff" : colors.textSecondary} />
          </Pressable>
        </View>
      </TabHeader>


      <FlatList
        ref={listRef}
        data={filteredGroups}
        keyExtractor={item => item.id}
        contentContainerStyle={[styles.listContent, { paddingBottom: listBottomPadding }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={refreshIndicatorColor}
            colors={[refreshIndicatorColor]}
            progressBackgroundColor={colors.surface}
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
              {/* Compact floating balance card */}
              {groups.length > 0 && (() => {
                const isPositive = netBalance > 0;
                const balanceColor = Math.abs(netBalance) < 0.01
                  ? colors.textSecondary
                  : isPositive ? colors.success : colors.danger;
                return (
                  <Pressable
                    disabled
                    style={({ pressed }) => ({ opacity: pressed ? 0.92 : 1 })}
                  >
                    <View style={[styles.heroCard, {
                      backgroundColor: colors.cardBg,
                      borderColor: colors.border,
                      shadowColor: colors.shadow,
                    }]}>
                      <View style={styles.heroCardHeader}>
                        <View style={styles.heroCardLabelRow}>
                          <View style={[styles.heroAccent, { backgroundColor: balanceColor }]} />
                          <Text style={[styles.heroLabel, { color: colors.textSecondary }]}>
                            {youOwe > 0 && youAreOwed > 0 ? "NET BALANCE" : "BALANCE"}
                          </Text>
                        </View>
                    {null}
                      </View>

                      <View style={styles.heroBalanceRow}>
                        <AnimatedAmount
                          style={[styles.heroAmount, { color: balanceColor }]}
                          value={Math.abs(netBalance)}
                          format={v => formatAmount(v, totalCurrency)}
                        />
                        <View style={styles.heroDirection}>
                          <Feather
                            name={Math.abs(netBalance) < 0.01 ? "minus" : isPositive ? "arrow-down-left" : "arrow-up-right"}
                            size={13}
                            color={balanceColor}
                          />
                          <Text style={[styles.heroDirectionText, { color: balanceColor }]}>
                            {Math.abs(netBalance) < 0.01 ? "Settled" : isPositive ? "owed to you" : "you owe"}
                          </Text>
                        </View>
                      </View>

                      <View style={[styles.heroMetricRow, { display: "none" }]} /* declutterGroups */>
                        <View style={[styles.heroMetric, { backgroundColor: colors.successLight }]}>
                          <Feather name="arrow-down-left" size={11} color={colors.success} />
                          <AnimatedAmount
                            style={[styles.heroMetricText, { color: colors.success }]}
                            value={youAreOwed}
                            format={v => `${formatAmount(v, totalCurrency)} owed`}
                          />
                        </View>
                        <View style={[styles.heroMetric, { backgroundColor: colors.dangerLight }]}>
                          <Feather name="arrow-up-right" size={11} color={colors.danger} />
                          <AnimatedAmount
                            style={[styles.heroMetricText, { color: colors.danger }]}
                            value={youOwe}
                            format={v => `${formatAmount(v, totalCurrency)} due`}
                          />
                        </View>
                      </View>
                    </View>
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

              <View style={styles.groupListTabs}>
                {([
                  { key: "active", label: "Active", count: activeGroups.length },
                  { key: "settled", label: "Settled", count: settledGroups.length },
                  { key: "archived", label: "Archived", count: archivedGroups.length },
              ] as const).filter(tab => tab.key !== "archived" || tab.count > 0 || selectedGroupList === "archived").map(tab => {
                  const selected = selectedGroupList === tab.key;
                  return (
                    <Pressable
                      key={tab.key}
                      testID={`groups-${tab.key}-tab`}
                      accessibilityRole="tab"
                      accessibilityState={{ selected }}
                      onPress={() => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        setSelectedGroupList(tab.key);
                      }}
                      style={[
                        styles.groupListTab,
                        {
                          backgroundColor: selected ? colors.primaryLight : colors.surface,
                          borderColor: selected ? colors.primary : colors.border,
                        },
                      ]}
                    >
                      <Text numberOfLines={1} style={[styles.groupListTabText, { color: selected ? colors.primary : colors.textSecondary }]}>
                        {tab.label}
                      </Text>
                      <View style={[styles.groupListTabCountBadge, { backgroundColor: colors.cardBg }]}>
                        <Text style={[styles.groupListTabCount, { color: selected ? colors.primary : colors.textTertiary }]}>
                          {tab.count}
                        </Text>
                      </View>
                    </Pressable>
                  );
                })}
              </View>
            </>
          )
        }
        ListEmptyComponent={
          isSearching ? undefined : selectedGroupList === "active" ? (
            pendingInvites.length === 0 ? (
              <View style={{ alignItems: "center" }}>
                <EmptyState
                  icon="users"
                  title="No active groups"
                  subtitle={
                    settledGroups.length > 0
                      ? "Your settled groups are in the Settled list."
                      : archivedGroups.length > 0
                        ? "Your archived groups are in the Archived list."
                        : groups.length === 0
                          ? "Create a group to start splitting expenses with friends"
                          : "There are no active groups right now."
                  }
                />
                {groups.length === 0 && (
                  <>
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
                  </>
                )}
              </View>
            ) : undefined
          ) : (
            <EmptyState
              icon={selectedGroupList === "settled" ? "check-circle" : "archive"}
              title={selectedGroupList === "settled" ? "No settled groups" : "No archived groups"}
              subtitle={selectedGroupList === "settled"
                ? "Groups with no outstanding balances will appear here."
                : "Groups you archive will appear here."}
            />
          )
        }
        renderItem={({ item, index }) => !isSearching && selectedGroupList === "archived" ? (
          <View style={[styles.archivedCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Pressable
              style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: 10 }}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                router.push({ pathname: "/group/[id]", params: { id: item.id } });
              }}
            >
              <MonochromeIconTile
                icon={groupIconName(item)}
                size={42}
                color={colors.textSecondary}
                borderColor={colors.border}
              />
              <View style={styles.archivedInfo}>
                <Text style={[styles.archivedName, { color: colors.text }]} numberOfLines={1}>
                  {item.name}
                </Text>
                <Text style={[styles.archivedMeta, { color: colors.textSecondary }]}>
                  Archived {timeAgo(item.archivedAt ?? item.createdAt)}
                </Text>
              </View>
            </Pressable>
            <Pressable
              style={[styles.unarchiveBtn, { borderColor: colors.border }]}
              onPress={() => {
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                unarchiveGroup(item.id);
              }}
              accessibilityRole="button"
              accessibilityLabel={`Restore ${item.name}`}
            >
              <Feather name="inbox" size={13} color={colors.primary} />
              <Text style={[styles.unarchiveBtnText, { color: colors.primary }]}>Restore</Text>
            </Pressable>
          </View>
        ) : (
            <Animated.View entering={cascadeIn(index)}>
              <GroupCard groupId={item.id} query={query} />
            </Animated.View>
          )}
      />

      {/* ── FAB — add a new group ─────────────────────────────────────── */}
      <Pressable
        onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); router.push("/group/new"); }}
        style={[styles.fab, { backgroundColor: colors.primary, bottom: fabBottom, shadowColor: colors.primary }]}
       accessibilityRole="button" accessibilityLabel="Add">
        <Feather name="plus" color="#fff" size={26} />
      </Pressable>

      <BalanceBreakdownModal visible={showBreakdown} onClose={() => setShowBreakdown(false)} />

      <SortBottomSheet
        visible={showSort}
        selectedKey={sortBy}
        options={GROUP_SORT_OPTIONS}
        onSelect={key => setSortBy(key as GroupSortKey)}
        onClose={() => setShowSort(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  backgroundLayer: {
    ...StyleSheet.absoluteFill,
    overflow: "hidden",
  },
  backgroundOrbPrimary: {
    position: "absolute",
    width: 360,
    height: 360,
    borderRadius: 180,
    top: -170,
    right: -135,
    opacity: 0.16,
  },
  backgroundOrbSecondary: {
    position: "absolute",
    width: 320,
    height: 320,
    borderRadius: 160,
    top: 300,
    left: -175,
    opacity: 0.11,
  },
  badge: {
    minWidth: 22, height: 22, borderRadius: 11,
    alignItems: "center", justifyContent: "center", paddingHorizontal: 5,
  },
  badgeText: { fontSize: 11, fontFamily: "Inter_700Bold", color: "#fff" },
  fab: {
    position: "absolute", right: 20, width: 56, height: 56,
    borderRadius: 28, justifyContent: "center", alignItems: "center",
    shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.35, shadowRadius: 8, elevation: 6,
  },
  searchResultHeader: { paddingBottom: 10, paddingHorizontal: 4 },
  searchResultText: { fontSize: 13, fontFamily: "Inter_500Medium" },

  listContent: { paddingHorizontal: 16, paddingTop: 0, gap: 0 },
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
  sortBtn: {
    width: 40, height: 44, borderRadius: 14, borderWidth: 1,
    alignItems: "center", justifyContent: "center",
  },

  /* Compact floating balance card */
  heroCard: {
    borderRadius: 18, marginBottom: 5,
    paddingHorizontal: 16, paddingVertical: 14,
    borderWidth: 1,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.06, shadowRadius: 8, elevation: 2,
  },
  heroCardHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  heroCardLabelRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  heroAccent: { width: 7, height: 7, borderRadius: 4 },
  heroLabel: { fontSize: 11, fontFamily: "Inter_700Bold", letterSpacing: 0.9 },
  heroBalanceRow: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", marginTop: 7 },
  heroAmount: { fontSize: 30, fontFamily: "Inter_800ExtraBold", letterSpacing: -0.8 },
  heroDirection: { flexDirection: "row", alignItems: "center", gap: 4, marginLeft: 12 },
  heroDirectionText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  heroMetricRow: { flexDirection: "row", gap: 7, marginTop: 10 },
  heroMetric: { flexDirection: "row", alignItems: "center", gap: 4, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 5 },
  heroMetricText: { fontSize: 10.5, fontFamily: "Inter_600SemiBold" },
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
  groupListTabs: { flexDirection: "row", gap: 8, marginBottom: 4 },
  groupListTab: {
    flex: 1, minWidth: 0, minHeight: 38,
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5,
    paddingHorizontal: 6, borderRadius: 12, borderWidth: 1,
  },
  groupListTabText: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  groupListTabCountBadge: {
    minWidth: 18, height: 18, paddingHorizontal: 4, borderRadius: 9,
    alignItems: "center", justifyContent: "center",
  },
  groupListTabCount: { fontSize: 10, fontFamily: "Inter_600SemiBold" },

  groupCard: {
    flexDirection: "row", alignItems: "center", gap: 12,
    marginVertical: 3, paddingHorizontal: 13, paddingVertical: 12,
    borderRadius: 18, borderWidth: 1,
    shadowColor: "#000", shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.06, shadowRadius: 8, elevation: 2,
  },
  groupCardInner: { flex: 1, flexDirection: "row", alignItems: "center", gap: 12 },
  groupInfo: { flex: 1 },
  groupName: { fontSize: 16, fontFamily: "Inter_600SemiBold", marginBottom: 5, letterSpacing: -0.2 },
  avatarRow: { flexDirection: "row", alignItems: "center" },
  memberCount: { fontSize: 12, fontFamily: "Inter_400Regular" },
  groupCardRight: { alignItems: "flex-end", minWidth: 88 },
  balanceAmounts: { alignItems: "flex-end", maxWidth: "100%" },
  balanceRow: { flexDirection: "row", alignItems: "center", gap: 5 },
  balanceAmount: { fontSize: 17, fontFamily: "Inter_700Bold", letterSpacing: -0.3, textAlign: "right" },
  preferredBalance: { fontSize: 10, fontFamily: "Inter_500Medium", marginTop: 2, textAlign: "right" },

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
});

const bsStyles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFill,
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
  groupInfo: { flex: 1 },
  groupName: { fontSize: 15, fontFamily: "Inter_600SemiBold", marginBottom: 2 },
  groupSub: { fontSize: 12, fontFamily: "Inter_400Regular" },
  groupRight: { alignItems: "flex-end", gap: 3 },
  amountDirection: { flexDirection: "row", alignItems: "center", gap: 5 },
  groupAmount: { fontSize: 16, fontFamily: "Inter_700Bold", letterSpacing: -0.3 },
  convertedAmount: { fontSize: 10, fontFamily: "Inter_500Medium", textAlign: "right" },

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
