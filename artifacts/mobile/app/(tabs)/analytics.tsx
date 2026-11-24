import { Dimensions as OODims } from "react-native";
const OO_AUDIT_W = Math.min(OODims.get("window").width * 0.82, 320);
import { ZERO_DECIMAL_CURRENCIES } from "@/utils/splitMath";
import { splitEquallyFor, splitByPercentagesFor, splitBySharesFor } from "@/utils/splitMath";
import { CurrencyPickerModal } from "@/components/CurrencyPickerModal";
import { searchMatches } from "@/utils/searchMatch";
import type { ComponentRef } from "react";
import { Feather } from "@expo/vector-icons";
import { TabHeader, TabSearchBar, TAB_SEARCH_SORT_ROW } from "@/components/TabHeader";
import { useFloatingDateHeader } from "@/hooks/useFloatingDateHeader";
import { TideBackdrop } from "@/components/TideBackdrop";
import { WebPullToRefresh } from "@/components/WebPullToRefresh";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import {
  Alert,
  FlatList,
  Keyboard,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type GestureResponderEvent,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { GestureDetector } from "react-native-gesture-handler";
import Animated, { FadeInDown, FadeOutUp } from "react-native-reanimated";
import { Avatar } from "@/components/Avatar";
import { BUILTIN_CATEGORY_CONFIG, CategoryIcon } from "@/components/CategoryIcon";
import { MonochromeIconTile, categoryIconName } from "@/components/MonochromeIconTile";
import { ReceiptSvgIcon } from "@/components/ReceiptSvgIcon";
import { EmptyState } from "@/components/EmptyState";
import { CURRENCY_LIST, CURRENCY_SYMBOLS, DirectPayment, Member, SplitType, useApp } from "@/context/AppContext";
import { evenPercentages, percentagesAddUp, splitByPercentages, splitEqually, toCents } from "@/utils/splitMath";
import { AlphabetIndex } from "@/components/AlphabetIndex";
import { scrollRegistry } from "@/hooks/scrollRegistry";
import { useSwipeDismiss } from "@/hooks/useSwipeDismiss";
import { useTheme } from "@/hooks/useTheme";
import { suggestCategory } from "@/services/ai";
import { SortBottomSheet } from "@/components/SortBottomSheet";

const BUILTIN_CATEGORIES = [
  { value: "food", label: "Food & Drink", icon: "coffee" },
  { value: "transport", label: "Transport", icon: "navigation" },
  { value: "accommodation", label: "Stay", icon: "home" },
  { value: "entertainment", label: "Fun", icon: "film" },
  { value: "utilities", label: "Utilities", icon: "zap" },
  { value: "shopping", label: "Shopping", icon: "shopping-bag" },
  { value: "health", label: "Health", icon: "heart" },
  { value: "other", label: "Other", icon: "receipt-outline" },
] as const;

// ─── Types ───────────────────────────────────────────────────────────────────

type SortKey = "date-newest" | "date-oldest" | "amount-highest" | "amount-lowest";
type FeedRow =
  | { type: "header"; id: string; label: string }
  | { type: "payment"; id: string; payment: DirectPayment };

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: "date-newest",    label: "Date (newest first)"   },
  { key: "date-oldest",   label: "Date (oldest first)"   },
  { key: "amount-highest",label: "Amount (highest first)" },
  { key: "amount-lowest", label: "Amount (lowest first)"  },
];

