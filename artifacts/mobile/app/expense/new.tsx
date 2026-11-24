import { splitEquallyFor, splitBySharesFor, splitByPercentagesFor } from "@/utils/splitMath";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router, useLocalSearchParams } from "expo-router";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { GestureDetector } from "react-native-gesture-handler";
import Animated from "react-native-reanimated";
import { Avatar } from "@/components/Avatar";
import { BUILTIN_CATEGORY_CONFIG, CategoryIcon } from "@/components/CategoryIcon";
import { ReceiptSvgIcon } from "@/components/ReceiptSvgIcon";
import { KeyboardAwareScrollViewCompat } from "@/components/KeyboardAwareScrollViewCompat";
import {
  Currency,
  CURRENCY_SYMBOLS,
  SplitType,
  useApp,
} from "@/context/AppContext";
import { CurrencyPickerModal } from "@/components/CurrencyPickerModal";
import { DatePickerField } from "@/components/DatePickerField";
import { showActionSheet, showAlert } from "@/hooks/alertStore";
import { useSwipeDismiss } from "@/hooks/useSwipeDismiss";
import { useTheme } from "@/hooks/useTheme";
import { dateOnlyFromDateTime, formatScheduleDate, normalizeDateOnly, toDateOnly } from "@/utils/format";
import { evenPercentages, inferShares, percentagesAddUp, splitByPercentages, splitByShares, splitEqually, sumMoney, toCents } from "@/utils/splitMath";

import { suggestCategory } from "@/services/ai";
import {
  addRecurringInterval,
  dateOnlyInTimeZone,
  dateOnlyToInstant,
  getDeviceTimeZone,
} from "@/utils/recurring";

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

const SPLIT_TYPES: { value: SplitType; label: string; desc: string }[] = [
  { value: "equal", label: "Equal", desc: "Split evenly" },
  { value: "exact", label: "Exact", desc: "Set amounts" },
  { value: "percentage", label: "%", desc: "By percentage" },
  { value: "shares", label: "Shares", desc: "By shares" },
];

function parseNumericInput(value: string): number {
  return parseFloat(value.replace(/,/g, "")) || 0;
}

function formatNumberInput(value: string): string {
  const sanitized = value.replace(/,/g, "").replace(/[^\d.]/g, "");
  if (!sanitized) return "";

  const firstDecimal = sanitized.indexOf(".");
  const hasDecimal = firstDecimal >= 0;
  const wholePart = (hasDecimal ? sanitized.slice(0, firstDecimal) : sanitized)
    .replace(/^0+(?=\d)/, "") || "0";
  const decimalPart = hasDecimal
    ? `.${sanitized.slice(firstDecimal + 1).replace(/\./g, "").slice(0, 2)}`
    : "";

  return `${Number(wholePart).toLocaleString("en-US")}${decimalPart}`;
}

