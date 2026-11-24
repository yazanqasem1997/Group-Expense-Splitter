import { FriendRequestCards } from "@/components/FriendRequestCards";
import { ZERO_DECIMAL_CURRENCIES } from "@/utils/splitMath";
import { searchMatches } from "@/utils/searchMatch";
import type { ComponentRef } from "react";
import { Feather } from "@expo/vector-icons";
import { TabHeader, TabSearchBar, TAB_SEARCH_SORT_ROW } from "@/components/TabHeader";
import { useFloatingDateHeader } from "@/hooks/useFloatingDateHeader";
import { TideBackdrop } from "@/components/TideBackdrop";
import { WebPullToRefresh } from "@/components/WebPullToRefresh";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { scrollRegistry } from "@/hooks/scrollRegistry";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import { MonochromeIconTile, categoryIconName } from "@/components/MonochromeIconTile";
import { AppNotification, CURRENCY_SYMBOLS, Expense, Settlement, getExpensePaidAmounts, useApp } from "@/context/AppContext";
import { useTheme } from "@/hooks/useTheme";
import { formatActivityAmount, timeAgo } from "@/utils/format";
import { SortBottomSheet } from "@/components/SortBottomSheet";

// ─── Types ────────────────────────────────────────────────────────────────────

type ActivityItem =
  | { type: "expense"; data: Expense }
  | { type: "settlement"; data: Settlement }
  | { type: "notification"; data: AppNotification };

type FeedRow =
  | { type: "date_header"; id: string; label: string }
  | ActivityItem;

type TypeFilter = "all" | "expenses" | "settlements";
type SortKey = "date-newest" | "date-oldest" | "amount-highest" | "amount-lowest";

const TYPE_FILTERS: { value: TypeFilter; label: string; icon: string }[] = [
  { value: "all",         label: "All",      icon: "list"         },
  { value: "expenses",    label: "Expenses", icon: "credit-card"  },
  { value: "settlements", label: "Settled",  icon: "check-circle" },
];

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: "date-newest",    label: "Date (newest first)"   },
  { key: "date-oldest",    label: "Date (oldest first)"   },
  { key: "amount-highest", label: "Amount (highest first)" },
  { key: "amount-lowest",  label: "Amount (lowest first)"  },
];

const ACTIVITY_SEEN_KEY = "@spliteasy_activity_seen_v1";

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Today / Yesterday / "July 2026" — no "This week" bucket */
function getDateBucket(dateStr: string): string {
  const d = new Date(dateStr);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return "Today";
  const yest = new Date(now);
  yest.setDate(yest.getDate() - 1);
  if (d.toDateString() === yest.toDateString()) return "Yesterday";
  // dayBucket: group by day, not month.
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const day = new Date(d); day.setHours(0, 0, 0, 0);
  const diff = Math.round((today.getTime() - day.getTime()) / 86400000);
  if (diff === 0) return "Today";
  if (diff === 1) return "Yesterday";
  return d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", ...(d.getFullYear() !== today.getFullYear() ? { year: "numeric" } : {}) });
}

function getActivityItemId(item: ActivityItem): string {
  if (item.type === "notification") return `notification_${item.data.id}`;
  return `${item.type}_${item.data.id}`;
}

/**
 * The amount used for amount sorting — must match what's actually shown on
 * the row (e.g. an expense you didn't pay shows your split, not the total),
 * or "highest/lowest first" looks wrong even though the raw data is sorted.
 * Returns null for notifications, which have no amount and are excluded.
 */
// Remembered across visits (and remounts) so returning to the tab never jumps to the top.
let activityScrollY = 0;

function activitySortAmount(item: ActivityItem, currentUserId: string): { amount: number; currency: string } | null {
  if (item.type === "notification") return null;
  if (item.type === "expense") {
    const e = item.data;
    const paidAmount = getExpensePaidAmounts(e)[currentUserId] ?? 0;
    const youPaid = paidAmount > 0;
    const mine = e.splits.find(s => s.memberId === currentUserId);
    const amount = youPaid ? paidAmount : (mine?.amount ?? e.amount);
    return { amount, currency: e.currency };
  }
  return { amount: item.data.amount, currency: item.data.currency };
}