const SPLIT_TYPES: { value: SplitType; label: string; desc: string }[] = [
  { value: "equal",      label: "Equal",   desc: "Split evenly"   },
  { value: "exact",      label: "Exact",   desc: "Set amounts"    },
    { value: "percentage", label: "%",       desc: "By percentage"  },
  { value: "shares",     label: "Shares",  desc: "By shares"      },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function money(value: number, currency: string, decimals = ZERO_DECIMAL_CURRENCIES.has(currency) ? 0 : 2) {
  return `${CURRENCY_SYMBOLS[currency] ?? `${currency} `}${value.toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })}`;
}

function bucket(iso: string) {
  const d = new Date(iso), now = new Date(), yest = new Date();
  yest.setDate(now.getDate() - 1);
  if (d.toDateString() === now.toDateString()) return "Today";
  if (d.toDateString() === yest.toDateString()) return "Yesterday";
  return d.toLocaleString(undefined, { month: "long", year: "numeric" });
}

function dateParts(iso: string) {
  const d = new Date(iso);
  return {
    month: d.toLocaleString(undefined, { month: "short" }),
    day: String(d.getDate()).padStart(2, "0"),
  };
}

// Signed value matching the feed row's own display convention:
// money you paid out shows red/minus, money paid to you shows green/plus.
function signedAmount(p: DirectPayment, currentUserId: string) {
  return (p.toId === currentUserId ? 1 : -1) * p.amount;
}

// ─── Payment form sheet ───────────────────────────────────────────────────────
// Multi-friend split: when >1 person is selected, choose Equal / Exact / % just
// like a group expense; one DirectPayment is created per person on save.
// No nested Modals — delete uses Alert.alert; the currency picker is an inline
// in-sheet dropdown (same pattern as the friend picker) rather than a second
// stacked root Modal, since two simultaneous native Modals can eat touches.

function PaymentFormContent({
  payment, friends, currentUser, defaultCurrency,
  onClose,
  dragGesture,
}: {
  payment: DirectPayment | null;
  friends: Member[];
  currentUser: Member;
  defaultCurrency: string;
  onClose: () => void;
  dragGesture: any;
}) {
  const { colors } = useTheme();
  const {
    addDirectPayment,
    updateDirectPayment,
    deleteDirectPayment,
    customCategories,
    addCustomCategory,
    getMemberById: getAnyMember,
    directPayments: allDirectPayments,
  } = useApp();
  const bill = payment?.bill;
  /** Old single-row one-offs (made before bills existed) still edit the simple way. */
  const editing = !!payment && !bill;
  const isOpen = !!payment;

  // When editing, pre-select the other party (single person only)
  const involvedId = payment
    ? (payment.fromId === currentUser.id ? payment.toId : payment.fromId)
    : "";

  // Multi-select: array of chosen friend IDs
  const [chosen, setChosen]           = useState<string[]>(involvedId ? [involvedId] : []);
  const formScrollRef = useRef<ComponentRef<typeof ScrollView>>(null);
  const commentsFocusedRef = useRef(false);
  const keepCommentsVisible = () => { if (commentsFocusedRef.current) setTimeout(() => formScrollRef.current?.scrollToEnd({ animated: true }), 250); };
  const [personOpen, setPersonOpen]   = useState(false);
  const [personQuery, setPersonQuery] = useState("");
  const personDropdownRef = useRef<ComponentRef<typeof View>>(null);
  // Group-style payer selection. The current user starts included but can be
  // removed from a multi-person one-off; friends become available to pay once
  // they are involved.
  const [paidById, setPaidById]       = useState(payment?.fromId ?? currentUser.id);
  const [includeSelf, setIncludeSelf] = useState(true);
  const [reason, setReason]           = useState((payment as any)?.reason ?? (payment as any)?.note ?? "");
  const [comments, setComments]       = useState((payment as any)?.comments ?? "");
  const [amount, setAmount]           = useState(payment ? String(payment.amount) : "");
  const [reasonError, setReasonError] = useState(false);
  const [amountError, setAmountError] = useState(false);

  // Currency — inline dropdown, local to the form (no second Modal)
  const [currency, setCurrency]       = useState(payment?.currency ?? defaultCurrency);
  const [currencyOpen, setCurrencyOpen] = useState(false);
  const [currencyQuery, setCurrencyQuery] = useState("");

  // Category — inline chip grid, same "no second Modal" pattern.
  // Auto-detected from the reason text (same offline keyword matcher used
  // for group expenses) unless the user has already saved/picked one.
  const [category, setCategory]       = useState((payment as any)?.category ?? "other");
  const [showCategoryPicker, setShowCategoryPicker] = useState(false);
  const [showAddCat, setShowAddCat] = useState(false);
  const [newCatName, setNewCatName] = useState("");
  const [autoCategory, setAutoCategory] = useState<string | null>(null);
  const suggestTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const categorySwipe = useSwipeDismiss(() => setShowCategoryPicker(false));

  function handleFormTouchStart(event: GestureResponderEvent) {
    if (!personOpen) return;
    const { pageX, pageY } = event.nativeEvent;
    personDropdownRef.current?.measureInWindow((x, y, width, height) => {
      const touchedDropdown =
        pageX >= x && pageX <= x + width && pageY >= y && pageY <= y + height;
      if (!touchedDropdown) setPersonOpen(false);
    });
  }

  // Split (visible whenever ≥1 friend selected)
  const [splitType, setSplitType]         = useState<SplitType>("equal");
  const [exactAmounts, setExactAmounts]   = useState<Record<string, string>>({});
    const [percentages, setPercentages] = useState<Record<string, string>>({});
  const [shares, setShares] = useState<Record<string, string>>({});


  // Reset when a new payment is opened
  useEffect(() => {
    const nextInvolvedId = payment
      ? (payment.fromId === currentUser.id ? payment.toId : payment.fromId)
      : "";
    setChosen(nextInvolvedId ? [nextInvolvedId] : []);
    setPersonOpen(false); setPersonQuery("");
    setPaidById(payment?.fromId ?? currentUser.id);
    setIncludeSelf(true);
    setReason((payment as any)?.reason ?? (payment as any)?.note ?? "");
    setComments((payment as any)?.comments ?? "");
    setAmount(payment ? String(payment.amount) : "");
    setReasonError(false); setAmountError(false);
    setCurrency(payment?.currency ?? defaultCurrency);
    setCurrencyOpen(false); setCurrencyQuery("");
    setCategory((payment as any)?.category ?? "other");
    setShowCategoryPicker(false);
    setShowAddCat(false);
    setNewCatName("");
    setAutoCategory(null);
    setSplitType("equal"); setExactAmounts({}); setPercentages({}); setShares({});
  }, [payment?.id]);

  useEffect(() => {
    if (showCategoryPicker) categorySwipe.reset();
  }, [showCategoryPicker]);

  // Auto-detect category from the reason text, same offline keyword matcher
  // used for group expenses. Only overrides the category while it's still
  // following the auto-suggestion (a manual pick from the chip grid stops
  // further auto-updates for this session, same as the expense form).
  useEffect(() => {
    if (suggestTimer.current) clearTimeout(suggestTimer.current);
    suggestTimer.current = setTimeout(() => {
      if (reason.trim().length >= 3) {
        const result = suggestCategory(reason);
        if (result.confidence === "high") {
          setCategory(result.category);
          setAutoCategory(result.category);
        } else if (autoCategory !== null) {
          setCategory("other");
          setAutoCategory(null);
        }
      } else if (autoCategory !== null) {
        setCategory("other");
        setAutoCategory(null);
      }
    }, 250);
    return () => { if (suggestTimer.current) clearTimeout(suggestTimer.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reason]);

  const filtered = friends.filter(f => f.name.toLowerCase().includes(personQuery.toLowerCase()));
  // Same A-Z grouping + rail as the New group member picker.
  const pickerScrollRef = useRef<ComponentRef<typeof ScrollView>>(null);
  const pickerLetterY = useRef<Record<string, number>>({});
  const pickerGroups = useMemo(() => {
    const map = new Map<string, Member[]>();
    [...filtered]
      .sort((a, b) => a.name.localeCompare(b.name))
      .forEach(f => {
        const first = (f.name.trim()[0] ?? "#").toUpperCase();
        const letter = /[A-Z]/.test(first) ? first : "#";
        if (!map.has(letter)) map.set(letter, []);
        map.get(letter)!.push(f);
      });
    return [...map.entries()]
      .map(([letter, people]) => ({ letter, people }))
      .sort((a, b) => (a.letter === "#" ? 1 : b.letter === "#" ? -1 : a.letter.localeCompare(b.letter)));
  }, [filtered]);
  const filteredCurrencies = useMemo(
    () => CURRENCY_LIST.filter(c =>
      !currencyQuery || `${c.code} ${c.label}`.toLowerCase().includes(currencyQuery.toLowerCase())
    ),
    [currencyQuery],
  );
  const allCategories = [
    ...BUILTIN_CATEGORIES,
    ...customCategories.map(value => ({
      value,
      label: value.charAt(0).toUpperCase() + value.slice(1),
      icon: "tag" as const,
    })),
  ];

  // Toggle a friend in/out of the selection
  function toggleFriend(id: string) {
    // When editing, only allow single selection
    if (editing) {
      setChosen([id]);
      setPersonOpen(false);
      Keyboard.dismiss();
      return;
    }
    setChosen(prev => {
      const next = prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id];
      const nextInvolvedIds = [
        ...(includeSelf ? [currentUser.id] : []),
        ...next,
      ];
      if (!nextInvolvedIds.includes(paidById)) setPaidById(nextInvolvedIds[0] ?? "");
      return next;
    });
  }

  const selectedFriends = friends.filter(f => chosen.includes(f.id));
  const participantMembers = [currentUser, ...selectedFriends];
  const involvedMembers = participantMembers.filter(member => member.id !== currentUser.id || includeSelf);
  const splitMembers = involvedMembers.filter(m => m.id !== paidById);
  const splitMemberIds = splitMembers.map(m => m.id);
  const allMemberIds = involvedMembers.map(m => m.id);
  const payerMember = involvedMembers.find(m => m.id === paidById) ?? currentUser;
  const payerShareLabel = paidById === currentUser.id ? "Your share" : `${payerMember.name}'s share`;
  const parsed = Number(amount.replace(/,/g, ""));
  // Every involved member except the payer gets a pairwise DirectPayment when
  // the form is saved.
  const showSplit = !editing && participantMembers.length >= 2;

  function toggleSelf() {
    const nextIncludeSelf = !includeSelf;
    setIncludeSelf(nextIncludeSelf);
    const nextInvolvedIds = [
      ...(nextIncludeSelf ? [currentUser.id] : []),
      ...chosen,
    ];
    if (!nextInvolvedIds.includes(paidById)) setPaidById(nextInvolvedIds[0] ?? "");
  }

  // Re-split from scratch whenever the people (or the total) change, so
  // deselecting someone spreads the bill over whoever is left.
  const memberKey = allMemberIds.join(",");
  const lastMemberKey = useRef(memberKey);
  const skipResetRef = useRef(false);
  useEffect(() => {
    if (!bill) return;
    skipResetRef.current = true;
    setChosen(bill.participants.filter(id => id !== currentUser.id));
    setIncludeSelf(bill.participants.includes(currentUser.id));
    setPaidById(bill.paidById);
    setAmount(String(bill.total));
    setSplitType(bill.splitType);
    setExactAmounts(bill.inputs?.exact ?? {});
    setPercentages(bill.inputs?.pct ?? {});
    setShares(bill.inputs?.shares ?? {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [payment?.id]);
  const lastParsed = useRef(parsed);
  useEffect(() => {
    if (skipResetRef.current) {
      skipResetRef.current = false;
      lastMemberKey.current = memberKey;
      lastParsed.current = parsed;
      return;
    }
    if (lastMemberKey.current !== memberKey) {
      lastMemberKey.current = memberKey;
      setShares({});
      setExactAmounts({});
      setPercentages({});
    }
    if (lastParsed.current !== parsed) {
      lastParsed.current = parsed;
      setExactAmounts({});
    }
  }, [memberKey, parsed]);
  // Seed sensible defaults as split type changes or friends are added
  useEffect(() => {
    if (chosen.length === 0) return;
    if (splitType === "exact") {
      setExactAmounts(prev => {
        const next = { ...prev };
        let changed = false;
        const evenParts = parsed > 0 ? splitEquallyFor(parsed, allMemberIds.length, currency) : [];
        allMemberIds.forEach((id, index) => {
          if (next[id] === undefined || next[id] === "") {
            next[id] = (evenParts[index] ?? 0) > 0 ? evenParts[index].toFixed(2) : "";
            changed = true;
          }
        });
        return changed ? next : prev;
      });
    } else if (splitType === "percentage") {
      setPercentages(prev => {
        const next = { ...prev };
        let changed = false;
        const evenPcts = evenPercentages(allMemberIds.length);
        allMemberIds.forEach((id, index) => {
          if (next[id] === undefined || next[id] === "") {
            next[id] = (evenPcts[index] ?? 0) > 0 ? String(evenPcts[index]) : "";
            changed = true;
          }
        });
        return changed ? next : prev;
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [splitType, allMemberIds.join(","), paidById, showSplit, parsed]);

  function adjustExact(id: string, delta: number) {
    setExactAmounts(prev => {
      const current = parseFloat(prev[id] ?? "0") || 0;
      const next = Math.max(0, Math.round((current + delta) * 100) / 100);
      return { ...prev, [id]: next.toFixed(2) };
    });
  }
  function adjustPercentage(id: string, delta: number) {
    setPercentages(prev => {
      const current = parseFloat(prev[id] ?? "0") || 0;
      const next = Math.max(0, Math.min(100, Math.round((current + delta) * 10) / 10));
      return { ...prev, [id]: next.toString() };
    });
  }
    function adjustShares(id: string, delta: number) {
    setShares(prev => {
      const current = parseFloat(prev[id] ?? "1") || 0;
      return { ...prev, [id]: String(Math.max(0, current + delta)) };
    });
  }
  const totalShareUnits = allMemberIds.reduce((sum, id) => sum + (parseFloat(shares[id] ?? "1") || 0), 0);
  const curSym = CURRENCY_SYMBOLS[currency]?.trim() || currency;
  // Per-person split amounts (always computed when ≥1 friend selected)
  const splitAmounts = useMemo<Record<string, number> | null>(() => {
    if (allMemberIds.length === 0) return null;
    if (splitType === "equal") {
      const parts = parsed > 0 ? splitEquallyFor(parsed, allMemberIds.length, currency) : [];
      return Object.fromEntries(allMemberIds.map((id, index) => [id, parts[index] ?? 0]));
    }
    if (splitType === "exact") {
      return Object.fromEntries(allMemberIds.map(id => [id, parseFloat(exactAmounts[id] ?? "0") || 0]));
    }
        if (splitType === "shares") {
      const w = allMemberIds.map(id => Math.max(0, parseFloat(shares[id] ?? "1") || 0));
      const parts = parsed > 0 && w.some(x => x > 0) ? splitBySharesFor(parsed, w, currency) : w.map(() => 0);
      return Object.fromEntries(allMemberIds.map((id, index) => [id, parts[index] ?? 0]));
    }
    // percentage: each member's % of the total bill

    const pcts = allMemberIds.map(id => parseFloat(percentages[id] ?? "0") || 0);
    const parts = Math.round(pcts.reduce((s, p) => s + p, 0) * 10) === 1000
      ? splitByPercentagesFor(parsed, pcts, currency)
      : pcts.map(pct => Math.round(pct * parsed) / 100);
    return Object.fromEntries(allMemberIds.map((id, index) => [id, parts[index] ?? 0]));
  }, [allMemberIds, involvedMembers.length, splitType, parsed, exactAmounts, percentages, shares, currency]);

  const totalAssigned = useMemo(
    () => splitAmounts ? Object.values(splitAmounts).reduce((s, v) => s + v, 0) : 0,
    [splitAmounts],
  );
  const splitTotal = useMemo(
    () => splitAmounts
      ? splitMemberIds.reduce((s, id) => s + (splitAmounts[id] ?? 0), 0)
      : 0,
    [splitAmounts, splitMemberIds],
  );

  // Payer's own share (amount they keep after others pay them back)
  const payerShare = useMemo(
    () => splitAmounts?.[paidById] ?? Math.max(0, parsed - splitTotal),
    [splitAmounts, paidById, parsed, splitTotal],
  );

  const splitValid = useMemo(() => {
    if (splitMemberIds.length === 0) return true;
    if (splitType === "equal") return true;
        if (splitType === "shares") return allMemberIds.some(id => (parseFloat(shares[id] ?? "1") || 0) > 0);
    if (splitType === "exact") return toCents(totalAssigned) === toCents(parsed);
    // percentage: every member's percentage must add up to 100
    const totalPct = allMemberIds.reduce((s, id) => s + (parseFloat(percentages[id] ?? "0") || 0), 0);
    return Math.round(totalPct * 10) === 1000;
  }, [splitMemberIds, splitType, totalAssigned, parsed, allMemberIds, percentages, shares]);

  function save() {
    const badReason = !reason.trim();
    const badAmount = !Number.isFinite(parsed) || parsed <= 0;
    setReasonError(badReason); setAmountError(badAmount);
    if (badReason || badAmount) return;
    if (chosen.length === 0) {
      Alert.alert(
        "Who's involved?",
        "Select at least one person who should share this one-off payment.",
      );
      return;
    }
    if (involvedMembers.length < 2) {
      Alert.alert(
        "Add another person",
        "A one-off needs at least two involved people.",
      );
      return;
    }

    if (showSplit && splitType !== "equal" && !splitValid) {
      Alert.alert(
        "Split doesn't balance",
        splitType === "exact"
          ? `All shares must add up to ${money(parsed, currency)}.`
                    : splitType === "shares" ? "Give at least one person a share." : "All percentages must add up to 100%.",
      );
      return;
    }

    const billId = bill?.billId ?? `b_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
    if (bill) {
      // Editing a bill: replace all of its rows with the new version.
      allDirectPayments.filter(r => r.billId === bill.billId).forEach(r => deleteDirectPayment(r.id, true));
    }
    const newBill = {
      billId,
      total: parsed,
      paidById,
      splitType,
      participants: allMemberIds,
      shares: Object.fromEntries(allMemberIds.map(id => [id, id === paidById ? payerShare : (splitAmounts?.[id] ?? 0)])),
      inputs: { exact: exactAmounts, pct: percentages, shares },
    };
    if (editing && payment) {
      // Single-edit: update the existing record
      const friendId = chosen[0] ?? "";
      updateDirectPayment(payment.id, {
        fromId: paidById,
        toId:   paidById === currentUser.id ? friendId : currentUser.id,
        reason: reason.trim(),
        comments: comments.trim() || undefined,
        amount: parsed,
        currency,
        category,
      });
    } else {
      // Add: one pairwise payment from the selected payer to each other
      // involved member. This preserves the DirectPayment storage model while
      // giving the form the same participant semantics as a group expense.
      splitMembers.forEach(member => {
        const amt = showSplit ? (splitAmounts?.[member.id] ?? 0) : parsed;
        if (amt <= 0) return;
        addDirectPayment({
          fromId: paidById,
          toId: member.id,
          reason: reason.trim(),
          comments: comments.trim() || undefined,
          amount: amt,
        currency,
        category,
        billId,
        bill: newBill,
      });
      });
    }
    onClose();
  }

  // Delete uses Alert – no nested Modal
  function requestDelete() {
    Alert.alert(
      "Remove one-off?",
      "This payment will be permanently deleted.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete", style: "destructive",
          onPress: () => {
            if (payment) {
              if (bill) allDirectPayments.filter(r => r.billId === bill.billId).forEach(r => deleteDirectPayment(r.id));
              else deleteDirectPayment(payment.id);
            }
            onClose();
          },
        },
      ],
    );
  }

  return (
    <View style={{ flex: 1 }}>
      {/* Drag zone: handle + title row. Swipe down from here to collapse. */}
      <GestureDetector gesture={dragGesture}>
        <View>
          <View style={[styles.handle, { backgroundColor: colors.border }]} />
          <View style={styles.sheetTitleRow}>
            <Text style={[styles.sheetTitle, { color: colors.text }]}>
              {isOpen ? "Edit One-Off" : "Add One-Off"}
            </Text>
            {isOpen && (
              <Pressable onPress={requestDelete} hitSlop={8} accessibilityRole="button" accessibilityLabel="Delete">
                <Feather name="trash-2" size={19} color={colors.danger} />
              </Pressable>
            )}
          </View>
        </View>
      </GestureDetector>

      <ScrollView
          ref={formScrollRef}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
          showsVerticalScrollIndicator={false}
          automaticallyAdjustKeyboardInsets
          contentContainerStyle={{ paddingBottom: 180 }}
          onTouchStart={handleFormTouchStart}
        onScrollBeginDrag={() => {
          Keyboard.dismiss();
          setPersonOpen(false);
        }}
      >
        {/* AMOUNT — follows the same leading card pattern as Add Expense. */}
        <Text style={[styles.section, { color: colors.textTertiary }]}>
          {editing && payment && !bill

              ? (payment.fromId === currentUser.id
                ? `${(friends.find(f => f.id === payment.toId)?.name ?? "They").split(" ")[0].toUpperCase()} OWES YOU`
                : `YOU OWE ${(friends.find(f => f.id === payment.fromId)?.name ?? "them").split(" ")[0].toUpperCase()}`)
              : showSplit && selectedFriends.length > 1 ? "TOTAL AMOUNT" : "AMOUNT"}
        </Text>
        <View style={styles.amountCard}>
          <View style={styles.amountCardBody}>
            <Pressable
              onPress={() => { Keyboard.dismiss(); setPersonOpen(false); setCurrencyOpen(true); }}
               style={[styles.currencyBox, { backgroundColor: colors.surface, borderColor: colors.border }]}
              accessibilityRole="button"
              accessibilityLabel="Choose currency"
            >
              <Text style={[styles.currencyIconText, { color: colors.text }]}>
                {CURRENCY_SYMBOLS[currency]?.trim() || currency}
              </Text>
                <Feather name="chevron-down" size={11} color={colors.textSecondary} style={styles.currencyChevron} />
            </Pressable>
            <View style={[styles.amountEntryBox, {
               backgroundColor: colors.surface,
              borderColor: amountError ? colors.danger : colors.border,
              borderWidth: amountError ? 2 : 1,
            }]}>
              <View style={styles.amountEntryColumn}>
                <View style={styles.amountRow}>
                  <TextInput
                    value={amount}
                    onChangeText={v => { setAmount(v); if (Number(v.replace(/,/g, "")) > 0) setAmountError(false); }}
                    onFocus={() => { setPersonOpen(false); setCurrencyOpen(false); }}
                    placeholder="0.00" placeholderTextColor={colors.textTertiary}
                    keyboardType="decimal-pad"
                    style={[styles.amountInput, { color: colors.text }, amount.length > 9 ? { fontSize: amount.length > 13 ? 20 : 26 } : null]}
                  />
                </View>
              </View>
            </View>
          </View>
        </View>
        {amountError && <Text style={[styles.errorHint, { color: colors.danger }]}>Please enter a cost amount</Text>}

        <CurrencyPickerModal
          visible={currencyOpen}
          value={currency}
          onChange={(c: string) => { setCurrency(c); setCurrencyOpen(false); }}
          onClose={() => setCurrencyOpen(false)}
        />

        {/* DESCRIPTION — same category/icon row as Add Expense. */}
        <Text style={[styles.section, { color: colors.textTertiary }]}>DESCRIPTION</Text>
        <View style={styles.descRow}>
          <Pressable
            onPress={() => setShowCategoryPicker(true)}
             style={[styles.categoryIconBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}
            accessibilityRole="button"
            accessibilityLabel="Choose category"
          >
             <CategoryIcon category={category} description={reason} size={32} />
            {autoCategory === category && (
              <View style={[styles.autoBadgeSmall, { backgroundColor: colors.primaryLight }]}>
                <Feather name="zap" size={8} color={colors.primary} />
              </View>
            )}
            <Feather name="chevron-down" size={12} color={colors.textSecondary} style={styles.categoryChevron} />
          </Pressable>
          <View style={{ flex: 1 }}>
            <TextInput
              value={reason}
              onChangeText={v => { setReason(v); if (v.trim()) setReasonError(false); }}
              onFocus={() => { setPersonOpen(false); setCurrencyOpen(false); setShowCategoryPicker(false); }}
              placeholder="What's this for? *"
              placeholderTextColor={reasonError ? colors.danger : colors.textTertiary}
              style={[styles.field, {
                 color: colors.text, backgroundColor: colors.surface,
                borderColor: reasonError ? colors.danger : colors.border,
                borderWidth: reasonError ? 2 : 1,
                height: 52,
                flex: 1,
              }]}
            />
            {reasonError && <Text style={[styles.errorHint, { color: colors.danger }]}>Please add a description</Text>}
          </View>
        </View>

        {/* Category picker — same bottom-sheet approach and item list as Add Expense. */}
        <Modal
          visible={showCategoryPicker}
          transparent
          animationType="slide"
          onRequestClose={() => setShowCategoryPicker(false)}
        >
          <View style={styles.catModalOverlay}>
            <Pressable
              style={StyleSheet.absoluteFill}
              onPress={() => setShowCategoryPicker(false)}
            />
            <Animated.View
              style={[
                styles.catModalSheet,
                { backgroundColor: colors.surface },
                categorySwipe.style,
              ]}
            >
              <GestureDetector gesture={categorySwipe.gesture}>
                <View>
                  <View style={styles.catModalHandle} />
                  <Text style={[styles.catModalTitle, { color: colors.text }]}>Category</Text>
                </View>
              </GestureDetector>
              <View style={styles.catModalGrid}>
                {allCategories.map(c => {
                  const isSelected = category === c.value;
                  const config = BUILTIN_CATEGORY_CONFIG[c.value];
                  return (
                    <Pressable
                      key={c.value}
                      style={[
                        styles.catModalChip,
                        {
                          backgroundColor: isSelected ? colors.primary : colors.background,
                          borderColor: isSelected ? colors.primary : colors.border,
                        },
                      ]}
                      onPress={() => {
                        setCategory(c.value);
                        setAutoCategory(null);
                        setShowCategoryPicker(false);
                      }}
                    >
                      {c.value === "other" ? (
                        <ReceiptSvgIcon
                          size={16}
                          color={isSelected ? "#fff" : (config?.color ?? colors.textSecondary)}
                        />
                      ) : (
                        <Feather
                          name={(config?.icon ?? "tag") as any}
                          size={16}
                          color={isSelected ? "#fff" : (config?.color ?? colors.textSecondary)}
                        />
                      )}
                      <Text style={[styles.catLabel, { color: isSelected ? "#fff" : colors.text }]}>
                        {c.label}
                      </Text>
                    </Pressable>
                  );
                })}
                {showAddCat ? (
                  <View style={[styles.addCatWrap, { borderColor: colors.primary, backgroundColor: colors.primaryLight }]}>
                    <TextInput
                      style={[styles.addCatInput, { color: colors.text }]}
                      placeholder="Category name"
                      placeholderTextColor={colors.textTertiary}
                      value={newCatName}
                      onChangeText={setNewCatName}
                      autoFocus
                      onSubmitEditing={() => {
                        const name = newCatName.trim().toLowerCase();
                        if (!name) return;
                        addCustomCategory(name);
                        setCategory(name);
                        setAutoCategory(null);
                        setNewCatName("");
                        setShowAddCat(false);
                        setShowCategoryPicker(false);
                      }}
                      returnKeyType="done"
                    />
                    <Pressable
                      onPress={() => {
                        const name = newCatName.trim().toLowerCase();
                        if (!name) return;
                        addCustomCategory(name);
                        setCategory(name);
                        setAutoCategory(null);
                        setNewCatName("");
                        setShowAddCat(false);
                        setShowCategoryPicker(false);
                      }}
                     accessibilityRole="button" accessibilityLabel="Done">
                      <Feather name="check" size={16} color={colors.primary} />
                    </Pressable>
                    <Pressable onPress={() => { setShowAddCat(false); setNewCatName(""); }} accessibilityRole="button" accessibilityLabel="Close">
                      <Feather name="x" size={16} color={colors.textTertiary} />
                    </Pressable>
                  </View>
                ) : (
                  <Pressable
                    style={[styles.catModalChip, { borderColor: colors.border, borderStyle: "dashed", backgroundColor: "transparent" }]}
                    onPress={() => setShowAddCat(true)}
                  >
                    <Feather name="plus" size={14} color={colors.textTertiary} />
                    <Text style={[styles.catLabel, { color: colors.textTertiary }]}>Add</Text>
                  </Pressable>
                )}
              </View>
            </Animated.View>
          </View>
        </Modal>

        {/* PAID BY — same chips as Groups > Add expense */}
        <Text style={[G.sectionLabel, { color: colors.textSecondary }]}>Paid by</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={G.paidByRow}>
          {involvedMembers.map(member => {
            const isPaidBy = paidById === member.id;
            return (
              <Pressable
                key={member.id}
                onPress={() => setPaidById(member.id)}
                style={[G.paidByChip, { backgroundColor: isPaidBy ? colors.primaryLight : colors.surface, borderColor: isPaidBy ? colors.primary : colors.border }]}
              >
                <Avatar name={member.name} color={member.avatarColor} size={24} imageUri={member.photo} />
                <Text style={[G.paidByLabel, { color: isPaidBy ? colors.primary : colors.text }]}>
                  {member.id === currentUser.id ? "You" : member.name.split(" ")[0]}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>

        {/* WHO'S INVOLVED — opens the same full-screen picker as New group */}
        <Text style={[G.sectionLabel, { color: colors.textSecondary }]}>Who's involved</Text>
        <Pressable
          onPress={() => { Keyboard.dismiss(); setCurrencyOpen(false); setPersonOpen(true); }}
          style={[G.addPeopleBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}
          accessibilityRole="button"
        >
          <Feather name="user-plus" size={16} color={colors.primary} />
          <Text style={[G.addPeopleText, { color: selectedFriends.length > 0 ? colors.text : colors.textSecondary }]}>
            {selectedFriends.length === 0 ? "Add members" : `${involvedMembers.length} ${involvedMembers.length === 1 ? "person" : "people"} involved`}
          </Text>
          <Feather name="chevron-right" size={16} color={colors.textTertiary} />
        </Pressable>

        <Modal
          visible={personOpen}
          animationType="slide"
          presentationStyle="pageSheet"
          onRequestClose={() => { setPersonOpen(false); setPersonQuery(""); }}
        >
          <View style={{ flex: 1, backgroundColor: colors.background, paddingTop: 30 }}>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16 }}>
              <Text style={{ color: colors.text, fontSize: 18, fontWeight: "800" }}>Add members</Text>
              <Pressable onPress={() => { setPersonOpen(false); setPersonQuery(""); }} hitSlop={12} accessibilityRole="button">
                <Text style={{ color: colors.primary, fontSize: 16, fontWeight: "800" }}>
                  {chosen.length > 1 ? `Done · ${chosen.length}` : "Done"}
                </Text>
              </Pressable>
            </View>
            <View style={[styles.searchInputWrap, { backgroundColor: colors.surface, borderColor: colors.border, marginHorizontal: 16, marginTop: 12, marginBottom: 4 }]}>
              <Feather name="search" size={16} color={colors.textTertiary} />
              <TextInput
                value={personQuery} onChangeText={setPersonQuery}
                placeholder="Search by name" placeholderTextColor={colors.textTertiary}
                style={[styles.flexInput, { color: colors.text }]}
                returnKeyType="search"
              />
            </View>
            <View style={{ flex: 1 }}>
              <ScrollView
                ref={pickerScrollRef}
                keyboardDismissMode="on-drag"
                keyboardShouldPersistTaps="handled"
                contentContainerStyle={{ paddingBottom: 40, paddingRight: pickerGroups.length > 1 ? 24 : 0 }}
              >
                {filtered.length === 0
                  ? <Text style={[styles.emptyFriend, { color: colors.textTertiary }]}>No people found</Text>
                  : pickerGroups.map(group => (
                    <View key={group.letter} onLayout={e => { pickerLetterY.current[group.letter] = e.nativeEvent.layout.y; }}>
                      <Text style={[G.sectionLabel, { color: colors.textTertiary, marginLeft: 16, marginTop: 12, marginBottom: 4 }]}>{group.letter}</Text>
                      {group.people.map(friend => {
                        const isSelected = chosen.includes(friend.id);
                        return (
                          <Pressable
                            key={friend.id}
                            onPress={() => toggleFriend(friend.id)}
                            style={[styles.friendRow, { borderColor: colors.border, paddingHorizontal: 16 }, isSelected && { backgroundColor: colors.primary + "10" }]}
                          >
                            <Avatar name={friend.name} color={friend.avatarColor} size={36} imageUri={friend.photo} />
                            <Text style={[styles.personText, { color: colors.text }]}>{friend.name}</Text>
                            <View style={[G.participantCheckbox, { borderColor: isSelected ? colors.primary : colors.border, backgroundColor: isSelected ? colors.primary : "transparent" }]}>
                              {isSelected && <Feather name="check" color="#fff" size={11} />}
                            </View>
                          </Pressable>
                        );
                      })}
                    </View>
                  ))}
              </ScrollView>
              {pickerGroups.length > 1 && (
                <AlphabetIndex
                  available={new Set(pickerGroups.map(g => g.letter))}
                  onSelect={letter => {
                    const y = pickerLetterY.current[letter];
                    if (y !== undefined) pickerScrollRef.current?.scrollTo({ y, animated: false });
                  }}
                  textColor={colors.text}
                  mutedColor={colors.textTertiary}
                  highlightColor={colors.primary}
                  style={{ position: "absolute", right: 2, top: 8, bottom: 8 }}
                />
              )}
            </View>
          </View>
        </Modal>

        {showSplit && (
          <>
            <View style={[G.splitTypeRow, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              {SPLIT_TYPES.map(t => (
                <Pressable
                  key={t.value}
                  style={[G.splitTypeBtn, splitType === t.value && { backgroundColor: colors.primaryLight }]}
                  onPress={() => setSplitType(t.value)}
                >
                  <Text style={[G.splitTypeLabel, { color: splitType === t.value ? colors.primary : colors.text }]}>{t.label}</Text>
                  <Text style={[G.splitTypeDesc, { color: splitType === t.value ? colors.primary : colors.textSecondary }]}>{t.desc}</Text>
                </Pressable>
              ))}
            </View>

            <View style={G.splitDetails}>
              {participantMembers.map(member => {
                const isIncluded = involvedMembers.some(involved => involved.id === member.id);
                const memberShare = member.id === paidById ? payerShare : (splitAmounts?.[member.id] ?? 0);
                const exactW = Math.min(150, Math.max(72, (exactAmounts[member.id] ?? "").length * 8 + 20));
                return (
                  <View key={member.id} style={[G.splitRow, { backgroundColor: colors.surface, opacity: isIncluded ? 1 : 0.45 }]}>
                    <Pressable
                      style={G.participantMain}
                      onPress={() => member.id === currentUser.id ? toggleSelf() : toggleFriend(member.id)}
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: isIncluded }}
                    >
                      <View style={[G.participantCheckbox, { borderColor: isIncluded ? colors.primary : colors.border, backgroundColor: isIncluded ? colors.primary : "transparent" }]}>
                        {isIncluded && <Feather name="check" size={11} color="#fff" />}
                      </View>
                      <Avatar name={member.name} color={member.avatarColor} size={32} imageUri={member.photo} />
                      <Text style={[G.splitName, { color: colors.text }]} numberOfLines={1} ellipsizeMode="tail">
                        {member.id === currentUser.id ? "You" : member.name.split(" ")[0]}
                      </Text>
                    </Pressable>
                    {!isIncluded ? (
                      <Text style={[G.splitAmount, { color: colors.textTertiary }]}>excluded</Text>
                    ) : splitType === "equal" ? (
                      <View style={[G.equalAmountBox, { backgroundColor: colors.inputBg, borderColor: colors.border }]}>
                        <Text numberOfLines={1} adjustsFontSizeToFit style={[G.splitAmount, { color: colors.textSecondary }]}>{money(memberShare, currency)}</Text>
                      </View>
                    ) : null}
                    {isIncluded && splitType === "exact" ? (
                      <View style={G.stepperWrap}>
                        <Pressable style={[G.stepperBtn, { backgroundColor: colors.primaryLight, borderColor: colors.border }]} hitSlop={6} onPress={() => adjustExact(member.id, -1)} accessibilityRole="button" accessibilityLabel="Remove one">
                          <Feather name="minus" size={14} color={colors.primary} />
                        </Pressable>
                        <View style={G.exactAmountInputWrap}>
                          <Text style={[G.splitCurrencySymbol, { color: colors.textSecondary }]}>{curSym}</Text>
                          <TextInput
                            style={[G.splitInput, { width: exactW, color: colors.text, borderColor: colors.border, backgroundColor: colors.inputBg }]}
                            placeholder="0.00" placeholderTextColor={colors.textTertiary}
                            value={exactAmounts[member.id] ?? ""}
                            onChangeText={v => setExactAmounts(prev => ({ ...prev, [member.id]: v }))}
                            keyboardType="decimal-pad"
                          />
                        </View>
                        <Pressable style={[G.stepperBtn, { backgroundColor: colors.primaryLight, borderColor: colors.border }]} hitSlop={6} onPress={() => adjustExact(member.id, 1)} accessibilityRole="button" accessibilityLabel="Add">
                          <Feather name="plus" size={14} color={colors.primary} />
                        </Pressable>
                      </View>
                    ) : isIncluded && splitType === "shares" ? (
                      <View style={G.stepperWrap}>
                        <Pressable style={[G.stepperBtn, { backgroundColor: colors.primaryLight, borderColor: colors.border }]} hitSlop={6} onPress={() => adjustShares(member.id, -1)} accessibilityLabel={`One less share for ${member.name}`}>
                          <Feather name="minus" size={14} color={colors.primary} />
                        </Pressable>
                        <View style={G.pctInputWrap}>
                          <TextInput
                            style={[G.splitInput, { color: colors.text, borderColor: colors.border, backgroundColor: colors.inputBg }]}
                            placeholder="1" placeholderTextColor={colors.textTertiary}
                            value={shares[member.id] ?? "1"}
                            onChangeText={v => setShares(prev => ({ ...prev, [member.id]: v }))}
                            keyboardType="decimal-pad"
                          />
                          <Text style={[G.pctLabel, { color: colors.textSecondary }]}>{money(splitAmounts?.[member.id] ?? 0, currency)}</Text>
                        </View>
                        <Pressable style={[G.stepperBtn, { backgroundColor: colors.primaryLight, borderColor: colors.border }]} hitSlop={6} onPress={() => adjustShares(member.id, 1)} accessibilityLabel={`One more share for ${member.name}`}>
                          <Feather name="plus" size={14} color={colors.primary} />
                        </Pressable>
                      </View>
                    ) : isIncluded && splitType === "percentage" ? (
                      <View style={G.stepperWrap}>
                        <Pressable style={[G.stepperBtn, { backgroundColor: colors.primaryLight, borderColor: colors.border }]} hitSlop={6} onPress={() => adjustPercentage(member.id, -5)} accessibilityRole="button" accessibilityLabel="Remove one">
                          <Feather name="minus" size={14} color={colors.primary} />
                        </Pressable>
                        <View style={G.pctInputWrap}>
                          <TextInput
                            style={[G.splitInput, { color: colors.text, borderColor: colors.border, backgroundColor: colors.inputBg }]}
                            placeholder="0" placeholderTextColor={colors.textTertiary}
                            value={percentages[member.id] ?? ""}
                            onChangeText={v => setPercentages(prev => ({ ...prev, [member.id]: v }))}
                            keyboardType="decimal-pad"
                          />
                          <Text style={[G.pctLabel, { color: colors.textSecondary }]}>%</Text>
                        </View>
                        <Pressable style={[G.stepperBtn, { backgroundColor: colors.primaryLight, borderColor: colors.border }]} hitSlop={6} onPress={() => adjustPercentage(member.id, 5)} accessibilityRole="button" accessibilityLabel="Add">
                          <Feather name="plus" size={14} color={colors.primary} />
                        </Pressable>
                      </View>
                    ) : null}
                  </View>
                );
              })}
            </View>

            {splitType !== "equal" && parsed > 0 && (
              <View style={[G.validationRow, { backgroundColor: splitValid ? colors.successLight : colors.dangerLight, borderColor: splitValid ? colors.success : colors.danger }]}>
                <Feather name={splitValid ? "check-circle" : "alert-circle"} size={16} color={splitValid ? colors.success : colors.danger} />
                <Text style={[G.validationText, { color: splitValid ? colors.success : colors.danger }]}>
                  {splitType === "shares"
                    ? (splitValid
                      ? `${totalShareUnits} share${totalShareUnits === 1 ? "" : "s"} · ${money(totalShareUnits > 0 ? parsed / totalShareUnits : 0, currency)} per share ✓`
                      : "Give at least one person a share")
                    : splitType === "exact"
                      ? (splitValid
                        ? `Splits add up to ${money(parsed, currency)} ✓`
                        : (() => {
                            const diff = toCents(parsed) - toCents(totalAssigned);
                            return diff > 0 ? `${money(diff / 100, currency)} remaining to assign` : `${money(Math.abs(diff) / 100, currency)} over the total`;
                          })())
                      : (() => {
                          const totalPct = allMemberIds.reduce((sum, id) => sum + (parseFloat(percentages[id] ?? "0") || 0), 0);
                          const remaining = Math.round((100 - totalPct) * 10) / 10;
                          return splitValid ? "Percentages add up to 100% ✓"
                            : remaining > 0 ? `${remaining.toFixed(1)}% remaining to assign` : `${Math.abs(remaining).toFixed(1)}% over the total`;
                        })()}
                </Text>
              </View>
            )}
          </>
        )}

        {/* COMMENTS */}
        <Text style={[styles.section, { color: colors.textTertiary }]}>COMMENTS</Text>
        <TextInput
          value={comments} onChangeText={setComments}
            onFocus={() => { setPersonOpen(false); setCurrencyOpen(false); commentsFocusedRef.current = true; keepCommentsVisible(); }}
            onBlur={() => { commentsFocusedRef.current = false; }}
            onContentSizeChange={keepCommentsVisible}
          placeholder="Add comments (optional)" placeholderTextColor={colors.textTertiary}
          style={[styles.field, styles.commentField, { color: colors.text, backgroundColor: colors.inputBg, borderColor: colors.border }]}
          multiline
        />

        {/* HISTORY — same change-tracking as group expenses, condensed for a sheet */}
        {isOpen && (payment?.auditLog?.length ?? 0) > 0 && (
          <>
            <Text style={[styles.section, { color: colors.textTertiary }]}>HISTORY</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} snapToInterval={OO_AUDIT_W + 10} decelerationRate="fast" contentContainerStyle={{ gap: 10, paddingRight: 16, marginBottom: 4 }}>
              {[...(payment!.auditLog ?? [])].reverse().map(entry => {
                const who = entry.changedBy === currentUser.id
                  ? currentUser
                  : (friends.find(f => f.id === entry.changedBy) ?? getAnyMember(entry.changedBy));
                const isMe = entry.changedBy === currentUser.id;
                const actionLabel = entry.action === "created" ? "added this payment"
                  : entry.action === "deleted" ? "deleted this payment"
                  : "edited this payment";
                return (
                  <View key={entry.id} style={[styles.historyCard, { width: OO_AUDIT_W, backgroundColor: colors.inputBg, borderColor: colors.border }]}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                      <Avatar name={who?.name ?? "?"} color={who?.avatarColor ?? "#ccc"} size={26} imageUri={who?.photo} />
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.historyTitle, { color: colors.text }]}>
                          {isMe ? "You" : who?.name ?? "Former member"} {actionLabel}
                        </Text>
                        <Text style={[styles.historyTime, { color: colors.textTertiary }]}>
                          {new Date(entry.changedAt).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                        </Text>
                      </View>
                    </View>
                    {(entry.fieldChanges ?? []).map((fc, i) => (
                      <Text key={i} style={[styles.historyChange, { color: colors.textSecondary }]}>
                        <Text style={{ fontFamily: "Inter_600SemiBold" }}>{fc.field === "reason" ? "Reason" : fc.field === "comments" ? "Comments" : fc.field.charAt(0).toUpperCase() + fc.field.slice(1)}</Text>
                        {": "}{fc.oldValue || "—"} → {fc.newValue || "—"}
                      </Text>
                    ))}
                  </View>
                );
              })}
            </ScrollView>
          </>
        )}

        <Pressable onPress={save} style={[styles.save, { backgroundColor: colors.primary }]}>
          <Text style={styles.saveText}>{editing ? "Save Changes" : "Save"}</Text>
        </Pressable>

        {/* bottom breathing room */}
        <View style={{ height: 20 }} />
      </ScrollView>
    </View>
  );
}

// ─── Balance sheet content ────────────────────────────────────────────────────
// Settle uses Alert.alert – no nested Modal.

function BalanceSheetContent({
  balances, currency, currentUser, onSettleRequest, onClose, dragGesture,
}: {
  balances: { member: Member; amount: number }[];
  currency: string;
  currentUser: Member;
  onSettleRequest: (member: Member, signedBalance: number) => void;
  onClose: () => void;
  dragGesture: any;
}) {
  const { colors } = useTheme();

  return (
    <View style={{ flex: 1 }}>
      <GestureDetector gesture={dragGesture}>
        <View>
          <View style={[styles.handle, { backgroundColor: colors.border }]} />
          <View style={styles.sheetTitleRow}>
            <Text style={[styles.sheetTitle, { color: colors.text }]}>Balances</Text>
            <Pressable onPress={onClose} hitSlop={8} accessibilityRole="button" accessibilityLabel="Close"><Feather name="x" size={20} color={colors.text} /></Pressable>
          </View>
        </View>
      </GestureDetector>
      <Text style={[styles.balanceSub, { color: colors.textSecondary }]}>
        Your one-off balance with each friend
      </Text>
      <ScrollView onScrollBeginDrag={Keyboard.dismiss} keyboardShouldPersistTaps="handled">
        {balances.length === 0
          ? <Text style={[styles.balanceSub, { color: colors.textSecondary }]}>No balances yet.</Text>
          : (
            <View style={[styles.balListCard, { backgroundColor: colors.surface, shadowColor: colors.text }]}>
              {balances.map(({ member, amount }, i) => {
                const isOwed = amount >= 0;
                const shade = isOwed ? "#0E7A66" : "#B91C1C";
                const isLast = i === balances.length - 1;
                return (
                  <View key={member.id} style={styles.balRow}>
                    <Avatar name={member.name} color={member.avatarColor} size={40} imageUri={member.photo} />
                    <View style={styles.balRowBody}>
                      <Text style={[styles.personText, { color: colors.text }]} numberOfLines={1}>{member.name}</Text>
                      <Text style={[styles.balRowMeta, { color: shade }]} numberOfLines={1}>
                        {isOwed ? "owes you" : "you owe"}
                      </Text>
                    </View>
                    <View style={{ alignItems: "flex-end", gap: 4 }}>
                      <Text style={[styles.balRowAmount, { color: shade }]}>
                        {money(Math.abs(amount), currency)}
                      </Text>
                      {Math.abs(amount) > 0.005 && (
                        <Pressable
                          onPress={() => onSettleRequest(member, amount)}
                          style={[styles.settleButton, { borderColor: colors.primary, backgroundColor: colors.primary + "14" }]}
                        >
                          <Feather name="check-circle" size={11} color={colors.primary} />
                          <Text style={[styles.settleButtonText, { color: colors.primary }]}>Settle up</Text>
                        </Pressable>
                      )}
                    </View>
                    {!isLast && <View style={[styles.balRowSep, { backgroundColor: colors.border }]} />}
                  </View>
                );
              })}
            </View>
          )
        }
        <View style={{ height: 20 }} />
      </ScrollView>
    </View>
  );
}

// ─── Main screen ─────────────────────────────────────────────────────────────

export default function OneOffsScreen() {
  const { colors, refreshIndicatorColor } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { openPaymentId } = useLocalSearchParams<{ openPaymentId?: string }>();
  const {
    currentUser, members, directPayments,
    addDirectPayment, seedDirectPayments, updateDirectPayment, deleteDirectPayment,
    defaultCurrency, convertAmount, fetchExchangeRates,
  } = useApp();

  const [query, setQuery]               = useState("");
  const [sort, setSort]                 = useState<SortKey>("date-newest");
  const [showSort, setShowSort]         = useState(false);
  const [showBalances, setShowBalances] = useState(false);
  const [refreshing, setRefreshing]     = useState(false);
  const refreshingRef = useRef(false);
  const refreshActionRef = useRef<() => void>(() => {});

  // Settle-up modal state
  type SettleTarget = { member: Member; signedBalance: number };
  const [settleTarget,   setSettleTarget]   = useState<SettleTarget | null>(null);
  const [settleAmount,   setSettleAmount]   = useState("");
  const [settleError,    setSettleError]    = useState("");


  // Form state
  const [formOpen, setFormOpen]             = useState(false);
  const [editingPayment, setEditingPayment] = useState<DirectPayment | null>(null);
  // True while the currently-open edit sheet was deep-linked in from an
  // Activity-tab notification, so closing it can send the user back there
  // instead of stranding them on the One-Offs tab.
  const openedFromNotification = useRef(false);

  // Deep-link from an Activity-tab notification: open that one-off's edit
  // sheet directly instead of leaving the user to hunt for it in the list.
  useFocusEffect(useCallback(() => {
    if (!openPaymentId) return;
    const target = directPayments.find(p => p.id === openPaymentId);
    if (target) {
      openedFromNotification.current = true;
      setEditingPayment(target);
      setFormOpen(true);
    }
    router.setParams({ openPaymentId: undefined });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openPaymentId, directPayments]));

  function closeFormSheet() {
    setFormOpen(false);
    if (openedFromNotification.current) {
      openedFromNotification.current = false;
      router.replace("/(tabs)/activity");
    }
  }

  // Swipe-down-to-dismiss for the form, balance, and sort sheets
  const formSwipe     = useSwipeDismiss(() => closeFormSheet());
  const balancesSwipe = useSwipeDismiss(() => setShowBalances(false));
  useEffect(() => { if (formOpen) formSwipe.reset(); }, [formOpen]);
  useEffect(() => { if (showBalances) balancesSwipe.reset(); }, [showBalances]);

  const handleRefresh = useCallback(async () => {
    if (refreshingRef.current) return;
    refreshingRef.current = true;
    setRefreshing(true);
    try {
      await fetchExchangeRates().catch(() => {});
    } finally {
      refreshingRef.current = false;
      setRefreshing(false);
    }
  }, [fetchExchangeRates]);
  refreshActionRef.current = handleRefresh;

  // Rows are Pressables, and the floating controls sit over the lower part of
  // the feed. Native RefreshControl can therefore miss a downward gesture
  // that starts low on the screen. Keep this as a non-capturing fallback so
  // FlatList always owns normal scrolling first.
  const refreshPanResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gesture) =>
        !refreshingRef.current &&
        gesture.dy > 22 &&
        gesture.dy > Math.abs(gesture.dx) * 1.15,
      onPanResponderRelease: (_, gesture) => {
        if (gesture.dy > 22) refreshActionRef.current();
      },
    }),
  ).current;

  const listRef = useRef<FlatList>(null);
  const topPad = insets.top;
  const fabBottom = insets.bottom + 90;
  // Opening One-offs clears its red dot.
  const { notifications: oneOffNotifs, markNotificationRead: markOneOffRead } = useApp();
  useFocusEffect(useCallback(() => {
    oneOffNotifs
      .filter(n => !n.read && String(n.type).startsWith("direct_payment"))
      .forEach(n => markOneOffRead(n.id));
  }, [oneOffNotifs, markOneOffRead]));
  const listBottomPadding = fabBottom + 56 + 12;

  useEffect(() => {
    scrollRegistry.register("analytics", () =>
      listRef.current?.scrollToOffset({ offset: 0, animated: true })
    );
    return () => scrollRegistry.unregister("analytics");
  }, []);

  const openAdd = useCallback(() => {
    setEditingPayment(null);
    setFormOpen(true);
  }, []);
  const openEdit = useCallback((p: DirectPayment) => {
    setEditingPayment(p);
    setFormOpen(true);
  }, []);
  function closeForm() { closeFormSheet(); }

  // All non-self members
  const friends = useMemo(
    () => members.filter(m => !m.isCurrentUser && m.id !== currentUser.id),
    [members, currentUser.id],
  );
  const friendById = useMemo(() => new Map(members.map(m => [m.id, m])), [members]);

  // Keep the development preview populated with enough one-offs to exercise
  // scrolling, date grouping, search, sorting, and currency conversion.
  const oneOffSeedAttempted = useRef(false);
  useEffect(() => {
    if (
      !__DEV__ ||
      oneOffSeedAttempted.current ||
      directPayments.length >= 50 ||
      friends.length === 0
    ) return;
    oneOffSeedAttempted.current = true;
    seedDirectPayments(50 - directPayments.length);
  }, [directPayments.length, friends.length, seedDirectPayments]);

  const search = query.toLocaleLowerCase().trim();
  const filtered = useMemo(() => directPayments.filter(p => {
    if (!search) return true;
    const other = friendById.get(p.fromId === currentUser.id ? p.toId : p.fromId);
    return searchMatches(search, [other?.name, (p as any).reason ?? (p as any).note]);
  }), [directPayments, search, friendById, currentUser.id]);

  // Balances: fromId is the one who fronted the money, so they're the creditor
  // (their balance goes up); toId is the one who received it, so they owe it
  // back (their balance goes down). This must mirror exactly how "Settle up"
  // constructs its cancelling record, or settling will double the debt instead
  // of clearing it.
  const balances = useMemo(() => {
    const map = new Map<string, number>();
    directPayments.forEach(p => {
      const id = p.fromId === currentUser.id ? p.toId : p.fromId;
      const delta = convertAmount(p.amount, p.currency, defaultCurrency) * (p.fromId === currentUser.id ? 1 : -1);
      map.set(id, (map.get(id) ?? 0) + delta);
    });
    return [...map]
      .map(([id, amount]) => ({ member: friendById.get(id), amount }))
      .filter((x): x is { member: Member; amount: number } => !!x.member && Math.abs(x.amount) > 0.005)
      .sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount));
  }, [directPayments, convertAmount, defaultCurrency, currentUser.id, friendById]);

  const owed      = balances.reduce((s, x) => s + Math.max(0, -x.amount), 0);
  const owedToYou = balances.reduce((s, x) => s + Math.max(0, x.amount), 0);

  // Open the settle-up popup for a specific friend balance.
  // Close the balance sheet first so we never stack two modals (iOS limitation).
  function openSettleModal(member: Member, signedBalance: number) {
    setShowBalances(false);
    setSettleTarget({ member, signedBalance });
    setSettleAmount(Math.abs(signedBalance).toFixed(2));
    setSettleError("");
  }

  // Settling: if you owe them (amount<0), you become fromId (paying, which
  // raises the balance back toward 0). If they owe you (amount>=0), they
  // become fromId. Either way this record exactly cancels the existing balance.
  function handleSettle(member: Member, signedBalance: number, partialAmount: number) {
    const iPaid = signedBalance < 0;
    addDirectPayment({
      fromId: iPaid ? currentUser.id : member.id,
      toId:   iPaid ? member.id : currentUser.id,
      reason: "Settlement",
      amount: partialAmount,
      currency: defaultCurrency,
      isSettlement: true,
    });
  }

  function confirmSettle() {
    if (!settleTarget) return;
    const parsed = parseFloat(settleAmount);
    const fullAmt = Math.abs(settleTarget.signedBalance);
    if (isNaN(parsed) || parsed <= 0) {
      setSettleError("Enter an amount greater than 0");
      return;
    }
    if (parsed > fullAmt + 0.001) {
      setSettleError(`Can't exceed the ${money(fullAmt, defaultCurrency)} balance`);
      return;
    }
    handleSettle(settleTarget.member, settleTarget.signedBalance, Math.min(parsed, fullAmt));
    setSettleTarget(null);
    setShowBalances(true);   // return to balances sheet so user can settle others
  }

  const rows = useMemo<FeedRow[]>(() => {
    // One row per bill: a one-off with three people is one bill, not three debts.
    const seenBills = new Set<string>();
    const grouped: DirectPayment[] = [];
    for (const p of filtered) {
      const b = p.billId;
      if (!b) { grouped.push(p); continue; }
      if (seenBills.has(b)) continue;
      seenBills.add(b);
      grouped.push({ ...p, __billRows: filtered.filter(x => x.billId === b) } as DirectPayment);
    }
    const ordered = [...grouped].sort((a, b) => {
      if (sort === "date-oldest")    return +new Date(a.createdAt) - +new Date(b.createdAt);
      // Compare by magnitude, ignoring the +/- direction: owing $230 and being
      // owed $225 should sort as "close" amounts, not opposite extremes.
      if (sort === "amount-highest") return Math.abs(signedAmount(b, currentUser.id)) - Math.abs(signedAmount(a, currentUser.id));
      if (sort === "amount-lowest")  return Math.abs(signedAmount(a, currentUser.id)) - Math.abs(signedAmount(b, currentUser.id));
      return +new Date(b.createdAt) - +new Date(a.createdAt);
    });
    if (!sort.startsWith("date"))
      return ordered.map(payment => ({ type: "payment", id: payment.id, payment }));

    const out: FeedRow[] = [];
    let last = "";
    ordered.forEach(payment => {
      const label = bucket(payment.createdAt);
      if (label !== last) { out.push({ type: "header", id: `h-${label}`, label }); last = label; }
      out.push({ type: "payment", id: payment.id, payment });
    });
    return out;
  }, [filtered, sort, friendById, currentUser.id]);

  const render = useCallback(({ item }: { item: FeedRow }) => {
    if (item.type === "header") {
      return (
        <View style={styles.dateHeader}>
          <View style={[styles.dateHeaderRule, { backgroundColor: colors.border }]} />
          <View style={[styles.dateHeaderPill, { backgroundColor: colors.cardBg, borderColor: colors.border }]}>
            <Feather name="calendar" size={11} color={colors.primary} />
            <Text style={[styles.dateHeaderText, { color: colors.textSecondary }]}>{item.label}</Text>
          </View>
          <View style={[styles.dateHeaderRule, { backgroundColor: colors.border }]} />
        </View>
      );
    }
    const p            = item.payment;
    const isSettlement = !!(p as any).isSettlement;
    const youFronted   = !isSettlement && p.fromId === currentUser.id; // you covered → owed to you
    const iOwe         = isSettlement  ? p.fromId === currentUser.id   // you paid off debt
                                       : p.toId   === currentUser.id;  // friend fronted, you owe
    const person       = friendById.get(p.fromId === currentUser.id ? p.toId : p.fromId);
    const d            = dateParts(p.createdAt);
    const billRows     = (p as DirectPayment & { __billRows?: DirectPayment[] }).__billRows;
    let billNet = 0;
    if (billRows) for (const r of billRows) { if (r.fromId === currentUser.id) billNet += r.amount; else if (r.toId === currentUser.id) billNet -= r.amount; }
    const showOwe      = billRows ? billNet < 0 : iOwe;
    const showAmount   = billRows ? Math.abs(billNet) : p.amount;
    const shade        = showOwe ? colors.danger : colors.success;

    let metaLine: string;
    if (isSettlement) {
      metaLine = p.fromId === currentUser.id
        ? `You settled with ${person?.name ?? "Former member"}`
        : `${person?.name ?? "Former member"} settled with you`;
    } else if (youFronted) {
      metaLine = `You paid · ${person?.name ?? "Former member"} owes you`;
    } else {
      metaLine = `${person?.name ?? "Former member"} paid · You owe ${person?.name ?? "Former member"}`;
    }
    if (p.bill) {
      const payerName = p.bill.paidById === currentUser.id ? "You" : (friendById.get(p.bill.paidById)?.name ?? "Former member");
      const others = p.bill.participants.filter(id => id !== currentUser.id).map(id => (friendById.get(id)?.name ?? "Former member").split(" ")[0]);
      metaLine = `${payerName} paid ${money(p.bill.total, p.currency)} · with ${others.join(", ")}`;
    }
    if ((p as any).comments) metaLine += ` · ${(p as any).comments}`;

    return (
      <Pressable
        onPress={() => openEdit(p)}
        style={({ pressed }) => [
          styles.paymentRow,
          {
            backgroundColor: colors.cardBg,
            borderColor: colors.border,
            shadowColor: colors.shadow,
            opacity: pressed ? 0.82 : 1,
          },
        ]}
      >
        <View style={styles.dateCol}>
      <Text style={[styles.dateMonth, { color: colors.textTertiary }]}>{d.month}</Text>
      <Text style={[styles.dateDay, { color: colors.textSecondary }]}>{d.day}</Text>
        </View>
        <MonochromeIconTile
          icon={categoryIconName((p as any).category)}
          color={colors.textSecondary}
          borderColor={colors.border}
        />
        <View style={styles.rowContent}>
          <Text style={[styles.reason, { color: colors.text }]} numberOfLines={1}>
            {(p as any).reason ?? (p as any).note ?? "Payment"}
          </Text>
          <Text style={[styles.personMeta, { color: colors.textSecondary }]} numberOfLines={1}>
            {metaLine}
          </Text>
        </View>
        <View style={styles.rowMoneyCol}>
          <Text style={[styles.rowMoney, { color: shade }]} numberOfLines={1}>
            {showOwe ? "−" : "+"}{money(showAmount, p.currency)}
          </Text>
          {p.currency !== defaultCurrency && (
            <Text style={[styles.rowMoneyConverted, { color: colors.textTertiary }]} numberOfLines={1}>
              ≈ {money(convertAmount(showAmount, p.currency, defaultCurrency), defaultCurrency)}
            </Text>
          )}
        </View>
        <View style={[styles.rowSep, { backgroundColor: colors.border }]} />
      </Pressable>
    );
  }, [colors, currentUser.id, friendById, defaultCurrency, convertAmount, openEdit]);

  const isSortActive = sort !== "date-newest";

  const floating = useFloatingDateHeader(rows, r => (r.type === "header" ? r.label : null));
  return (
    <View
      style={[styles.container, { backgroundColor: colors.background }]}
      {...refreshPanResponder.panHandlers}
    >
      <View pointerEvents="none" style={styles.backgroundLayer}>
        <View style={[styles.backgroundOrbPrimary, { backgroundColor: colors.primary }]} />
        <View style={[styles.backgroundOrbSecondary, { backgroundColor: colors.primaryDark }]} />
      </View>

      <TideBackdrop />
      <WebPullToRefresh onRefresh={handleRefresh} refreshing={refreshing} />
      <TabHeader titleColor="#FFFFFF" title="One-Offs" topInset={topPad}>
        {/* Summary cards */}
        <View style={styles.cards}>
          <View style={[styles.card, { flex: 1, backgroundColor: colors.cardBg, borderColor: colors.border }]}>
            <Text style={[styles.cardLabel, { color: colors.textSecondary }]}>YOU OWE</Text>
            <Text
              style={[styles.cardValue, { color: colors.danger }]}
              adjustsFontSizeToFit numberOfLines={1} minimumFontScale={0.5}
            >
              {money(owed, defaultCurrency, 2)}
            </Text>
          </View>
          <View style={[styles.card, { flex: 1, backgroundColor: colors.cardBg, borderColor: colors.border }]}>
            <Text style={[styles.cardLabel, { color: colors.textSecondary }]}>OWED TO YOU</Text>
            <Text
              style={[styles.cardValue, { color: colors.success }]}
              adjustsFontSizeToFit numberOfLines={1} minimumFontScale={0.5}
            >
              {money(owedToYou, defaultCurrency, 2)}
            </Text>
          </View>
          <Pressable
            onPress={() => setShowBalances(true)}
            style={[styles.card, { flex: 1, backgroundColor: colors.cardBg, borderColor: colors.border }]}
          >
            <Text style={[styles.cardLabel, { color: colors.textSecondary }]}>BALANCES</Text>
            <Text style={[styles.balanceCardText, { color: colors.primary }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>View all</Text>
          </Pressable>
        </View>

        {/* Search + sort */}
        <View style={TAB_SEARCH_SORT_ROW}>
          <TabSearchBar
            value={query}
            onChangeText={setQuery}
            placeholder="Search people or description…"
            style={{ flex: 1 }}
            onClear={() => setQuery("")}
            accessibilityLabel="One-offs search"
          />
          <Pressable
            onPress={() => { Keyboard.dismiss(); setShowSort(true); }}
            style={[
              styles.sortBtn,
              isSortActive
                ? { backgroundColor: colors.primary, borderColor: colors.primary }
                : { backgroundColor: colors.surface, borderColor: colors.border },
            ]}
           accessibilityRole="button" accessibilityLabel="Filter">
            <Feather name="sliders" size={17} color={isSortActive ? "#fff" : colors.textSecondary} />
          </Pressable>
        </View>
      </TabHeader>

      {/* ── Feed ─────────────────────────────────────────────────────── */}
      <View style={{ flex: 1 }}>
      {floating.label && (
        <View pointerEvents="none" style={{ marginTop: -12, marginBottom: 6 }}>
<View style={styles.dateHeader}>
          <View style={[styles.dateHeaderRule, { backgroundColor: colors.border }]} />
          <View style={[styles.dateHeaderPill, { backgroundColor: colors.cardBg, borderColor: colors.border }]}>
            <Feather name="calendar" size={11} color={colors.primary} />
            <Text style={[styles.dateHeaderText, { color: colors.textSecondary }]}>{floating.label}</Text>
          </View>
          <View style={[styles.dateHeaderRule, { backgroundColor: colors.border }]} />
        </View>
        </View>
      )}
      <FlatList
        onScroll={floating.onScroll}
        scrollEventThrottle={floating.scrollEventThrottle}
        CellRendererComponent={floating.CellRendererComponent}
        ref={listRef}
        data={floating.listRows}
        renderItem={render}
        keyExtractor={x => x.id}
        style={styles.list}
        removeClippedSubviews={Platform.OS !== "web"}
        initialNumToRender={12}
        maxToRenderPerBatch={8}
        updateCellsBatchingPeriod={40}
        windowSize={7}
        contentContainerStyle={{ paddingBottom: listBottomPadding }}
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
          <EmptyState icon="target" title="No one-offs yet" subtitle="Tap + to add a payment with a friend" />
        }
      />
      </View>

      {/* ── FAB ──────────────────────────────────────────────────────── */}
      <Pressable
        onPress={openAdd}
        style={[styles.fab, { backgroundColor: colors.primary, bottom: fabBottom, shadowColor: colors.primary }]}
       accessibilityRole="button" accessibilityLabel="Add">
        <Feather name="plus" color="#fff" size={26} />
      </Pressable>

      {/* ── Root-level Modals (NEVER nested) ─────────────────────────── */}

      {/* 1. Payment form — tall sheet, swipe the handle/title down to collapse */}
      {/* Overlay + sheet are SIBLINGS, not parent/child: a Pressable ancestor
          around the sheet would claim the touch responder on press-down and
          starve the sheet's own PanResponder of the move events it needs to
          detect a downward swipe (drag would silently do nothing). */}
      <Modal visible={formOpen} transparent animationType="slide" onRequestClose={closeForm}>
        <View style={styles.overlayRoot}>
          <Pressable
            style={[StyleSheet.absoluteFill, { backgroundColor: "transparent" }]}
            onPress={() => { Keyboard.dismiss(); closeForm(); }}
          />
          <Animated.View
            style={[
              styles.sheet, styles.formSheetSize,
               { backgroundColor: colors.background, paddingBottom: Math.max(22, insets.bottom + 8) },
              formSwipe.style,
            ]}
          >
            <PaymentFormContent
              payment={editingPayment}
              friends={friends}
              currentUser={currentUser}
              defaultCurrency={defaultCurrency}
              onClose={closeForm}
              dragGesture={formSwipe.gesture}
            />
          </Animated.View>
        </View>
      </Modal>

      {/* 2. Balance sheet */}
      <Modal visible={showBalances} transparent animationType="slide" onRequestClose={() => setShowBalances(false)}>
        <View style={styles.overlayRoot}>
          <Pressable style={[StyleSheet.absoluteFill, { backgroundColor: "rgba(0,0,0,.45)" }]} onPress={() => setShowBalances(false)} />
          <Animated.View style={[styles.sheet, styles.balanceSheetSize, { backgroundColor: colors.surface, paddingBottom: Math.max(insets.bottom + 14, 24) }, balancesSwipe.style]}>
            <BalanceSheetContent
              balances={balances}
              currency={defaultCurrency}
              currentUser={currentUser}
              onSettleRequest={openSettleModal}
              onClose={() => setShowBalances(false)}
              dragGesture={balancesSwipe.gesture}
            />
          </Animated.View>
        </View>
      </Modal>

      {/* 3. Settle-up popup — centered card, slides up, keyboard-aware */}
      <Modal visible={!!settleTarget} transparent animationType="slide" onRequestClose={() => { Keyboard.dismiss(); setSettleTarget(null); }}>
        <Pressable style={styles.settleOverlay} onPress={() => { Keyboard.dismiss(); setSettleTarget(null); }}>
          <Pressable style={[styles.settleSheet, { backgroundColor: colors.surface }]} onPress={e => e.stopPropagation()}>
              <Text style={[styles.settleSheetTitle, { color: colors.text }]}>Record Payment</Text>
              {settleTarget && (() => {
                const fullAmt   = Math.abs(settleTarget.signedBalance);
                const parsed    = parseFloat(settleAmount);
                const validAmt  = !isNaN(parsed) && parsed > 0 ? Math.min(parsed, fullAmt) : 0;
                const remaining = Math.max(0, fullAmt - validAmt);
                const isFull    = validAmt >= fullAmt - 0.001;
                const isPartial = validAmt > 0 && !isFull;
                const iPaid     = settleTarget.signedBalance < 0;
                const from      = iPaid ? currentUser : settleTarget.member;
                const to        = iPaid ? settleTarget.member : currentUser;
                const setFrac   = (f: number) => { setSettleAmount((fullAmt * f).toFixed(2)); setSettleError(""); };
                return (
                  <>
                    {/* Who → Who */}
                    <View style={[styles.settlePartyRow, { backgroundColor: colors.inputBg, borderColor: colors.border }]}>
                      <Text style={[styles.settlePartyName, { color: colors.text }]} numberOfLines={1}>{from.name}</Text>
                      <View style={[styles.settleArrow, { backgroundColor: colors.primaryLight }]}>
                        <Feather name="arrow-right" size={13} color={colors.primary} />
                      </View>
                      <Text style={[styles.settlePartyName, { color: colors.text }]} numberOfLines={1}>{to.name}</Text>
                      <Text style={[styles.settleFullBalance, { color: colors.textTertiary }]}>
                        Balance: {money(fullAmt, defaultCurrency)}
                      </Text>
                    </View>

                    {/* Editable amount */}
                    <Text style={[styles.settleSheetLabel, { color: colors.textSecondary }]}>Amount paid</Text>
                    <View style={[styles.settleAmtRow, { backgroundColor: colors.inputBg, borderColor: settleError ? colors.danger : isFull ? "#0D9488" : isPartial ? "#EE7B30" : colors.border }]}>
                      <Text style={[styles.settleAmtSymbol, { color: colors.textTertiary }]}>{CURRENCY_SYMBOLS[defaultCurrency] ?? defaultCurrency}</Text>
                      <TextInput
                        style={[styles.settleAmtInput, { color: colors.text }]}
                        value={settleAmount}
                        onChangeText={t => { setSettleAmount(t); if (settleError) setSettleError(""); }}
                        keyboardType="decimal-pad"
                        autoFocus
                        selectTextOnFocus
                      />
                    </View>

                    {/* Fraction chips */}
                    <View style={styles.settleFractionRow}>
                      {([["¼", 0.25], ["½", 0.5], ["¾", 0.75]] as [string, number][]).map(([label, frac]) => {
                        const chipAmt = fullAmt * frac;
                        const active  = Math.abs(validAmt - chipAmt) < 0.01;
                        return (
                          <Pressable key={label} onPress={() => setFrac(frac)}
                            style={[styles.settleFracChip, { backgroundColor: active ? colors.primaryLight : colors.inputBg, borderColor: active ? colors.primary : colors.border }]}>
                            <Text style={[styles.settleFracChipText, { color: active ? colors.primary : colors.textSecondary }]}>{label}</Text>
                            <Text style={[styles.settleFracAmt, { color: active ? colors.primary : colors.textTertiary }]}>{money(chipAmt, defaultCurrency)}</Text>
                          </Pressable>
                        );
                      })}
                      <Pressable onPress={() => setFrac(1)}
                        style={[styles.settleFracChip, { backgroundColor: isFull ? colors.primaryLight : colors.inputBg, borderColor: isFull ? colors.primary : colors.border }]}>
                        <Text style={[styles.settleFracChipText, { color: isFull ? colors.primary : colors.textSecondary }]}>Full</Text>
                        <Text style={[styles.settleFracAmt, { color: isFull ? colors.primary : colors.textTertiary }]}>{money(fullAmt, defaultCurrency)}</Text>
                      </Pressable>
                    </View>

                    {/* Status */}
                    {settleError ? (
                      <Text style={[styles.settleErrorText, { color: colors.danger }]}>{settleError}</Text>
                    ) : (
                      <View style={styles.settleStatusRow}>
                        <Feather name={isFull ? "check-circle" : isPartial ? "clock" : "info"} size={13} color={isFull ? "#0D9488" : isPartial ? "#EE7B30" : colors.textTertiary} />
                        <Text style={[styles.settleRemainingText, { color: isFull ? "#0D9488" : isPartial ? "#EE7B30" : colors.textTertiary }]}>
                          {isFull ? "Settles the balance in full" : isPartial ? `${money(remaining, defaultCurrency)} will remain outstanding` : "Edit the amount for a partial payment"}
                        </Text>
                      </View>
                    )}

                    {/* Actions */}
                    <View style={styles.settleActions}>
                      <Pressable style={[styles.settleBtn, { backgroundColor: colors.background, borderColor: colors.border }]} onPress={() => { Keyboard.dismiss(); setSettleTarget(null); }}>
                        <Text style={[styles.settleBtnText, { color: colors.textSecondary }]}>Cancel</Text>
                      </Pressable>
                      <Pressable style={[styles.settleBtn, { backgroundColor: colors.primary }]} onPress={confirmSettle}>
                        {validAmt > 0 ? (
                          <View style={{ alignItems: "center" }}>
                            <Text style={[styles.settleBtnLabel, { color: "rgba(255,255,255,0.75)" }]}>Record</Text>
                            <Text style={[styles.settleBtnText, { color: "#fff" }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.65}>{money(validAmt, defaultCurrency)}</Text>
                          </View>
                        ) : (
                          <Text style={[styles.settleBtnText, { color: "#fff" }]}>Record Payment</Text>
                        )}
                      </Pressable>
                    </View>
                  </>
                );
              })()}
            </Pressable>
          </Pressable>
      </Modal>

      <SortBottomSheet
        visible={showSort}
        selectedKey={sort}
        options={SORT_OPTIONS}
        onSelect={key => setSort(key as SortKey)}
        onClose={() => setShowSort(false)}
      />
    </View>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

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

  // Cards
  cards: { flexDirection: "row", gap: 8 },
  card: {
    minHeight: 52, justifyContent: "center", alignItems: "center",
    paddingHorizontal: 6, borderRadius: 12, borderWidth: 1,
    borderColor: "rgba(255,255,255,.22)", backgroundColor: "rgba(255,255,255,.13)",
    shadowColor: "#000", shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.06, shadowRadius: 8, elevation: 2,
  },
  cardLabel: {
    fontFamily: "Inter_600SemiBold", fontSize: 9, letterSpacing: 0.55,
    color: "rgba(255,255,255,.68)", marginBottom: 3, textAlign: "center",
  },
  cardValue: {
    fontFamily: "Inter_700Bold", fontSize: 16,
    fontVariant: ["tabular-nums"], textAlign: "center",
  },
  balanceCardText: {
    color: "#fff", fontFamily: "Inter_600SemiBold",
    fontSize: 12, textAlign: "center", lineHeight: 16,
  },

  // Search + sort
  sortBtn: {
    width: 40, height: 44, borderRadius: 14, borderWidth: 1,
    alignItems: "center", justifyContent: "center",
  },

  // Feed
  list: { backgroundColor: "transparent" },
  dateHeader: {
    flexDirection: "row", alignItems: "center", gap: 8,
    paddingHorizontal: 16, paddingTop: 12, paddingBottom: 7,
  },
  dateHeaderRule: { flex: 1, height: StyleSheet.hairlineWidth },
  dateHeaderPill: {
    flexDirection: "row", alignItems: "center", gap: 5,
    paddingHorizontal: 10, paddingVertical: 5,
    borderRadius: 10, borderWidth: 1,
  },
  dateHeaderText: { fontFamily: "Inter_700Bold", fontSize: 10.5, letterSpacing: 0.5 },
  paymentRow: {
    flexDirection: "row", alignItems: "center", gap: 12,
    marginHorizontal: 16, marginVertical: 3,
    paddingHorizontal: 13, paddingVertical: 12,
    borderRadius: 18, borderWidth: 1, borderColor: "#E2E8F0",
  },
  dateCol: { width: 30, alignItems: "center" },
  dateMonth: { color: "#94A3B8", fontFamily: "Inter_600SemiBold", fontSize: 10, textTransform: "uppercase" },
  dateDay:   { color: "#334155", fontFamily: "Inter_700Bold", fontSize: 16, fontVariant: ["tabular-nums"] },
  arrowTile: { width: 40, height: 40, borderWidth: 1, borderRadius: 4, alignItems: "center", justifyContent: "center" },
  rowContent: { flex: 1, minWidth: 0 },
  reason:    { fontFamily: "Inter_500Medium", fontSize: 14, marginBottom: 2 },
  personMeta:{ fontFamily: "Inter_400Regular", fontSize: 12 },
  rowMoneyCol: { maxWidth: "34%", flexShrink: 0, alignItems: "flex-end" },
  rowMoney:  { fontFamily: "Inter_700Bold", fontSize: 13, textAlign: "right", fontVariant: ["tabular-nums"] },
  rowMoneyConverted: { fontFamily: "Inter_500Medium", fontSize: 10, color: "#94A3B8", marginTop: 2, textAlign: "right" },
  rowSep:    { position: "absolute", bottom: 0, left: 110, right: 0, height: StyleSheet.hairlineWidth, backgroundColor: "#E8EAEF" },

  // FAB
  fab: {
    position: "absolute", right: 20, width: 56, height: 56,
    borderRadius: 28, justifyContent: "center", alignItems: "center",
    shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.35, shadowRadius: 8, elevation: 6,
  },

  // Sheets shared
  // Overlay + sheet render as siblings inside this root; see the drag-swipe
  // comment above the Modals for why they can't nest a Pressable ancestor.
  overlayRoot: { flex: 1, justifyContent: "flex-end" },
  sheet: {
    maxHeight: "94%",
    borderTopLeftRadius: 22, borderTopRightRadius: 22,
    paddingHorizontal: 20, paddingTop: 12,
  },
  // Form sheet: tall so all fields are visible without scrolling on typical phones
  formSheetSize: { minHeight: "88%" },
  // Balance sheet: tall enough to see several rows at once
  balanceSheetSize: { minHeight: "60%", maxHeight: "82%" },
  settleFormSize: { maxHeight: "92%" },

  handle: { alignSelf: "center", width: 40, height: 4, borderRadius: 2, marginBottom: 17 },
  sheetTitleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 14 },
  sheetTitle: { fontFamily: "Inter_700Bold", fontSize: 20 },

  // Form
  section: { fontFamily: "Inter_600SemiBold", fontSize: 10, letterSpacing: 0.8, marginTop: 17, marginBottom: 8 },
  descRow: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  categoryIconBtn: {
    width: 64,
    height: 52,
    position: "relative",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 14,
    borderWidth: 1,
  },
  categoryChevron: { position: "absolute", right: 4, top: 20 },
  autoBadgeSmall: {
    position: "absolute",
    top: -2,
    right: -2,
    width: 12,
    height: 12,
    borderRadius: 6,
    alignItems: "center",
    justifyContent: "center",
  },
  personSelect: { height: 48, borderRadius: 12, borderWidth: 1, paddingHorizontal: 12, gap: 10, alignItems: "center", flexDirection: "row" },
  personText: { flex: 1, fontFamily: "Inter_500Medium", fontSize: 14 },
  friendDropdown: { borderWidth: 1, borderRadius: 12, overflow: "hidden", marginTop: 5 },
  emptyFriend: { padding: 16, fontFamily: "Inter_400Regular", fontSize: 13, textAlign: "center" },
  searchInputWrap: { height: 40, borderRadius: 10, borderWidth: 1, paddingHorizontal: 10, gap: 8, flexDirection: "row", alignItems: "center" },
  flexInput: { flex: 1, fontFamily: "Inter_400Regular", fontSize: 14 },
  friendRow: { minHeight: 49, flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 12, borderTopWidth: StyleSheet.hairlineWidth },
  checkCircle: { width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, alignItems: "center", justifyContent: "center" },
  doneSelectBtn: { margin: 8, height: 40, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  doneSelectText: { color: "#fff", fontFamily: "Inter_600SemiBold", fontSize: 14 },
  chip: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 9, paddingVertical: 5, borderRadius: 20, borderWidth: 1 },
  chipText: { fontFamily: "Inter_500Medium", fontSize: 12 },
  paidByRow: { gap: 8, paddingRight: 4 },
  paidByChip: { flexDirection: "row", alignItems: "center", gap: 7, minHeight: 42, paddingHorizontal: 10, borderRadius: 22, borderWidth: 1 },
  paidByLabel: { fontFamily: "Inter_600SemiBold", fontSize: 13 },
  direction: { flexDirection: "row", overflow: "hidden", borderRadius: 12, borderWidth: 1 },
  directionButton: { flex: 1, paddingVertical: 12, gap: 6, alignItems: "center", justifyContent: "center", flexDirection: "row" },
  directionText: { fontFamily: "Inter_600SemiBold", fontSize: 13 },
  field: { minHeight: 48, borderRadius: 12, borderWidth: 1, paddingHorizontal: 13, fontFamily: "Inter_400Regular", fontSize: 15 },
  commentField: { height: 76, paddingTop: 12, textAlignVertical: "top" },
  errorHint: { marginTop: 5, marginLeft: 4, fontFamily: "Inter_400Regular", fontSize: 12 },
  amountCard: {
    flexDirection: "column",
    alignItems: "stretch",
    justifyContent: "flex-start",
    paddingVertical: 0,
    position: "relative",
    borderRadius: 16,
    gap: 4,
    zIndex: 5,
  },
  amountRow: { width: "100%", flexDirection: "row", alignItems: "center", gap: 1 },
  amountCardBody: {
    width: "100%",
    minHeight: 52,
    flexDirection: "row",
    alignItems: "stretch",
    justifyContent: "space-between",
    gap: 8,
  },
  amountEntryBox: {
    flex: 1,
    minWidth: 0,
    height: 52,
    position: "relative",
    paddingHorizontal: 13,
    paddingVertical: 0,
    justifyContent: "center",
    borderRadius: 12,
  },
  amountEntryColumn: {
    minWidth: 0,
    width: "100%",
    alignItems: "flex-start",
    gap: 5,
  },
  amountInput: {
    flex: 1,
    minWidth: 0,
    fontSize: 22,
    fontFamily: "Inter_700Bold",
    paddingHorizontal: 0,
    textAlign: "left",
  },
  currencyBox: {
    width: 64,
    height: 52,
    flexShrink: 0,
    position: "relative",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 3,
    borderRadius: 14,
    borderWidth: 1,
  },
  currencyChevron: {
    position: "absolute",
    right: 4,
  },
  currencyIconText: { fontSize: 20, fontFamily: "Inter_600SemiBold" },
  categoryButton: { height: 52, borderRadius: 12, borderWidth: 1, paddingHorizontal: 12, flexDirection: "row", alignItems: "center", gap: 10 },
  categoryButtonText: { fontFamily: "Inter_600SemiBold", fontSize: 14 },
  autoBadge: { flexDirection: "row", alignItems: "center", gap: 3, paddingHorizontal: 6, paddingVertical: 3, borderRadius: 6 },
  autoBadgeText: { fontFamily: "Inter_600SemiBold", fontSize: 10 },
  catModalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "flex-end" },
  catModalSheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 12,
    paddingBottom: 32,
    paddingHorizontal: 20,
  },
  catModalHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#ccc",
    alignSelf: "center",
    marginBottom: 16,
  },
  catModalTitle: { fontSize: 18, fontFamily: "Inter_700Bold", marginBottom: 16 },
  catModalGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  catModalChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 14,
    borderWidth: 1,
  },
  catLabel: { fontSize: 13, fontFamily: "Inter_500Medium" },
  addCatWrap: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1,
    gap: 8,
  },
  addCatInput: { fontSize: 13, fontFamily: "Inter_400Regular", minWidth: 90 },
  historyCard: { borderRadius: 12, borderWidth: 1, padding: 10, gap: 4 },
  historyTitle: { fontFamily: "Inter_600SemiBold", fontSize: 13 },
  historyTime: { fontFamily: "Inter_500Medium", fontSize: 11, marginTop: 1 },
  historyChange: { fontFamily: "Inter_500Medium", fontSize: 12, marginTop: 2 },
  categoryGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  categoryChip: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, paddingVertical: 9, borderRadius: 10, borderWidth: 1 },
  categoryChipText: { fontFamily: "Inter_600SemiBold", fontSize: 13 },
  save: { height: 51, borderRadius: 14, marginTop: 22, marginBottom: 6, justifyContent: "center", alignItems: "center" },
  saveText: { color: "#fff", fontFamily: "Inter_600SemiBold", fontSize: 16 },

  // Split (equal / exact / percentage)
  splitTypeRow: { flexDirection: "row", overflow: "hidden", borderRadius: 12, borderWidth: 1 },
  splitTypeBtn: { flex: 1, paddingVertical: 10, alignItems: "center", justifyContent: "center", gap: 2 },
  splitTypeLabel: { fontFamily: "Inter_600SemiBold", fontSize: 13 },
  splitTypeDesc: { fontFamily: "Inter_400Regular", fontSize: 10 },
  splitDetails: { gap: 8, marginTop: 10 },
  splitRow: { flexDirection: "row", alignItems: "center", gap: 10, padding: 10, borderRadius: 12 },
  splitMemberMain: { flex: 1, minWidth: 0, flexDirection: "row", alignItems: "center", gap: 10 },
  splitName: { flex: 1, fontFamily: "Inter_500Medium", fontSize: 13 },
  splitAmountText: { fontFamily: "Inter_600SemiBold", fontSize: 13 },
  stepperWrap: { flexDirection: "row", alignItems: "center", gap: 6 },
  stepperBtn: { width: 26, height: 26, borderRadius: 8, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  splitInput: { width: 96, height: 30, borderRadius: 8, borderWidth: 1, paddingHorizontal: 8, fontFamily: "Inter_600SemiBold", fontSize: 13, textAlign: "center" },
  pctInputWrap: { flexDirection: "row", alignItems: "center", borderRadius: 8, borderWidth: 1, paddingRight: 8 },
  pctInput: { borderWidth: 0, width: 60 },
  pctLabel: { fontFamily: "Inter_500Medium", fontSize: 12 },
  validationRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 10, padding: 10, borderRadius: 10, borderWidth: 1 },
  validationText: { flex: 1, fontFamily: "Inter_500Medium", fontSize: 12 },

  // Currency picker
  pickerPage: { flex: 1 },
  pickerHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: 20, paddingTop: 22, borderBottomWidth: StyleSheet.hairlineWidth },
  pickerTitle: { fontFamily: "Inter_700Bold", fontSize: 19 },
  currencyRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12, paddingHorizontal: 20, borderBottomWidth: StyleSheet.hairlineWidth },
  flag: { width: 30, fontSize: 21, textAlign: "center" },
  currencyCode: { fontFamily: "Inter_600SemiBold", fontSize: 15 },
  currencyName: { fontFamily: "Inter_400Regular", fontSize: 12 },

  // Balance sheet
  balanceSub: { fontFamily: "Inter_400Regular", fontSize: 13, marginBottom: 12 },
  balListCard: {
    borderRadius: 16, overflow: "hidden", marginBottom: 8,
    shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 2,
  },
  balRow: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: 16, paddingVertical: 13, gap: 12, position: "relative",
  },
  balRowBody: { flex: 1, minWidth: 0, gap: 2 },
  balRowMeta: { fontFamily: "Inter_400Regular", fontSize: 12 },
  balRowAmount: { fontFamily: "Inter_700Bold", fontSize: 15, fontVariant: ["tabular-nums"] },
  balRowSep: { position: "absolute", bottom: 0, left: 68, right: 0, height: StyleSheet.hairlineWidth },
  settleButton: { flexDirection: "row", alignItems: "center", gap: 4, paddingVertical: 5, paddingHorizontal: 10, borderRadius: 20, borderWidth: 1 },
  settleButtonText: { fontFamily: "Inter_600SemiBold", fontSize: 12 },

  // Settle-up modal
  settleOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.55)", alignItems: "center", justifyContent: "flex-end", paddingHorizontal: 24, paddingBottom: 340 },
  settleSheet: { width: "100%", borderRadius: 16, padding: 24, gap: 12, maxHeight: "88%" },
  settleSheetTitle: { fontSize: 18, fontFamily: "Inter_700Bold" },
  settleSheetLabel: { fontSize: 12, fontFamily: "Inter_600SemiBold", textTransform: "uppercase", letterSpacing: 0.6 },
  settlePartyRow: { flexDirection: "row", alignItems: "center", gap: 8, borderRadius: 12, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 10 },
  settlePartyName: { fontSize: 13, fontFamily: "Inter_600SemiBold", flexShrink: 1 },
  settleArrow: { width: 24, height: 24, borderRadius: 12, alignItems: "center", justifyContent: "center", flexShrink: 0 },
  settleFullBalance: { fontSize: 12, fontFamily: "Inter_400Regular", marginLeft: "auto", flexShrink: 0 },
  settleAmtRow: { flexDirection: "row", alignItems: "center", gap: 8, borderRadius: 12, borderWidth: 1, paddingHorizontal: 14, height: 52 },
  settleAmtSymbol: { fontSize: 15, fontFamily: "Inter_500Medium" },
  settleAmtInput: { flex: 1, fontSize: 24, fontFamily: "Inter_700Bold" },
  settleFractionRow: { flexDirection: "row", gap: 8 },
  settleFracChip: { flex: 1, alignItems: "center", paddingVertical: 8, borderRadius: 10, borderWidth: 1 },
  settleFracChipText: { fontSize: 14, fontFamily: "Inter_700Bold" },
  settleFracAmt: { fontSize: 10, fontFamily: "Inter_400Regular", marginTop: 2 },
  settleStatusRow: { flexDirection: "row", alignItems: "center", gap: 5 },
  settleRemainingText: { fontSize: 12, fontFamily: "Inter_400Regular" },
  settleErrorText: { fontSize: 12, fontFamily: "Inter_500Medium" },
  settleActions: { flexDirection: "row", gap: 10, marginTop: 4 },
  settleBtn: { flex: 1, paddingVertical: 14, borderRadius: 12, alignItems: "center", justifyContent: "center", borderWidth: 1 },
  settleBtnLabel: { fontSize: 10, fontFamily: "Inter_500Medium", letterSpacing: 0.3 },
  settleBtnText: { fontSize: 15, fontFamily: "Inter_600SemiBold" },

});