function formatNumberDisplay(value: number): string {
  return value.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatTwoDecimalInput(value: string): string {
  if (!value.trim()) return "";
  return formatNumberInput(parseNumericInput(value).toFixed(2));
}

function getSplitInputFontSize(value: string, inputWidth = 64): number {
  const characterCount = Math.max(1, value.length);
  return Math.max(9, Math.min(14, Math.floor((inputWidth - 16) / (characterCount * 0.58))));
}

export default function NewExpenseScreen() {
  const { groupId, expenseId, recurringId, mode } = useLocalSearchParams<{
    groupId: string;
    expenseId?: string;
    recurringId?: string;
    mode?: "normal" | "recurring";
  }>();
  const { colors } = useTheme();
  const { width: viewportWidth } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const {
    getGroupById,
    getMemberById,
    currentUser,
    addExpense,
    updateExpense,
    addRecurringExpense,
    updateRecurringExpense,
    expenses,
    recurringExpenses,
    customCategories,
    addCustomCategory,
  } = useApp();

  const existingExpense = expenseId ? expenses.find(e => e.id === expenseId) : undefined;
  const existingRecurring = recurringId ? recurringExpenses.find(r => r.id === recurringId) : undefined;
  const isRecurringEditing = !!existingRecurring;
  const isEditing = !!existingExpense || isRecurringEditing;
  const isRecurringOnly = !isEditing && mode === "recurring";
  const isNormalOnly = !isEditing && mode === "normal";
  const resolvedGroupId = existingExpense?.groupId ?? existingRecurring?.groupId ?? groupId ?? "";
  const group = getGroupById(resolvedGroupId);
  const initialPaymentDate = normalizeDateOnly(existingExpense?.paymentDate)
    || (existingExpense
      ? dateOnlyFromDateTime(existingExpense.createdAt)
      : existingRecurring
        ? dateOnlyInTimeZone(new Date(existingRecurring.nextDueAt), existingRecurring.timeZone)
        : toDateOnly());

  const [description, setDescription] = useState(existingExpense?.description ?? existingRecurring?.description ?? "");
  const [amountStr, setAmountStr] = useState(
    existingExpense
      ? formatNumberInput(String(existingExpense.amount))
      : existingRecurring
        ? formatNumberInput(String(existingRecurring.amount))
        : ""
  );
  const [paidById, setPaidById] = useState(existingExpense?.paidById ?? existingRecurring?.paidById ?? currentUser.id);
  const [category, setCategory] = useState<string>(existingExpense?.category ?? existingRecurring?.category ?? "other");
  const [autoCategory, setAutoCategory] = useState<string | null>(null);
  const [splitType, setSplitType] = useState<SplitType>(
    existingExpense?.splitType ?? existingRecurring?.splitType ?? "equal"
  );
  const [exactAmounts, setExactAmounts] = useState<Record<string, string>>(
    existingExpense?.splitType === "exact"
      ? Object.fromEntries((existingExpense.splits ?? []).map(s => [s.memberId, formatTwoDecimalInput(String(s.amount))]))
      : existingRecurring?.splitType === "exact"
        ? Object.fromEntries((existingRecurring.splits ?? []).map(s => [s.memberId, formatTwoDecimalInput(String(s.amount))]))
        : {}
  );
  const [percentages, setPercentages] = useState<Record<string, string>>(
    existingExpense?.splitType === "percentage"
      ? Object.fromEntries((existingExpense.splits ?? []).map(s => [s.memberId, formatNumberInput(String(s.percentage ?? 0))]))
      : existingRecurring?.splitType === "percentage"
        ? Object.fromEntries((existingRecurring.splits ?? []).map(s => [s.memberId, formatNumberInput(String(s.percentage ?? 0))]))
        : {}
  );
  const [shares, setShares] = useState<Record<string, string>>(() => {
    const source = existingExpense?.splitType === "shares"
      ? existingExpense.splits ?? []
      : existingRecurring?.splitType === "shares"
        ? existingRecurring.splits ?? []
        : [];
    if (source.length === 0) return {};
    const inferred = inferShares(source.map(s => s.amount));
    return Object.fromEntries(source.map((s, i) => [s.memberId, String(inferred[i])]));
  });
  const [showAddCat, setShowAddCat] = useState(false);
  const [descError, setDescError] = useState(false);
  const [amountError, setAmountError] = useState(false);
  const [intervalError, setIntervalError] = useState(false);
  const [isRecurring, setIsRecurring] = useState(isRecurringOnly || isRecurringEditing);
  const [intervalMonths, setIntervalMonths] = useState(
    existingRecurring?.intervalMonths != null
      ? String(existingRecurring.intervalMonths)
      : existingRecurring?.frequency === "monthly"
        ? "1"
        : existingRecurring?.frequency === "quarterly"
          ? "3"
          : "",
  );
  const [intervalWeeks, setIntervalWeeks] = useState(
    existingRecurring?.intervalWeeks != null
      ? String(existingRecurring.intervalWeeks)
      : existingRecurring?.frequency === "weekly"
        ? "1"
        : existingRecurring?.frequency === "biweekly"
          ? "2"
          : "",
  );
  const [intervalDays, setIntervalDays] = useState(
    existingRecurring?.intervalDays != null
      ? String(existingRecurring.intervalDays)
      : existingRecurring?.frequency === "custom"
        ? String(existingRecurring.customDays ?? 30)
        : "",
  );
  const [newCatName, setNewCatName] = useState("");
  const [expenseCurrency, setExpenseCurrency] = useState<Currency>(
    existingExpense?.currency ?? existingRecurring?.currency ?? group?.currency ?? "USD"
  );
  const [showExpCurrencyPicker, setShowExpCurrencyPicker] = useState(false);
  const [showCategoryPicker, setShowCategoryPicker] = useState(false);
  const [includedMemberIds, setIncludedMemberIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [paymentDate, setPaymentDate] = useState(initialPaymentDate);
  const categorySwipe = useSwipeDismiss(() => setShowCategoryPicker(false));
  useEffect(() => { if (showCategoryPicker) categorySwipe.reset(); }, [showCategoryPicker]);
  const recurringInterval = useMemo(
    () => ({
      months: parseInt(intervalMonths, 10) || 0,
      weeks: parseInt(intervalWeeks, 10) || 0,
      days: parseInt(intervalDays, 10) || 0,
    }),
    [intervalMonths, intervalWeeks, intervalDays],
  );

  const topPad = insets.top;
  const amount = parseNumericInput(amountStr);
  const amountFontSize =
    amount > 50_000_000_000
      ? Math.max(
          16,
          28 - Math.ceil(Math.log10(amount / 50_000_000_000)) * 2
        )
      : 28;
  const amountTextMaxWidth = Math.max(120, viewportWidth - 120);
  const fittedAmountFontSize = Math.floor(
    (amountTextMaxWidth - 24) / (Math.max(4, amountStr.length) * 0.62)
  );
  const displayAmountFontSize = Math.max(
    16,
    Math.min(amountFontSize, fittedAmountFontSize)
  );

  function handleDismiss() {
    const dirty = isEditing
      ? (
          description.trim() !== (existingExpense?.description ?? "")
          || amount !== (existingExpense?.amount ?? 0)
          || paymentDate !== initialPaymentDate
        )
      : (description.trim().length > 0 || amountStr.trim().length > 0);
    if (dirty) {
      showAlert(
        "Discard this expense?",
        isEditing
          ? "Your changes to this expense haven't been saved."
          : "You've started adding an expense but haven't saved it.",
        [
          { text: "Keep editing", style: "cancel" },
          { text: "Discard", style: "destructive", onPress: () => router.back() },
        ]
      );
      return;
    }
    router.back();
  }

  const nextRecurringDate = useMemo(
    () =>
      isRecurring
        ? addRecurringInterval(
            paymentDate,
            "custom",
            undefined,
            recurringInterval,
          )
        : "",
    [isRecurring, paymentDate, recurringInterval],
  );
  const currencySymbol = CURRENCY_SYMBOLS[expenseCurrency] ?? expenseCurrency + " ";

  const suggestTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (suggestTimer.current) clearTimeout(suggestTimer.current);
    suggestTimer.current = setTimeout(() => {
      if (description.trim().length >= 3) {
        const result = suggestCategory(description);
        if (result.confidence === "high") {
          setCategory(result.category);
          setAutoCategory(result.category);
        } else {
          setCategory("other");
          setAutoCategory(null);
        }
      } else {
        setCategory("other");
        setAutoCategory(null);
      }
    }, 250);
    return () => { if (suggestTimer.current) clearTimeout(suggestTimer.current); };
  }, [description]);

  const members = useMemo(
    () => {
      const groupMembers = (group?.memberIds ?? [])
        .map(id => getMemberById(id))
        .filter(Boolean) as NonNullable<ReturnType<typeof getMemberById>>[];
      return [...groupMembers].sort(
        (a, b) => Number(b.id === currentUser.id) - Number(a.id === currentUser.id),
      );
    },
    [group, getMemberById, currentUser.id],
  );

  // Keep payer selection independent from the people sharing the expense.
  // For edits, preserve the expense's existing participants instead of
  // silently re-including everyone in the group.
  useEffect(() => {
    if (group) {
      const existingMemberIds = (existingExpense?.splits ?? [])
        .map(split => split.memberId)
        .filter(memberId => group.memberIds.includes(memberId));
      setIncludedMemberIds(existingMemberIds?.length ? existingMemberIds : group.memberIds.slice());
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [group?.id]);

  const includedMembers = useMemo(
    () => members.filter(m => includedMemberIds.includes(m.id)),
    [members, includedMemberIds]
  );

  // Shares are allocated in whole cents with the largest-remainder method so
  // they always add up to the total (100 / 3 -> 33.34 + 33.33 + 33.33).
  const splits = useMemo(() => {
    if (!group) return [];
    const paidFor = (memberId: string) => (memberId === paidById ? amount : undefined);
    if (splitType === "equal") {
      const parts = splitEquallyFor(amount, includedMembers.length, expenseCurrency);
      return includedMembers.map((m, i) => ({ memberId: m.id, amount: parts[i] ?? 0, paid: paidFor(m.id) }));
    }
    if (splitType === "exact") {
      return includedMembers.map(m => ({
        memberId: m.id,
        amount: parseNumericInput(exactAmounts[m.id] ?? "0"),
        paid: paidFor(m.id),
      }));
    }
    if (splitType === "shares") {
      const weights = includedMembers.map(m => parseNumericInput(shares[m.id] ?? "0"));
      const parts = splitBySharesFor(amount, weights, expenseCurrency);
      return includedMembers.map((m, i) => ({ memberId: m.id, amount: parts[i] ?? 0, paid: paidFor(m.id) }));
    }
    const pcts = includedMembers.map(m => parseNumericInput(percentages[m.id] ?? "0"));
    // Only normalise once the percentages are valid, so an unfinished entry
    // (e.g. 50% + 30%) still shows honest amounts while the user types.
    const parts = percentagesAddUp(pcts)
      ? splitByPercentagesFor(amount, pcts, expenseCurrency)
      : pcts.map(p => Math.round(p * amount) / 100);
    return includedMembers.map((m, i) => ({
      memberId: m.id,
      amount: parts[i] ?? 0,
      percentage: pcts[i],
      paid: paidFor(m.id),
    }));
  }, [group, splitType, amount, includedMembers, paidById, exactAmounts, percentages, shares]);

  // Seed even percentages that add to exactly 100 the first time "%" is picked.
  useEffect(() => {
    return; // Exact / % / Shares start blank: the user enters the real split.
    // eslint-disable-next-line no-unreachable
    if (splitType !== "percentage" || includedMembers.length === 0) return;
    const blank = includedMembers.every(m => !(percentages[m.id] ?? "").trim());
    if (!blank) return;
    const even = evenPercentages(includedMembers.length);
    setPercentages(Object.fromEntries(includedMembers.map((m, i) => [m.id, String(even[i])])));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [splitType, includedMembers.length]);

  // When people are added or removed, re-spread % and exact amounts evenly over
  // whoever is now involved, so the split never keeps stale values from people
  // who were taken out (e.g. 25% + 25% left over after removing two of four).
  const includedKey = includedMemberIds.slice().sort().join(",");
  const lastIncludedKey = useRef<string | null>(null);
  useEffect(() => {
    if (includedMemberIds.length === 0) return;
    if (lastIncludedKey.current === null) { lastIncludedKey.current = includedKey; return; }
    if (lastIncludedKey.current === includedKey) return;
    lastIncludedKey.current = includedKey;
    const n = includedMembers.length;
    if (n === 0) return;
    // Keep what was typed for people still included; new people start blank.
    setPercentages(prev => Object.fromEntries(includedMembers.map(m => [m.id, prev[m.id] ?? ""])));
    setExactAmounts(prev => Object.fromEntries(includedMembers.map(m => [m.id, prev[m.id] ?? ""])));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [includedKey]);

  const splitTotal = useMemo(() => sumMoney(splits.map(sp => sp.amount)), [splits]);

  const splitValid = useMemo(() => {
    if (amount <= 0) return null;
    if (splitType === "equal") return true;
    if (splitType === "exact") return toCents(splitTotal) === toCents(amount);
    if (splitType === "shares") {
      return includedMembers.some(m => parseNumericInput(shares[m.id] ?? "0") > 0);
    }
    if (splitType === "percentage") {
      return percentagesAddUp(includedMembers.map(m => parseNumericInput(percentages[m.id] ?? "0")));
    }
    return false;
  }, [amount, splitType, splitTotal, includedMembers, percentages, shares]);

  function adjustShares(memberId: string, delta: number) {
    Haptics.selectionAsync();
    setShares(prev => {
      const current = parseNumericInput(prev[memberId] ?? "0");
      const next = Math.max(0, Math.round((current + delta) * 100) / 100);
      return { ...prev, [memberId]: String(next) };
    });
  }

  const totalShareUnits = includedMembers.reduce((sum, m) => sum + parseNumericInput(shares[m.id] ?? "0"), 0);

  function adjustExact(memberId: string, delta: number) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setExactAmounts(prev => {
      const current = parseNumericInput(prev[memberId] ?? "0");
      const next = Math.max(0, Math.round((current + delta) * 100) / 100);
      return { ...prev, [memberId]: formatNumberInput(next.toFixed(2)) };
    });
  }

  function adjustPercentage(memberId: string, delta: number) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setPercentages(prev => {
      const current = parseFloat(prev[memberId] ?? "0") || 0;
      const next = Math.max(0, Math.min(100, Math.round((current + delta) * 10) / 10));
      return { ...prev, [memberId]: formatNumberInput(next.toFixed(2)) };
    });
  }

  function handleAddCustomCategory() {
    const name = newCatName.trim();
    if (!name) return;
    addCustomCategory(name);
    setCategory(name.toLowerCase());
    setAutoCategory(null);
    setNewCatName("");
    setShowAddCat(false);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }

  function handleSave() {
    if (saving) return;
    let hasError = false;
    if (!description.trim()) { setDescError(true); hasError = true; }
    if (amount <= 0) { setAmountError(true); hasError = true; }
    if (hasError) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return;
    }
    if (!group) return;
    if (includedMembers.length === 0) {
      showAlert(
        "Who's involved?",
        "Select at least one person who should share this expense. The person who paid can be excluded.",
      );
      return;
    }
    if (splitValid === false) {
      const msg = splitType === "shares"
        ? "Give at least one person a share above zero."
        : splitType === "exact"
        ? (() => {
            const remaining = Math.round((amount - splitTotal) * 100) / 100;
            return remaining > 0
              ? `${currencySymbol}${formatNumberDisplay(remaining)} remaining to assign.`
              : `${currencySymbol}${formatNumberDisplay(Math.abs(remaining))} over the total.`;
          })()
        : (() => {
            const totalPct = includedMembers.reduce(
              (sum, member) => sum + parseNumericInput(percentages[member.id] ?? "0"),
              0,
            );
            const remaining = Math.round((100 - totalPct) * 100) / 100;
            return remaining > 0
              ? `${remaining.toFixed(2)}% remaining to assign.`
              : `${Math.abs(remaining).toFixed(2)}% over the total.`;
          })();
      showAlert("Split doesn't balance", msg);
      return;
    }
    if (
      isRecurring &&
      recurringInterval.months === 0 &&
      recurringInterval.weeks === 0 &&
      recurringInterval.days === 0
    ) {
      setIntervalError(true);
      showAlert("Choose a frequency", "Enter a value for months, weeks, or days.");
      return;
    }
    setIntervalError(false);
    setSaving(true);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    if (isRecurringEditing && existingRecurring) {
      const timeZone = existingRecurring.timeZone ?? getDeviceTimeZone();
      updateRecurringExpense(existingRecurring.id, {
        description: description.trim(),
        amount,
        currency: expenseCurrency,
        paidById,
        splitType,
        splits,
        category,
        frequency: "custom",
        intervalMonths: recurringInterval.months,
        intervalWeeks: recurringInterval.weeks,
        intervalDays: recurringInterval.days,
        nextDueAt: dateOnlyToInstant(paymentDate, timeZone),
        timeZone,
      });
    } else if (isEditing && existingExpense) {
      updateExpense(existingExpense.id, {
        description: description.trim(),
        amount,
        currency: expenseCurrency,
        paidById,
        splitType,
        splits,
        category,
        paymentDate: paymentDate || null,
      });
    } else {
      addExpense({
        groupId: group.id,
        description: description.trim(),
        amount,
        currency: expenseCurrency,
        paidById,
        splitType,
        splits,
        category,
        paymentDate: paymentDate || toDateOnly(new Date()),
      });
      if (isRecurring) {
        const timeZone = getDeviceTimeZone();
        const firstDueDate = addRecurringInterval(
          paymentDate,
          "custom",
          undefined,
          recurringInterval,
        );
        addRecurringExpense({
          groupId: group.id,
          description: description.trim(),
          amount,
          currency: expenseCurrency,
          paidById,
          splitType,
          splits,
          category,
          frequency: "custom",
          ...(recurringInterval.months > 0 ? { intervalMonths: recurringInterval.months } : {}),
          ...(recurringInterval.weeks > 0 ? { intervalWeeks: recurringInterval.weeks } : {}),
          ...(recurringInterval.days > 0 ? { intervalDays: recurringInterval.days } : {}),
          timeZone,
          occurrenceCount: 0,
          nextDueAt: dateOnlyToInstant(firstDueDate, timeZone),
          isActive: true,
        });
      }
    }
    router.back();
  }

  if (!group) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <Text style={{ color: colors.text }}>Group not found</Text>
      </View>
    );
  }

  const allCategories = [
    ...BUILTIN_CATEGORIES,
    ...customCategories.map(c => ({
      value: c,
      label: c.charAt(0).toUpperCase() + c.slice(1),
      icon: "tag" as const,
    })),
  ];

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topPad + 8, backgroundColor: colors.headerBg }]}>
        <Pressable onPress={handleDismiss} hitSlop={8} accessibilityRole="button" accessibilityLabel="Close">
          <Feather name="x" size={24} color={colors.text} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.text }]}>
          {isRecurringEditing
            ? "Edit Recurring Expense"
            : isEditing
              ? "Edit Expense"
              : isRecurringOnly
                ? "Add Recurring Expense"
                : "Add Expense"}
        </Text>
        <View style={styles.headerRight}>
          {!isRecurring && (
            <DatePickerField
              label="Paid on"
              maxDate={toDateOnly()}
              value={paymentDate}
              onChange={setPaymentDate}
              colors={colors}
              allowClear={false}
              compact
              iconOnly
            />
          )}
          <Pressable
            style={[styles.saveBtn, { backgroundColor: colors.primary, opacity: saving ? 0.6 : 1 }]}
            onPress={handleSave}
            disabled={saving}
          >
            <Text style={styles.saveBtnText}>Save</Text>
          </Pressable>
        </View>
      </View>

      <KeyboardAwareScrollViewCompat
        contentContainerStyle={[styles.content, { paddingBottom: Platform.OS === "web" ? 134 : 40 }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
        <View>
          <View style={[
            styles.amountCard,
          ]}>
            <View style={styles.amountCardBody}>
              <Pressable
                onPress={() => setShowExpCurrencyPicker(true)}
                style={[
                  styles.currencyBox,
                  { backgroundColor: colors.surface, borderColor: colors.border },
                ]}
                accessibilityRole="button"
                accessibilityLabel="Choose currency"
              >
                <Text style={[styles.currencyIconText, { color: colors.text }]}>
                  {currencySymbol.trim() || expenseCurrency}
                </Text>
                <Feather name="chevron-down" size={11} color={colors.textSecondary} style={styles.currencyChevron} />
              </Pressable>
              <View
                style={[
                  styles.amountEntryBox,
                  {
                    backgroundColor: colors.surface,
                    borderColor: amountError ? colors.danger : colors.border,
                    borderWidth: amountError ? 2 : 1,
                  },
                ]}
              >
                <View style={[styles.amountEntryColumn, { width: amountTextMaxWidth }]}>
                  <View style={styles.amountRow}>
                    <TextInput
                      style={[styles.amountInput, { color: colors.text, fontSize: displayAmountFontSize }]}
                      placeholder="0.00"
                      placeholderTextColor={colors.textTertiary}
                      value={amountStr}
                      onChangeText={t => {
                        const formatted = formatNumberInput(t);
                        setAmountStr(formatted);
                        if (parseNumericInput(formatted) > 0) setAmountError(false);
                      }}
                      keyboardType="decimal-pad"
                      selectionColor={colors.primary}
                    />
                  </View>
                </View>
              </View>
            </View>
          </View>
          {amountError && (
            <Text style={[styles.fieldErrorHint, { color: colors.danger }]}>
              Please enter a cost amount
            </Text>
          )}
        </View>

        <View style={styles.descRow}>
          <Pressable
            onPress={() => setShowCategoryPicker(true)}
            style={[
              styles.categoryIconBtn,
              { backgroundColor: colors.surface, borderColor: colors.border },
            ]}
            accessibilityRole="button"
            accessibilityLabel="Choose category"
          >
            <CategoryIcon category={category} description={description} size={32} />
            {autoCategory === category && (
              <View style={[styles.autoBadgeSmall, { backgroundColor: colors.primaryLight }]}>
                <Feather name="zap" size={8} color={colors.primary} />
              </View>
            )}
            <Feather name="chevron-down" size={12} color={colors.textSecondary} style={styles.categoryChevron} />
          </Pressable>
          <View style={{ flex: 1 }}>
            <TextInput
              style={[
                styles.descriptionInput,
                { color: colors.text, backgroundColor: colors.surface, flex: 1 },
                descError
                  ? { borderColor: colors.danger, borderWidth: 2 }
                  : { borderColor: colors.border, borderWidth: 1 },
              ]}
              placeholder="What's this for? *"
              placeholderTextColor={descError ? colors.danger : colors.textTertiary}
              value={description}
              onChangeText={t => { setDescription(t); if (t.trim()) setDescError(false); }}
            />
            {descError && (
              <Text style={[styles.fieldErrorHint, { color: colors.danger }]}>
                Please add a description
              </Text>
            )}
          </View>
        </View>

        {/* Tab-specific add modes lock the payment type. The untargeted form
            keeps the switch for entry points that intentionally support both. */}
        {(!isEditing || isRecurringEditing) && !isNormalOnly && (
          <View style={styles.recurringSection}>
            {!isRecurringOnly && !isRecurringEditing && (
              <View
                style={[styles.recurringRow, {
                  backgroundColor: colors.surface,
                  borderColor: colors.primary + "50",
                  borderWidth: 1.5,
                }]}
              >
                <View style={[styles.recurringIconWrap, { backgroundColor: isRecurring ? colors.primary : colors.primaryLight }]}>
                  <Feather name="repeat" size={15} color={isRecurring ? "#fff" : colors.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.recurringLabel, { color: colors.text }]}>
                    Repeat this expense
                  </Text>
                </View>
                <Switch
                  value={isRecurring}
                  onValueChange={v => {
                    setIsRecurring(v);
                    if (!v) setIntervalError(false);
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  }}
                  trackColor={{ false: colors.border, true: colors.primary }}
                  thumbColor="#fff"
                  style={{ marginLeft: "auto" }}
                />
              </View>
            )}
            {isRecurring && (
              <View
                style={[
                  styles.recurringSchedule,
                  { backgroundColor: colors.primaryLight, borderColor: colors.primary + "40" },
                ]}
              >
                <View style={styles.recurringScheduleHeader}>
                  <Text style={[styles.recurringScheduleLabel, { color: colors.text }]}>
                    Repeat every
                  </Text>
                  <DatePickerField
                    label={isRecurringEditing ? "Next payment" : "First payment"}
                    value={paymentDate}
                    onChange={setPaymentDate}
                    colors={colors}
                    allowClear={false}
                    compact
                    iconOnly
                  />
                </View>
                <View style={styles.frequencyInlineRow}>
                  {[
                    { label: "Month", value: intervalMonths, setValue: setIntervalMonths, testID: "recurring-interval-months" },
                    { label: "Week", value: intervalWeeks, setValue: setIntervalWeeks, testID: "recurring-interval-weeks" },
                    { label: "Day", value: intervalDays, setValue: setIntervalDays, testID: "recurring-interval-days" },
                  ].map(interval => (
                    <View key={interval.label} style={styles.frequencyInlineItem}>
                      <Text style={[styles.frequencyUnitLabel, { color: colors.text }]}>{interval.label}</Text>
                      <TextInput
                        testID={interval.testID}
                        style={[
                          styles.frequencyIntervalInput,
                          {
                            color: colors.text,
                            backgroundColor: intervalError ? colors.dangerLight : colors.inputBg,
                            borderColor: intervalError ? colors.danger : colors.border,
                          },
                        ]}
                        value={interval.value}
                        onChangeText={value => {
                          const nextValue = value.replace(/[^0-9]/g, "");
                          interval.setValue(nextValue);
                          const nextIntervals = [
                            interval.label === "Month" ? nextValue : intervalMonths,
                            interval.label === "Week" ? nextValue : intervalWeeks,
                            interval.label === "Day" ? nextValue : intervalDays,
                          ];
                          if (nextIntervals.some(item => Number.parseInt(item, 10) > 0)) {
                            setIntervalError(false);
                          }
                        }}
                        keyboardType="number-pad"
                        maxLength={3}
                        placeholder="0"
                        placeholderTextColor={colors.textTertiary}
                        selectTextOnFocus
                      />
                    </View>
                  ))}
                </View>
                <Text style={[styles.recurringFirstDate, { color: colors.text }]}>
                  {isRecurringEditing
                    ? `Next payment ${formatScheduleDate(paymentDate)} · following payment ${formatScheduleDate(nextRecurringDate)}`
                    : `First payment ${formatScheduleDate(paymentDate)} · next payment ${formatScheduleDate(nextRecurringDate)}`}
                </Text>
              </View>
            )}
          </View>
        )}

        {/* Category picker modal */}
        {/* Overlay + sheet are siblings, not parent/child — a Pressable/responder
            ancestor around the sheet would swallow the touch before the drag
            gesture below ever sees it. */}
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
                      onSubmitEditing={handleAddCustomCategory}
                      returnKeyType="done"
                    />
                    <Pressable onPress={handleAddCustomCategory} accessibilityRole="button" accessibilityLabel="Done">
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

        <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>Paid by</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.paidByRow}>
          {members.map(m => (
            <Pressable
              key={m.id}
              style={[
                styles.paidByChip,
                {
                  backgroundColor: paidById === m.id ? colors.primaryLight : colors.surface,
                  borderColor: paidById === m.id ? colors.primary : colors.border,
                },
              ]}
              onPress={() => setPaidById(m.id)}
            >
              <Avatar name={m.name} color={m.avatarColor} size={24} imageUri={m.photo} />
              <Text style={[styles.paidByLabel, { color: paidById === m.id ? colors.primary : colors.text }]}>
                {m.isCurrentUser ? "You" : m.name.split(" ")[0]}
              </Text>
            </Pressable>
          ))}
        </ScrollView>

        <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>Who's involved</Text>
        <View style={[styles.splitTypeRow, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          {SPLIT_TYPES.map(t => (
            <Pressable
              key={t.value}
              style={[
                styles.splitTypeBtn,
                splitType === t.value && { backgroundColor: colors.primaryLight },
              ]}
              onPress={() => setSplitType(t.value)}
            >
              <Text style={[styles.splitTypeLabel, { color: splitType === t.value ? colors.primary : colors.text }]}>
                {t.label}
              </Text>
              <Text style={[styles.splitTypeDesc, { color: splitType === t.value ? colors.primary : colors.textSecondary }]}>
                {t.desc}
              </Text>
            </Pressable>
          ))}
        </View>

        <View style={styles.splitDetails}>
          {members.map(m => {
            const isIncluded = includedMemberIds.includes(m.id);
            const split = splits.find(s => s.memberId === m.id);
            return (
              <View
                key={m.id}
                style={[styles.splitRow, { backgroundColor: colors.surface, opacity: isIncluded ? 1 : 0.45 }]}
              >
                <Pressable
                  style={styles.participantMain}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    setIncludedMemberIds(prev =>
                      isIncluded ? prev.filter(i => i !== m.id) : [...prev, m.id]
                    );
                  }}
                >
                  <View
                    style={[
                      styles.participantCheckbox,
                      {
                        borderColor: isIncluded ? colors.primary : colors.border,
                        backgroundColor: isIncluded ? colors.primary : "transparent",
                      },
                    ]}
                  >
                    {isIncluded && <Feather name="check" size={11} color="#fff" />}
                  </View>
                  <Avatar name={m.name} color={m.avatarColor} size={32} />
                  <Text
                    style={[styles.splitName, { color: colors.text }]}
                    numberOfLines={1}
                    ellipsizeMode="tail"
                  >
                    {m.isCurrentUser ? "You" : m.name.split(" ")[0]}
                  </Text>
                </Pressable>
                {!isIncluded ? (
                  <Text style={[styles.splitAmount, { color: colors.textTertiary }]}>excluded</Text>
                ) : splitType === "equal" ? (
                  <View style={[styles.equalAmountBox, { backgroundColor: colors.inputBg, borderColor: colors.border }]}>
                    <Text style={[styles.splitAmount, { color: colors.textSecondary }]}>
                      {currencySymbol.trim() || expenseCurrency} {formatNumberDisplay(split?.amount ?? 0)}
                    </Text>
                  </View>
                ) : null}
                {isIncluded && splitType === "exact" ? (
                  <View style={styles.stepperWrap}>
                    <Pressable
                      style={[styles.stepperBtn, { backgroundColor: colors.primaryLight, borderColor: colors.border }]}
                      hitSlop={6}
                      onPress={() => adjustExact(m.id, -1)}
                     accessibilityRole="button" accessibilityLabel="Remove one">
                      <Feather name="minus" size={14} color={colors.primary} />
                    </Pressable>
                    <View style={styles.exactAmountInputWrap}>
                      <Text style={[styles.splitCurrencySymbol, { color: colors.textSecondary }]}>
                        {currencySymbol.trim() || expenseCurrency}
                      </Text>
                      <TextInput
                        style={[
                          styles.splitInput,
                          styles.exactSplitInput,
                          {
                            color: colors.text,
                            borderColor: colors.border,
                            backgroundColor: colors.inputBg,
                            width: Math.min(150, Math.max(72, (exactAmounts[m.id] ?? "").length * 8 + 20)), fontSize: getSplitInputFontSize(exactAmounts[m.id] ?? "", Math.min(150, Math.max(72, (exactAmounts[m.id] ?? "").length * 8 + 20))),
                          },
                        ]}
                        placeholder="0.00"
                        placeholderTextColor={colors.textTertiary}
                        value={exactAmounts[m.id] ?? ""}
                        onChangeText={v => setExactAmounts(prev => ({ ...prev, [m.id]: formatNumberInput(v) }))}
                        onBlur={() => setExactAmounts(prev => ({
                          ...prev,
                          [m.id]: formatTwoDecimalInput(prev[m.id] ?? ""),
                        }))}
                        keyboardType="decimal-pad"
                      />
                    </View>
                    <Pressable
                      style={[styles.stepperBtn, { backgroundColor: colors.primaryLight, borderColor: colors.border }]}
                      hitSlop={6}
                      onPress={() => adjustExact(m.id, 1)}
                     accessibilityRole="button" accessibilityLabel="Add">
                      <Feather name="plus" size={14} color={colors.primary} />
                    </Pressable>
                  </View>
                ) : isIncluded && splitType === "shares" ? (
                  <View style={styles.stepperWrap}>
                    <Pressable
                      style={[styles.stepperBtn, { backgroundColor: colors.primaryLight, borderColor: colors.border }]}
                      hitSlop={6}
                      onPress={() => adjustShares(m.id, -1)}
                      accessibilityLabel={`One less share for ${m.name}`}
                    >
                      <Feather name="minus" size={14} color={colors.primary} />
                    </Pressable>
                    <View style={styles.pctInputWrap}>
                      <TextInput
                        style={[styles.splitInput, { color: colors.text, borderColor: colors.border, backgroundColor: colors.inputBg }]}
                        placeholder="1"
                        placeholderTextColor={colors.textTertiary}
                        value={shares[m.id] ?? "0"}
                        onChangeText={v => setShares(prev => ({ ...prev, [m.id]: formatNumberInput(v) }))}
                        keyboardType="decimal-pad"
                      />
                      <Text style={[styles.pctLabel, { color: colors.textSecondary }]}>
                        {formatNumberDisplay(split?.amount ?? 0)}
                      </Text>
                    </View>
                    <Pressable
                      style={[styles.stepperBtn, { backgroundColor: colors.primaryLight, borderColor: colors.border }]}
                      hitSlop={6}
                      onPress={() => adjustShares(m.id, 1)}
                      accessibilityLabel={`One more share for ${m.name}`}
                    >
                      <Feather name="plus" size={14} color={colors.primary} />
                    </Pressable>
                  </View>
                ) : isIncluded && splitType === "percentage" && (
                  <View style={styles.stepperWrap}>
                    <Pressable
                      style={[styles.stepperBtn, { backgroundColor: colors.primaryLight, borderColor: colors.border }]}
                      hitSlop={6}
                      onPress={() => adjustPercentage(m.id, -5)}
                     accessibilityRole="button" accessibilityLabel="Remove one">
                      <Feather name="minus" size={14} color={colors.primary} />
                    </Pressable>
                    <View style={styles.pctInputWrap}>
                      <TextInput
                        style={[styles.splitInput, { color: colors.text, borderColor: colors.border, backgroundColor: colors.inputBg }]}
                        placeholder="0.00"
                        placeholderTextColor={colors.textTertiary}
                        value={percentages[m.id] ?? ""}
                        onChangeText={v => setPercentages(prev => ({ ...prev, [m.id]: formatNumberInput(v) }))}
                        keyboardType="decimal-pad"
                      />
                      <Text style={[styles.pctLabel, { color: colors.textSecondary }]}>%</Text>
                    </View>
                    <Pressable
                      style={[styles.stepperBtn, { backgroundColor: colors.primaryLight, borderColor: colors.border }]}
                      hitSlop={6}
                      onPress={() => adjustPercentage(m.id, 5)}
                     accessibilityRole="button" accessibilityLabel="Add">
                      <Feather name="plus" size={14} color={colors.primary} />
                    </Pressable>
                  </View>
                )}
              </View>
            );
          })}
        </View>

        {splitType !== "equal" && amount > 0 && (
          <View style={[
            styles.validationRow,
            {
              backgroundColor: splitValid ? colors.successLight : colors.dangerLight,
              borderColor: splitValid ? colors.success : colors.danger,
            },
          ]}>
            <Feather
              name={splitValid ? "check-circle" : "alert-circle"}
              size={16}
              color={splitValid ? colors.success : colors.danger}
            />
            <Text style={[styles.validationText, { color: splitValid ? colors.success : colors.danger }]}>
              {splitType === "shares"
                ? splitValid
                  ? `${totalShareUnits} share${totalShareUnits === 1 ? "" : "s"} · ${currencySymbol}${formatNumberDisplay(totalShareUnits > 0 ? amount / totalShareUnits : 0)} per share ✓`
                  : "Give at least one person a share"
                : splitType === "exact"
                ? splitValid
                  ? `Splits add up to ${currencySymbol}${formatNumberDisplay(amount)} ✓`
                  : (() => {
                      const remaining = Math.round((amount - splitTotal) * 100) / 100;
                      return remaining > 0
                        ? `${currencySymbol}${formatNumberDisplay(remaining)} remaining to assign`
                        : `${currencySymbol}${formatNumberDisplay(Math.abs(remaining))} over the total`;
                    })()
                : (() => {
                    const totalPct = includedMembers.reduce(
                      (s, m) => s + parseNumericInput(percentages[m.id] ?? "0"),
                      0
                    );
                    const remaining = Math.round((100 - totalPct) * 100) / 100;
                    return splitValid
                      ? `Percentages add up to 100% ✓`
                      : remaining > 0
                        ? `${remaining.toFixed(2)}% remaining to assign`
                        : `${Math.abs(remaining).toFixed(2)}% over the total`;
                  })()}
            </Text>
          </View>
        )}

      </KeyboardAwareScrollViewCompat>

      <CurrencyPickerModal
        visible={showExpCurrencyPicker}
        value={expenseCurrency}
        onChange={(c: Currency) => { setExpenseCurrency(c); setShowExpCurrencyPicker(false); }}
        onClose={() => setShowExpCurrencyPicker(false)}
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
  headerTitle: { fontSize: 18, fontFamily: "Inter_700Bold" },
  headerRight: { flexDirection: "row", alignItems: "center", gap: 8 },
  saveBtn: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 14 },
  saveBtnText: { color: "#fff", fontSize: 14, fontFamily: "Inter_600SemiBold" },
  content: { padding: 20, gap: 14 },
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
  amountRow: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    gap: 1,
  },
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
    minHeight: 52,
    position: "relative",
    paddingHorizontal: 10,
    paddingVertical: 8,
    justifyContent: "center",
    borderRadius: 14,
  },
  amountEntryColumn: {
    minWidth: 0,
    width: "100%",
    alignItems: "flex-start",
    gap: 5,
  },
  amountLabel: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  expCurrencyChip: {
    flexDirection: "row", alignItems: "center", gap: 4,
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, borderWidth: 1,
  },
  expCurrencyChipText: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  currencyIconText: { fontSize: 20, fontFamily: "Inter_600SemiBold" },
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
  amountInput: {
    flex: 1,
    minWidth: 0,
    fontSize: 40,
    fontFamily: "Inter_700Bold",
    paddingHorizontal: 0,
    textAlign: "left",
  },
  descRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  descriptionInput: {
    height: 52,
    borderRadius: 14,
    paddingHorizontal: 16,
    fontSize: 16,
    fontFamily: "Inter_400Regular",
    borderWidth: 1,
  },
  sectionLabelRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  sectionLabel: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  autoBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
  },
  autoBadgeText: { fontSize: 10, fontFamily: "Inter_600SemiBold" },
  catRow: { gap: 8, paddingVertical: 4 },
  catChip: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    gap: 6,
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
  paidByRow: { gap: 8, paddingVertical: 4 },
  paidByChip: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 14,
    borderWidth: 1,
    gap: 8,
  },
  paidByLabel: { fontSize: 13, fontFamily: "Inter_500Medium" },
  splitTypeRow: {
    flexDirection: "row",
    borderRadius: 16,
    borderWidth: 1,
    overflow: "hidden",
  },
  splitTypeBtn: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 8,
  },
  splitTypeLabel: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  splitTypeDesc: { fontSize: 10, fontFamily: "Inter_400Regular", marginTop: 2 },
  splitDetails: { gap: 10 },
  splitRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    borderRadius: 14,
    gap: 12,
  },
  participantMain: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  splitName: { flex: 1, minWidth: 0, fontSize: 14, fontFamily: "Inter_500Medium" },
  splitAmount: { fontSize: 14, fontFamily: "Inter_400Regular" },
  equalAmountBox: {
    minWidth: 86,
    height: 36,
    paddingHorizontal: 8,
    borderWidth: 1,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  stepperWrap: { flexShrink: 0, flexDirection: "row", alignItems: "center", gap: 6 },
  stepperBtn: {
    width: 34,
    height: 34,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  exactAmountInputWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  splitCurrencySymbol: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
  },
  exactSplitInput: {
    width: 72,
  },
  splitInput: {
    width: 64,
    height: 36,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 8,
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
  },
  pctInputWrap: { flexDirection: "row", alignItems: "center", gap: 3 },
  pctLabel: { fontSize: 14, fontFamily: "Inter_500Medium" },
  participantCheckbox: {
    width: 20, height: 20, borderRadius: 6, borderWidth: 1.5,
    alignItems: "center", justifyContent: "center",
  },
  categoryIconBtn: {
    width: 64,
    height: 52,
    position: "relative",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 14,
    borderWidth: 1,
  },
  categoryChevron: {
    position: "absolute",
    right: 4,
    top: 20,
  },
  autoBadgeSmall: {
    position: "absolute", top: -2, right: -2, width: 12, height: 12,
    borderRadius: 6, alignItems: "center", justifyContent: "center",
  },
  catModalOverlay: {
    flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "flex-end",
  },
  catModalSheet: {
    borderTopLeftRadius: 20, borderTopRightRadius: 20,
    paddingTop: 12, paddingBottom: 32, paddingHorizontal: 20,
  },
  catModalHandle: {
    width: 40, height: 4, borderRadius: 2, backgroundColor: "#ccc",
    alignSelf: "center", marginBottom: 16,
  },
  catModalTitle: { fontSize: 18, fontFamily: "Inter_700Bold", marginBottom: 16 },
  catModalGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  catModalChip: {
    flexDirection: "row", alignItems: "center", gap: 6,
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: 14, borderWidth: 1,
  },
  validationRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  validationText: { fontSize: 13, fontFamily: "Inter_500Medium", flex: 1 },
  fieldErrorHint: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    marginTop: 5,
    marginLeft: 4,
  },
  recurringSection: { gap: 10 },
  recurringRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 14,
    borderWidth: 1.5,
  },
  recurringIconWrap: {
    width: 32, height: 32, borderRadius: 10,
    alignItems: "center", justifyContent: "center", flexShrink: 0,
  },
  recurringLabel: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  recurringSchedule: {
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 14,
    borderWidth: 1,
  },
  recurringScheduleLabel: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  recurringScheduleHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  frequencyInlineRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  frequencyInlineItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  frequencyUnitLabel: {
    fontSize: 13,
    fontFamily: "Inter_700Bold",
  },
  frequencyIntervalInput: {
    width: 48,
    height: 34,
    borderRadius: 8,
    borderWidth: 1,
    textAlign: "center",
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
  },
  recurringFirstDate: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    lineHeight: 16,
  },
  customDaysRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    alignSelf: "flex-start",
  },
  customDaysLabel: { fontSize: 15, fontFamily: "Inter_400Regular" },
  customDaysInput: {
    width: 60,
    height: 38,
    borderRadius: 8,
    borderWidth: 1,
    textAlign: "center",
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
  },
  recurringNote: { fontSize: 12, fontFamily: "Inter_400Regular", lineHeight: 17 },
  recurringSubSection: { gap: 8, marginTop: 4 },
  recurringSubLabel: { fontSize: 11, fontFamily: "Inter_600SemiBold", textTransform: "uppercase", letterSpacing: 0.6 },
  dayPickerRow: { flexDirection: "row", gap: 6 },
  dayChip: { width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center", borderWidth: 1 },
  dayChipText: { fontSize: 12, fontFamily: "Inter_700Bold" },
  timeChip: { alignItems: "center", paddingHorizontal: 14, paddingVertical: 10, borderRadius: 14, borderWidth: 1, gap: 2, minWidth: 72 },
  timeChipEmoji: { fontSize: 18 },
  timeChipLabel: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  timeChipSub: { fontSize: 10, fontFamily: "Inter_400Regular" },
  endTypeRow: { flexDirection: "row", gap: 6 },
  endTypeBtn: { flex: 1, alignItems: "center", paddingVertical: 10, borderRadius: 10, borderWidth: 1 },
  endTypeBtnText: { fontSize: 12, fontFamily: "Inter_500Medium" },
  previewCard: { alignItems: "center", paddingHorizontal: 14, paddingVertical: 12, borderRadius: 14, borderWidth: 1, gap: 2, minWidth: 60 },
  previewCardMonth: { fontSize: 10, fontFamily: "Inter_600SemiBold", letterSpacing: 0.5 },
  previewCardDay: { fontSize: 22, fontFamily: "Inter_700Bold" },
  previewCardWeekday: { fontSize: 10, fontFamily: "Inter_400Regular" },
});