function getPaymentDateParts(dateStr: string): { month: string; day: string } {
  const date = new Date(dateStr);
  return {
    month: date.toLocaleString("default", { month: "short" }),
    day: String(date.getDate()).padStart(2, "0"),
  };
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function ActivityScreen() {
  const { colors, refreshIndicatorColor } = useTheme();
  const insets = useSafeAreaInsets();
  const {
    expenses, settlements,
    getMemberById, getGroupById, currentUser,
    checkAndAddRecurring, fetchExchangeRates,
    checkAndSendGroupReminders,
    convertAmount, defaultCurrency,
    notifications, markAllNotificationsRead, markNotificationRead,
    clearNewActivity, directPayments: _dpAll,
  } = useApp();
  // One-Offs are switched off for launch: keep them out of Activity too.
  const directPayments = [] as typeof _dpAll;

  // ── State ─────────────────────────────────────────────────────────────────
  const [refreshing, setRefreshing] = useState(false);
  const [showSortSheet, setShowSortSheet] = useState(false);
  const [seenActivityIds, setSeenActivityIds] = useState<Set<string>>(new Set());

  // Keep the Activity surface feeling alive without competing with the feed.
  // These are deliberately slow so the screen feels polished rather than busy.
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
      { translateX: backgroundMotion.value * 36 },
      { translateY: backgroundMotion.value * 22 },
      { scale: 1 + backgroundMotion.value * 0.08 },
    ],
  }));
  const orbSecondaryStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: backgroundMotion.value * -42 },
      { translateY: backgroundMotion.value * 30 },
      { scale: 1.08 - backgroundMotion.value * 0.06 },
    ],
  }));

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    checkAndAddRecurring();
    checkAndSendGroupReminders();
    await fetchExchangeRates().catch(() => {});
    setRefreshing(false);
  }, [checkAndAddRecurring, checkAndSendGroupReminders, fetchExchangeRates]);

  const { filter } = useLocalSearchParams<{ filter?: string }>();
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>(
    filter === "expenses" || filter === "settlements" ? filter : "all"
  );
  const [sortKey, setSortKey] = useState<SortKey>("date-newest");

  useEffect(() => {
    if (filter === "expenses" || filter === "settlements") setTypeFilter(filter);
  }, [filter]);

  const listRef = useRef<FlatList>(null);
  useEffect(() => {
    scrollRegistry.register("activity", () => {
      activityScrollY = 0;
    listRef.current?.scrollToOffset({ offset: 0, animated: true });
    });
    return () => scrollRegistry.unregister("activity");
  }, []);

  const activityFocusedRef = useRef(false);
  useFocusEffect(
    useCallback(() => {
      activityFocusedRef.current = true;
      const y = activityScrollY;
      const timer = y > 0 ? setTimeout(() => listRef.current?.scrollToOffset({ offset: y, animated: false }), 80) : null;
      return () => {
        activityFocusedRef.current = false;
        if (timer) clearTimeout(timer);
      };
    }, []),
  );

  const searchRef = useRef<ComponentRef<typeof TextInput>>(null);
  const topPad = insets.top;
  const isSearching = query.trim().length > 0;
  const q = query.toLowerCase().trim();
  const isDateSort = sortKey === "date-newest" || sortKey === "date-oldest";
  const isSortActive = sortKey !== "date-newest";

  // ── All items ─────────────────────────────────────────────────────────────
  const allItems: ActivityItem[] = useMemo(() => [
    ...expenses.map(e => ({ type: "expense" as const, data: e })),
    ...settlements.map(s => ({ type: "settlement" as const, data: s })),
    // expense_added and settlement_recorded are always shown as rich transaction
    // rows above. Drop them from the notification list entirely so old ghost
    // entries (created before the duplicate fix) never create a second row.
    ...notifications
      .filter(
        n =>
          n.type !== "expense_added" &&
          n.type !== "settlement_recorded" &&
          n.type !== "member_added" &&
          n.type !== "simplify_debts_changed",
      )
      .map(n => ({ type: "notification" as const, data: n })),
  ], [expenses, settlements, notifications]);

  const allItemsRef = useRef<ActivityItem[]>([]);
  const seenActivityIdsRef = useRef<Set<string>>(new Set());
  const seenLoadedRef = useRef(false);
  const baselineInitializedRef = useRef(false);
  allItemsRef.current = allItems;

  // Activity is the notification surface now. Persist the rows that have
  // already been seen so new rows remain highlighted across app restarts.
  useFocusEffect(useCallback(() => {
    // Clear the new-activity badge the moment the user lands on this tab.
    clearNewActivity();
    let cancelled = false;
    AsyncStorage.getItem(ACTIVITY_SEEN_KEY)
      .then(raw => {
        if (cancelled) return;
        seenLoadedRef.current = true;
        if (raw === null) {
          // The first visit establishes the existing feed as already seen.
          // Later rows arriving from sync are then highlighted normally.
          if (allItemsRef.current.length === 0) return;
          const next = new Set<string>();
          allItemsRef.current.forEach(item => next.add(getActivityItemId(item)));
          baselineInitializedRef.current = true;
          seenActivityIdsRef.current = next;
          setSeenActivityIds(next);
          AsyncStorage.setItem(ACTIVITY_SEEN_KEY, JSON.stringify([...next])).catch(() => {});
          return;
        }
        try {
          const stored = JSON.parse(raw);
          const next = new Set<string>(Array.isArray(stored) ? stored : []);
          seenActivityIdsRef.current = next;
          baselineInitializedRef.current = true;
          setSeenActivityIds(next);
        } catch {
          baselineInitializedRef.current = true;
        }
      })
      .catch(() => {
        if (!cancelled) {
          seenLoadedRef.current = true;
          baselineInitializedRef.current = true;
        }
      });

    return () => {
      cancelled = true;
      if (!seenLoadedRef.current) return;
      const next = new Set(seenActivityIdsRef.current);
      allItemsRef.current.forEach(item => next.add(getActivityItemId(item)));
      seenActivityIdsRef.current = next;
      setSeenActivityIds(next);
      AsyncStorage.setItem(ACTIVITY_SEEN_KEY, JSON.stringify([...next])).catch(() => {});
      markAllNotificationsRead(true);
    };
  }, [markAllNotificationsRead, clearNewActivity]));

  // The first loaded snapshot is existing history, not new activity. Later
  // items that arrive through a sync remain highlighted until the next visit.
  useEffect(() => {
    if (!seenLoadedRef.current || baselineInitializedRef.current || allItems.length === 0) return;
    const next = new Set<string>();
    allItems.forEach(item => next.add(getActivityItemId(item)));
    baselineInitializedRef.current = true;
    seenActivityIdsRef.current = next;
    setSeenActivityIds(next);
    AsyncStorage.setItem(ACTIVITY_SEEN_KEY, JSON.stringify([...next])).catch(() => {});
  }, [allItems]);

  // ── Filtered items ────────────────────────────────────────────────────────
  const filteredItems = useMemo(() => {
    return allItems.filter(item => {
      if (typeFilter === "expenses" && item.type !== "expense") return false;
      if (typeFilter === "settlements" && item.type !== "settlement") return false;
      if (!q) return true;
      if (item.type === "expense") {
        const e = item.data;
        const people = [e.paidById, ...(e.splits ?? []).map(sp => sp.memberId)].map(mid => getMemberById(mid)?.name);
        return searchMatches(q, [e.description, getGroupById(e.groupId)?.name, ...people]);
      }
      if (item.type === "settlement") {
        const st = item.data;
        return searchMatches(q, [getGroupById(st.groupId)?.name, getMemberById(st.fromId)?.name, getMemberById(st.toId)?.name]);
      }
      const n = item.data;
      const nGroup = n.groupId ? getGroupById(n.groupId) : undefined;
      return searchMatches(q, [n.title, n.body, nGroup?.name]);
    });
  }, [allItems, q, typeFilter, getGroupById, getMemberById, directPayments, expenses]);

  // ── Sorted + grouped feed rows ────────────────────────────────────────────
  const { feedRows, stickyIndices } = useMemo(() => {
    const sorted = [...filteredItems].sort((a, b) => {
      switch (sortKey) {
        case "date-newest":
          return new Date(b.data.createdAt).getTime() - new Date(a.data.createdAt).getTime();
        case "date-oldest":
          return new Date(a.data.createdAt).getTime() - new Date(b.data.createdAt).getTime();
        // Compare by magnitude, ignoring the +/- direction: owing $230 and
        // being owed $225 should sort as "close" amounts, not opposites.
        case "amount-highest": {
          const sa = activitySortAmount(a, currentUser.id);
          const sb = activitySortAmount(b, currentUser.id);
          if (!sa || !sb) return sa ? -1 : sb ? 1 : 0; // rows without an amount always go last
          const amtA = Math.abs(convertAmount(sa.amount, sa.currency, defaultCurrency));
          const amtB = Math.abs(convertAmount(sb.amount, sb.currency, defaultCurrency));
          return amtB - amtA;
        }
        case "amount-lowest": {
          const sa = activitySortAmount(a, currentUser.id);
          const sb = activitySortAmount(b, currentUser.id);
          if (!sa || !sb) return sa ? -1 : sb ? 1 : 0; // rows without an amount always go last
          const amtA = Math.abs(convertAmount(sa.amount, sa.currency, defaultCurrency));
          const amtB = Math.abs(convertAmount(sb.amount, sb.currency, defaultCurrency));
          return amtA - amtB;
        }
        default: return 0;
      }
    });

    if (!isDateSort) {
      return { feedRows: sorted as FeedRow[], stickyIndices: [] as number[] };
    }

    const rows: FeedRow[] = [];
    const indices: number[] = [];
    let lastBucket = "";
    for (const item of sorted) {
      const bucket = getDateBucket(item.data.createdAt);
      if (bucket !== lastBucket) {
        indices.push(rows.length);
        rows.push({ type: "date_header", id: `hdr_${bucket}`, label: bucket });
        lastBucket = bucket;
      }
      rows.push(item);
    }
    return { feedRows: rows, stickyIndices: indices };
  }, [filteredItems, sortKey, isDateSort, convertAmount, defaultCurrency, getGroupById, currentUser.id]);

  // ── Render helpers ────────────────────────────────────────────────────────
  function highlightText(text: string, style: any) {
    if (!q) return <Text style={style} numberOfLines={1} ellipsizeMode="tail">{text}</Text>;
    const idx = text.toLowerCase().indexOf(q);
    if (idx === -1) return <Text style={style} numberOfLines={1} ellipsizeMode="tail">{text}</Text>;
    return (
      <Text style={style} numberOfLines={1} ellipsizeMode="tail">
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
    const paidAmounts = getExpensePaidAmounts(expense);
    const myPaidAmount = paidAmounts[currentUser.id] ?? 0;
    const youPaid = myPaidAmount > 0;
    const sym = CURRENCY_SYMBOLS[expense.currency] ?? "$";

    // Show the user's NET position, not the gross amount:
    //   • You paid → show what others owe you (total − your own share) in green
    //   • Someone else paid → show what you owe (your split) in red
    const myShareAmount = myShare?.amount ?? 0;
    const netAmount = youPaid
      ? myPaidAmount - myShareAmount     // what you get back
      : myShareAmount;                   // what you owe
    const amountColor = youPaid ? colors.success : colors.danger;
    const amountDisplay = netAmount > 0
      ? `${youPaid ? "+" : "−"}${formatActivityAmount(netAmount, sym, ZERO_DECIMAL_CURRENCIES.has(expense.currency) ? 0 : 2)}`
      : null;

    const payerLabel = youPaid ? "You" : (payer?.name ?? "Someone");
    const groupLabel = group?.name ?? "";
    const expenseDate = getPaymentDateParts(expense.createdAt);
    const linkedNotification = notifications.find(n => n.type === "expense_added" && n.expenseId === expense.id);
    const isNew = linkedNotification ? !linkedNotification.read : !seenActivityIds.has(`expense_${expense.id}`);

    return (
      <Pressable
        style={({ pressed }) => [
          styles.row,
          {
            backgroundColor: colors.cardBg,
            borderColor: colors.border,
            shadowColor: colors.shadow,
          },
          isNew && {
            backgroundColor: colors.primary + "28",
            borderColor: colors.primary + "70",
          },
          { opacity: pressed ? 0.88 : 1 },
        ]}
        onPress={() => router.push({ pathname: "/expense/[id]", params: { id: expense.id } })}
      >
        {isNew && <View style={[styles.newDot, { backgroundColor: colors.primary }]} />}
        <View style={[styles.paymentDate, { display: "none" }]}>
          <Text style={[styles.paymentMonth, { color: colors.textTertiary }]}>{expenseDate.month}</Text>
          <Text style={[styles.paymentDay, { color: colors.textSecondary }]}>{expenseDate.day}</Text>
        </View>
        <MonochromeIconTile
          icon={categoryIconName(expense.category)}
          color={colors.textSecondary}
          borderColor={colors.border}
        />
        <View style={styles.rowBody}>
          {highlightText(expense.description, [styles.rowTitle, { color: colors.text }])}
          <Text style={[styles.rowMeta, { color: colors.textSecondary }]} numberOfLines={1}>
            {payerLabel}{groupLabel ? ` · ${groupLabel}` : ""}
          </Text>
        </View>
        {amountDisplay !== null && (
          <Text
            style={[styles.rowAmount, { color: amountColor }]}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.75}
          >
            {amountDisplay}
          </Text>
        )}
        <View style={[styles.rowSepPayment, { backgroundColor: colors.border }]} />
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
    const sym = CURRENCY_SYMBOLS[settlement.currency] ?? "$";
    const amountStr = formatActivityAmount(settlement.amount, sym, ZERO_DECIMAL_CURRENCIES.has(settlement.currency) ? 0 : 2);
    const paymentDate = getPaymentDateParts(settlement.createdAt);
    const linkedNotification = notifications.find(n => n.type === "settlement_recorded" && n.settlementId === settlement.id);
    const isNew = linkedNotification ? !linkedNotification.read : !seenActivityIds.has(`settlement_${settlement.id}`);

    return (
      <Pressable
        style={({ pressed }) => [
          styles.row,
          {
            backgroundColor: colors.cardBg,
            borderColor: colors.border,
            shadowColor: colors.shadow,
          },
          isNew && {
            backgroundColor: colors.primary + "28",
            borderColor: colors.primary + "70",
          },
          { opacity: pressed ? 0.88 : 1 },
        ]}
        onPress={() => router.push({ pathname: "/settlement/[id]", params: { id: settlement.id } })}
      >
        {isNew && <View style={[styles.newDot, { backgroundColor: colors.primary }]} />}
        <View style={[styles.paymentDate, { display: "none" }]}>
          <Text style={[styles.paymentMonth, { color: colors.textTertiary }]}>{paymentDate.month}</Text>
          <Text style={[styles.paymentDay, { color: colors.textSecondary }]}>{paymentDate.day}</Text>
        </View>
        <MonochromeIconTile
          icon="check"
          color={colors.textSecondary}
          borderColor={colors.border}
        />
        <View style={styles.rowBody}>
          {highlightText(title, [styles.rowTitle, { color: colors.text }])}
          <Text style={[styles.rowMeta, { color: colors.textSecondary }]} numberOfLines={1}>
            {group?.name ?? ""}
          </Text>
        </View>
        <Text
          style={[styles.rowAmount, { color: colors.textSecondary }]}
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.75}
        >
          {amountStr}
        </Text>
        <View style={[styles.rowSepPayment, { backgroundColor: colors.border }]} />
      </Pressable>
    );
  }

  function notificationIcon(type: AppNotification["type"]): string {
    switch (type) {
      case "expense_added": return "plus-circle";
      case "expense_edited": return "edit-2";
      case "expense_deleted": return "trash-2";
      case "settlement_recorded": return "check-circle";
      case "settlement_deleted": return "rotate-ccw";
      case "member_added": return "user-plus";
      case "member_removed": return "user-minus";
      case "comment_added": return "message-circle";
      case "recurring_added":
      case "recurring_updated":
      case "recurring_fired": return "repeat";
      case "recurring_deleted": return "bell-off";
      case "direct_payment_added": return "target";
      case "direct_payment_edited": return "edit-2";
      case "direct_payment_deleted": return "trash-2";
      case "group_archived": return "archive";
      case "group_ended": return "lock";
      case "group_updated": return "settings";
      case "simplify_debts_changed": return "git-merge";
      default: return "clock";
    }
  }

  function openNotification(notification: AppNotification) {
    markNotificationRead(notification.id);
    const expenseExists = notification.expenseId && expenses.some(e => e.id === notification.expenseId);
    const settlement = notification.settlementId
      ? settlements.find(s => s.id === notification.settlementId)
      : undefined;
    const payment = notification.paymentId
      ? directPayments.find(p => p.id === notification.paymentId)
      : undefined;

    if (expenseExists) {
      router.push({ pathname: "/expense/[id]", params: { id: notification.expenseId! } });
    } else if (payment) {
      router.push({ pathname: "/(tabs)/analytics", params: { openPaymentId: payment.id } });
    } else if (notification.type === "expense_deleted" && notification.deletedExpense) {
      router.push({
        pathname: "/activity/deleted",
        params: {
          type: "expense",
          snapshot: JSON.stringify(notification.deletedExpense),
          deletedAt: notification.createdAt,
          deletedById: notification.deletedById,
        },
      });
    } else if (notification.type === "settlement_deleted" && notification.deletedSettlement) {
      router.push({
        pathname: "/activity/deleted",
        params: {
          type: "settlement",
          snapshot: JSON.stringify(notification.deletedSettlement),
          deletedAt: notification.createdAt,
          deletedById: notification.deletedById,
        },
      });
    } else if (notification.type === "direct_payment_deleted" && notification.deletedPayment) {
      router.push({
        pathname: "/activity/deleted",
        params: {
          type: "direct_payment",
          snapshot: JSON.stringify(notification.deletedPayment),
          deletedAt: notification.createdAt,
          deletedById: notification.deletedById,
        },
      });
    } else if (settlement) {
      router.push({
        pathname: "/group/[id]",
        params: { id: settlement.groupId, focusId: settlement.id, openPaymentId: settlement.id },
      });
    } else if (notification.groupId) {
      router.push({ pathname: "/group/[id]", params: { id: notification.groupId } });
    }
  }

  function renderNotification(notification: AppNotification) {
    const group = notification.groupId ? getGroupById(notification.groupId) : undefined;
    const isNew = !notification.read;
    const notifDate = getPaymentDateParts(notification.createdAt);
    // One-off payment notifications show the payment's own category icon
    // (same icon used on its One-Offs row) instead of a generic type icon.
    const linkedPayment = notification.paymentId
      ? directPayments.find(p => p.id === notification.paymentId)
      : undefined;

    return (
      <Pressable
        style={({ pressed }) => [
          styles.row,
          {
            backgroundColor: colors.cardBg,
            borderColor: colors.border,
            shadowColor: colors.shadow,
          },
          isNew && {
            backgroundColor: colors.primary + "28",
            borderColor: colors.primary + "70",
          },
          { opacity: pressed ? 0.88 : 1 },
        ]}
        onPress={() => openNotification(notification)}
      >
        {isNew && <View style={[styles.newDot, { backgroundColor: colors.primary }]} />}
        <View style={[styles.paymentDate, { display: "none" }]}>
          <Text style={[styles.paymentMonth, { color: colors.textTertiary }]}>{notifDate.month}</Text>
          <Text style={[styles.paymentDay, { color: colors.textSecondary }]}>{notifDate.day}</Text>
        </View>
        {linkedPayment ? (
          <MonochromeIconTile
            icon={categoryIconName(linkedPayment.category)}
            color={colors.textSecondary}
            borderColor={colors.border}
          />
        ) : (
          <MonochromeIconTile
            icon={notificationIcon(notification.type)}
            color={colors.textSecondary}
            borderColor={colors.border}
          />
        )}
        <View style={styles.rowBody}>
          <Text style={[styles.rowTitle, { color: colors.text }]} numberOfLines={1}>{notification.title}</Text>
          <Text style={[styles.rowMeta, { color: colors.textSecondary }]} numberOfLines={1}>
            {notification.body || group?.name || "Group update"}
          </Text>
        </View>
        <View style={[styles.rowSepPayment, { backgroundColor: colors.border }]} />
      </Pressable>
    );
  }

  function renderDateHeader(label: string) {
    return (
      <View style={styles.dateHeader}>
        <View style={[styles.dateHeaderRule, { backgroundColor: colors.border }]} />
        <View style={[styles.dateHeaderPill, { backgroundColor: colors.cardBg, borderColor: colors.border }]}>
          <Feather name="calendar" size={11} color={colors.primary} />
          <Text style={[styles.dateHeaderText, { color: colors.textSecondary }]}>{label}</Text>
        </View>
        <View style={[styles.dateHeaderRule, { backgroundColor: colors.border }]} />
      </View>
    );
  }

  function renderRow({ item }: { item: FeedRow }) {
    if (item.type === "date_header") return renderDateHeader(item.label);
    if (item.type === "expense") return renderExpense(item.data);
    if (item.type === "settlement") return renderSettlement(item.data);
    return renderNotification(item.data);
  }

  function getKey(item: FeedRow): string {
    if (item.type === "date_header") return item.id;
    if (item.type === "expense") return `exp_${item.data.id}`;
    if (item.type === "settlement") return `set_${item.data.id}`;
    return `notif_${item.data.id}`;
  }

  // ── Render ────────────────────────────────────────────────────────────────
  const floating = useFloatingDateHeader(feedRows, r => (r.type === "date_header" ? r.label : null));
  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View pointerEvents="none" style={styles.backgroundLayer}>
        <Animated.View style={[styles.backgroundOrbPrimary, { backgroundColor: colors.primary }, orbPrimaryStyle]} />
        <Animated.View style={[styles.backgroundOrbSecondary, { backgroundColor: colors.primaryDark }, orbSecondaryStyle]} />
      </View>

      <TideBackdrop />
      <WebPullToRefresh onRefresh={handleRefresh} refreshing={refreshing} />
      <TabHeader titleColor="#FFFFFF" title="Activity" topInset={topPad}>
        {/* Filter chips + sort button */}
        <View style={styles.filterRow}>
          {TYPE_FILTERS.map(f => {
            const active = typeFilter === f.value;
            return (
              <Pressable
                key={f.value}
                style={[
                  styles.filterChip,
                  {
                    flex: 1,
                    justifyContent: "center",
                    backgroundColor: active ? colors.primaryLight : colors.cardBg,
                    borderColor: active ? colors.primary : colors.border,
                  },
                ]}
                onPress={() => setTypeFilter(f.value)}
              >
                <Feather
                  name={f.icon as any}
                  size={12}
                  color={active ? colors.primary : colors.textSecondary}
                />
                <Text style={[styles.filterChipText, { color: active ? colors.primary : colors.textSecondary }]}>
                  {f.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {/* Search + sort — sort button sits to the right of the search box */}
        <View style={TAB_SEARCH_SORT_ROW}>
          <TabSearchBar
            value={query}
            onChangeText={setQuery}
            inputRef={searchRef}
            placeholder="Search expenses, groups, people…"
            style={{ flex: 1 }}
            onClear={() => { setQuery(""); searchRef.current?.blur(); }}
            accessibilityLabel="Activity search"
          />
          <Pressable
            style={[
              styles.sortBtn,
              {
                backgroundColor: isSortActive ? colors.primary : colors.surface,
                borderColor: isSortActive ? colors.primary : colors.border,
              },
            ]}
            onPress={() => setShowSortSheet(true)}
           accessibilityRole="button" accessibilityLabel="Filter">
            <Feather name="sliders" size={17} color={isSortActive ? "#fff" : colors.textSecondary} />
          </Pressable>
        </View>
      </TabHeader>

      {/* ── Feed (layered cards on the animated surface) ───────────────── */}
      <View style={{ flex: 1 }}>
      {floating.label && (
        <View pointerEvents="none" style={{ marginTop: -12, marginBottom: 6 }}>
          {renderDateHeader(floating.label)}
        </View>
      )}
      <FriendRequestCards />
      <FlatList
        onScroll={e => {
          if (activityFocusedRef.current) activityScrollY = e.nativeEvent.contentOffset.y;
          floating.onScroll(e);
        }}
        scrollEventThrottle={floating.scrollEventThrottle}
        CellRendererComponent={floating.CellRendererComponent}
        ref={listRef}
        data={floating.listRows}
        keyExtractor={getKey}
        renderItem={renderRow}
        style={styles.list}
        contentContainerStyle={[
          styles.listContent,
          { paddingBottom: Platform.OS === "web" ? 134 : insets.bottom + 90 },
        ]}
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
        ListEmptyComponent={
          isSearching || typeFilter !== "all" ? (
            <View style={styles.noResults}>
              <View style={[styles.noResultsIcon, { backgroundColor: colors.primaryLight }]}>
                <Feather name="search" size={28} color={colors.primary} />
              </View>
              <Text style={[styles.noResultsTitle, { color: colors.text }]}>No results</Text>
              <Text style={[styles.noResultsSub, { color: colors.textSecondary }]}>
                {isSearching ? `Nothing matched "${query}"` : `No ${typeFilter} yet`}
              </Text>
            </View>
          ) : (
            <View style={styles.emptyActivity}>
              <View style={[styles.emptyActivityIcon, { backgroundColor: colors.primaryLight }]}>
                <Feather name="activity" size={28} color={colors.primary} />
              </View>
              <Text style={[styles.emptyActivityTitle, { color: colors.text }]}>No activity yet</Text>
              <Text style={[styles.emptyActivitySub, { color: colors.textSecondary }]}>
                Add expenses to a group to see your activity here
              </Text>
            </View>
          )
        }
        showsVerticalScrollIndicator={false}
      />
      </View>

      <SortBottomSheet
        visible={showSortSheet}
        selectedKey={sortKey}
        options={SORT_OPTIONS}
        onSelect={key => setSortKey(key as SortKey)}
        onClose={() => setShowSortSheet(false)}
      />
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

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

  // Header stays transparent so the primary-colored controls blend into the
  // same dark, animated surface as the feed below.
  // Filter + sort row
  filterRow: { flexDirection: "row", gap: 7, alignItems: "center", paddingHorizontal: 2 },
  filterChip: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5,
    paddingHorizontal: 11, minHeight: 52,
    borderRadius: 12, borderWidth: 1,
  },
  filterChipActive: {
  },
  filterChipInactive: {
  },
  filterChipText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },

  // Sort button
  sortBtn: {
    width: 40, height: 44, borderRadius: 14, borderWidth: 1,
    alignItems: "center", justifyContent: "center",
  },
  sortBtnInactive: {
  },
  sortBtnActive: {
  },
  sortIcon: { flexDirection: "row", alignItems: "center" },

  // List
  list: { backgroundColor: "transparent" },
  listContent: { paddingTop: 0 },

  // Feed row — each financial event is a distinct elevated surface.
  row: {
    flexDirection: "row", alignItems: "center",
    marginHorizontal: 16, marginVertical: 3,
    paddingHorizontal: 13, paddingVertical: 12, gap: 12,
    borderRadius: 18,
    borderWidth: 1,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  rowBody: { flex: 1, minWidth: 0 },
  newDot: {
    position: "absolute", left: 7, top: 14,
    width: 6, height: 6, borderRadius: 3,
  },
  rowTitle: { fontSize: 14, fontFamily: "Inter_500Medium", marginBottom: 2 },
  rowMeta: { fontSize: 12, fontFamily: "Inter_400Regular" },
  rowDate: { fontSize: 12, fontFamily: "Inter_400Regular" },
  rowAmount: {
    fontSize: 14,
    fontFamily: "Inter_700Bold",
    fontVariant: ["tabular-nums"],
    maxWidth: "38%",
    textAlign: "right",
  },
  // Inset hairline separator for expense rows (icon 40 + gap 12 + padding 16 = 68)
  rowSep: {
    position: "absolute",
    left: 68, right: 0, bottom: 0,
    height: StyleSheet.hairlineWidth,
    backgroundColor: "transparent",
  },
  rowSepPayment: {
    position: "absolute",
    left: 110, right: 0, bottom: 0,
    height: StyleSheet.hairlineWidth,
    backgroundColor: "transparent",
  },

  paymentDate: {
    width: 30, alignItems: "center", justifyContent: "center", flexShrink: 0,
  },
  paymentMonth: {
    fontSize: 10, lineHeight: 13, fontFamily: "Inter_600SemiBold",
    textTransform: "uppercase",
  },
  paymentDay: {
    fontSize: 16, fontFamily: "Inter_700Bold",
    fontVariant: ["tabular-nums"],
  },

  // Date group header keeps the sticky section readable over the moving
  // background while remaining visually quieter than a feed card.
  dateHeader: {
    flexDirection: "row", alignItems: "center", gap: 8,
    paddingHorizontal: 16, paddingTop: 12, paddingBottom: 7,
  },
  dateHeaderRule: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
  },
  dateHeaderPill: {
    flexDirection: "row", alignItems: "center", gap: 5,
    paddingHorizontal: 10, paddingVertical: 5,
    borderRadius: 10, borderWidth: 1,
  },
  dateHeaderText: {
    fontSize: 10.5, fontFamily: "Inter_700Bold",
    letterSpacing: 0.5,
  },

  // Empty
  noResults: { alignItems: "center", paddingTop: 60, gap: 12 },
  noResultsIcon: {
    width: 64, height: 64, borderRadius: 20,
    alignItems: "center", justifyContent: "center",
  },
  noResultsTitle: { fontSize: 17, fontFamily: "Inter_600SemiBold" },
  noResultsSub: {
    fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center",
    maxWidth: 260,
  },
  emptyActivity: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 40,
    paddingHorizontal: 32,
  },
  emptyActivityIcon: {
    width: 64,
    height: 64,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
    backgroundColor: "#E8EEFF",
  },
  emptyActivityTitle: {
    fontSize: 17,
    fontFamily: "Inter_600SemiBold",
    marginBottom: 6,
    textAlign: "center",
  },
  emptyActivitySub: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    lineHeight: 20,
  },

});