// Styles copied from Groups > Add expense so One-offs looks the same.
const G = StyleSheet.create({
  sectionLabel: { fontSize: 12, fontFamily: "Inter_600SemiBold", textTransform: "uppercase", letterSpacing: 0.8, marginTop: 14, marginBottom: 8 },
  paidByRow: { gap: 8, paddingVertical: 4 },
  paidByChip: { flexDirection: "row", alignItems: "center", paddingHorizontal: 12, paddingVertical: 8, borderRadius: 14, borderWidth: 1, gap: 8 },
  paidByLabel: { fontSize: 13, fontFamily: "Inter_500Medium" },
  addPeopleBtn: { flexDirection: "row", alignItems: "center", gap: 10, height: 52, borderRadius: 14, borderWidth: 1, paddingHorizontal: 14, marginBottom: 12 },
  addPeopleText: { flex: 1, fontSize: 15, fontFamily: "Inter_500Medium" },
  splitTypeRow: { flexDirection: "row", borderRadius: 16, borderWidth: 1, overflow: "hidden", marginBottom: 12 },
  splitTypeBtn: { flex: 1, alignItems: "center", paddingVertical: 12, paddingHorizontal: 8 },
  splitTypeLabel: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  splitTypeDesc: { fontSize: 10, fontFamily: "Inter_400Regular", marginTop: 2 },
  splitDetails: { gap: 10 },
  splitRow: { flexDirection: "row", alignItems: "center", padding: 12, borderRadius: 14, gap: 12 },
  participantMain: { flex: 1, minWidth: 0, flexDirection: "row", alignItems: "center", gap: 12 },
  splitName: { flex: 1, minWidth: 0, fontSize: 14, fontFamily: "Inter_500Medium" },
  splitAmount: { fontSize: 14, fontFamily: "Inter_400Regular" },
  equalAmountBox: { minWidth: 86, maxWidth: 150, height: 36, paddingHorizontal: 8, borderWidth: 1, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  stepperWrap: { flexShrink: 0, flexDirection: "row", alignItems: "center", gap: 6 },
  stepperBtn: { width: 34, height: 34, borderRadius: 10, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  exactAmountInputWrap: { flexDirection: "row", alignItems: "center", gap: 4 },
  splitCurrencySymbol: { fontSize: 14, fontFamily: "Inter_400Regular" },
  splitInput: { width: 64, height: 36, borderWidth: 1, borderRadius: 8, paddingHorizontal: 8, fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center" },
  pctInputWrap: { flexDirection: "row", alignItems: "center", gap: 3 },
  pctLabel: { fontSize: 14, fontFamily: "Inter_500Medium" },
  participantCheckbox: { width: 20, height: 20, borderRadius: 6, borderWidth: 1.5, alignItems: "center", justifyContent: "center" },
  validationRow: { flexDirection: "row", alignItems: "center", gap: 8, padding: 12, borderRadius: 12, borderWidth: 1, marginTop: 12 },
  validationText: { flex: 1, fontSize: 13, fontFamily: "Inter_500Medium" },
});
