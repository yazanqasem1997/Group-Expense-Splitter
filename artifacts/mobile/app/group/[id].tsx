import { BlurView } from "expo-blur";
import { onPush } from "@/utils/pushEvents";
import { markGroupSeen } from "@/utils/groupSeen";
import type { ComponentRef } from "react";
import { Feather, Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Haptics from "expo-haptics";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { ActivityIndicator, Alert, KeyboardAvoidingView as RNKeyboardAvoidingView } from "react-native";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { runOnJS } from "react-native-reanimated";
import {
  Animated,
  FlatList,
  Linking,
  Modal,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AmountText, formatAmount } from "@/components/AmountText";
import { CategoryIcon, getCategoryConfig } from "@/components/CategoryIcon";
import { DatePickerField } from "@/components/DatePickerField";
import { KeyboardAwareScrollViewCompat } from "@/components/KeyboardAwareScrollViewCompat";
import { MemberProfileSheet } from "@/components/MemberProfileSheet";
import { Avatar } from "@/components/Avatar";
import { Celebration } from "@/components/Celebration";
import { MonochromeIconTile, groupIconName } from "@/components/MonochromeIconTile";
import { EmptyState } from "@/components/EmptyState";
import { GroupSpendingChart, SpendingExpense } from "@/components/GroupSpendingChart";
import {
  CURRENCY_SYMBOLS, Expense, GroupMessage, RecurringExpense, RecurringFrequency,
  RECURRING_FREQUENCY_LABELS, Settlement,
  computeNextOccurrences, getExpensePaidAmounts, useApp,
} from "@/context/AppContext";
import { showActionSheet, showAlert } from "@/hooks/alertStore";
import { getScanUsage, redeemTripPass } from "@workspace/api-client-react";
import { shareGroupExport } from "@/utils/exportGroup";
import { useTheme } from "@/hooks/useTheme";
import { formatDate, formatExpenseDate, timeAgo } from "@/utils/format";
import {
  dateOnlyInTimeZone,
  dateOnlyToInstant,
  getDeviceTimeZone,
  recurringIntervalLabel,
} from "@/utils/recurring";
import { ITEMIZATION_CATEGORIES, ITEMIZATION_LABELS, categoryShares, mainItemizationCategory } from "@/utils/spendingCategories";
import { CurrencyPickerModal } from "@/components/CurrencyPickerModal";
import { PURCHASES_LIVE } from "@/constants/brand";

type Tab = "expenses" | "recurring" | "balances" | "charts" | "chat";
type ReminderMethod = "email" | "notification";
const SIMPLIFY_EXAMPLE_NAMES = ["Ryan", "Sara", "Alex"] as const;
const GROUP_EXPENSE_SEEN_KEY = "@spliteasy_group_expense_seen_v1";
const GROUP_CHAT_SEEN_KEY = "@spliteasy_group_chat_seen_v1";

type FeedItem =
  | { type: "expense"; id: string; createdAt: string; data: Expense }
  | { type: "settlement"; id: string; createdAt: string; data: Settlement };

// Deliberately spread across hue and brightness so adjacent members remain
// distinguishable in both the chart and the totals bars.
const CHART_MEMBER_COLORS = [
  "#2563EB", "#DC2626", "#0D9488", "#D97706", "#7C3AED",
  "#DB2777", "#0891B2", "#65A30D", "#4F46E5", "#C2410C",
];

function expenseChartTimestamp(expense: Expense): number {
  if (expense.paymentDate && /^\d{4}-\d{2}-\d{2}$/.test(expense.paymentDate)) {
    // Date-only values represent a local calendar day, not a UTC timestamp.
    const paymentTimestamp = new Date(`${expense.paymentDate}T00:00:00`).getTime();
    if (!Number.isNaN(paymentTimestamp)) return paymentTimestamp;
  }
  return new Date(expense.createdAt).getTime();
}

function expenseShareForMember(expense: Expense, memberId: string): number {
  return (expense.splits ?? [])
    .filter(split => split.memberId === memberId)
    .reduce((sum, split) => sum + split.amount, 0);
}

export default function GroupDetailScreen() {
  const { id, focusId, openPaymentId, profileId, profileAt, tab: tabParam, tabAt } = useLocalSearchParams<{
    id: string;
    tab?: string;
    tabAt?: string;
    focusId?: string;
    openPaymentId?: string;
    profileId?: string;
    profileAt?: string;
  }>();
  const { colors, refreshIndicatorColor, isDark: tpDark } = useTheme();
  const insets = useSafeAreaInsets();
  const {
    getGroupById, getMemberById, getGroupExpenses, getGroupSettlements,
    getGroupBalances,
    leaveGroupMember,
    toggleSimplifyDebts,
    currentUser, deleteGroup, deleteExpense, deleteSettlement,
    addSettlement, addSettlements, archiveGroup, unarchiveGroup,
    endGroup, assignAdmin, removeAdmin,
    addGroupMessage, getGroupMessages, updateGroup,
    groupMessageReads, syncGroupMessages, markGroupMessagesRead,
    checkAndAddRecurring, fetchExchangeRates, checkAndSendGroupReminders,
    recurringExpenses, updateRecurringExpense, deleteRecurringExpense,
    convertAmount, exchangeRates, sendGroupReminder,
    addExpense,
  } = useApp();
  const TRIP_PASS_PRICE = 14.99;
  const [showGroupCurrency, setShowGroupCurrency] = useState(false);
  const [groupPlan, setGroupPlan] = useState<{ plan: string; credits: number } | null>(null);
  const loadGroupPlan = useCallback(() => {
    if (!id) return;
    getScanUsage({ groupId: id })
      .then(u => setGroupPlan({ plan: u.plan, credits: u.tripPassCredits ?? 0 }))
      .catch(() => {});
  }, [id]);
  useFocusEffect(loadGroupPlan);
  const [tpDismissed, setTpDismissed] = useState(false);
  useEffect(() => {
    if (!id) return;
    AsyncStorage.getItem(`tripPassCardDismissed:${id}`).then(v => setTpDismissed(v === "1")).catch(() => {});
  }, [id]);
  function dismissTripPassCard() {
    setTpDismissed(true);
    if (id) AsyncStorage.setItem(`tripPassCardDismissed:${id}`, "1").catch(() => {});
  }

  function billTripPassToGroup() {
    const g = getGroupById(id);
    if (!g || g.memberIds.length === 0) return;
    const payer = currentUser.id;
    const totalCents = Math.round(TRIP_PASS_PRICE * 100);
    const base = Math.floor(totalCents / g.memberIds.length);
    const rest = totalCents - base * g.memberIds.length;
    const splits = g.memberIds.map(memberId => ({
      memberId,
      amount: (base + (memberId === payer ? rest : 0)) / 100,
      ...(memberId === payer ? { paid: TRIP_PASS_PRICE } : {}),
    }));
    addExpense({
      groupId: g.id,
      description: "Trip Pass (Plus for 30 days)",
      amount: TRIP_PASS_PRICE,
      currency: "AED",
      paidById: payer,
      splitType: "equal",
      splits,
      category: "other",
      paymentDate: new Date().toISOString().slice(0, 10),
    });
  }

  async function activateTripPass() {
    const g = getGroupById(id);
    if (!g) return;
    try {
      const result = await redeemTripPass(g.id);
      if (result && typeof result === "object" && "ok" in result && (result as { ok?: boolean }).ok === false) throw new Error();
    } catch {
      showAlert("Couldn't use the Trip Pass", "Check your connection and try again. Your pass hasn't been used.");
      return;
    }
    loadGroupPlan();
    const n = g.memberIds.length;
    showAlert(
      "Plus is on for this group",
      n > 1
        ? `Add the AED ${TRIP_PASS_PRICE.toFixed(2)} Trip Pass to ${g.name} as an expense, split equally between all ${n} members (about AED ${(TRIP_PASS_PRICE / n).toFixed(2)} each)?`
        : "Everyone you add to this group gets Plus for the next 30 days.",
      n > 1
        ? [
            { text: "No thanks", style: "cancel" },
            { text: "Split it", onPress: billTripPassToGroup },
          ]
        : undefined,
    );
  }

  function handleUnlockPlus() {
    const g = getGroupById(id);
    if (!g || !groupPlan) return;
    if (groupPlan.credits > 0) {
      showAlert(
        "Use a Trip Pass?",
        `Plus for everyone in ${g.name} for 30 days. You have ${groupPlan.credits} Trip Pass${groupPlan.credits > 1 ? "es" : ""}.`,
        [
          { text: "Cancel", style: "cancel" },
          { text: "Use one", onPress: () => { void activateTripPass(); } },
        ],
      );
    } else {
      router.push({ pathname: "/trip-pass", params: { groupId: g.id } });
    }
  }

  function renderUnlockBanner() {
    if (!PURCHASES_LIVE) return null;
    if (!groupPlan || groupPlan.plan !== "free" || tpDismissed) return null;
    const has = groupPlan.credits > 0;
    return (
      <View style={[styles.tpCard, tpDark && { backgroundColor: colors.surface, borderColor: "#8A6A20" }]}>
        <Ionicons name="star" size={15} color="#F5A524" />
        <Pressable onPress={handleUnlockPlus} style={styles.tpCardMain} accessibilityRole="button">
          <Text style={[styles.tpCardTitle, { color: colors.text }]}>Trip Pass</Text>
          <Text style={[styles.tpCardSub, { color: colors.textSecondary }]} numberOfLines={1}>{has ? `${groupPlan.credits} ready to use` : `AED ${TRIP_PASS_PRICE.toFixed(2)} · 30 days`}</Text>
          <Text style={styles.tpCardLink}>{has ? "Use" : "Get"}</Text>
        </Pressable>
        <Pressable onPress={dismissTripPassCard} hitSlop={10} accessibilityRole="button" accessibilityLabel="Hide Trip Pass card">
          <Feather name="x" size={16} color="#9AABAE" />
        </Pressable>
      </View>
    );
  }

  function renderTripPassPill() {
    if (!PURCHASES_LIVE) return null;
    if (!groupPlan || groupPlan.plan !== "free" || !tpDismissed) return null;
    return (
      <Pressable onPress={handleUnlockPlus} style={[styles.tpPill, tpDark && { backgroundColor: "#3A2A0A" }]} accessibilityRole="button" accessibilityLabel="Trip Pass">
        <Ionicons name="star" size={11} color="#F5A524" />
        <Text style={[styles.tpPillText, tpDark && { color: "#F5C66B" }]}>Trip Pass</Text>
      </Pressable>
    );
  }


  const [tab, setTab] = useState<Tab>("expenses");
  // Deep links like "Go to Balances" open the right tab.
  useEffect(() => {
    if (tabParam === "expenses" || tabParam === "balances" || tabParam === "recurring" || tabParam === "charts") setTab(tabParam as Tab);
  }, [tabParam, tabAt]);
  const preserveTabOnNextFocusRef = useRef(false);
  const feedListRef = useRef<FlatList<FeedItem>>(null);
  const chatInputRef = useRef<ComponentRef<typeof TextInput>>(null);
  const { width } = useWindowDimensions();

  const [chatText, setChatText] = useState("");
  const [chartScrollSignal, setChartScrollSignal] = useState(0);
  const [seenExpenseIds, setSeenExpenseIds] = useState<Set<string>>(new Set());
  const [highlightedExpenseIds, setHighlightedExpenseIds] = useState<Set<string>>(new Set());
  const [chatSeenAt, setChatSeenAt] = useState<string | null>(null);
  const [seenStateLoaded, setSeenStateLoaded] = useState(false);
  const expenseBaselineInitializedRef = useRef(false);
  const chatBaselineInitializedRef = useRef(false);

  const [settleModal, setSettleModal] = useState<{
    fromId: string; toId: string; fullAmount: number;
  } | null>(null);
  const [settleAmount, setSettleAmount] = useState("");
  const [settleError, setSettleError] = useState("");
  const [settleSubmitting, setSettleSubmitting] = useState(false);
  const [showSettleAllConfirm, setShowSettleAllConfirm] = useState(false);
  const [settleAllSubmitting, setSettleAllSubmitting] = useState(false);

  const [refreshing, setRefreshing] = useState(false);
  const fabScale = useRef(new Animated.Value(1)).current;
  const fabScrollY = useRef(new Animated.Value(0)).current;
  const fabCollapsedRef = useRef(false);
  // Keep the final list item clear of the 56px FAB with a small visual gap.
  const fabListBottomPadding = Platform.OS === "web" ? 242 : 208;
  const [fabOpen, setFabOpen] = useState(false);
  const fabScrollProgress = fabScrollY.interpolate({
    inputRange: [0, 180],
    outputRange: [0, 1],
    extrapolate: "clamp",
  });

  useFocusEffect(
    useCallback(() => {
      // Returning from the add-recurring form should keep the recurring tab
      // selected instead of treating the form close as a fresh group visit.
      if (preserveTabOnNextFocusRef.current) {
        preserveTabOnNextFocusRef.current = false;
      } else {
        setTab("expenses");
      }
      setFabOpen(false);
      setFabCollapsed(false);
      fabScrollY.setValue(0);

      return () => {};
    }, [fabScrollY]),
  );

  const [readBySheetMessage, setReadBySheetMessage] = useState<GroupMessage | null>(null);
  const openReadBySheet = useCallback((message: GroupMessage) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setReadBySheetMessage(message);
  }, []);

  // Keep messages fresh while the group is open so the Chat tab can show a
  // badge before it is opened. Only mark messages read when Chat is visible.
  useEffect(() => {
    if (!id) return;
    syncGroupMessages(id);
    if (tab === "chat") markGroupMessagesRead(id);
    const interval = setInterval(() => {
      syncGroupMessages(id);
      if (tab === "chat") markGroupMessagesRead(id);
    }, 30000);
    return () => clearInterval(interval);
  }, [tab, id, syncGroupMessages, markGroupMessagesRead]);

  const [dismissedRatesWarning, setDismissedRatesWarning] = useState(false);

  const [profileMemberId, setProfileMemberId] = useState<string | null>(null);
  const { notifications: groupNotifs, markNotificationRead: markGroupNotifRead } = useApp();
  useEffect(() => {
    groupNotifs
      .filter(n => !n.read && n.type === "member_added" && n.groupId === id)
      .forEach(n => markGroupNotifRead(n.id));
  }, [groupNotifs, id, markGroupNotifRead]);
  useEffect(() => {
    if (profileId) setProfileMemberId(profileId);
  }, [profileId, profileAt]);
  const [balanceDetail, setBalanceDetail] = useState<{
    fromId: string;
    toId: string;
    amount: number;
  } | null>(null);
  const [showSimplifyDebtsInfo, setShowSimplifyDebtsInfo] = useState(false);

  // Trip dates modal state
  const [showTripDatesModal, setShowTripDatesModal] = useState(false);
  const tripDatesSnapshot = useRef<string>("");
  const [tripDatesError, setTripDatesError] = useState("");
  const [tripStartInput, setTripStartInput] = useState(""); // ISO YYYY-MM-DD
  const [tripEndInput, setTripEndInput] = useState("");   // ISO YYYY-MM-DD
  const [tripStartReminderInput, setTripStartReminderInput] = useState("2");
  const [settleUpReminderInput, setSettleUpReminderInput] = useState("7");
  const [activeCalendar, setActiveCalendar] = useState<"start" | "end" | null>(null);

  // Reminder channel state
  const [reminderChannel, setReminderChannel] = useState<"push" | "email" | "both">("push");
  const [reminderModal, setReminderModal] = useState<{
    fromId: string; toId: string; amount: number;
  } | null>(null);
  const [reminderMethods, setReminderMethods] = useState<ReminderMethod[]>(["notification"]);
  const [reminderSubmitting, setReminderSubmitting] = useState(false);

  // Recurring expense management
  const [editingRecurring, setEditingRecurring] = useState<RecurringExpense | null>(null);
  const [openRecurId, setOpenRecurId] = useState<string | null>(null);
  const [chatOpen, setChatOpen] = useState(false);
  const [pauseRecurringOnSettle, setPauseRecurringOnSettle] = useState(true);
  const editRecurSnapshot = useRef<string>("");
  const [editRecurError, setEditRecurError] = useState("");
  const [editRecurDesc, setEditRecurDesc] = useState("");
  const [editRecurAmount, setEditRecurAmount] = useState("");
  const [editRecurFreq, setEditRecurFreq] = useState<RecurringFrequency>("monthly");
  const [editRecurCustomDays, setEditRecurCustomDays] = useState("30");
  const [editRecurNextDate, setEditRecurNextDate] = useState("");

  const group = getGroupById(id);
  const simplifyDebtsEnabled = group?.simplifyDebtsEnabled !== false;
  const groupExpenses = getGroupExpenses(id);
  const groupSettlements = getGroupSettlements(id);
  const groupExpenseIdsKey = groupExpenses.map(expense => expense.id).join("|");
  const debts = useMemo(() => getGroupBalances(id), [id, getGroupBalances]);
  const [celebrate, setCelebrate] = useState(false);
  const endCelebration = useCallback(() => setCelebrate(false), []);
  const orderedDebts = useMemo(
    () => debts
      .map((debt, index) => ({ debt, index }))
      .sort((a, b) => {
        const aInvolvesMe = a.debt.fromId === currentUser.id || a.debt.toId === currentUser.id;
        const bInvolvesMe = b.debt.fromId === currentUser.id || b.debt.toId === currentUser.id;
        return Number(bInvolvesMe) - Number(aInvolvesMe) || a.index - b.index;
      })
      .map(item => item.debt),
    [debts, currentUser.id],
  );
  const messages = useMemo(() => getGroupMessages(id), [id, getGroupMessages]);

  useEffect(() => {
    let cancelled = false;
    setSeenStateLoaded(false);
    expenseBaselineInitializedRef.current = false;
    chatBaselineInitializedRef.current = false;
    setSeenExpenseIds(new Set());
    setHighlightedExpenseIds(new Set());
    setChatSeenAt(null);

    Promise.all([
      AsyncStorage.getItem(`${GROUP_EXPENSE_SEEN_KEY}:${currentUser.id}`),
      AsyncStorage.getItem(`${GROUP_CHAT_SEEN_KEY}:${currentUser.id}`),
    ]).then(([expenseRaw, chatRaw]) => {
      if (cancelled) return;
      try {
        const expenseMap = expenseRaw ? JSON.parse(expenseRaw) : {};
        const storedExpenseIds = Array.isArray(expenseMap[id]) ? expenseMap[id] : [];
        setSeenExpenseIds(new Set(storedExpenseIds));

        const chatMap = chatRaw ? JSON.parse(chatRaw) : {};
        setChatSeenAt(typeof chatMap[id] === "string" ? chatMap[id] : null);
      } catch {
        setSeenExpenseIds(new Set());
        setChatSeenAt(null);
      }
      setSeenStateLoaded(true);
    }).catch(() => {
      if (cancelled) return;
      setSeenExpenseIds(new Set());
      setChatSeenAt(null);
      setSeenStateLoaded(true);
    });

    return () => { cancelled = true; };
  }, [currentUser.id, id]);

  // Existing records are the baseline on the first load. Records added after
  // that remain unseen until the user opens the Expenses tab.
  useEffect(() => {
    if (!seenStateLoaded || expenseBaselineInitializedRef.current || groupExpenses.length === 0) return;
    expenseBaselineInitializedRef.current = true;
    setSeenExpenseIds(previous => {
      if (previous.size > 0) return previous;
      const baseline = new Set(groupExpenses.map(expense => expense.id));
      AsyncStorage.getItem(`${GROUP_EXPENSE_SEEN_KEY}:${currentUser.id}`)
        .then(raw => {
          const map = raw ? JSON.parse(raw) : {};
          if (map[id]) return;
          map[id] = [...baseline];
          return AsyncStorage.setItem(`${GROUP_EXPENSE_SEEN_KEY}:${currentUser.id}`, JSON.stringify(map));
        })
        .catch(() => {});
      return baseline;
    });
  }, [currentUser.id, groupExpenses, id, seenStateLoaded]);

  // If there were no expenses during the baseline load, establish the empty
  // group as seen once the user first opens the feed.
  useEffect(() => {
    if (!seenStateLoaded || tab !== "expenses" || expenseBaselineInitializedRef.current) return;
    expenseBaselineInitializedRef.current = true;
    const baseline = new Set(groupExpenses.map(expense => expense.id));
    setSeenExpenseIds(baseline);
    AsyncStorage.getItem(`${GROUP_EXPENSE_SEEN_KEY}:${currentUser.id}`)
      .then(raw => {
        const map = raw ? JSON.parse(raw) : {};
        map[id] = [...baseline];
        return AsyncStorage.setItem(`${GROUP_EXPENSE_SEEN_KEY}:${currentUser.id}`, JSON.stringify(map));
      })
      .catch(() => {});
  }, [currentUser.id, groupExpenses, id, seenStateLoaded, tab]);

  useEffect(() => {
    if (!seenStateLoaded || chatBaselineInitializedRef.current || messages.length === 0) return;
    if (chatSeenAt) {
      chatBaselineInitializedRef.current = true;
      return;
    }
    chatBaselineInitializedRef.current = true;
    const latest = messages.reduce((latestDate, message) => (
      new Date(message.createdAt).getTime() > new Date(latestDate).getTime()
        ? message.createdAt
        : latestDate
    ), messages[0].createdAt);
    setChatSeenAt(latest);
    AsyncStorage.getItem(`${GROUP_CHAT_SEEN_KEY}:${currentUser.id}`)
      .then(raw => {
        const map = raw ? JSON.parse(raw) : {};
        if (!map[id]) {
          map[id] = latest;
          return AsyncStorage.setItem(`${GROUP_CHAT_SEEN_KEY}:${currentUser.id}`, JSON.stringify(map));
        }
      })
      .catch(() => {});
  }, [chatSeenAt, currentUser.id, id, messages, seenStateLoaded]);

  const hasNewExpenses = seenStateLoaded
    && groupExpenses.some(expense => !seenExpenseIds.has(expense.id));
  const hasNewChat = seenStateLoaded
    && messages.some(message => !chatSeenAt || new Date(message.createdAt).getTime() > new Date(chatSeenAt).getTime());

  useEffect(() => {
    if (!seenStateLoaded || tab !== "expenses") return;
    const newIds = new Set(groupExpenses
      .filter(expense => !seenExpenseIds.has(expense.id))
      .map(expense => expense.id));
    setHighlightedExpenseIds(previous => {
      const unchanged = previous.size === newIds.size
        && Array.from(newIds).every(expenseId => previous.has(expenseId));
      return unchanged ? previous : newIds;
    });
  }, [groupExpenseIdsKey, seenExpenseIds, seenStateLoaded, tab]);

  useEffect(() => {
    if (!seenStateLoaded || tab !== "chat" || messages.length === 0) return;
    const latest = messages.reduce((latestDate, message) => (
      new Date(message.createdAt).getTime() > new Date(latestDate).getTime()
        ? message.createdAt
        : latestDate
    ), messages[0].createdAt);
    if (chatSeenAt && new Date(latest).getTime() <= new Date(chatSeenAt).getTime()) return;
    setChatSeenAt(latest);
    AsyncStorage.getItem(`${GROUP_CHAT_SEEN_KEY}:${currentUser.id}`)
      .then(raw => {
        const map = raw ? JSON.parse(raw) : {};
        map[id] = latest;
        return AsyncStorage.setItem(`${GROUP_CHAT_SEEN_KEY}:${currentUser.id}`, JSON.stringify(map));
      })
      .catch(() => {});
  }, [chatSeenAt, currentUser.id, id, messages, seenStateLoaded, tab]);

  const groupRecurring = useMemo(
    () => recurringExpenses.filter(r => r.groupId === id),
    [recurringExpenses, id]
  );
  const activeRecurringCount = groupRecurring.filter(recurring => recurring.isActive).length;
  const recurringSettlementWarning = activeRecurringCount === 1
    ? "This group has 1 active recurring expense. Settling won't stop it; pause or delete it in the Recurring tab to prevent future expenses."
    : `This group has ${activeRecurringCount} active recurring expenses. Settling won't stop them; pause or delete them in the Recurring tab to prevent future expenses.`;

  const setFabCollapsed = useCallback((collapsed: boolean) => {
    if (fabCollapsedRef.current === collapsed) return;
    fabCollapsedRef.current = collapsed;
    Animated.timing(fabScale, {
      toValue: collapsed ? 0.72 : 1,
      duration: 180,
      useNativeDriver: true,
    }).start();
  }, [fabScale]);

  const handleContentScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const offsetY = event.nativeEvent.contentOffset.y;
      fabScrollY.setValue(Math.max(offsetY, 0));
      if (fabCollapsedRef.current) {
        if (offsetY <= 8) setFabCollapsed(false);
      } else if (offsetY > 24) {
        setFabCollapsed(true);
      }
    },
    [fabScrollY, setFabCollapsed],
  );

  const markExpensesSeen = useCallback(() => {
    if (!seenStateLoaded || tab !== "expenses") return;

    setSeenExpenseIds(previous => {
      const next = new Set(previous);
      groupExpenses.forEach(expense => next.add(expense.id));
      if (next.size === previous.size) return previous;

      AsyncStorage.getItem(`${GROUP_EXPENSE_SEEN_KEY}:${currentUser.id}`)
        .then(raw => {
          const map = raw ? JSON.parse(raw) : {};
          map[id] = [...next];
          return AsyncStorage.setItem(`${GROUP_EXPENSE_SEEN_KEY}:${currentUser.id}`, JSON.stringify(map));
        })
        .catch(() => {});
      return next;
    });
    setHighlightedExpenseIds(new Set());
  }, [currentUser.id, groupExpenseIdsKey, id, seenStateLoaded, tab]);

  const handleSetTab = (nextTab: Tab) => {
    if (tab === "expenses" && nextTab !== "expenses") {
      markExpensesSeen();
    }
    setTab(nextTab);
    setFabOpen(false);
    setFabCollapsed(false);
    fabScrollY.setValue(0);
  };

  const feedItems = useMemo<FeedItem[]>(() => {
    const expItems: FeedItem[] = groupExpenses.map(e => ({ type: "expense", id: e.id, createdAt: e.createdAt, data: e }));
    const settItems: FeedItem[] = groupSettlements.map(s => ({ type: "settlement", id: s.id, createdAt: s.createdAt, data: s }));
    return [...expItems, ...settItems].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [groupExpenses, groupSettlements]);

  useEffect(() => {
    if (!focusId) return;
    const index = feedItems.findIndex(item => item.id === focusId);
    if (index < 0) return;
    const timer = setTimeout(() => {
      feedListRef.current?.scrollToIndex({ index, animated: true, viewPosition: 0.35 });
    }, 350);
    return () => clearTimeout(timer);
  }, [focusId, feedItems]);

  useEffect(() => {
    if (!openPaymentId) return;
    const payment = groupSettlements.find(s => s.id === openPaymentId);
    if (!payment) return;
    const timer = setTimeout(() => {
      router.push({ pathname: "/settlement/[id]", params: { id: payment.id } });
    }, 450);
    return () => clearTimeout(timer);
  }, [openPaymentId, groupSettlements]);

  const topPad = insets.top;

  const spendingChartExpenses: SpendingExpense[] = useMemo(() => {
    return groupExpenses.map(expense => ({
      timestamp: expenseChartTimestamp(expense),
      amount: expense.amount,
      currency: expense.currency,
      category: expense.category,
      description: expense.description,
      paidById: expense.paidById,
      splits: (expense.splits ?? []).map(split => ({
        memberId: split.memberId,
        amount: split.amount,
      })),
    }));
  }, [groupExpenses]);

  const spendingChartMembers = useMemo(() => {
    if (!group) return [];
    return group.memberIds.map((memberId, memberIndex) => {
      const member = getMemberById(memberId);
      return {
        id: memberId,
        label: member?.isCurrentUser ? "You" : (member?.name?.split(" ")[0] ?? "?"),
        color: CHART_MEMBER_COLORS[memberIndex % CHART_MEMBER_COLORS.length],
      };
    });
  }, [group, getMemberById]);

  const [itemizationScope, setItemizationScope] = useState<string>("group");
  const [customItemizationSearch, setCustomItemizationSearch] = useState("");
  const [customItemizationCategory, setCustomItemizationCategory] = useState<string>(ITEMIZATION_CATEGORIES[0]);

  const itemizationRows = useMemo(() => {
    if (!group) return [];
    const relevant = itemizationScope === "group"
      ? groupExpenses
      : groupExpenses.filter(e => expenseShareForMember(e, itemizationScope) > 0);
    const totals: Record<string, number> = {};
    relevant.forEach(expense => {
      const amount = itemizationScope === "group"
        ? expense.amount
        : expenseShareForMember(expense, itemizationScope);
      const converted = convertAmount(amount, expense.currency, group.currency);
      categoryShares(expense.category, expense.description, expense.categoryBreakdown).forEach(({ category, fraction }) => {
        totals[category] = (totals[category] ?? 0) + converted * fraction;
      });
    });
    const sum = Object.values(totals).reduce((s, v) => s + v, 0);
    return ITEMIZATION_CATEGORIES
      .map(cat => ({ cat, amount: totals[cat] ?? 0 }))
      .filter(row => row.amount > 0)
      .sort((a, b) => b.amount - a.amount)
      .map(row => ({ ...row, pct: sum > 0 ? row.amount / sum : 0 }));
  }, [group, groupExpenses, itemizationScope, convertAmount]);

  const customItemizationRows = useMemo(() => {
    if (!group) return [];
    const relevant = itemizationScope === "group"
      ? groupExpenses
      : groupExpenses.filter(e => expenseShareForMember(e, itemizationScope) > 0);
    return (group.customItemizations ?? []).map(rule => {
      const searchTerm = rule.searchTerm.trim().toLocaleLowerCase();
      const amount = searchTerm
        ? relevant
          .filter(expense => expense.description.toLocaleLowerCase().includes(searchTerm))
          .reduce((sum, expense) => {
            const expenseAmount = itemizationScope === "group"
              ? expense.amount
              : expenseShareForMember(expense, itemizationScope);
            return sum + convertAmount(expenseAmount, expense.currency, group.currency);
          }, 0)
        : 0;
      return { ...rule, amount };
    });
  }, [group, groupExpenses, itemizationScope, convertAmount]);

  const addCustomItemization = useCallback(() => {
    if (!group) return;
    const searchTerm = customItemizationSearch.trim();
    if (!searchTerm) return;
    const nextRule = {
      id: `item_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
      searchTerm,
      category: customItemizationCategory,
    };
    updateGroup(id, {
      customItemizations: [...(group.customItemizations ?? []), nextRule],
    });
    setCustomItemizationSearch("");
  }, [customItemizationCategory, customItemizationSearch, group, id, updateGroup]);

  const removeCustomItemization = useCallback((ruleId: string) => {
    if (!group) return;
    updateGroup(id, {
      customItemizations: (group.customItemizations ?? []).filter(rule => rule.id !== ruleId),
    });
  }, [group, id, updateGroup]);

  const memberFinancialRows = useMemo(() => {
    if (!group) return [];
    return group.memberIds.map(memberId => {
      const paid = groupExpenses.reduce((sum, expense) => (
        sum + convertAmount(
          getExpensePaidAmounts(expense)[memberId] ?? 0,
          expense.currency,
          group.currency,
        )
      ), 0);
      const share = groupExpenses.reduce((sum, expense) => (
        sum + (expense.splits ?? [])
          .filter(split => split.memberId === memberId)
          .reduce((splitSum, split) => splitSum + convertAmount(split.amount, expense.currency, group.currency), 0)
      ), 0);
      return { memberId, paid, share, difference: paid - share };
    });
  }, [group, groupExpenses, convertAmount]);

  const [groupMissingLong, setGroupMissingLong] = useState(false);
  useEffect(() => {
    if (group) { setGroupMissingLong(false); return; }
    const t = setTimeout(() => setGroupMissingLong(true), 6000);
    return () => clearTimeout(t);
  }, [!!group]);
  const paymentComparisonMax = Math.max(
    ...memberFinancialRows.flatMap(row => [row.paid, row.share]),
    1,
  );

  // Hooks must run before the early return (deleting an open group crashed).
  useEffect(() => {
    if (tab !== "chat") return;
    groupNotifs
      .filter(n => !n.read && n.type === "group_message" && n.groupId === id)
      .forEach(n => markGroupNotifRead(n.id));
  }, [tab, groupNotifs, id, markGroupNotifRead]);

  const chatListRef = useRef<FlatList<GroupMessage>>(null);

    // Opening (and leaving) the group clears its red dot.
  useEffect(() => {
    if (!id) return;
    markGroupSeen(String(id));
    return () => markGroupSeen(String(id));
  }, [id]);

    // New message pushed for this group: fetch it right away.
  useEffect(() => {
    if (!id) return;
    return onPush(d => {
      if (d.type === "group_message" && d.groupId === id) {
        syncGroupMessages(id);
        if (tab === "chat") markGroupMessagesRead(id);
      }
    });
  }, [tab, id, syncGroupMessages, markGroupMessagesRead]);

  if (!group) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        {groupMissingLong ? <Text style={{ color: colors.text, textAlign: "center", marginTop: 120 }}>Group not found</Text> : <ActivityIndicator color={colors.primary} style={{ marginTop: 120 }} />}
      </View>
    );
  }

  // Group-type-aware noun so "Dates & Reminders" reads naturally for
  // homes, couples, etc. instead of always saying "trip".
  const periodNoun =
    group.type === "trip" ? "trip"
    : group.type === "home" ? "billing period"
    : group.type === "couple" ? "period"
    : "period";
  const periodNounCap = periodNoun.charAt(0).toUpperCase() + periodNoun.slice(1);

  const totalExpenses = groupExpenses.reduce((s, e) => s + convertAmount(e.amount, e.currency, group.currency), 0);
  const myDebts = debts.filter(d => d.fromId === currentUser.id);
  const myCredits = debts.filter(d => d.toId === currentUser.id);

  // Warn when the group has mixed currencies but rates haven't loaded yet.
  const hasMixedCurrencies = groupExpenses.some(e => e.currency !== group.currency);
  const ratesAvailable = Object.keys(exchangeRates).length > 0;
  const showRatesWarning = hasMixedCurrencies && !ratesAvailable && !dismissedRatesWarning;

  async function handleRefresh() {
    setRefreshing(true);
    checkAndAddRecurring();
    await fetchExchangeRates().catch(() => {});
    setRefreshing(false);
  }

  async function handleExport() {
    if (!group) return;
    try {
      const usage = await getScanUsage({ groupId: id });
      if (usage.plan === "free") {
        router.push({ pathname: "/plus", params: { reason: "export", groupId: id } });
        return;
      }
    } catch {
      showAlert("Couldn't check your plan", "Check your connection and try again.");
      return;
    }
    const input = {
      groupName: group.name,
      groupCurrency: group.currency,
      memberIds: group.memberIds,
      nameOf: (memberId: string) => getMemberById(memberId)?.name ?? "Former member",
      expenses: groupExpenses,
      settlements: groupSettlements,
      debts,
      convert: (amount: number, from: string, to: string) => convertAmount(amount, from, to),
      generatedOn: new Date().toISOString().slice(0, 10),
    };
    const run = (kind: "csv" | "pdf") => {
      shareGroupExport(kind, input).catch(() => showAlert("Export failed", "Please try again."));
    };
    showActionSheet("Export " + group.name, [
      { text: "Spreadsheet (CSV)", icon: "file-text", onPress: () => run("csv") },
      { text: "PDF report", icon: "file", onPress: () => run("pdf") },
      { text: "Cancel", style: "cancel" },
    ]);
  }

  function handleGroupOptions() {
    if (!group) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const archiveLabel = group.isArchived ? "Unarchive Group" : "Archive Group";
    const isAdmin = (group.adminIds ?? []).includes(currentUser.id);
    const viewBtns = [
      { text: "Recurring bills", icon: "repeat", onPress: () => handleSetTab("recurring") },
      { text: "Spending insights", icon: "pie-chart", onPress: () => handleSetTab("charts") },
    ];
    const myDebts = getGroupBalances(group.id).filter(d => d.fromId === currentUser.id || d.toId === currentUser.id);
    const iOwe = myDebts.filter(d => d.fromId === currentUser.id).reduce((s, d) => s + d.amount, 0);
    const owedToMe = myDebts.filter(d => d.toId === currentUser.id).reduce((s, d) => s + d.amount, 0);
    const leaveBtn = [{
      text: "Leave group",
      icon: "log-out",
      onPress: () => {
        if (myDebts.length > 0) {
          const what = iOwe > 0.009
            ? `You still owe ${formatAmount(iOwe, group.currency)}.`
            : `You're still owed ${formatAmount(owedToMe, group.currency)}.`;
          showAlert("Settle up first", `${what} You can leave once your balance in this group is zero.`, [
            { text: "Cancel", style: "cancel" },
            { text: "Go to Balances", onPress: () => handleSetTab("balances") },
          ]);
          return;
        }
        showAlert("Leave group?", `You'll no longer see "${group.name}". Past expenses stay for the others.`, [
          { text: "Cancel", style: "cancel" },
          { text: "Leave", style: "destructive", onPress: () => { router.back(); setTimeout(() => leaveGroupMember(group.id, currentUser.id), 400); } },
        ]);
      },
    }];
    const endBtn = !group.isEnded && isAdmin
      ? [{
          text: "End Group Period",
          icon: "lock",
          onPress: () => {
            showAlert(
              "End Group Period",
              "This will end and archive the group. Members can still settle up, but no new expenses should be added. A member will need to restore it manually to bring it back.",
              [
                { text: "Cancel", style: "cancel" },
                {
                  text: "End Period",
                  style: "destructive",
                  onPress: () => endGroup(id),
                },
              ]
            );
          },
        }]
      : [];
    showActionSheet(group.name, [
      {
        text: "Dates & Reminders",
        icon: "calendar",
        onPress: openTripDatesModal,
      },
      {
        text: `Default Currency (${group.currency})`,
        icon: "dollar-sign",
        onPress: () => setShowGroupCurrency(true),
      },
      
      ...endBtn, ...leaveBtn,
      {
        text: "Export (CSV or PDF)",
        icon: "download",
        onPress: () => void handleExport(),
      },
      {
        text: archiveLabel,
        icon: group.isArchived ? "inbox" : "archive",
        onPress: () => {
          if (group.isArchived) unarchiveGroup(id);
          else archiveGroup(id);
        },
      },
      {
        text: "Delete Group",
        icon: "trash-2",
        style: "destructive",
        onPress: handleDeleteGroup,
      },
      { text: "Cancel", style: "cancel" },
    ], `${group.memberIds.length} members · ${groupExpenses.length} expenses`);
  }

  function renderBalanceSummary() {
    const dArr = debts as { fromId: string; toId: string; amount: number }[];
    const myCredits = dArr.filter(d => d.toId === currentUser.id);
    const myOwing = dArr.filter(d => d.fromId === currentUser.id);
    const totalOwed = myCredits.reduce((s, d) => s + d.amount, 0);
    const totalOwe = myOwing.reduce((s, d) => s + d.amount, 0);
    const isSettled = totalOwed === 0 && totalOwe === 0;
    const net = Math.abs(totalOwed - totalOwe);
    const isPositive = totalOwed > totalOwe;
    const amtColor = isSettled ? colors.textTertiary : isPositive ? colors.positive : colors.negative;
    const label = isSettled ? "All settled" : isPositive ? "You are owed" : "You owe";
    const statusColor = isSettled ? colors.success : amtColor;

    return (
      <Pressable
        style={[
          styles.balanceSummary,
          {
            backgroundColor: colors.surface,
            borderColor: colors.border,
            shadowColor: colors.shadow,
          },
        ]}
        disabled
      >
        <View style={styles.balanceSummaryRow}>
          <View style={styles.balanceSummaryLabelWrap}>
            {isSettled && <View style={[styles.balanceSummaryIcon, { backgroundColor: isSettled ? colors.successLight : isPositive ? colors.successLight : colors.dangerLight }]}>
              <Feather name={isSettled ? "check" : isPositive ? "arrow-down-left" : "arrow-up-right"} size={15} color={statusColor} />
            </View>}
            <Text style={[styles.balanceSummaryLabel, { color: statusColor }]}>{label}</Text>
          </View>
          {!isSettled && (
            <Text style={[styles.balanceSummaryAmount, { color: amtColor }]}>
              {formatAmount(Math.abs(net), group!.currency)}
            </Text>
          )}
        </View>
        <Text style={{ fontSize: 12, color: colors.textSecondary, marginTop: 4, fontFamily: "Inter_400Regular" }}>
          Total spent {formatAmount(totalExpenses, group!.currency)}
        </Text>
      </Pressable>
    );
  }

  function tripDatesState() {
    return JSON.stringify({
      tripStartInput, tripEndInput, tripStartReminderInput, settleUpReminderInput,
      reminderChannel,
    });
  }

  function openTripDatesModal() {
    setTripStartInput(group?.startDate ?? "");
    setTripEndInput(group?.endDate ?? "");
    setTripStartReminderInput(String(group?.tripStartReminderDays ?? 2));
    setSettleUpReminderInput(String(group?.settleUpReminderDays ?? 7));
    setReminderChannel(group?.reminderChannel ?? "push");
    setActiveCalendar(null);
    setTripDatesError("");
    // Snapshot next tick after state applies is unreliable; store the source values.
    tripDatesSnapshot.current = JSON.stringify({
      tripStartInput: group?.startDate ?? "",
      tripEndInput: group?.endDate ?? "",
      tripStartReminderInput: String(group?.tripStartReminderDays ?? 2),
      settleUpReminderInput: String(group?.settleUpReminderDays ?? 7),
      reminderChannel: group?.reminderChannel ?? "push",
    });
    setShowTripDatesModal(true);
  }

  function closeTripDatesModal() {
    if (tripDatesState() !== tripDatesSnapshot.current) {
      showAlert(
        "Discard changes?",
        "You've changed the dates or reminders but haven't saved them yet.",
        [
          { text: "Keep editing", style: "cancel" },
          { text: "Discard", style: "destructive", onPress: () => setShowTripDatesModal(false) },
        ]
      );
      return;
    }
    setShowTripDatesModal(false);
  }

  function saveTripDates() {
    if (!group) return;
    const start = tripStartInput.trim();
    const end = tripEndInput.trim();
    if (start && end && end < start) {
      setTripDatesError("End date can't be before the start date.");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return;
    }
    setTripDatesError("");
    updateGroup(id, {
      startDate: start || undefined,
      endDate: end || undefined,
      tripStartReminderDays: parseInt(tripStartReminderInput) || undefined,
      settleUpReminderDays: parseInt(settleUpReminderInput) || undefined,
      reminderChannel,
    });
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setShowTripDatesModal(false);
  }

  function handleDeleteGroup() {
    const outstandingForDelete = getGroupBalances(id);
    if (outstandingForDelete.length > 0) {
      showAlert(
        "Settle up first",
        `This group still has ${outstandingForDelete.length} open ${outstandingForDelete.length === 1 ? "balance" : "balances"}. It can be deleted once everyone is settled.`,
        [
          { text: "Cancel", style: "cancel" },
          { text: "Go to Balances", onPress: () => handleSetTab("balances") },
        ],
      );
      return;
    }
    showAlert(
      "Delete this group?",
      `"${group?.name}" and all ${groupExpenses.length} expense${groupExpenses.length === 1 ? "" : "s"}, settlements and messages in it will be permanently deleted for everyone. This can't be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => { router.back(); setTimeout(() => deleteGroup(id), 400); },
        },
      ]
    );
  }

  function handleSettleAll() {
    if (!group || debts.length === 0) return;
    setShowSettleAllConfirm(true);
  }

  function promptPauseRecurring() {
    const active = groupRecurring.filter(r => r.isActive);
    if (active.length === 0) return;
    Alert.alert(
      active.length === 1 ? "Pause the recurring expense?" : `Pause ${active.length} recurring expenses?`,
      "Settling up doesn't stop recurring expenses. They'll keep adding new costs to this group until paused.",
      [
        { text: "Keep running", style: "cancel" },
        { text: "Pause", onPress: () => active.forEach(r => updateRecurringExpense(r.id, { isActive: false })) },
      ],
    );
  }

  function confirmSettleAll() {
    if (!group || settleAllSubmitting) return;
    if (debts.length === 0) { setShowSettleAllConfirm(false); return; }
    setSettleAllSubmitting(true);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    if (activeRecurringCount > 0 && pauseRecurringOnSettle) groupRecurring.filter(r => r.isActive).forEach(r => updateRecurringExpense(r.id, { isActive: false }));
    addSettlements(
      debts.map(d => ({
        groupId: id,
        fromId: d.fromId,
        toId: d.toId,
        amount: d.amount,
        currency: group.currency,
      }))
    );
    setShowSettleAllConfirm(false);
    setSettleAllSubmitting(false);
    setCelebrate(true);
  }

  function openSettleModal(fromId: string, toId: string, amount: number) {
    setSettleAmount(amount.toFixed(2));
    setSettleError("");
    setSettleSubmitting(false);
    setSettleModal({ fromId, toId, fullAmount: amount });
  }

  function confirmSettle() {
    if (!settleModal || !group || settleSubmitting) return;
    const amount = parseFloat(settleAmount);
    if (isNaN(amount) || amount <= 0) {
      setSettleError("Enter an amount greater than 0");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return;
    }
    if (amount > settleModal.fullAmount + 0.001) {
      setSettleError(`Can't exceed the ${formatAmount(settleModal.fullAmount, group.currency)} balance`);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return;
    }
    setSettleSubmitting(true);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    addSettlement({
      groupId: id,
      fromId: settleModal.fromId,
      toId: settleModal.toId,
      amount: Math.min(amount, settleModal.fullAmount),
      currency: group.currency,
    });
    // Paying off the last open balance in full settles the whole group.
    if (debts.length === 1 && amount >= settleModal.fullAmount - 0.005) setCelebrate(true);
    if (activeRecurringCount > 0 && pauseRecurringOnSettle) groupRecurring.filter(r => r.isActive).forEach(r => updateRecurringExpense(r.id, { isActive: false }));
    setSettleModal(null);
    setSettleSubmitting(false);
  }

  function openReminderModal(fromId: string, toId: string, amount: number) {
    setReminderMethods(["notification"]);
    setReminderModal({ fromId, toId, amount });
  }

  async function confirmSendReminder() {
    if (!group || !reminderModal || reminderSubmitting) return;

    const { fromId, toId, amount } = reminderModal;
    const fromMember = getMemberById(fromId);
    const toMember = getMemberById(toId);
    const isMyDebt = fromId === currentUser.id;
    const recipient = isMyDebt ? toMember : fromMember;

    if (!recipient) {
      showAlert("Recipient unavailable", "This member could not be found in the group.");
      return;
    }

    const includesNotification = reminderMethods.includes("notification");
    const includesEmail = reminderMethods.includes("email");
    const recipientEmail = recipient.email;

    if (includesEmail && !recipientEmail) {
      showAlert("No email", "This member doesn't have an email address on file.");
      return;
    }

    setReminderSubmitting(true);
    try {
      if (includesNotification) {
        await sendGroupReminder(id, recipient.id, amount, group.currency);
      }

      if (includesEmail && recipientEmail) {
        const subject = encodeURIComponent(`Reminder: ${group.name} balance`);
        const body = encodeURIComponent(
          `Hi ${isMyDebt ? toMember?.name : fromMember?.name},\n\n` +
          `Just a friendly reminder about the ${formatAmount(amount, group.currency)} balance in our "${group.name}" group on Split Mate.\n\n` +
          `${isMyDebt ? "I'll send it over soon!" : "Could you settle this when you get a chance? Thanks!"}\n\n` +
          `— ${currentUser.name}`
        );
        const url = `mailto:${recipientEmail}?subject=${subject}&body=${body}`;
        await Linking.openURL(url);
      }

      setReminderModal(null);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      const delivery = includesNotification && includesEmail
        ? "a Split Mate notification was sent and an email draft was opened"
        : includesNotification
        ? "a Split Mate notification"
        : "an email draft";
      showAlert("Reminder sent", `${recipient.name} will receive ${delivery}.`);
    } catch {
      if (includesNotification && !includesEmail) {
        showAlert("Couldn't send reminder", "Please check your connection and try again.");
      } else if (includesEmail && !includesNotification) {
        showAlert("Can't open mail app", `Send a reminder to ${recipientEmail}`);
      } else {
        showAlert(
          "Reminder partially sent",
          `The Split Mate notification was sent, but the email draft could not be opened for ${recipientEmail}.`,
        );
      }
    } finally {
      setReminderSubmitting(false);
    }
  }

  function editRecurState() {
    return JSON.stringify({
      editRecurDesc, editRecurAmount, editRecurFreq, editRecurCustomDays, editRecurNextDate,
    });
  }

  function openEditRecurring(r: RecurringExpense) {
    setEditingRecurring(r);
    setEditRecurDesc(r.description);
    setEditRecurAmount(String(r.amount));
    setEditRecurFreq(r.frequency);
    setEditRecurCustomDays(String(r.customDays ?? 30));
    setEditRecurNextDate(dateOnlyInTimeZone(new Date(r.nextDueAt), r.timeZone));
    setEditRecurError("");
    editRecurSnapshot.current = JSON.stringify({
      editRecurDesc: r.description,
      editRecurAmount: String(r.amount),
      editRecurFreq: r.frequency,
      editRecurCustomDays: String(r.customDays ?? 30),
      editRecurNextDate: dateOnlyInTimeZone(new Date(r.nextDueAt), r.timeZone),
    });
  }

  function closeEditRecurring() {
    if (editingRecurring && editRecurState() !== editRecurSnapshot.current) {
      showAlert(
        "Discard changes?",
        "Your edits to this recurring schedule haven't been saved.",
        [
          { text: "Keep editing", style: "cancel" },
          { text: "Discard", style: "destructive", onPress: () => setEditingRecurring(null) },
        ]
      );
      return;
    }
    setEditingRecurring(null);
  }

  function saveEditRecurring() {
    if (!editingRecurring) return;
    const amount = parseFloat(editRecurAmount);
    if (!editRecurDesc.trim()) {
      setEditRecurError("Add a description");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return;
    }
    if (isNaN(amount) || amount <= 0) {
      setEditRecurError("Enter an amount greater than 0");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return;
    }
    setEditRecurError("");
    const timeZone = editingRecurring.timeZone ?? getDeviceTimeZone();
    const nextDueAt = dateOnlyToInstant(editRecurNextDate, timeZone);
    updateRecurringExpense(editingRecurring.id, {
      description: editRecurDesc.trim(),
      amount,
      frequency: editRecurFreq,
      ...(editRecurFreq === "custom" ? { customDays: parseInt(editRecurCustomDays) || 30 } : {}),
      nextDueAt,
      timeZone,
    });
    setEditingRecurring(null);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }

  function getRecurringStatus(r: RecurringExpense): { label: string; color: string } {
    if (!r.isActive) {
      if (
        (r.endType === "count" && r.endCount !== undefined && (r.occurrenceCount ?? 0) >= r.endCount) ||
        (r.endType === "date" && r.endDate && new Date() > new Date(r.endDate + "T23:59:59"))
      ) {
        return { label: "Completed", color: colors.textTertiary };
      }
      return { label: "Paused", color: colors.warning };
    }
    return { label: "Active", color: colors.success };
  }

  function renderRecurringSection() {
    if (groupRecurring.length === 0) return null;
    return (
      <View style={recurStyles.section}>
        {groupRecurring.map(r => {
          const status = getRecurringStatus(r);
          const freqLabel = recurringIntervalLabel(r);
          const statusBackground = status.label === "Active"
            ? colors.successLight
            : status.label === "Paused"
              ? colors.warningLight
              : colors.border;
          const nextDate = new Date(r.nextDueAt);
          const nextLabel = nextDate.toLocaleDateString("en", { month: "short", day: "numeric" });
          return (
            <View
                key={r.id}
                onStartShouldSetResponder={() => true}
                onResponderRelease={() => setOpenRecurId(id => (id === r.id ? null : r.id))}
                style={[
                  recurStyles.card,
                {
                  backgroundColor: colors.cardBg,
                  borderColor: colors.border,
                  shadowColor: colors.shadow,
                },
              ]}
            >
              <View style={recurStyles.cardMain}>
                <CategoryIcon category={r.category} description={r.description} size={40} />
                <View style={{ flex: 1 }}>
                  <Text style={[recurStyles.cardDesc, { color: colors.text }]} numberOfLines={1}>
                    {r.description}
                  </Text>
                  <View style={recurStyles.cardMeta}>
                    <View style={[recurStyles.freqPill, { backgroundColor: colors.border }]}>
                      <Feather name="repeat" size={11} color={colors.textSecondary} />
                      <Text style={[recurStyles.freqPillText, { color: colors.textSecondary }]}>{freqLabel}</Text>
                    </View>
                    <Text style={[recurStyles.metaDot, { color: colors.textTertiary }]}>·</Text>
                    <Text style={[recurStyles.metaText, { color: colors.textSecondary }]}>Next {nextLabel}</Text>
                  </View>
                </View>
                <View style={recurStyles.amountColumn}>
                  <View style={[recurStyles.statusPill, { backgroundColor: statusBackground }]}>
                    <View style={[recurStyles.statusDot, { backgroundColor: status.color }]} />
                    <Text style={[recurStyles.statusText, { color: status.color }]}>{status.label}</Text>
                  </View>
                  <Text style={[recurStyles.cardAmount, { color: colors.text }]}>
                    {(group?.currency ? (CURRENCY_SYMBOLS[group.currency] ?? "") : "") + r.amount.toFixed(2)}
                  </Text>
                  <Pressable
                    onPress={() => setOpenRecurId(id => (id === r.id ? null : r.id))}
                    hitSlop={10}
                    accessibilityRole="button"
                    accessibilityLabel="More options"
                    style={{ alignSelf: "flex-end", marginTop: 4 }}
                  >
                    <Feather name="more-horizontal" size={18} color={colors.textSecondary} />
                  </Pressable>
                </View>
              </View>
              <View style={[recurStyles.cardActions, openRecurId === r.id ? null : { display: "none" }]}>
                <Pressable
                  style={[recurStyles.actionBtn, { backgroundColor: colors.primaryLight }]}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    router.push({
                      pathname: "/expense/new",
                      params: { recurringId: r.id, groupId: r.groupId, mode: "recurring" },
                    });
                  }}
                >
                  <Feather name="edit-2" size={13} color={colors.primary} />
                  <Text style={[recurStyles.actionBtnText, { color: colors.primary }]}>Edit</Text>
                </Pressable>
                <Pressable
                  style={[recurStyles.actionBtn, { backgroundColor: r.isActive ? colors.warningLight : colors.successLight }]}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    updateRecurringExpense(r.id, { isActive: !r.isActive });
                  }}
                >
                  <Feather name={r.isActive ? "pause" : "play"} size={13} color={r.isActive ? colors.warning : colors.success} />
                  <Text style={[recurStyles.actionBtnText, { color: r.isActive ? colors.warning : colors.success }]}>
                    {r.isActive ? "Pause" : "Resume"}
                  </Text>
                </Pressable>
                <Pressable
                  style={[recurStyles.actionBtn, { backgroundColor: colors.dangerLight }]}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                    showAlert(
                      "Delete this schedule?",
                      `"${r.description}" will stop repeating and be removed. Existing expenses it already created stay. You can undo this right after.`,
                      [
                        { text: "Cancel", style: "cancel" },
                        {
                          text: "Delete",
                          style: "destructive",
                          onPress: () => deleteRecurringExpense(r.id),
                        },
                      ]
                    );
                  }}
                >
                  <Feather name="trash-2" size={13} color={colors.danger} />
                  <Text style={[recurStyles.actionBtnText, { color: colors.danger }]}>Delete</Text>
                </Pressable>
              </View>
            </View>
          );
        })}
      </View>
    );
  }


  function handleSendChat() {
    if (!chatText.trim()) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    addGroupMessage(id, chatText);
    setChatText("");
    setTimeout(() => chatListRef.current?.scrollToEnd({ animated: true }), 60);
    chatInputRef.current?.blur();
  }

  function renderExpenseItem(expense: Expense) {
    const payer = getMemberById(expense.paidById);
    const paidAmounts = getExpensePaidAmounts(expense);
    const myPaidAmount = paidAmounts[currentUser.id] ?? 0;
    const youPaid = myPaidAmount > 0;
    const involvedCount = new Set([
      expense.paidById,
      ...Object.keys(paidAmounts),
      ...(expense.splits ?? []).map(split => split.memberId),
    ]).size;
    const myShare = expense.splits.find(s => s.memberId === currentUser.id);
    const isInvolved = youPaid || !!myShare;
    const netForMe = isInvolved
      ? (youPaid ? myPaidAmount - (myShare?.amount ?? 0) : -(myShare!.amount))
      : null;
    const reactionCount = Object.values(expense.reactions ?? {}).reduce((s, ids) => s + ids.length, 0);
    const commentCount = (expense.comments ?? []).length;
    const isNewExpense = highlightedExpenseIds.has(expense.id);

    return (
      <Pressable
        style={({ pressed }) => [
          styles.expenseRow,
          {
            backgroundColor: colors.cardBg,
            borderColor: colors.border,
            borderWidth: 1,
            shadowColor: colors.shadow,
            opacity: pressed ? 0.92 : 1,
          },
        ]}
        onPress={() => router.push({ pathname: "/expense/[id]", params: { id: expense.id } })}
        onLongPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          showActionSheet(expense.description, [
            {
              text: "Edit expense",
              icon: "edit-2",
              onPress: () =>
                router.push({ pathname: "/expense/new", params: { expenseId: expense.id, groupId: expense.groupId } }),
            },
            {
              text: "Delete expense",
              icon: "trash-2",
              style: "destructive",
              onPress: () =>
                showAlert(
                  "Delete this expense?",
                  `"${expense.description}" will be permanently removed for everyone in the group. You can undo this right after.`,
                  [
                    { text: "Cancel", style: "cancel" },
                    { text: "Delete", style: "destructive", onPress: () => deleteExpense(expense.id) },
                  ]
                ),
            },
            { text: "Cancel", style: "cancel" },
          ], formatAmount(expense.amount, expense.currency));
        }}
      >
        <CategoryIcon category={expense.category} description={expense.description} size={40} />
        <View style={styles.expenseBody}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "nowrap", minWidth: 0 }}>
            <Text style={[styles.expenseName, { color: colors.text, flexShrink: 1, minWidth: 0 }]} numberOfLines={1}>
              {expense.description}
            </Text>
            {isNewExpense && (
              <Text style={[styles.newExpenseLabel, { color: colors.teal, backgroundColor: colors.tealTint, paddingHorizontal: 6, paddingVertical: 1, borderRadius: 5, overflow: "hidden", flexShrink: 0 }]}>NEW</Text>
            )}
            <View style={[styles.expensePeople, { flexShrink: 0 }]}>
              
            </View>
            {!!expense.sourceRecurringId && (
              <View style={[styles.recurringBadge, { backgroundColor: colors.primaryLight, flexShrink: 0 }]}>
                <Feather name="repeat" size={10} color={colors.primary} />
                <Text style={[styles.recurringBadgeText, { color: colors.primary }]}>Recurring</Text>
              </View>
            )}
          </View>
          <View style={styles.expenseMetaRow}>
            <Text style={[styles.expenseMeta, { color: colors.textSecondary }]}>
              {youPaid ? "You" : (
                <Text style={{ color: colors.primary, fontFamily: "Inter_500Medium" }}>
                  {payer?.name ?? "Someone"}
                </Text>
              )}
              {" paid · "}{formatExpenseDate(expense.paymentDate, expense.createdAt)}
            </Text>
            {(reactionCount > 0 || commentCount > 0) && (
              <View style={styles.expenseSocialRow}>
                {reactionCount > 0 && (
                  <Text style={[styles.expenseSocial, { color: colors.textTertiary }]}>👍 {reactionCount}</Text>
                )}
                {commentCount > 0 && (
                  <Text style={[styles.expenseSocial, { color: colors.textTertiary }]}>💬 {commentCount}</Text>
                )}
              </View>
            )}
          </View>
          {!isInvolved && (
            <View
              style={[
                styles.notInvolvedPill,
                {
                  backgroundColor: `${colors.textSecondary}1A`,
                  borderColor: `${colors.textSecondary}33`,
                },
              ]}
            >
              <Feather name="eye-off" size={11} color={colors.textSecondary} />
              <Text style={[styles.notInvolvedText, { color: colors.textSecondary }]}>Not involved</Text>
            </View>
          )}
        </View>
        <View style={styles.expenseRight}>
          {/* declutterRow */ false && expense.currency !== group!.currency && (
            <Text style={[styles.expenseForeignOrig, { color: isInvolved ? colors.textTertiary : colors.warning }]}>
              ≈ {formatAmount(convertAmount(expense.amount, expense.currency, group!.currency), group!.currency)}
            </Text>
          )}
          <AmountText
            amount={expense.amount}
              currency={expense.currency}
            style={isInvolved && netForMe !== null ? [styles.expenseNet, { color: colors.textTertiary }] : [styles.expenseTotal, { color: isInvolved ? colors.text : colors.warning }]}
          />
          {isInvolved && netForMe !== null && (
            <Text style={[styles.expenseTotal, { color: netForMe >= 0 ? colors.positive : colors.negative }]}>
              {netForMe >= 0 ? "+" : "-"}{formatAmount(
                Math.abs(expense.currency !== group!.currency
                  ? convertAmount(netForMe, expense.currency, group!.currency)
                  : netForMe),
                group!.currency
              )}
            </Text>
          )}
        </View>
      </Pressable>
    );
  }

  function renderSettlementItem(settlement: Settlement) {
    const from = getMemberById(settlement.fromId);
    const to = getMemberById(settlement.toId);
    const payerIdentity = from ?? (settlement.fromId === currentUser.id ? currentUser : undefined);
    const isMe = settlement.fromId === currentUser.id || settlement.toId === currentUser.id;

    return (
      <Pressable
        style={({ pressed }) => [
          styles.expenseRow,
          {
            backgroundColor: colors.cardBg,
            borderColor: colors.border,
            shadowColor: colors.shadow,
            opacity: pressed ? 0.92 : 1,
          },
        ]}
        onPress={() => router.push({ pathname: "/settlement/[id]", params: { id: settlement.id } })}
        onLongPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          showActionSheet("Settlement record", [
            {
              text: "Remove payment",
              icon: "trash-2",
              style: "destructive",
              onPress: () =>
                showAlert(
                  "Remove this payment?",
                  "The outstanding balance between these members will be restored. You can undo this right after.",
                  [
                    { text: "Cancel", style: "cancel" },
                    { text: "Remove", style: "destructive", onPress: () => deleteSettlement(settlement.id) },
                  ]
                ),
            },
            { text: "Cancel", style: "cancel" },
          ], formatAmount(settlement.amount, group!.currency));
        }}
      >
        {payerIdentity && (
          <Avatar
            name={payerIdentity.name}
            color={payerIdentity.avatarColor}
            size={40}
            imageUri={payerIdentity.photo}
          />
        )}
        <View style={styles.expenseBody}>
          <Text style={[styles.expenseName, { color: colors.text }]} numberOfLines={1}>
            {settlement.fromId === currentUser.id ? "You" : from?.name ?? "Someone"}
            {" → "}
            {settlement.toId === currentUser.id ? "you" : to?.name ?? "Someone"}
          </Text>
          <Text style={[styles.expenseMeta, { color: colors.textSecondary }]}>
            Settlement · {timeAgo(settlement.createdAt)}
          </Text>
        </View>
        <View style={styles.expenseRight}>
          <AmountText amount={settlement.amount} currency={group!.currency} style={[styles.expenseTotal, { color: colors.teal }]} />
          <Text style={[styles.expenseNet, { color: colors.teal }]}>settled</Text>
        </View>
      </Pressable>
    );
  }

  function renderTabBar() {
    return (
      <View style={[
        styles.tabBar,
        { backgroundColor: colors.surface, borderBottomColor: colors.border },
      ]}>
        {(["expenses", "recurring", "balances", "charts", ...(tab === "chat" ? ["chat"] : [])] as Tab[]).map(t => {
          const labels: Record<Tab, string> = { expenses: "Expenses", recurring: "Recurring", balances: "Balances", charts: "Insights", chat: "Chat" };
          const hasUnread = t === "chat" ? hasNewChat : t === "expenses" ? hasNewExpenses : false;
          return (
            <Pressable
              key={t}
              style={[styles.tabItem, tab === t && { borderBottomColor: colors.primary, borderBottomWidth: 2 }]}
              onPress={() => handleSetTab(t)}
            >
              <Text style={[styles.tabLabel, { color: tab === t ? colors.primary : colors.textSecondary }]}>
                {labels[t]}
              </Text>
              {hasUnread && tab !== t && (
                <View style={[styles.tabDot, { backgroundColor: colors.negative }]} />
              )}
            </Pressable>
          );
        })}
      </View>
    );
  }

  function renderSimplifyDebtsControl() {
    return (
      <View
        style={[
          styles.simplifyDebtsControl,
          {
            backgroundColor: colors.surface,
            borderColor: colors.border,
          },
        ]}
      >
        <View style={[styles.simplifyDebtsControlIcon, { backgroundColor: colors.primaryDark }]}>
          <Feather name="git-merge" size={16} color="#FFFFFF" />
        </View>
        <View style={styles.simplifyDebtsControlCopy}>
          <Text style={[styles.simplifyDebtsControlTitle, { color: colors.text }]}>Simplify debts</Text>
          <Text style={[styles.simplifyDebtsControlSubtitle, { color: colors.textSecondary }]}>
            {simplifyDebtsEnabled ? "On · Fewer payment relationships" : "Off · Show each debt separately"}
          </Text>
        </View>
        <Switch
          value={simplifyDebtsEnabled}
          onValueChange={() => toggleSimplifyDebts(id)}
          trackColor={{ false: colors.switchOff, true: "#0D9488" }}
          thumbColor="#FFFFFF"
          ios_backgroundColor={colors.switchOff}
          accessibilityLabel="Toggle Simplify Debts"
        />
        <Pressable
          style={[styles.simplifyInfoButton, { backgroundColor: colors.surfaceElevated, borderColor: colors.textSecondary }]}
          onPress={() => setShowSimplifyDebtsInfo(true)}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Learn how Simplify Debts works"
        >
          <Feather name="info" size={16} color={colors.textSecondary} />
        </Pressable>
      </View>
    );
  }

  // First name, plus last-name initial when another member shares that first name.
  function balanceDisplayName(member?: { id: string; name?: string } | null): string {
    const full = (member?.name ?? "").trim();
    if (!full) return "Someone";
    const parts = full.split(/s+/);
    const first = parts[0];
    const clash = (group?.memberIds ?? []).some(mid => {
      if (mid === member!.id) return false;
      const other = getMemberById(mid);
      return !other?.isCurrentUser && (other?.name ?? "").trim().split(/s+/)[0]?.toLowerCase() === first.toLowerCase();
    });
    if (!clash || parts.length < 2) return first;
    return `${first} ${parts[parts.length - 1][0].toUpperCase()}.`;
  }

  function renderBalances() {
    if (debts.length === 0) {
      return (
        <View style={styles.listContent}>
          {renderSimplifyDebtsControl()}
          <Text style={[styles.balanceBoardSubtitle, styles.balanceIntroText, { color: colors.textSecondary }]}>
            Outstanding payments between members
          </Text>
          <View style={styles.settledCard}>
            <View style={[styles.settledIcon, { backgroundColor: colors.successLight }]}>
              <Feather name="check-circle" size={28} color={colors.success} />
            </View>
            <Text style={[styles.settledTitle, { color: colors.text }]}>All settled up!</Text>
            <Text style={[styles.settledSub, { color: colors.textSecondary }]}>No outstanding balances</Text>
          </View>
        </View>
      );
    }

    return (
      <ScrollView
        style={styles.balanceScroll}
               contentContainerStyle={[styles.listContent, { paddingBottom: fabListBottomPadding }]}
        showsVerticalScrollIndicator={false}
        alwaysBounceVertical
        onScroll={handleContentScroll}
        scrollEventThrottle={16}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={refreshIndicatorColor}
            colors={[refreshIndicatorColor]}
          />
        }
      >
        <View>
          {renderSimplifyDebtsControl()}
          <View style={[styles.balanceBoardHeader, { display: "none" }]} /* declutterBalances */>
            <View style={styles.balanceBoardHeaderCopy}>
              <Text style={[styles.balanceBoardSubtitle, { color: colors.textSecondary }]}>
                Outstanding payments between members
              </Text>
            </View>
            <View style={[styles.balanceCountBadge, { backgroundColor: colors.surfaceElevated }]}>
              <Text style={[styles.balanceCountText, { color: colors.textSecondary }]}>{debts.length}</Text>
            </View>
          </View>

          <View style={styles.balanceRows}>
            {orderedDebts.map((debt, index) => {
              const from = getMemberById(debt.fromId);
              const to = getMemberById(debt.toId);
              const isMyDebt = debt.fromId === currentUser.id;
              const isMyCredit = debt.toId === currentUser.id;
              const involvesMe = isMyDebt || isMyCredit;
              const fromName = from?.isCurrentUser ? "You" : balanceDisplayName(from);
              const toName = to?.isCurrentUser ? "You" : balanceDisplayName(to);
              const amountColor = isMyCredit ? colors.positive : isMyDebt ? colors.negative : colors.text;
              const roleText = isMyDebt ? "you pay" : isMyCredit ? "you get" : null;

              return (
                <Pressable
                  key={`${debt.fromId}_${debt.toId}`}
                  style={[
                    styles.balanceCard,
                    index > 0 && styles.balancePaymentRowSpaced,
                    { backgroundColor: colors.surface, borderColor: colors.border, shadowColor: colors.shadow },
                  ]}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    setBalanceDetail({ fromId: debt.fromId, toId: debt.toId, amount: debt.amount });
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={`${fromName} pays ${toName} ${formatAmount(debt.amount, group!.currency)}`}
                >
                  <View style={styles.balanceCardTop}>
                    <View style={styles.balanceAvatarPair}>
                      <View style={[styles.balanceAvatarRing, { borderColor: colors.surface }]}>
                        <Avatar name={from?.name ?? ""} color={from?.avatarColor ?? colors.primaryLight} size={28} imageUri={from?.photo} />
                      </View>
                      <View style={[styles.balanceAvatarRing, styles.balanceAvatarOverlap, { borderColor: colors.surface }]}>
                        <Avatar name={to?.name ?? ""} color={to?.avatarColor ?? colors.primaryLight} size={28} imageUri={to?.photo} />
                      </View>
                    </View>
                    <View style={styles.balanceCardNames}>
                      <Text style={[styles.balanceCardTitle, { color: colors.text }]} numberOfLines={1}>
                        {fromName} → {toName}
                      </Text>
                      {roleText ? (
                        <Text style={[styles.balanceCardRole, { color: colors.textSecondary }]}>{roleText}</Text>
                      ) : null}
                    </View>
                    <Text style={[styles.balanceCardAmount, { color: amountColor }]} numberOfLines={1}>
                      {formatAmount(debt.amount, group!.currency)}
                    </Text>
                  </View>
                  {involvesMe && (
                    <View style={styles.balanceCardActions}>
                      <Pressable
                        style={[styles.balanceRemindBtn, { backgroundColor: colors.warningLight }]}
                        onPress={() => openReminderModal(debt.fromId, debt.toId, debt.amount)}
                        accessibilityRole="button"
                        accessibilityLabel="Send reminder"
                      >
                        <Feather name="bell" size={14} color={colors.warning} />
                        <Text style={[styles.balanceBtnText, { color: colors.warning }]}>Remind</Text>
                      </Pressable>
                      <Pressable
                        style={[styles.balanceSettleBtn, { backgroundColor: colors.teal }]}
                        onPress={() => openSettleModal(debt.fromId, debt.toId, debt.amount)}
                        accessibilityRole="button"
                        accessibilityLabel={isMyCredit ? "Mark as paid" : "Settle balance"}
                      >
                        <Text style={[styles.balanceBtnText, { color: "#fff" }]}>{isMyCredit ? "Mark paid" : "Settle"}</Text>
                      </Pressable>
                    </View>
                  )}
                </Pressable>
              );
            })}
          </View>
        </View>
      </ScrollView>
    );
  }

  function renderChat() {
    return (
      <KeyboardAvoidingView
        style={{ flex: 1, overflow: "hidden" }}
        behavior="translate-with-padding"
        keyboardVerticalOffset={0}
      >
        <FlatList
          ref={chatListRef}
          onContentSizeChange={() => chatListRef.current?.scrollToEnd({ animated: true })}
          onLayout={() => chatListRef.current?.scrollToEnd({ animated: false })}
          data={messages}
          keyExtractor={m => m.id}
          contentContainerStyle={styles.chatList}
          showsVerticalScrollIndicator={false}
          keyboardDismissMode="on-drag"
          keyboardShouldPersistTaps="handled"
          ListEmptyComponent={
            <EmptyState
              icon="message-circle"
              title="No messages yet"
              subtitle="Start the group conversation"
            />
          }
          renderItem={({ item }: { item: GroupMessage }) => {
            const author = getMemberById(item.memberId);
            const isMe = item.memberId === currentUser.id;
            const reads = groupMessageReads[id] ?? {};
            // "Read by" = other members whose read cursor is at or after this message's time.
            const readByIds = isMe
              ? (group?.memberIds ?? []).filter(mid => {
                  if (mid === item.memberId) return false;
                  const cursor = reads[mid];
                  return !!cursor && new Date(cursor).getTime() >= new Date(item.createdAt).getTime();
                })
              : [];
            const otherMemberCount = (group?.memberIds.length ?? 1) - 1;
            const hasRead = readByIds.length > 0;
            const messageBubble = (
              <View style={styles.chatBubbleWrap}>
                {!isMe && (
                  <Text style={[styles.chatAuthor, { color: colors.primary }]}>
                    {author?.name ?? "Former member"}
                  </Text>
                )}
                <View style={[
                  styles.chatBubble,
                  {
                    backgroundColor: isMe ? colors.primary : colors.surface,
                    borderColor: isMe ? colors.primary : colors.border,
                  },
                ]}>
                  <Text style={[styles.chatText, { color: isMe ? "#fff" : colors.text }]}>
                    {item.text}
                  </Text>
                </View>
                <Pressable
                  disabled={!isMe}
                  onPress={() => openReadBySheet(item)}
                  style={[styles.chatMetaRow, { alignSelf: isMe ? "flex-end" : "flex-start" }]}
                >
                  <Text style={[styles.chatTime, { color: colors.textTertiary }]}>
                    {timeAgo(item.createdAt)}{item.failed ? <Text style={{ color: colors.danger }}> · Not sent</Text> : null}
                  </Text>
                  {isMe && (
                    <Ionicons
                      name={hasRead ? "checkmark-done" : "checkmark"}
                      size={15}
                      color={colors.success}
                      style={{ marginLeft: 4 }}
                    />
                  )}
                </Pressable>
              </View>
            );
            const swipeGesture = Gesture.Pan()
              .activeOffsetX([-14, 14])
              .failOffsetY([-14, 14])
              .onEnd((event) => {
                if (Math.abs(event.translationX) >= 45) {
                  runOnJS(openReadBySheet)(item);
                }
              });
            return (
              <View style={[styles.chatRow, isMe && styles.chatRowMe]}>
                {!isMe && (
                  <Pressable
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      setProfileMemberId(item.memberId);
                    }}
                  >
                    <Avatar name={author?.name ?? ""} color={author?.avatarColor ?? "#ccc"} size={28} imageUri={author?.photo} />
                  </Pressable>
                )}
                {isMe ? (
                  <GestureDetector gesture={swipeGesture}>
                    {messageBubble}
                  </GestureDetector>
                ) : messageBubble}
              </View>
            );
          }}
        />
        <View
          style={[
            styles.chatInputBar,
            {
              backgroundColor: colors.surface,
              borderTopColor: colors.border,
              paddingBottom: Math.max(insets.bottom, 10),
            },
          ]}
        >
          <Avatar name={currentUser.name} color={currentUser.avatarColor} size={30} imageUri={currentUser.photo} />
          <TextInput
            ref={chatInputRef}
            style={[styles.chatInput, { color: colors.text, backgroundColor: colors.inputBg }]}
            value={chatText}
            onChangeText={setChatText}
            placeholder="Message the group…"
            placeholderTextColor={colors.textTertiary}
            returnKeyType="send"
            onSubmitEditing={handleSendChat}
            multiline
          />
          <Pressable
            style={styles.chatSendBtn}
            onPress={handleSendChat}
           accessibilityRole="button" accessibilityLabel="Send">
            <Feather name="send" size={19} color={chatText.trim() ? colors.primary : colors.textTertiary} />
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    );
  }

  function renderPaymentComparisonCard() {
    return (
      <View style={[styles.contributionCard, { backgroundColor: colors.surface }]}>
        <View style={styles.groupTotalHeader}>
          <View style={[styles.groupTotalIcon, { backgroundColor: colors.successLight }]}>
            <Feather name="credit-card" size={18} color={colors.success} />
          </View>
          <View style={styles.groupTotalCopy}>
            <Text style={[styles.chartTitle, { color: colors.text }]}>Payments vs expense share</Text>
              <Text /* insightsTotal */ style={{ fontSize: 13, color: colors.textSecondary, marginTop: 2, fontFamily: "Inter_500Medium" }}>
                Total spent <Text style={{ color: colors.text, fontFamily: "Inter_700Bold" }}>{formatAmount(totalExpenses, group!.currency)}</Text>
              </Text>
          </View>
        </View>

        <View style={[styles.paymentLegend, { borderBottomColor: colors.border }]}>
          <View style={styles.paymentLegendItem}>
            <View style={[styles.paymentLegendDot, { backgroundColor: colors.primary }]} />
            <Text style={[styles.paymentLegendText, { color: colors.textSecondary }]}>Paid</Text>
          </View>
          <View style={styles.paymentLegendItem}>
            <View style={[styles.paymentLegendDot, { backgroundColor: colors.success }]} />
            <Text style={[styles.paymentLegendText, { color: colors.textSecondary }]}>Their share</Text>
          </View>
        </View>

        {memberFinancialRows.map(row => {
          const member = getMemberById(row.memberId);
          if (!member) return null;
          const paidPct = row.paid / paymentComparisonMax;
          const sharePct = row.share / paymentComparisonMax;
          const difference = Math.abs(row.difference);
          const differenceLabel = difference < 0.005
            ? "Balanced"
            : row.difference > 0
              ? `Gets back ${formatAmount(difference, group!.currency)}`
              : `Owes ${formatAmount(difference, group!.currency)}`;
          return (
            <View key={row.memberId} style={styles.paymentComparisonRow}>
              <View style={styles.paymentPersonHeader}>
                <Avatar
                  name={member.name}
                  color={member.avatarColor}
                  size={28}
                  imageUri={member.photo}
                />
                <Text style={[styles.contributionName, { color: colors.text }]} numberOfLines={1}>
                  {member.isCurrentUser ? "You" : member.name.split(" ")[0]}
                </Text>
                <Text style={[styles.paymentDifference, { color: row.difference > 0 ? colors.positive : row.difference < 0 ? colors.negative : colors.textTertiary }]}>
                  {differenceLabel}
                </Text>
              </View>
              <View style={styles.paymentBarRow}>
                <Text style={[styles.paymentBarLabel, { color: colors.textSecondary }]}>Paid</Text>
                <View style={[styles.memberBarTrack, { backgroundColor: colors.border }]}>
                  <View style={[styles.memberBarFill, { backgroundColor: colors.primary, width: `${Math.max(paidPct * 100, row.paid > 0 ? 2 : 0)}%` as any }]} />
                </View>
                <Text numberOfLines={1} style={[styles.paymentBarValue, { color: colors.textSecondary }]}>
                  {formatAmount(row.paid, group!.currency)}
                </Text>
              </View>
              <View style={styles.paymentBarRow}>
                <Text style={[styles.paymentBarLabel, { color: colors.textSecondary }]}>Share</Text>
                <View style={[styles.memberBarTrack, { backgroundColor: colors.border }]}>
                  <View style={[styles.memberBarFill, { backgroundColor: colors.success, width: `${Math.max(sharePct * 100, row.share > 0 ? 2 : 0)}%` as any }]} />
                </View>
                <Text numberOfLines={1} style={[styles.paymentBarValue, { color: colors.textSecondary }]}>
                  {formatAmount(row.share, group!.currency)}
                </Text>
              </View>
            </View>
          );
        })}
      </View>
    );
  }

  return (
    <View
      style={[styles.container, { backgroundColor: colors.background }]}
    >
      <View style={[styles.header, { paddingTop: topPad + 8, backgroundColor: colors.headerBg }]}>
        <Pressable onPress={() => router.back()} style={styles.backBtn} accessibilityRole="button" accessibilityLabel="Back">
          <Feather name="arrow-left" size={24} color={colors.text} />
        </Pressable>
        <View style={styles.headerCenter}>
          <MonochromeIconTile
            icon={groupIconName(group)}
            size={32}
            color={colors.textSecondary}
            borderColor={colors.border}
          />
          <View style={{ flex: 1 }}>
            <Text style={[styles.groupName, { color: colors.text }]} numberOfLines={1}>{group.name}</Text>
            {group.isArchived && (
              <Text style={[styles.archivedBadge, { color: colors.warning }]}>Archived</Text>
            )}
          </View>
        </View>
        {renderTripPassPill()}
        {debts.length > 0 && (
          <Pressable
            style={[styles.settleAllBtn, { backgroundColor: colors.teal }]}
            onPress={handleSettleAll}
          >
            <Text style={styles.settleAllBtnText}>Settle Up</Text>
          </Pressable>
        )}
        <Pressable
            /* headerChatBtn */
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              groupNotifs.filter(n => !n.read && n.type === "group_message" && n.groupId === id).forEach(n => markGroupNotifRead(n.id));
              markGroupMessagesRead(id);
              setChatOpen(true);
            }}
            hitSlop={6}
            accessibilityRole="button"
            accessibilityLabel="Group chat"
            style={[styles.headerMembersBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}
          >
            <Feather name="message-circle" size={16} color={colors.text} />
            {groupNotifs.some(n => !n.read && n.type === "group_message" && n.groupId === id) && (
              <View style={{ position: "absolute", top: 4, right: 4, width: 8, height: 8, borderRadius: 4, backgroundColor: colors.danger }} />
            )}
          </Pressable>
          <Modal
            visible={chatOpen}
            transparent
            animationType="fade"
            onRequestClose={() => { setChatOpen(false); markGroupMessagesRead(id); }}
          >
            <BlurView intensity={30} tint="dark" style={StyleSheet.absoluteFill}>
              <Pressable
                style={StyleSheet.absoluteFill}
                onPress={() => { setChatOpen(false); markGroupMessagesRead(id); }}
                accessibilityLabel="Close chat"
              />
            </BlurView>
            <RNKeyboardAvoidingView
              behavior={Platform.OS === "ios" ? "padding" : undefined}
              style={{ flex: 1, justifyContent: "flex-end" }}
              pointerEvents="box-none"
            >
              <View style={{ height: "82%", backgroundColor: colors.background, borderTopLeftRadius: 24, borderTopRightRadius: 24, overflow: "hidden" }}>
                <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingTop: 14, paddingBottom: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }}>
                  <Text style={{ fontSize: 17, fontFamily: "Inter_700Bold", color: colors.text }}>{group?.name ?? "Chat"}</Text>
                  <Pressable onPress={() => { setChatOpen(false); markGroupMessagesRead(id); }} hitSlop={12} accessibilityRole="button" accessibilityLabel="Close chat">
                    <Feather name="x" size={22} color={colors.textSecondary} />
                  </Pressable>
                </View>
                <View style={{ flex: 1 }}>{renderChat()}</View>
              </View>
            </RNKeyboardAvoidingView>
          </Modal>
          <Pressable
            style={[styles.headerMembersBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            router.push({ pathname: "/group/members", params: { id } });
          }}
          hitSlop={4}
          accessibilityRole="button"
          accessibilityLabel="View group members"
        >
          <Feather name="users" size={16} color={colors.text} />
          <Text style={[styles.headerMembersCount, { color: colors.text }]}>{group.memberIds.length}</Text>
        </Pressable>
        <Pressable onPress={handleGroupOptions} accessibilityRole="button" accessibilityLabel="More options">
          <Feather name="more-horizontal" size={24} color={colors.text} />
        </Pressable>
      </View>

      <View style={[styles.statsBar, { backgroundColor: colors.surface, display: "none" }]}>
        <View style={[styles.statItem, styles.statItemTotal]}>
          <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Total</Text>
          <Text
            style={[styles.statValue, styles.statValueTotal, { color: colors.text }]}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.6}
          >
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

      {showRatesWarning && (
        <View style={[styles.ratesWarningBanner, { backgroundColor: colors.warningLight, borderColor: colors.warning }]}>
          <Feather name="alert-triangle" size={14} color={colors.warning} />
          <Text style={[styles.ratesWarningText, { color: colors.warning }]}>
            Exchange rates unavailable — balances may be approximate
          </Text>
          <Pressable
            onPress={() => setDismissedRatesWarning(true)}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
           accessibilityRole="button" accessibilityLabel="Close">
            <Feather name="x" size={14} color={colors.warning} />
          </Pressable>
        </View>
      )}

      {/* Balance summary follows the group totals for quick context. */}
      {renderBalanceSummary()}
      {renderTabBar()}
      {group && (
        <CurrencyPickerModal
          visible={showGroupCurrency}
          onClose={() => setShowGroupCurrency(false)}
          value={group.currency}
          title="Group Currency"
          onChange={(code) => {
            setShowGroupCurrency(false);
            if (code !== group.currency) {
              updateGroup(group.id, { currency: code });
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            }
          }}
        />
      )}
      {renderUnlockBanner()}

      {tab === "balances" ? (
        renderBalances()
      ) : (
        <>
          {tab === "expenses" ? (
            <FlatList
              ref={feedListRef}
              data={feedItems}
              keyExtractor={item => item.id}
              keyboardDismissMode="on-drag"
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={[styles.listContent, { paddingBottom: fabListBottomPadding }]}
              ListEmptyComponent={
                <EmptyState icon="credit-card" title="No expenses yet" subtitle="Add your first expense to start splitting" />
              }
              renderItem={({ item }) => item.type === "expense" ? renderExpenseItem(item.data) : renderSettlementItem(item.data)}
              onScrollToIndexFailed={({ index }) => {
                setTimeout(() => feedListRef.current?.scrollToIndex({ index, animated: true }), 300);
              }}
              showsVerticalScrollIndicator={false}
               onScroll={handleContentScroll}
               scrollEventThrottle={16}
              refreshControl={
                <RefreshControl
                  refreshing={refreshing}
                  onRefresh={handleRefresh}
                  tintColor={refreshIndicatorColor}
                  colors={[refreshIndicatorColor]}
                />
              }
            />
          ) : tab === "recurring" ? (
            <ScrollView
              contentContainerStyle={[styles.listContent, { paddingBottom: fabListBottomPadding }]}
              showsVerticalScrollIndicator={false}
              onScroll={handleContentScroll}
              scrollEventThrottle={16}
              refreshControl={
                <RefreshControl
                  refreshing={refreshing}
                  onRefresh={handleRefresh}
                  tintColor={refreshIndicatorColor}
                  colors={[refreshIndicatorColor]}
                />
              }
            >
              {groupRecurring.length > 0 ? (
                renderRecurringSection()
              ) : (
                <EmptyState
                  icon="repeat"
                  title="No recurring expenses"
                  subtitle="Create a recurring expense to automate regular payments"
                />
              )}
            </ScrollView>
          ) : tab === "chat" ? (
            renderChat()
          ) : (
            <KeyboardAwareScrollViewCompat
              contentContainerStyle={[styles.listContent, { paddingBottom: Platform.OS === "web" ? 192 : 160, gap: 16 }]}
              showsVerticalScrollIndicator={false}
              keyboardDismissMode="on-drag"
              keyboardShouldPersistTaps="handled"
              bottomOffset={24}
              onScrollBeginDrag={() => setChartScrollSignal(previous => previous + 1)}
              onScroll={handleContentScroll}
              scrollEventThrottle={16}
              refreshControl={
                <RefreshControl
                  refreshing={refreshing}
                  onRefresh={handleRefresh}
                  tintColor={refreshIndicatorColor}
                  colors={[refreshIndicatorColor]}
                />
              }
            >
              {renderPaymentComparisonCard()}

              <View style={[styles.chartCard, { backgroundColor: colors.surface }]}>
                <Text style={[styles.chartTitle, { color: colors.text }]}>Group spending</Text>
                <Text style={[styles.chartSub, { color: colors.textSecondary }]}>
                  See spending by category and members.
                </Text>
                <GroupSpendingChart
                  expenses={spendingChartExpenses}
                  members={spendingChartMembers}
                  targetCurrency={group.currency}
                  convertAmount={convertAmount}
                  width={width - 64}
                  height={200}
                  formatValue={v => formatAmount(v, group.currency)}
                  textColor={colors.textTertiary}
                  gridColor={colors.border}
                  legendTextColor={colors.textSecondary}
                  inputBackgroundColor={colors.inputBg}
                  primaryLightColor={colors.primaryLight}
                  accentColor={colors.primary}
                  emptyText="Add expenses to see spending trends"
                  dismissSignal={chartScrollSignal}
                  cardBackgroundColor={colors.surface}
                />
              </View>

              <View style={[styles.chartCard, { backgroundColor: colors.surface }]}>
                <Text style={[styles.chartTitle, { color: colors.text }]}>Itemization</Text>
                <Text style={[styles.chartSub, { color: colors.textSecondary }]}>
                  Where the money went, by category
                </Text>

                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  style={styles.scopeScroll}
                  contentContainerStyle={styles.scopeRow}
                >
                  <Pressable
                    onPress={() => setItemizationScope("group")}
                    style={[
                      styles.scopePill,
                      { borderColor: colors.border },
                      itemizationScope === "group" && { backgroundColor: colors.primary, borderColor: colors.primary },
                    ]}
                  >
                    <Text style={[styles.scopePillText, { color: itemizationScope === "group" ? "#fff" : colors.textSecondary }]}>
                      Group
                    </Text>
                  </Pressable>
                  {group.memberIds.map(memberId => {
                    const member = getMemberById(memberId);
                    if (!member) return null;
                    const active = itemizationScope === memberId;
                    return (
                      <Pressable
                        key={memberId}
                        onPress={() => setItemizationScope(memberId)}
                        style={[
                          styles.scopePill,
                          { borderColor: colors.border },
                          active && { backgroundColor: colors.primary, borderColor: colors.primary },
                        ]}
                      >
                        <Text style={[styles.scopePillText, { color: active ? "#fff" : colors.textSecondary }]}>
                          {member.isCurrentUser ? "You" : member.name.split(" ")[0]}
                        </Text>
                      </Pressable>
                    );
                  })}
                </ScrollView>

                {itemizationRows.length === 0 ? (
                  <Text style={[styles.chartSub, { color: colors.textTertiary, marginTop: 14 }]}>
                    No expenses to categorize yet
                  </Text>
                ) : (
                  itemizationRows.map(row => {
                    const config = getCategoryConfig(row.cat);
                    return (
                      <View key={row.cat} style={styles.memberBar}>
                        <View style={styles.categoryBarLabel}>
                          <CategoryIcon category={row.cat} size={26} borderRadius={8} />
                          <Text style={[styles.memberBarName, { color: colors.text }]} numberOfLines={1}>
                            {ITEMIZATION_LABELS[row.cat] ?? "Miscellaneous"}
                          </Text>
                        </View>
                        <View style={[styles.memberBarTrack, { backgroundColor: colors.border }]}>
                          <View style={[styles.memberBarFill, { backgroundColor: config.color, width: `${Math.max(row.pct * 100, 2)}%` as any }]} />
                        </View>
                        <Text style={[styles.memberBarValue, { color: colors.textSecondary }]}>{formatAmount(row.amount, group.currency)}</Text>
                      </View>
                    );
                  })
                )}

                <View style={[styles.customItemizationSection, { borderTopColor: colors.border }]}>
                  <Text style={[styles.sectionLabel, { color: colors.text }]}>User-defined items</Text>
                  <Text style={[styles.customItemizationHint, { color: colors.textSecondary }]}>
                    Search expense descriptions, then choose where to group the matches.
                  </Text>
                  <View style={styles.customItemizationInputRow}>
                    <TextInput
                      value={customItemizationSearch}
                      onChangeText={setCustomItemizationSearch}
                      onSubmitEditing={addCustomItemization}
                      placeholder="Search expenses, e.g. water"
                      placeholderTextColor={colors.textTertiary}
                      returnKeyType="done"
                      style={[styles.customItemizationInput, { color: colors.text, borderColor: colors.border, backgroundColor: colors.inputBg }]}
                    />
                    <Pressable
                      onPress={addCustomItemization}
                      disabled={!customItemizationSearch.trim()}
                      accessibilityRole="button"
                      accessibilityLabel="Add user-defined item"
                      style={[
                        styles.customItemizationAdd,
                        { backgroundColor: customItemizationSearch.trim() ? colors.primary : colors.border },
                      ]}
                    >
                      <Feather name="plus" size={18} color="#fff" />
                    </Pressable>
                  </View>
                  <View style={styles.customItemizationCategoryWrap}>
                    {ITEMIZATION_CATEGORIES.map(category => {
                      const active = customItemizationCategory === category;
                      return (
                        <Pressable
                          key={category}
                          onPress={() => setCustomItemizationCategory(category)}
                          style={[
                            styles.customItemizationCategoryChip,
                            { borderColor: active ? colors.primary : colors.border },
                            active && { backgroundColor: colors.primaryLight },
                          ]}
                        >
                          <Text style={[styles.customItemizationCategoryText, { color: active ? colors.primary : colors.textSecondary }]}>
                            {ITEMIZATION_LABELS[category]}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                  {customItemizationRows.length > 0 && (
                    customItemizationRows.map(rule => (
                      <View key={rule.id} style={styles.customItemizationRule}>
                        <CategoryIcon category={rule.category} size={28} borderRadius={8} />
                        <View style={styles.customItemizationRuleCopy}>
                          <Text style={[styles.customItemizationRuleSearch, { color: colors.text }]} numberOfLines={1}>
                            {rule.searchTerm}
                          </Text>
                          <Text style={[styles.customItemizationRuleCategory, { color: colors.textSecondary }]} numberOfLines={1}>
                            {ITEMIZATION_LABELS[rule.category] ?? "Miscellaneous"}
                          </Text>
                        </View>
                        <Text style={[styles.customItemizationRuleAmount, { color: colors.textSecondary }]}>
                          {formatAmount(rule.amount, group.currency)}
                        </Text>
                        <Pressable
                          onPress={() => removeCustomItemization(rule.id)}
                          hitSlop={8}
                          accessibilityRole="button"
                          accessibilityLabel={`Remove ${rule.searchTerm}`}
                        >
                          <Feather name="x" size={16} color={colors.textTertiary} />
                        </Pressable>
                      </View>
                    ))
                  )}
                </View>
              </View>

            </KeyboardAwareScrollViewCompat>
          )}
        </>
      )}

      {(tab === "expenses" || tab === "recurring") && (
        <>
        {tab === "expenses" && fabOpen && (
          <Animated.View
            style={[
              styles.receiptFab,
                {
                  backgroundColor: colors.primaryLight,
                  borderColor: colors.textSecondary,
                  transform: [
                    { scale: fabScale },
                    { translateX: fabScrollProgress.interpolate({ inputRange: [0, 1], outputRange: [0, 17] }) },
                    { translateY: fabScrollProgress.interpolate({ inputRange: [0, 1], outputRange: [0, 2] }) },
                  ],
                },
            ]}
          >
            <Pressable
              style={styles.fabPressable}
              accessibilityRole="button"
              accessibilityLabel="Scan receipt"
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                router.push({ pathname: "/receipt/new", params: { groupId: id } });
              }}
            >
              <Feather name="camera" size={21} color={colors.primary} />
            </Pressable>
          </Animated.View>
        )}
        {tab === "expenses" && fabOpen && (
          <Animated.View
            style={[
              styles.manualFab,
                {
                  backgroundColor: colors.primaryLight,
                  borderColor: colors.textSecondary,
                  transform: [
                    { scale: fabScale },
                    { translateX: fabScrollProgress.interpolate({ inputRange: [0, 1], outputRange: [0, 5] }) },
                    { translateY: fabScrollProgress.interpolate({ inputRange: [0, 1], outputRange: [0, 17] }) },
                  ],
                },
            ]}
          >
            <Pressable
              style={styles.fabPressable}
              accessibilityRole="button"
              accessibilityLabel="Add expense manually"
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                setFabOpen(false);
                router.push({ pathname: "/expense/new", params: { groupId: id, mode: "normal" } });
              }}
            >
              <Feather name="edit-3" size={19} color={colors.primary} />
            </Pressable>
          </Animated.View>
        )}
        <Animated.View
          style={[
            styles.fab,
            { backgroundColor: colors.primary, transform: [{ scale: fabScale }] },
          ]}
        >
          <Pressable
            style={styles.fabPressable}
            accessibilityRole="button"
            accessibilityLabel={tab === "recurring" ? "Add recurring expense" : "Add expense"}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              if (tab === "expenses") {
                setFabOpen((open) => !open);
              } else {
                preserveTabOnNextFocusRef.current = true;
                router.push({
                  pathname: "/expense/new",
                  params: { groupId: id, mode: "recurring" },
                });
              }
            }}
          >
            <Feather name={tab === "expenses" && fabOpen ? "x" : "plus"} size={24} color="#fff" />
          </Pressable>
        </Animated.View>
        </>
      )}

      {/* Balance Reminder Modal */}
      <Modal
        visible={!!reminderModal}
        transparent
        animationType="fade"
        onRequestClose={() => setReminderModal(null)}
      >
        <Pressable style={styles.settleOverlay} onPress={() => setReminderModal(null)}>
          <Pressable
            style={[styles.settleSheet, { backgroundColor: colors.surface }]}
            onPress={e => e.stopPropagation()}
          >
            {reminderModal && (() => {
              const recipient = getMemberById(
                reminderModal.fromId === currentUser.id ? reminderModal.toId : reminderModal.fromId,
              );
              const selectedRecipientName = recipient?.name ?? "this member";
              return (
                <>
                  <View style={styles.reminderModalHeader}>
                    <View style={[styles.reminderModalIcon, { backgroundColor: colors.warningLight }]}>
                      <Feather name="bell" size={18} color={colors.warning} />
                    </View>
                    <View style={styles.reminderModalHeading}>
                      <Text style={[styles.settleSheetTitle, { color: colors.text }]}>Send reminder</Text>
                      <Text style={[styles.settleSheetSub, { color: colors.textSecondary }]}>
                        Select one or both ways for {selectedRecipientName}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.reminderMethodRow}>
                    {([
                      { value: "email" as const, label: "Email", icon: "mail" as const },
                      { value: "notification" as const, label: "Notification", icon: "bell" as const },
                    ]).map(option => {
                      const selected = reminderMethods.includes(option.value);
                      return (
                        <Pressable
                          key={option.value}
                          style={[
                            styles.reminderMethodOption,
                            {
                              backgroundColor: selected ? colors.primaryLight : colors.background,
                              borderColor: selected ? colors.primary : colors.border,
                            },
                          ]}
                          onPress={() => {
                            setReminderMethods(current => {
                              if (current.includes(option.value)) {
                                return current.length > 1
                                  ? current.filter(method => method !== option.value)
                                  : current;
                              }
                              return [...current, option.value];
                            });
                            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                          }}
                        >
                          <Feather
                            name={option.icon}
                            size={18}
                            color={selected ? colors.primary : colors.textSecondary}
                          />
                          <Text style={[styles.reminderMethodLabel, { color: selected ? colors.primary : colors.text }]}>
                            {option.label}
                          </Text>
                          {selected && <Feather name="check" size={15} color={colors.primary} />}
                        </Pressable>
                      );
                    })}
                  </View>

                  <Pressable
                    style={[
                      styles.reminderSendButton,
                      { backgroundColor: colors.primary, opacity: reminderSubmitting ? 0.6 : 1 },
                    ]}
                    onPress={confirmSendReminder}
                    disabled={reminderSubmitting}
                  >
                    <Feather
                      name={reminderMethods.length > 1 ? "send" : reminderMethods[0] === "email" ? "mail" : "bell"}
                      size={17}
                      color="#fff"
                    />
                    <Text style={styles.reminderSendButtonText}>
                      {reminderMethods.length > 1 ? "Send both" : "Send"}
                    </Text>
                  </Pressable>
                  <Pressable
                    style={styles.reminderCancelButton}
                    onPress={() => setReminderModal(null)}
                    disabled={reminderSubmitting}
                  >
                    <Text style={[styles.reminderCancelButtonText, { color: colors.textSecondary }]}>Cancel</Text>
                  </Pressable>
                </>
              );
            })()}
          </Pressable>
        </Pressable>
      </Modal>

      {/* Partial Payment Modal */}
      <Modal
        visible={!!settleModal}
        transparent
        animationType="fade"
        onRequestClose={() => setSettleModal(null)}
      >
        <View style={styles.paymentModalRoot}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => setSettleModal(null)}
          />
          <KeyboardAvoidingView
            style={styles.paymentKeyboardAvoiding}
            behavior="padding"
            keyboardVerticalOffset={12}
          >
            <Pressable
              style={[styles.settleSheet, styles.paymentSheet, { backgroundColor: colors.surface }]}
              onPress={e => e.stopPropagation()}
            >
              <View style={styles.paymentSheetContent}>
            <View style={styles.paymentModalHeading}>
              <View style={[styles.paymentModalIcon, { backgroundColor: colors.primaryLight }]}>
                <Feather name="credit-card" size={18} color={colors.primary} />
              </View>
              <View style={styles.paymentModalHeadingText}>
                <Text style={[styles.settleSheetTitle, styles.paymentModalTitle, { color: colors.text }]}>Record payment</Text>
                <Text style={[styles.settleSheetSub, styles.paymentModalSub, { color: colors.textSecondary }]}>
                  Choose how much to record
                </Text>
              </View>
            </View>
            {activeRecurringCount > 0 && (
              <View style={[styles.recurringSettleWarning, { backgroundColor: colors.warningLight, borderColor: colors.warning }]}>
                <Feather name="alert-triangle" size={14} color={colors.warning} />
                <Text style={[styles.recurringSettleWarningText, { color: colors.text }]}>
                  {recurringSettlementWarning}
                </Text>
              </View>
            )}
            {activeRecurringCount > 0 && (
              <Pressable
                onPress={() => setPauseRecurringOnSettle(v => !v)}
                style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 10 }}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: pauseRecurringOnSettle }}
              >
                <View style={{ width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: colors.teal, backgroundColor: pauseRecurringOnSettle ? colors.teal : "transparent", alignItems: "center", justifyContent: "center" }}>
                  {pauseRecurringOnSettle && <Feather name="check" size={14} color="#fff" />}
                </View>
                <Text style={{ fontSize: 15, color: colors.text, fontFamily: "Inter_500Medium", flex: 1 }}>
                  {activeRecurringCount === 1 ? "Also pause the recurring bill" : `Also pause ${activeRecurringCount} recurring bills`}
                </Text>
              </Pressable>
            )}
            {settleModal && (() => {
              const parsed = parseFloat(settleAmount);
              const validAmt = !isNaN(parsed) && parsed > 0 ? Math.min(parsed, settleModal.fullAmount) : 0;
              const remaining = Math.max(0, settleModal.fullAmount - validAmt);
              const isFull = validAmt >= settleModal.fullAmount - 0.001;
              const isPartial = validAmt > 0 && !isFull;
              const from = getMemberById(settleModal.fromId);
              const to   = getMemberById(settleModal.toId);
              const setFraction = (f: number) => {
                setSettleAmount((settleModal.fullAmount * f).toFixed(2));
                setSettleError("");
              };
              return (
              <>
                {/* Keep the names in their own row so the balance never truncates them. */}
                <View style={[styles.settlePartyCard, { backgroundColor: colors.inputBg, borderColor: colors.border }]}>
                  <View style={styles.settlePartyNamesRow}>
                    <View style={styles.settlePartyNameBlock}>
                      <Text style={[styles.settlePartyRole, { color: colors.textTertiary }]}>FROM</Text>
                      <Text style={[styles.settlePartyName, { color: colors.text }]} numberOfLines={2}>
                        {from?.name ?? "Former member"}
                      </Text>
                    </View>
                    <View style={[styles.settleArrow, { backgroundColor: colors.primaryLight }]}>
                      <Feather name="arrow-right" size={13} color={colors.primary} />
                    </View>
                    <View style={[styles.settlePartyNameBlock, { alignItems: "flex-end" }]}>
                      <Text style={[styles.settlePartyRole, { color: colors.textTertiary }]}>TO</Text>
                      <Text style={[styles.settlePartyName, styles.settlePartyNameRight, { color: colors.text }]} numberOfLines={2}>
                        {to?.name ?? "Former member"}
                      </Text>
                    </View>
                  </View>
                  <View style={[styles.settleBalanceRow, { borderTopColor: colors.border }]}>
                    <Text style={[styles.settleBalanceLabel, { color: colors.textSecondary }]}>Outstanding balance</Text>
                    <Text style={[styles.settleFullBalance, { color: colors.text }]}>
                      {formatAmount(settleModal.fullAmount, group.currency)}
                    </Text>
                  </View>
                </View>

                {/* Large editable amount */}
                <Text style={[styles.settleSheetLabel, { color: colors.textSecondary }]}>Amount paid</Text>
                <View style={[
                  styles.settleAmtRow,
                  { borderColor: settleError ? colors.danger : isFull ? colors.success : isPartial ? colors.warning : colors.border, backgroundColor: colors.inputBg },
                ]}>
                  <Text style={[styles.settleAmtSymbol, { color: colors.textTertiary }]}>
                    {group.currency}
                  </Text>
                  <TextInput
                    style={[styles.settleAmtInput, { color: colors.text }]}
                    value={settleAmount}
                    onChangeText={t => { setSettleAmount(t); if (settleError) setSettleError(""); }}
                    keyboardType="decimal-pad"
                    selectTextOnFocus
                  />
                </View>

                {/* Quick-fraction chips */}
                <View style={styles.settleFractionRow}>
                  {([["¼", 0.25], ["½", 0.5], ["¾", 0.75]] as [string, number][]).map(([label, frac]) => {
                    const chipAmt = settleModal.fullAmount * frac;
                    const active = Math.abs(validAmt - chipAmt) < 0.01;
                    return (
                      <Pressable
                        key={label}
                        onPress={() => setFraction(frac)}
                        style={[styles.settleFracChip, {
                          backgroundColor: active ? colors.primaryLight : colors.inputBg,
                          borderColor: active ? colors.primary : colors.border,
                        }]}
                      >
                        <Text style={[styles.settleFracChipText, { color: active ? colors.primary : colors.textSecondary }]}>
                          {label}
                        </Text>
                        <Text style={[styles.settleFracAmt, { color: active ? colors.primary : colors.textTertiary }]}>
                          {formatAmount(chipAmt, group.currency)}
                        </Text>
                      </Pressable>
                    );
                  })}
                  <Pressable
                    onPress={() => setFraction(1)}
                    style={[styles.settleFracChip, {
                      backgroundColor: isFull ? colors.primaryLight : colors.inputBg,
                      borderColor: isFull ? colors.primary : colors.border,
                    }]}
                  >
                    <Text style={[styles.settleFracChipText, { color: isFull ? colors.primary : colors.textSecondary }]}>Full</Text>
                    <Text style={[styles.settleFracAmt, { color: isFull ? colors.primary : colors.textTertiary }]}>
                      {formatAmount(settleModal.fullAmount, group.currency)}
                    </Text>
                  </Pressable>
                </View>

                {/* Status line */}
                {settleError ? (
                  <Text style={[styles.settleErrorText, { color: colors.danger }]}>{settleError}</Text>
                ) : (
                  <View style={styles.settleStatusRow}>
                    <Feather
                      name={isFull ? "check-circle" : isPartial ? "clock" : "info"}
                      size={13}
                      color={isFull ? colors.success : isPartial ? colors.warning : colors.textTertiary}
                    />
                    <Text style={[styles.settleRemainingText, {
                      color: isFull ? colors.success : isPartial ? colors.warning : colors.textTertiary,
                    }]}>
                      {isFull
                        ? "Settles the balance in full"
                        : isPartial
                        ? `${formatAmount(remaining, group.currency)} will remain outstanding`
                        : "Edit the amount for a partial payment"}
                    </Text>
                  </View>
                )}

                <View style={[styles.settleSheetActions, styles.paymentSheetActions]}>
                  <Pressable
                    style={[styles.settleSheetBtn, styles.paymentSheetBtn, { backgroundColor: colors.background, borderColor: colors.border }]}
                    onPress={() => setSettleModal(null)}
                  >
                    <Text style={[styles.settleSheetBtnText, { color: colors.textSecondary }]}>Cancel</Text>
                  </Pressable>
                  <Pressable
                    style={[styles.settleSheetBtn, styles.paymentSheetBtn, { backgroundColor: colors.primary, opacity: settleSubmitting ? 0.6 : 1 }]}
                    onPress={confirmSettle}
                    disabled={settleSubmitting}
                  >
                    {validAmt > 0 ? (
                      <View style={{ alignItems: "center" }}>
                        <Text style={[styles.settleSheetBtnSubLabel, { color: "rgba(255,255,255,0.75)" }]}>Record</Text>
                        <Text style={[styles.settleSheetBtnText, { color: "#fff" }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.65}>{formatAmount(validAmt, group.currency)}</Text>
                      </View>
                    ) : (
                      <Text style={[styles.settleSheetBtnText, { color: "#fff" }]}>Record Payment</Text>
                    )}
                  </Pressable>
                </View>
              </>
              );
            })()}
              </View>
            </Pressable>
          </KeyboardAvoidingView>
        </View>
      </Modal>

      {/* Trip Dates & Reminders Modal */}
      <Modal
        visible={showTripDatesModal}
        transparent
        animationType="slide"
        onRequestClose={closeTripDatesModal}
      >
        <View style={styles.settleOverlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={closeTripDatesModal} />
          <View style={[styles.settleSheet, { backgroundColor: colors.surface, gap: 0, height: "85%" }]}>
            <View style={[styles.tripModalHeader, { borderBottomColor: colors.border }]}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.settleSheetTitle, { color: colors.text }]}>Dates & Reminders</Text>
                <Text style={[styles.tripModalSubtitle, { color: colors.textTertiary }]}>
                  Set your {periodNoun} window and when to remind everyone
                </Text>
              </View>
              <Pressable onPress={closeTripDatesModal} hitSlop={8} accessibilityRole="button" accessibilityLabel="Close">
                <Feather name="x" size={20} color={colors.textSecondary} />
              </Pressable>
            </View>

            <ScrollView
              style={styles.tripModalBody}
              contentContainerStyle={{ paddingBottom: 32 }}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              nestedScrollEnabled
            >
              <DatePickerField
                label="Start Date"
                value={tripStartInput}
                onChange={setTripStartInput}
                colors={colors}
                forceClose={activeCalendar === "end"}
                onOpen={() => setActiveCalendar("start")}
              />

              <View style={{ height: 16 }} />

              <DatePickerField
                label="End Date"
                value={tripEndInput}
                onChange={setTripEndInput}
                colors={colors}
                forceClose={activeCalendar === "start"}
                onOpen={() => setActiveCalendar("end")}
              />

              {tripDatesError ? (
                <View style={[styles.tripDatesErrorBox, { backgroundColor: colors.dangerLight }]}>
                  <Feather name="alert-circle" size={14} color={colors.danger} />
                  <Text style={[styles.tripDatesErrorText, { color: colors.danger }]}>{tripDatesError}</Text>
                </View>
              ) : null}

              <View style={[styles.tripRemindersSection, { borderTopColor: colors.border }]}>
                <Text style={[styles.tripModalLabel, { color: colors.textSecondary }]}>Days before {periodNoun} starts to remind me</Text>
                <View style={[styles.tripModalInput, { borderColor: colors.border, backgroundColor: colors.inputBg, width: 80 }]}>
                  <TextInput
                    style={[styles.tripModalInputText, { color: colors.text, textAlign: "center" }]}
                    value={tripStartReminderInput}
                    onChangeText={t => setTripStartReminderInput(t.replace(/[^0-9]/g, ""))}
                    keyboardType="number-pad"
                    maxLength={2}
                  />
                </View>

                <Text style={[styles.tripModalLabel, { color: colors.textSecondary, marginTop: 12 }]}>Settle-up reminder every N days after {periodNoun} ends</Text>
                <View style={[styles.tripModalInput, { borderColor: colors.border, backgroundColor: colors.inputBg, width: 80 }]}>
                  <TextInput
                    style={[styles.tripModalInputText, { color: colors.text, textAlign: "center" }]}
                    value={settleUpReminderInput}
                    onChangeText={t => setSettleUpReminderInput(t.replace(/[^0-9]/g, ""))}
                    keyboardType="number-pad"
                    maxLength={2}
                  />
                </View>
              </View>

              {/* ── Reminder Channel ───────────────────────────────── */}
              <View style={[styles.tripRemindersSection, { borderTopColor: colors.border }]}>
                <Text style={[styles.tripModalLabel, { color: colors.textSecondary }]}>Remind via</Text>
                <View style={styles.channelRow}>
                  {([
                    { val: "push" as const, label: "Push", icon: "bell" },
                    { val: "email" as const, label: "Email", icon: "mail" },
                    { val: "both" as const, label: "Both", icon: "layers" },
                  ]).map(opt => (
                    <Pressable
                      key={opt.val}
                      style={[
                        styles.channelBtn,
                        {
                          backgroundColor: reminderChannel === opt.val ? colors.primaryLight : colors.background,
                          borderColor: reminderChannel === opt.val ? colors.primary : colors.border,
                        },
                      ]}
                      onPress={() => { setReminderChannel(opt.val); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
                    >
                      <Feather name={opt.icon as "bell"} size={14} color={reminderChannel === opt.val ? colors.primary : colors.textSecondary} />
                      <Text style={[styles.channelBtnText, { color: reminderChannel === opt.val ? colors.primary : colors.text }]}>
                        {opt.label}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>

            </ScrollView>

            <View style={[styles.settleSheetActions, { paddingHorizontal: 16, paddingBottom: 20 }]}>
              <Pressable
                style={[styles.settleSheetBtn, { backgroundColor: colors.background, borderColor: colors.border }]}
                onPress={closeTripDatesModal}
              >
                <Text style={[styles.settleSheetBtnText, { color: colors.textSecondary }]}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[styles.settleSheetBtn, { backgroundColor: colors.primary, borderColor: colors.primary }]}
                onPress={saveTripDates}
              >
                <Text style={[styles.settleSheetBtnText, { color: "#fff" }]}>Save</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <Celebration visible={celebrate} onDone={endCelebration} />

      {/* Settle All Confirmation Modal */}
      <Modal
        visible={showSettleAllConfirm}
        transparent
        animationType="fade"
        onRequestClose={() => setShowSettleAllConfirm(false)}
      >
        <Pressable style={styles.settleOverlay} onPress={() => setShowSettleAllConfirm(false)}>
          <Pressable style={[styles.settleSheet, { backgroundColor: colors.surface }]} onPress={e => e.stopPropagation()}>
            <View style={styles.settleAllIconWrap}>
              <View style={[styles.settleAllIconCircle, { backgroundColor: colors.tealTint }]}>
                <Feather name="check" size={26} color={colors.teal} />
              </View>
            </View>
            <Text style={[styles.settleSheetTitle, { color: colors.text }]}>Settle Up Group</Text>
            <Text style={[styles.settleSheetSub, { color: colors.textSecondary }]}>
              Mark all balances in this group as settled?
            </Text>
            {activeRecurringCount > 0 && (
              <View style={[styles.recurringSettleWarning, { backgroundColor: colors.warningLight, borderColor: colors.warning }]}>
                <Feather name="alert-triangle" size={14} color={colors.warning} />
                <Text style={[styles.recurringSettleWarningText, { color: colors.text }]}>
                  {recurringSettlementWarning}
                </Text>
              </View>
            )}
            {group && (
              <View style={[styles.settleAllSummary, { backgroundColor: colors.background, borderColor: colors.border }]}>
                <View style={styles.settleAllSummaryRow}>
                  <Text style={[styles.settleAllSummaryLabel, { color: colors.textSecondary }]}>Payments</Text>
                  <Text style={[styles.settleAllSummaryValue, { color: colors.text }]}>
                    {debts.length} {debts.length === 1 ? "transfer" : "transfers"}
                  </Text>
                </View>
                <View style={[styles.settleAllDivider, { backgroundColor: colors.border }]} />
                <View style={styles.settleAllSummaryRow}>
                  <Text style={[styles.settleAllSummaryLabel, { color: colors.textSecondary }]}>Total</Text>
                  <Text style={[styles.settleAllSummaryValue, { color: colors.teal }]}>
                    {formatAmount(debts.reduce((s, d) => s + d.amount, 0), group.currency)}
                  </Text>
                </View>
              </View>
            )}
            <View style={styles.settleSheetActions}>
              <Pressable
                style={[styles.settleSheetBtn, { backgroundColor: colors.background, borderColor: colors.border }]}
                onPress={() => setShowSettleAllConfirm(false)}
              >
                <Text style={[styles.settleSheetBtnText, { color: colors.textSecondary }]}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[styles.settleSheetBtn, { backgroundColor: colors.teal, borderColor: colors.teal, opacity: settleAllSubmitting ? 0.6 : 1 }]}
                onPress={confirmSettleAll}
                disabled={settleAllSubmitting}
              >
                <Text style={[styles.settleSheetBtnText, { color: "#fff" }]}>Settle All</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Balance details sheet */}
      <Modal
        visible={balanceDetail !== null}
        transparent
        animationType="slide"
        onRequestClose={() => setBalanceDetail(null)}
      >
        <Pressable style={styles.settleOverlay} onPress={() => setBalanceDetail(null)}>
          <Pressable
            style={[styles.settleSheet, { backgroundColor: colors.surface }]}
            onPress={e => e.stopPropagation()}
          >
            {balanceDetail && (() => {
              const from = getMemberById(balanceDetail.fromId);
              const to = getMemberById(balanceDetail.toId);
              const isMyDebt = balanceDetail.fromId === currentUser.id;
              const isMyCredit = balanceDetail.toId === currentUser.id;
              const statusLabel = isMyCredit ? "You receive" : isMyDebt ? "You owe" : "Between members";
              const statusColor = isMyCredit ? colors.positive : isMyDebt ? colors.negative : colors.text;
              const fromName = from?.isCurrentUser ? "You" : (from?.name ?? "Someone");
              const toName = to?.isCurrentUser ? "You" : (to?.name ?? "Someone");

              return (
                <>
                  <View style={styles.balanceDetailHeader}>
                    <View style={styles.balanceDetailHeaderCopy}>
                      <Text style={[styles.settleSheetTitle, { color: colors.text }]}>Balance details</Text>
                      <Text style={[styles.settleSheetSub, { color: colors.textSecondary }]}>
                        {statusLabel}
                      </Text>
                    </View>
                    <Pressable
                      onPress={() => setBalanceDetail(null)}
                      hitSlop={10}
                      accessibilityRole="button"
                      accessibilityLabel="Close balance details"
                    >
                      <Feather name="x" size={20} color={colors.textSecondary} />
                    </Pressable>
                  </View>

                  <View style={styles.balanceDetailPeople}>
                    <View style={styles.balanceDetailPerson}>
                      <Avatar
                        name={from?.name ?? ""}
                        color={from?.avatarColor ?? colors.primaryLight}
                        size={42}
                        imageUri={from?.photo}
                      />
                      <Text style={[styles.balanceDetailName, { color: colors.text }]} numberOfLines={1}>
                        {fromName}
                      </Text>
                    </View>
                    <Feather name="arrow-right" size={20} color={colors.textTertiary} />
                    <View style={styles.balanceDetailPerson}>
                      <Avatar
                        name={to?.name ?? ""}
                        color={to?.avatarColor ?? colors.primaryLight}
                        size={42}
                        imageUri={to?.photo}
                      />
                      <Text style={[styles.balanceDetailName, { color: colors.text }]} numberOfLines={1}>
                        {toName}
                      </Text>
                    </View>
                  </View>

                  <View style={[styles.balanceDetailAmountCard, { backgroundColor: colors.background, borderColor: colors.border }]}>
                    <Text style={[styles.balanceDetailStatus, { color: statusColor }]}>{statusLabel}</Text>
                    <Text style={[styles.balanceDetailAmount, { color: statusColor }]}>
                      {formatAmount(balanceDetail.amount, group.currency)}
                    </Text>
                  </View>

                  {(isMyDebt || isMyCredit) && (
                    <View style={styles.balanceDetailActions}>
                      <Pressable
                        style={[styles.reminderBtn, { backgroundColor: colors.warningLight }]}
                        onPress={() => {
                          setBalanceDetail(null);
                          openReminderModal(balanceDetail.fromId, balanceDetail.toId, balanceDetail.amount);
                        }}
                        accessibilityRole="button"
                        accessibilityLabel="Send reminder"
                      >
                        <Feather name="bell" size={14} color={colors.warning} />
                      </Pressable>
                      <Pressable
                        style={[styles.settleBtn, { backgroundColor: colors.primary }]}
                        onPress={() => {
                          setBalanceDetail(null);
                          openSettleModal(balanceDetail.fromId, balanceDetail.toId, balanceDetail.amount);
                        }}
                        accessibilityRole="button"
                        accessibilityLabel="Settle balance"
                      >
                        <Text style={styles.settleBtnText}>Settle</Text>
                      </Pressable>
                    </View>
                  )}

                  <Pressable
                    style={[styles.balanceDetailClose, { backgroundColor: colors.background, borderColor: colors.border }]}
                    onPress={() => setBalanceDetail(null)}
                  >
                    <Text style={[styles.settleSheetBtnText, { color: colors.textSecondary }]}>Close</Text>
                  </Pressable>
                </>
              );
            })()}
          </Pressable>
        </Pressable>
      </Modal>

      {/* Simplify debts explanation sheet */}
      <Modal
        visible={showSimplifyDebtsInfo}
        transparent
        animationType="fade"
        onRequestClose={() => setShowSimplifyDebtsInfo(false)}
      >
        <Pressable style={styles.settleOverlay} onPress={() => setShowSimplifyDebtsInfo(false)}>
          <Pressable
            style={[styles.settleSheet, styles.simplifyInfoSheet, { backgroundColor: colors.surface }]}
            onPress={e => e.stopPropagation()}
          >
            <View style={styles.simplifyInfoHeader}>
              <View style={styles.simplifyInfoHeaderCopy}>
                <Text style={[styles.settleSheetTitle, { color: colors.text }]}>Simplify debts</Text>
                <Text style={[styles.settleSheetSub, { color: colors.textSecondary }]}>
                  Split Mate combines payment chains into fewer transfers while keeping the same underlying expenses.
                </Text>
              </View>
              <Pressable
                onPress={() => setShowSimplifyDebtsInfo(false)}
                hitSlop={10}
                accessibilityRole="button"
                accessibilityLabel="Close Simplify Debts explanation"
              >
                <Feather name="x" size={20} color={colors.textSecondary} />
              </Pressable>
            </View>

            <View style={[styles.simplifyExampleCard, { backgroundColor: colors.background, borderColor: colors.border }]}>
            <Text style={[styles.simplifyExampleHeading, { color: colors.primary }]}>BEFORE SIMPLIFYING DEBTS</Text>
              <View style={styles.simplifyExampleRows}>
                <View style={styles.simplifyExampleRow}>
                  <View style={styles.simplifyExamplePeople}>
                    <Avatar name={SIMPLIFY_EXAMPLE_NAMES[0]} color="#475569" size={25} />
                    <Text style={[styles.simplifyExampleName, { color: colors.text }]} numberOfLines={1}>{SIMPLIFY_EXAMPLE_NAMES[0]}</Text>
                    <View style={styles.simplifyExampleArrow}>
                      <View style={[styles.simplifyExampleArrowShaft, { backgroundColor: colors.text }]} />
                      <View style={[styles.simplifyExampleArrowHead, { borderLeftColor: colors.text }]} />
                    </View>
                    <Avatar name={SIMPLIFY_EXAMPLE_NAMES[1]} color="#0F766E" size={25} />
                    <Text style={[styles.simplifyExampleName, { color: colors.text }]} numberOfLines={1}>{SIMPLIFY_EXAMPLE_NAMES[1]}</Text>
                  </View>
                  <Text style={[styles.simplifyExampleAmount, { color: colors.text }]}>
                    {group ? formatAmount(20, group.currency) : "20"}
                  </Text>
                </View>
                <View style={styles.simplifyExampleRow}>
                  <View style={styles.simplifyExamplePeople}>
                    <Avatar name={SIMPLIFY_EXAMPLE_NAMES[1]} color="#0F766E" size={25} />
                    <Text style={[styles.simplifyExampleName, { color: colors.text }]} numberOfLines={1}>{SIMPLIFY_EXAMPLE_NAMES[1]}</Text>
                    <View style={styles.simplifyExampleArrow}>
                      <View style={[styles.simplifyExampleArrowShaft, { backgroundColor: colors.text }]} />
                      <View style={[styles.simplifyExampleArrowHead, { borderLeftColor: colors.text }]} />
                    </View>
                    <Avatar name={SIMPLIFY_EXAMPLE_NAMES[2]} color="#A16207" size={25} />
                    <Text style={[styles.simplifyExampleName, { color: colors.text }]} numberOfLines={1}>{SIMPLIFY_EXAMPLE_NAMES[2]}</Text>
                  </View>
                  <Text style={[styles.simplifyExampleAmount, { color: colors.text }]}>
                    {group ? formatAmount(20, group.currency) : "20"}
                  </Text>
                </View>
              </View>
              <Text style={[styles.simplifyExampleHeading, { color: colors.primary }]}>AFTER SIMPLIFY DEBTS</Text>
              <View style={[styles.simplifyExampleRow, styles.simplifyExampleAfter, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <View style={styles.simplifyExamplePeople}>
                  <Avatar name={SIMPLIFY_EXAMPLE_NAMES[0]} color="#475569" size={25} />
                  <Text style={[styles.simplifyExampleName, { color: colors.text }]} numberOfLines={1}>{SIMPLIFY_EXAMPLE_NAMES[0]}</Text>
                  <View style={styles.simplifyExampleArrow}>
                    <View style={[styles.simplifyExampleArrowShaft, { backgroundColor: colors.primary }]} />
                    <View style={[styles.simplifyExampleArrowHead, { borderLeftColor: colors.primary }]} />
                  </View>
                  <Avatar name={SIMPLIFY_EXAMPLE_NAMES[2]} color="#A16207" size={25} />
                  <Text style={[styles.simplifyExampleName, { color: colors.text }]} numberOfLines={1}>{SIMPLIFY_EXAMPLE_NAMES[2]}</Text>
                </View>
                <Text style={[styles.simplifyExampleAmount, { color: colors.text }]}>
                  {group ? formatAmount(20, group.currency) : "20"}
                </Text>
              </View>
              <Text style={[styles.simplifyExampleCaption, { color: colors.text }]}>
                Same amount owed, one less payment.
              </Text>
            </View>

            <View style={styles.simplifyBulletList}>
              <View style={styles.simplifyBulletRow}>
                <View style={[styles.simplifyBullet, { backgroundColor: colors.teal }]} />
                <Text style={[styles.simplifyBulletText, { color: colors.textSecondary }]}>
                  Keeps each member’s net amount the same.
                </Text>
              </View>
              <View style={styles.simplifyBulletRow}>
                <View style={[styles.simplifyBullet, { backgroundColor: colors.teal }]} />
                <Text style={[styles.simplifyBulletText, { color: colors.textSecondary }]}>
                  Combines compatible debts into a shorter payment path.
                </Text>
              </View>
              <View style={styles.simplifyBulletRow}>
                <View style={[styles.simplifyBullet, { backgroundColor: colors.teal }]} />
                <Text style={[styles.simplifyBulletText, { color: colors.textSecondary }]}>
                  Turn it off anytime to see every debt separately.
                </Text>
              </View>
            </View>

            <Pressable
              style={[styles.simplifyInfoClose, { backgroundColor: colors.primary }]}
              onPress={() => setShowSimplifyDebtsInfo(false)}
            >
              <Text style={[styles.settleSheetBtnText, { color: "#fff" }]}>Done</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Member profile sheet */}
      <MemberProfileSheet
        memberId={profileMemberId}
        groupId={id}
        visible={profileMemberId !== null}
        onClose={() => setProfileMemberId(null)}
      />

      {/* "Read by" sheet for own chat messages */}
      <Modal
        visible={readBySheetMessage !== null}
        transparent
        animationType="slide"
        onRequestClose={() => setReadBySheetMessage(null)}
      >
        <Pressable style={styles.settleOverlay} onPress={() => setReadBySheetMessage(null)}>
          <Pressable style={[styles.settleSheet, { backgroundColor: colors.surface }]} onPress={(e) => e.stopPropagation()}>
            <View style={styles.readBySheet}>
              <Text style={[styles.settleSheetTitle, { color: colors.text }]}>Message info</Text>
              {readBySheetMessage && (() => {
                const reads = groupMessageReads[id] ?? {};
                const others = group.memberIds.filter(mid => mid !== readBySheetMessage.memberId);
                const readers = others.filter(mid => {
                  const cursor = reads[mid];
                  return !!cursor && new Date(cursor).getTime() >= new Date(readBySheetMessage.createdAt).getTime();
                });
                const notReaders = others.filter(mid => !readers.includes(mid));
                return (
                  <>
                    {readers.length > 0 && (
                      <>
                        <Text style={[styles.sectionLabel, { color: colors.textTertiary }]}>Read by</Text>
                        {readers.map(mid => {
                          const m = getMemberById(mid);
                          return (
                            <View key={mid} style={styles.readByRow}>
                              <Avatar name={m?.name ?? ""} color={m?.avatarColor ?? "#ccc"} size={26} imageUri={m?.photo} />
                              <Text style={{ color: colors.text }}>{m?.name ?? "Former member"}</Text>
                              <Ionicons name="checkmark-done" size={15} color={colors.primary} style={{ marginLeft: "auto" }} />
                            </View>
                          );
                        })}
                      </>
                    )}
                    {notReaders.length > 0 && (
                      <>
                        <Text style={[styles.sectionLabel, { color: colors.textTertiary, marginTop: readers.length ? 8 : 0 }]}>Delivered</Text>
                        {notReaders.map(mid => {
                          const m = getMemberById(mid);
                          return (
                            <View key={mid} style={styles.readByRow}>
                              <Avatar name={m?.name ?? ""} color={m?.avatarColor ?? "#ccc"} size={26} imageUri={m?.photo} />
                              <Text style={{ color: colors.text }}>{m?.name ?? "Former member"}</Text>
                              <Ionicons name="checkmark" size={15} color={colors.textTertiary} style={{ marginLeft: "auto" }} />
                            </View>
                          );
                        })}
                      </>
                    )}
                  </>
                );
              })()}
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Edit Recurring Expense Modal */}
      <Modal
        visible={!!editingRecurring}
        transparent
        animationType="slide"
        onRequestClose={closeEditRecurring}
      >
        <Pressable style={styles.settleOverlay} onPress={closeEditRecurring}>
          <Pressable style={[styles.settleSheet, { backgroundColor: colors.surface, gap: 0, height: "85%" }]} onPress={e => e.stopPropagation()}>
            <View style={[styles.tripModalHeader, { borderBottomColor: colors.border }]}>
              <Text style={[styles.settleSheetTitle, { color: colors.text }]}>Edit Recurring</Text>
              <Pressable onPress={closeEditRecurring} hitSlop={8} accessibilityRole="button" accessibilityLabel="Close">
                <Feather name="x" size={20} color={colors.textSecondary} />
              </Pressable>
            </View>
            <ScrollView
              style={styles.tripModalBody}
              contentContainerStyle={{ paddingBottom: 8, gap: 14 }}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              {editRecurError ? (
                <View style={[styles.tripDatesErrorBox, { backgroundColor: colors.dangerLight, marginTop: 0 }]}>
                  <Feather name="alert-circle" size={14} color={colors.danger} />
                  <Text style={[styles.tripDatesErrorText, { color: colors.danger }]}>{editRecurError}</Text>
                </View>
              ) : null}

              {/* Description */}
              <View>
                <Text style={[recurStyles.editLabel, { color: colors.textSecondary }]}>Description</Text>
                <TextInput
                  style={[recurStyles.editInput, { color: colors.text, backgroundColor: colors.inputBg, borderColor: colors.border }]}
                  value={editRecurDesc}
                  onChangeText={t => { setEditRecurDesc(t); if (editRecurError) setEditRecurError(""); }}
                  placeholder="What's this for?"
                  placeholderTextColor={colors.textTertiary}
                />
              </View>

              {/* Amount */}
              <View>
                <Text style={[recurStyles.editLabel, { color: colors.textSecondary }]}>Amount</Text>
                <TextInput
                  style={[recurStyles.editInput, { color: colors.text, backgroundColor: colors.inputBg, borderColor: colors.border }]}
                  value={editRecurAmount}
                  onChangeText={t => { setEditRecurAmount(t); if (editRecurError) setEditRecurError(""); }}
                  keyboardType="decimal-pad"
                  placeholder="0.00"
                  placeholderTextColor={colors.textTertiary}
                />
              </View>

              {/* Frequency */}
              <View>
                <Text style={[recurStyles.editLabel, { color: colors.textSecondary }]}>Frequency</Text>
                <View style={recurStyles.freqRow}>
                  {(Object.entries(RECURRING_FREQUENCY_LABELS) as [RecurringFrequency, string][]).map(([val, label]) => (
                    <Pressable
                      key={val}
                      style={[
                        recurStyles.freqChip,
                        {
                          backgroundColor: editRecurFreq === val ? colors.primary : colors.surface,
                          borderColor: editRecurFreq === val ? colors.primary : colors.border,
                        },
                      ]}
                      onPress={() => { setEditRecurFreq(val); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
                    >
                      <Text style={[recurStyles.freqChipText, { color: editRecurFreq === val ? "#fff" : colors.textSecondary }]}>
                        {label}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>

              {/* Custom days */}
              {editRecurFreq === "custom" && (
                <View style={[recurStyles.inlineRow, { backgroundColor: colors.inputBg, borderColor: colors.border }]}>
                  <Text style={[recurStyles.inlineLabel, { color: colors.text }]}>Every</Text>
                  <TextInput
                    style={[recurStyles.inlineInput, { color: colors.text }]}
                    value={editRecurCustomDays}
                    onChangeText={t => setEditRecurCustomDays(t.replace(/[^0-9]/g, ""))}
                    keyboardType="number-pad"
                    maxLength={3}
                    selectTextOnFocus
                  />
                  <Text style={[recurStyles.inlineLabel, { color: colors.text }]}>days</Text>
                </View>
              )}

              <DatePickerField
                label="Next payment date"
                value={editRecurNextDate}
                onChange={setEditRecurNextDate}
                colors={colors}
                allowClear={false}
              />
              <Text style={[recurStyles.scheduleHint, { color: colors.textTertiary }]}>
                Future payments use the creator's timezone and calendar dates, so daylight-saving changes won't shift the schedule.
              </Text>
            </ScrollView>

            <View style={[styles.settleSheetActions, { paddingHorizontal: 16, paddingBottom: 20 }]}>
              <Pressable
                style={[styles.settleSheetBtn, { backgroundColor: colors.background, borderColor: colors.border }]}
                onPress={closeEditRecurring}
              >
                <Text style={[styles.settleSheetBtnText, { color: colors.textSecondary }]}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[styles.settleSheetBtn, { backgroundColor: colors.primary, borderColor: colors.primary }]}
                onPress={saveEditRecurring}
              >
                <Text style={[styles.settleSheetBtnText, { color: "#fff" }]}>Save Changes</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingBottom: 12, gap: 12,
    shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 2,
  },
  backBtn: { padding: 4 },
  settleAllBtn: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20 },
  settleAllBtnText: { color: "#fff", fontSize: 13, fontFamily: "Inter_600SemiBold" },
  headerMembersBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4,
    minWidth: 38, paddingHorizontal: 8, paddingVertical: 7, borderRadius: 18, borderWidth: 1,
  },
  headerMembersCount: { fontSize: 12, fontFamily: "Inter_700Bold" },
  headerCenter: { flex: 1, flexDirection: "row", alignItems: "center", gap: 8 },
  groupName: { fontSize: 18, fontFamily: "Inter_700Bold" },
  archivedBadge: { fontSize: 11, fontFamily: "Inter_500Medium" },
  statsBar: {
    flexDirection: "row", marginHorizontal: 16, marginTop: 12, borderRadius: 14, overflow: "hidden",
    shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 2,
  },
  ratesWarningBanner: {
    flexDirection: "row", alignItems: "center", gap: 8,
    marginHorizontal: 16, marginTop: 10,
    paddingHorizontal: 12, paddingVertical: 9,
    borderRadius: 10, borderWidth: 1,
  },
  ratesWarningText: { flex: 1, fontSize: 12, fontFamily: "Inter_500Medium" },
  statItem: { flex: 0.9, alignItems: "center", paddingVertical: 12 },
  statItemTotal: { flex: 2 },
  statLabel: { fontSize: 11, fontFamily: "Inter_400Regular", marginBottom: 2 },
  unlockBanner: { flexDirection: "row", alignItems: "center", gap: 10, marginHorizontal: 16, marginVertical: 8, padding: 12, borderRadius: 14, borderWidth: 1.5, borderColor: "#F5A524", backgroundColor: "#FFF8E8" },
  unlockIcon: { width: 32, height: 32, borderRadius: 10, backgroundColor: "#F5A524", alignItems: "center", justifyContent: "center" },
  unlockTitle: { color: "#0B2A2E", fontSize: 14, fontFamily: "Inter_700Bold" },
  unlockSub: { color: "#557277", fontSize: 12, marginTop: 1 },
  unlockBtn: { backgroundColor: "#04404A", borderRadius: 10, paddingHorizontal: 12, paddingVertical: 7 },
  unlockBtnText: { color: "#FFFFFF", fontSize: 12.5, fontFamily: "Inter_700Bold" },
  tpCard: { flexDirection: "row", alignItems: "center", gap: 8, marginHorizontal: 16, marginTop: 10, paddingHorizontal: 12, paddingVertical: 9, borderRadius: 12, borderWidth: 1.2, borderColor: "#F5C66B", backgroundColor: "#FFFFFF" },
  tpCardMain: { flex: 1, flexDirection: "row", alignItems: "center", gap: 8 },
  tpCardTitle: { color: "#0B2A2E", fontSize: 13, fontFamily: "Inter_700Bold" },
  tpCardSub: { flex: 1, color: "#557277", fontSize: 12 },
  tpCardLink: { color: "#0E8A8F", fontSize: 13, fontFamily: "Inter_700Bold" },
  tpPill: { flexDirection: "row", alignItems: "center", gap: 3, borderWidth: 1.2, borderColor: "#F5A524", backgroundColor: "#FFF7E6", borderRadius: 14, paddingHorizontal: 7, paddingVertical: 4 },
  tpPillText: { color: "#9A6200", fontSize: 11, fontFamily: "Inter_700Bold" },
  statValue: { fontSize: 15, fontFamily: "Inter_700Bold" },
  statValueTotal: { fontSize: 17, width: "100%", textAlign: "center" },
  statDivider: { width: 1, marginVertical: 8 },
  tabBar: { flexDirection: "row", marginTop: 10, borderBottomWidth: 1 },
  tabItem: {
    flex: 1, alignItems: "center", paddingVertical: 12,
    borderBottomWidth: 2, borderBottomColor: "transparent", position: "relative",
  },
  tabLabel: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  tabDot: { position: "absolute", top: 10, right: "25%", width: 6, height: 6, borderRadius: 3 },
  listContent: { padding: 16 },
  balanceScroll: { flex: 1 },
  expenseRow: {
    flexDirection: "row", alignItems: "center", padding: 14, borderRadius: 16, marginBottom: 8, gap: 12,
    borderWidth: 1,
    shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 2,
  },
  expenseBody: { flex: 1 },
  expenseName: { fontSize: 15, fontFamily: "Inter_500Medium", marginBottom: 3 },
  newExpenseLabel: { fontSize: 10, fontFamily: "Inter_700Bold", letterSpacing: 0.5 },
  expenseMetaRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  expenseMeta: { fontSize: 12, fontFamily: "Inter_400Regular", flex: 1 },
  expensePeople: { flexDirection: "row", alignItems: "center", gap: 4, marginLeft: 8 },
  expensePeopleCount: { fontSize: 12, fontFamily: "Inter_600SemiBold", fontVariant: ["tabular-nums"] },
  balanceInlineAmount: { fontSize: 15, fontFamily: "Inter_500Medium" },
  expenseSocialRow: { flexDirection: "row", gap: 8 },
  expenseSocial: { fontSize: 11, fontFamily: "Inter_400Regular" },
  expenseRight: { alignItems: "flex-end" },
  expenseTotal: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  expenseNet: { fontSize: 12, fontFamily: "Inter_500Medium", marginTop: 2 },
  expenseForeignOrig: { fontSize: 11, fontFamily: "Inter_400Regular", marginBottom: 1 },
  settledCard: { alignItems: "center", paddingVertical: 48, paddingHorizontal: 32, gap: 12 },
  settledIcon: { width: 64, height: 64, borderRadius: 32, alignItems: "center", justifyContent: "center" },
  settledTitle: { fontSize: 18, fontFamily: "Inter_700Bold" },
  settledSub: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center" },
  balanceBoard: {
    marginHorizontal: -10,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 16,
    borderRadius: 16,
    borderWidth: 1,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 2,
  },
  balanceBoardHeader: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  balanceBoardHeaderCopy: { flex: 1, minWidth: 0, gap: 3 },
  balanceBoardTitle: { fontSize: 18, fontFamily: "Inter_700Bold" },
  balanceBoardSubtitle: { fontSize: 12, fontFamily: "Inter_400Regular" },
  balanceIntroText: { marginTop: 10, marginBottom: 2 },
  balanceCountBadge: { width: 28, height: 28, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  balanceCountText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  simplifyDebtsControl: {
    flexDirection: "row", alignItems: "center", gap: 9,
    marginTop: 0, marginBottom: 10, paddingHorizontal: 11, paddingVertical: 9,
    borderRadius: 13, borderWidth: 1,
  },
  simplifyDebtsControlIcon: {
    width: 30, height: 30, borderRadius: 9,
    alignItems: "center", justifyContent: "center",
  },
  simplifyDebtsControlCopy: { flex: 1, minWidth: 0, gap: 2 },
  simplifyDebtsControlTitle: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  simplifyDebtsControlSubtitle: { fontSize: 11, fontFamily: "Inter_400Regular" },
  simplifyInfoButton: {
    width: 30, height: 30, borderRadius: 15, borderWidth: 1,
    alignItems: "center", justifyContent: "center",
  },
  simplifyInfoSheet: { maxHeight: "92%" },
  simplifyInfoHeader: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  simplifyInfoHeaderCopy: { flex: 1, gap: 7 },
  simplifyExampleCard: {
    marginTop: 14, padding: 12, borderRadius: 14, borderWidth: 1, gap: 8,
  },
  simplifyExampleHeading: {
    fontSize: 10, fontFamily: "Inter_700Bold", letterSpacing: 0.7,
  },
  simplifyExampleRows: { gap: 7 },
  simplifyExampleRow: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    gap: 6, minHeight: 32, paddingHorizontal: 8,
  },
  simplifyExampleAfter: {
    paddingVertical: 6, borderRadius: 10, borderWidth: 1,
  },
  simplifyExamplePeople: {
    flex: 1, minWidth: 0, flexDirection: "row", alignItems: "center", gap: 5,
  },
  simplifyExampleArrow: {
    width: 20, height: 18, flexDirection: "row", alignItems: "center", justifyContent: "center",
    transform: [{ translateX: -4 }],
  },
  simplifyExampleArrowShaft: { width: 12, height: 4, borderRadius: 2 },
  simplifyExampleArrowHead: {
    width: 0, height: 0,
    borderTopWidth: 6, borderBottomWidth: 6, borderLeftWidth: 8,
    borderTopColor: "transparent", borderBottomColor: "transparent",
  },
  simplifyExampleName: {
    width: 42, fontSize: 11, fontFamily: "Inter_600SemiBold",
  },
  simplifyExampleAmount: {
    width: 56, fontSize: 11, fontFamily: "Inter_600SemiBold",
    fontVariant: ["tabular-nums"], textAlign: "right",
  },
  simplifyExampleDivider: {
    alignItems: "center", borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 7, marginTop: 1,
  },
  simplifyExampleCaption: {
    fontSize: 11, fontFamily: "Inter_400Regular", lineHeight: 16,
  },
  simplifyBulletList: { marginTop: 14, gap: 9 },
  simplifyBulletRow: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  simplifyBullet: { width: 6, height: 6, borderRadius: 3, marginTop: 6 },
  simplifyBulletText: { flex: 1, fontSize: 12, lineHeight: 18, fontFamily: "Inter_400Regular" },
  simplifyInfoClose: {
    minHeight: 44, marginTop: 12, borderRadius: 12,
    alignItems: "center", justifyContent: "center",
  },
  balanceRows: { marginTop: 14 },
  balanceCard: { borderRadius: 16, borderWidth: 1, padding: 12, gap: 10, shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 3, elevation: 1 },
  balanceCardTop: { flexDirection: "row", alignItems: "center", gap: 10 },
  balanceAvatarPair: { flexDirection: "row", flexShrink: 0 },
  balanceAvatarRing: { borderWidth: 2, borderRadius: 18 },
  balanceAvatarOverlap: { marginLeft: -10 },
  balanceCardNames: { flex: 1, minWidth: 0 },
  balanceCardTitle: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  balanceCardRole: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 1 },
  balanceCardAmount: { flexShrink: 0, fontSize: 15, fontFamily: "Inter_700Bold", fontVariant: ["tabular-nums"], textAlign: "right" },
  balanceCardActions: { flexDirection: "row", gap: 8 },
  balanceRemindBtn: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 14, paddingVertical: 9, borderRadius: 12 },
  balanceSettleBtn: { flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 9, borderRadius: 12 },
  balanceBtnText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  balancePaymentRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    minWidth: 0,
    padding: 5,
    borderRadius: 13,
    borderWidth: 1,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
  },
  balancePaymentRowSpaced: { marginTop: 10 },
  balanceMemberBox: { flexShrink: 1,
    flex: 1,
    minWidth: 0,
    height: 54,
    borderRadius: 11,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    paddingHorizontal: 7,
  },
  balanceMemberBoxName: { width: "100%", fontSize: 12, fontFamily: "Inter_600SemiBold", textAlign: "center" },
  memberNameBox: { flexDirection: "row", alignItems: "center", marginHorizontal: 16, marginVertical: 3, paddingHorizontal: 13, paddingVertical: 12, gap: 12, borderRadius: 18, borderWidth: 1, shadowColor: "#000", shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 2 },
  balanceAmountColumn: { width: 96, flexShrink: 0, alignItems: "flex-end", gap: 8 },
  balanceAmount: { width: 96, fontSize: 13, fontFamily: "Inter_700Bold", fontVariant: ["tabular-nums"], textAlign: "right" },
  balanceActions: { flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: 6 },
  balanceSummary: {
    marginHorizontal: 16, marginTop: 12, marginBottom: 2,
    paddingHorizontal: 14, paddingVertical: 12,
    borderRadius: 16, borderWidth: 1,
    shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 2,
  },
  balanceSummaryRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  balanceSummaryLabelWrap: { flex: 1, flexDirection: "row", alignItems: "center", gap: 9, minWidth: 0 },
  balanceSummaryIcon: { width: 30, height: 30, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  balanceSummaryLabel: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  balanceSummaryAmount: { fontSize: 22, fontFamily: "Inter_700Bold", fontVariant: ["tabular-nums"], flexShrink: 0 },
  balanceDebtCard: {
    minHeight: 72, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 9, marginBottom: 8, borderWidth: StyleSheet.hairlineWidth,
    shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 4, elevation: 1,
  },
  balanceCompactRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  balanceMembersColumn: { flex: 1, minWidth: 0, gap: 3 },
  balanceMembersLine: { flex: 1, minWidth: 0, flexDirection: "row", alignItems: "center", gap: 7 },
  balanceMemberInline: { flex: 1, minWidth: 0, flexDirection: "row", alignItems: "center", gap: 6 },
  balanceMemberCopy: { flex: 1, minWidth: 0 },
  balancePersonName: { maxWidth: "100%", fontSize: 12, fontFamily: "Inter_600SemiBold" },
  balancePersonRole: { fontSize: 10, fontFamily: "Inter_400Regular", marginTop: 1 },
  balanceStatusLabel: { fontSize: 10, fontFamily: "Inter_600SemiBold" },
  debtActions: { flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: 6 },
  reminderBtn: { width: 30, height: 30, borderRadius: 15, alignItems: "center", justifyContent: "center" },
  balanceDetailHeader: { flexDirection: "row", alignItems: "center", gap: 12 },
  balanceDetailHeaderCopy: { flex: 1, gap: 2 },
  balanceDetailPeople: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 16, paddingVertical: 8 },
  balanceDetailPerson: { alignItems: "center", gap: 6, maxWidth: 120 },
  balanceDetailName: { fontSize: 13, fontFamily: "Inter_600SemiBold", textAlign: "center" },
  balanceDetailAmountCard: { alignItems: "center", borderRadius: 14, borderWidth: 1, paddingVertical: 12, gap: 3 },
  balanceDetailStatus: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  balanceDetailAmount: { fontSize: 24, fontFamily: "Inter_700Bold", fontVariant: ["tabular-nums"] },
  balanceDetailActions: { flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: 8 },
  balanceDetailClose: { minHeight: 44, borderRadius: 12, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  reminderModalHeader: { flexDirection: "row", alignItems: "center", gap: 12 },
  reminderModalIcon: { width: 42, height: 42, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  reminderModalHeading: { flex: 1, gap: 2 },
  reminderMethodRow: { flexDirection: "row", gap: 10, marginTop: 4 },
  reminderMethodOption: {
    flex: 1, minHeight: 76, borderRadius: 14, borderWidth: 1.5,
    alignItems: "center", justifyContent: "center", gap: 7, paddingHorizontal: 8,
  },
  reminderMethodLabel: { fontSize: 13, fontFamily: "Inter_600SemiBold", textAlign: "center" },
  reminderSendButton: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    borderRadius: 12, paddingVertical: 14, marginTop: 4,
  },
  reminderSendButtonText: { color: "#fff", fontSize: 15, fontFamily: "Inter_600SemiBold" },
  reminderCancelButton: { alignItems: "center", paddingVertical: 4 },
  reminderCancelButtonText: { fontSize: 14, fontFamily: "Inter_500Medium" },
  settleBtn: { minWidth: 56, paddingHorizontal: 10, paddingVertical: 7, borderRadius: 16, alignItems: "center" },
  settleBtnText: { color: "#fff", fontSize: 12, fontFamily: "Inter_600SemiBold" },
  fab: {
    position: "absolute", bottom: Platform.OS === "web" ? 174 : 140, right: 20,
    width: 56, height: 56, borderRadius: 28, alignItems: "center", justifyContent: "center",
    shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.25, shadowRadius: 8, elevation: 8,
  },
  fabPressable: {
    ...StyleSheet.absoluteFill,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 28,
  },
  receiptFab: {
    position: "absolute",
    bottom: Platform.OS === "web" ? 186 : 152,
    right: 80,
    width: 46,
    height: 46,
    borderRadius: 23,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 5,
  },
  manualFab: {
    position: "absolute",
    bottom: Platform.OS === "web" ? 233 : 199,
    right: 40,
    width: 46,
    height: 46,
    borderRadius: 23,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 5,
  },
  chartCard: {
    borderRadius: 16, padding: 16,
    shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 2,
  },
  chartTitle: { fontSize: 15, fontFamily: "Inter_600SemiBold", marginBottom: 2 },
  chartSub: { fontSize: 12, fontFamily: "Inter_400Regular", marginBottom: 14 },
  groupTotalHeader: { flexDirection: "row", alignItems: "center", gap: 11 },
  groupTotalIcon: { width: 38, height: 38, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  groupTotalCopy: { flex: 1, minWidth: 0 },
  groupTotalMeta: {
    flexDirection: "row", justifyContent: "space-between",
    borderTopWidth: StyleSheet.hairlineWidth, marginTop: 14, paddingTop: 11,
  },
  groupTotalMetaText: { fontSize: 11, fontFamily: "Inter_500Medium" },
  memberBar: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 12 },
  memberBarLabel: { width: 56, flexDirection: "row", alignItems: "center", gap: 6 },
  memberBarDot: { width: 8, height: 8, borderRadius: 4 },
  memberBarName: { fontSize: 12, fontFamily: "Inter_500Medium", flex: 1 },
  memberBarTrack: { flex: 1, height: 8, borderRadius: 4, overflow: "hidden" },
  memberBarFill: { height: 8, borderRadius: 4 },
  memberBarValue: { width: 64, textAlign: "right", fontSize: 12, fontFamily: "Inter_500Medium" },
  contributionCard: {
    borderRadius: 16, padding: 16, marginTop: 12,
    shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 2,
  },
  contributionRow: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 12 },
  contributionMember: { width: 84, flexDirection: "row", alignItems: "center", gap: 6 },
  contributionName: { flex: 1, fontSize: 12, fontFamily: "Inter_500Medium" },
  paymentLegend: { flexDirection: "row", alignItems: "center", gap: 16, borderBottomWidth: StyleSheet.hairlineWidth, marginTop: 14, paddingBottom: 10 },
  paymentLegendItem: { flexDirection: "row", alignItems: "center", gap: 5 },
  paymentLegendDot: { width: 8, height: 8, borderRadius: 4 },
  paymentLegendText: { fontSize: 11, fontFamily: "Inter_500Medium" },
  paymentComparisonRow: { marginTop: 14 },
  paymentPersonHeader: { flexDirection: "row", alignItems: "center", gap: 6 },
  paymentDifference: { flex: 1, textAlign: "right", fontSize: 11, fontFamily: "Inter_600SemiBold" },
  paymentBarRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 6 },
  paymentBarLabel: { width: 36, flexShrink: 0, fontSize: 10, fontFamily: "Inter_500Medium" },
  paymentBarValue: { width: 108, minWidth: 108, flexShrink: 0, textAlign: "right", fontSize: 11, fontFamily: "Inter_500Medium" },
  categoryBarLabel: { width: 124, flexDirection: "row", alignItems: "center", gap: 8 },
  breakdownDivider: { borderTopWidth: StyleSheet.hairlineWidth, marginTop: 14, paddingTop: 12, marginBottom: 2 },
  scopeScroll: { marginTop: 12 },
  scopeRow: { flexDirection: "row", gap: 8, paddingRight: 4 },
  scopePill: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 16, borderWidth: 1 },
  scopePillText: { fontSize: 12, fontFamily: "Inter_500Medium" },
  customItemizationSection: { borderTopWidth: StyleSheet.hairlineWidth, marginTop: 18, paddingTop: 16 },
  customItemizationHint: { fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 5, lineHeight: 16 },
  customItemizationInputRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 10 },
  customItemizationInput: { flex: 1, minHeight: 40, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, fontSize: 13, fontFamily: "Inter_400Regular" },
  customItemizationAdd: { width: 40, height: 40, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  customItemizationCategoryWrap: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 10 },
  customItemizationCategoryChip: { borderWidth: 1, borderRadius: 14, paddingHorizontal: 9, paddingVertical: 6 },
  customItemizationCategoryText: { fontSize: 10, fontFamily: "Inter_500Medium" },
  customItemizationEmpty: { fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 12 },
  customItemizationRule: { flexDirection: "row", alignItems: "center", gap: 9, marginTop: 12 },
  customItemizationRuleCopy: { flex: 1, minWidth: 0 },
  customItemizationRuleSearch: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  customItemizationRuleCategory: { fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 2 },
  customItemizationRuleAmount: { width: 70, textAlign: "right", fontSize: 12, fontFamily: "Inter_500Medium" },
  chatList: { padding: 16, gap: 12, paddingBottom: 16 },
  chatRow: { flexDirection: "row", alignItems: "flex-end", gap: 8 },
  chatRowMe: { flexDirection: "row-reverse" },
  chatBubbleWrap: { maxWidth: "72%", gap: 2 },
  chatAuthor: { fontSize: 11, fontFamily: "Inter_600SemiBold", marginLeft: 2, marginBottom: 2 },
  chatBubble: { borderRadius: 16, padding: 12, borderWidth: 1 },
  chatText: { fontSize: 14, fontFamily: "Inter_400Regular", lineHeight: 20 },
  chatTime: { fontSize: 10, fontFamily: "Inter_400Regular", marginTop: 2 },
  chatMetaRow: { flexDirection: "row", alignItems: "center" },
  readBySheet: { padding: 20, gap: 4 },
  readByRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 8 },
  sectionLabel: { fontSize: 12, fontFamily: "Inter_600SemiBold", textTransform: "uppercase", letterSpacing: 0.4 },
  chatInputBar: {
    flexDirection: "row", alignItems: "flex-end", gap: 10,
    paddingHorizontal: 16, paddingVertical: 10, borderTopWidth: 1,
  },
  chatInput: {
    flex: 1, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8,
    fontSize: 14, fontFamily: "Inter_400Regular", maxHeight: 80,
  },
  chatSendBtn: { width: 36, height: 36, alignItems: "center", justifyContent: "center" },
  settleAllIconWrap: { alignItems: "center", marginBottom: 4 },
  settleAllIconCircle: { width: 60, height: 60, borderRadius: 30, alignItems: "center", justifyContent: "center" },
  settleAllSummary: { borderRadius: 12, borderWidth: 1, paddingHorizontal: 16, paddingVertical: 4 },
  recurringSettleWarning: {
    flexDirection: "row", alignItems: "flex-start", gap: 8,
    paddingHorizontal: 12, paddingVertical: 10,
    marginTop: 2, borderRadius: 12, borderWidth: 1,
  },
  recurringSettleWarningText: { flex: 1, fontSize: 12, fontFamily: "Inter_500Medium", lineHeight: 17 },
  settleAllSummaryRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 12 },
  settleAllSummaryLabel: { fontSize: 14, fontFamily: "Inter_400Regular" },
  settleAllSummaryValue: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  settleAllDivider: { height: 1 },
  notInvolvedPill: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 5,
    marginTop: 4,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 8,
    borderWidth: 1,
  },
  notInvolvedText: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  recurringBadge: { flexDirection: "row", alignItems: "center", gap: 3, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 10 },
  recurringBadgeText: { fontSize: 10, fontFamily: "Inter_500Medium" },
  tripModalHeader: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1, gap: 12,
  },
  tripModalSubtitle: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
  tripDatesErrorBox: {
    flexDirection: "row", alignItems: "center", gap: 8,
    paddingHorizontal: 12, paddingVertical: 10, borderRadius: 10, marginTop: 16,
  },
  tripDatesErrorText: { flex: 1, fontSize: 13, fontFamily: "Inter_500Medium" },
  tripModalBody: { paddingHorizontal: 20, paddingTop: 16, flex: 1 },
  tripModalLabel: { fontSize: 12, fontFamily: "Inter_600SemiBold", textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 6 },
  tripModalInput: {
    flexDirection: "row", alignItems: "center", gap: 8,
    borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, height: 44,
  },
  tripModalInputText: { flex: 1, fontSize: 15, fontFamily: "Inter_400Regular" },
  tripRemindersSection: { borderTopWidth: 1, marginTop: 16, paddingTop: 16 },
  settleOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.55)", alignItems: "center", justifyContent: "center", padding: 24 },
  settleSheet: { width: "100%", borderRadius: 20, padding: 24, gap: 12, maxHeight: "88%" },
  paymentModalRoot: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    alignItems: "center",
    justifyContent: "center",
    padding: 8,
  },
  paymentKeyboardAvoiding: { width: "100%", maxWidth: 420 },
  paymentSheet: { padding: 12, gap: 0, maxHeight: "100%" },
  paymentSheetContent: { gap: 6, paddingBottom: 0 },
  paymentSheetActions: { gap: 8 },
  paymentSheetBtn: { paddingVertical: 8 },
  paymentModalHeading: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 0 },
  paymentModalIcon: { width: 32, height: 32, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  paymentModalHeadingText: { flex: 1, gap: 0 },
  paymentModalTitle: { fontSize: 17 },
  paymentModalSub: { fontSize: 11, lineHeight: 15 },
  settleSheetTitle: { fontSize: 18, fontFamily: "Inter_700Bold" },
  settleSheetSub: { fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 20 },
  settleSheetLabel: { fontSize: 12, fontFamily: "Inter_600SemiBold", textTransform: "uppercase", letterSpacing: 0.6 },
  settleAmtRow: {
    flexDirection: "row", alignItems: "center", gap: 8,
    borderRadius: 12, borderWidth: 1, paddingHorizontal: 12, height: 48,
  },
  settleAmtSymbol: { fontSize: 15, fontFamily: "Inter_500Medium" },
  settleAmtInput: { flex: 1, fontSize: 22, fontFamily: "Inter_700Bold" },
  settleFullChip: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 },
  settleFullChipText: { fontSize: 12, fontFamily: "Inter_700Bold" },
  settleErrorText: { fontSize: 12, fontFamily: "Inter_500Medium", marginTop: 2 },
  settleRemainingText: { fontSize: 12, fontFamily: "Inter_400Regular" },
  settlePartyCard: { borderRadius: 14, borderWidth: 1, padding: 10 },
  settlePartyNamesRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  settlePartyNameBlock: { flex: 1, minWidth: 0, gap: 2 },
  settlePartyRole: { fontSize: 9, fontFamily: "Inter_600SemiBold", letterSpacing: 0.7 },
  settlePartyName: { fontSize: 14, lineHeight: 18, fontFamily: "Inter_600SemiBold", flexShrink: 1 },
  settlePartyNameRight: { textAlign: "right" },
  settleArrow: { width: 22, height: 22, borderRadius: 11, alignItems: "center", justifyContent: "center", flexShrink: 0 },
  settleBalanceRow: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    gap: 12, marginTop: 8, paddingTop: 8, borderTopWidth: StyleSheet.hairlineWidth,
  },
  settleBalanceLabel: { flex: 1, fontSize: 12, fontFamily: "Inter_400Regular" },
  settleFullBalance: { fontSize: 15, fontFamily: "Inter_700Bold", flexShrink: 0 },
  settleFractionRow: { flexDirection: "row", gap: 8 },
  settleFracChip: {
    flex: 1, alignItems: "center", paddingVertical: 6,
    borderRadius: 10, borderWidth: 1,
  },
  settleFracChipText: { fontSize: 14, fontFamily: "Inter_700Bold" },
  settleFracAmt: { fontSize: 10, fontFamily: "Inter_400Regular", marginTop: 2 },
  settleStatusRow: { flexDirection: "row", alignItems: "center", gap: 5 },
  settleSheetActions: { flexDirection: "row", gap: 10, marginTop: 0 },
  settleSheetBtn: { flex: 1, paddingVertical: 11, borderRadius: 12, alignItems: "center", justifyContent: "center", borderWidth: 1 },
  settleSheetBtnSubLabel: { fontSize: 10, fontFamily: "Inter_500Medium", letterSpacing: 0.3 },
  settleSheetBtnText: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  channelRow: { flexDirection: "row", gap: 8, marginTop: 8 },
  channelBtn: {
    flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 6, paddingVertical: 10, borderRadius: 12, borderWidth: 1.5,
  },
  channelBtnText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
});

const recurStyles = StyleSheet.create({
  section: {
    gap: 8,
  },
  card: {
    borderRadius: 16, borderWidth: 1, padding: 14, marginBottom: 0,
    shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 2,
  },
  cardMain: { flexDirection: "row", alignItems: "center", gap: 12 },
  cardDesc: { fontSize: 15, fontFamily: "Inter_500Medium", marginBottom: 5 },
  cardMeta: { flexDirection: "row", alignItems: "center", gap: 5 },
  freqPill: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 7, paddingVertical: 2, borderRadius: 8 },
  freqPillText: { fontSize: 11, fontFamily: "Inter_500Medium" },
  metaDot: { fontSize: 12 },
  metaText: { fontSize: 12, fontFamily: "Inter_400Regular" },
  amountColumn: { alignItems: "flex-end", minWidth: 74 },
  statusPill: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 7, paddingVertical: 3, borderRadius: 8 },
  statusText: { fontSize: 10, fontFamily: "Inter_600SemiBold" },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  cardAmount: { fontSize: 18, fontFamily: "Inter_700Bold", marginTop: 5 },
  cardActions: { flexDirection: "row", justifyContent: "center", gap: 8, marginTop: 10 },
  actionBtn: {
    flexDirection: "row", alignItems: "center", gap: 5,
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20,
  },
  actionBtnText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  // Edit modal styles
  editLabel: { fontSize: 11, fontFamily: "Inter_600SemiBold", textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 6 },
  editInput: {
    borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, height: 44,
    fontSize: 15, fontFamily: "Inter_400Regular",
  },
  freqRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  freqChip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, borderWidth: 1 },
  freqChipText: { fontSize: 12, fontFamily: "Inter_500Medium" },
  inlineRow: {
    flexDirection: "row", alignItems: "center", gap: 10,
    borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, height: 44,
  },
  inlineLabel: { fontSize: 14, fontFamily: "Inter_400Regular" },
  inlineInput: { width: 56, fontSize: 16, fontFamily: "Inter_600SemiBold", textAlign: "center" },
  dayRow: { flexDirection: "row", gap: 8 },
  dayChip: {
    width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center", borderWidth: 1,
  },
  dayChipText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  timeChip: {
    alignItems: "center", paddingHorizontal: 14, paddingVertical: 10, borderRadius: 12, borderWidth: 1, gap: 2,
  },
  timeChipEmoji: { fontSize: 18 },
  timeChipLabel: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  timeChipSub: { fontSize: 10, fontFamily: "Inter_400Regular" },
  endTypeRow: { flexDirection: "row", gap: 8 },
  endTypeBtn: { flex: 1, paddingVertical: 9, borderRadius: 10, alignItems: "center", borderWidth: 1 },
  endTypeBtnText: { fontSize: 12, fontFamily: "Inter_500Medium" },
  scheduleHint: { fontSize: 11, lineHeight: 16, fontFamily: "Inter_400Regular" },
});
