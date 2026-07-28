import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import { router, useLocalSearchParams } from "expo-router";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Avatar } from "@/components/Avatar";
import { BUILTIN_CATEGORY_CONFIG } from "@/components/CategoryIcon";
import { KeyboardAwareScrollViewCompat } from "@/components/KeyboardAwareScrollViewCompat";
import {
  CURRENCY_SYMBOLS,
  RECURRING_FREQUENCY_DAYS,
  RECURRING_FREQUENCY_LABELS,
  RecurringFrequency,
  SplitType,
  useApp,
} from "@/context/AppContext";
import { showAlert } from "@/hooks/alertStore";
import { useTheme } from "@/hooks/useTheme";
import { parseReceipt, suggestCategory } from "@/services/ai";

const BUILTIN_CATEGORIES = [
  { value: "food", label: "Food", icon: "coffee" },
  { value: "transport", label: "Transport", icon: "navigation" },
  { value: "accommodation", label: "Stay", icon: "home" },
  { value: "entertainment", label: "Fun", icon: "film" },
  { value: "utilities", label: "Utilities", icon: "zap" },
  { value: "shopping", label: "Shopping", icon: "shopping-bag" },
  { value: "health", label: "Health", icon: "heart" },
  { value: "other", label: "Other", icon: "more-horizontal" },
] as const;

const SPLIT_TYPES: { value: SplitType; label: string; desc: string }[] = [
  { value: "equal", label: "Equal", desc: "Split evenly" },
  { value: "exact", label: "Exact", desc: "Set amounts" },
  { value: "percentage", label: "%", desc: "By percentage" },
];

export default function NewExpenseScreen() {
  const { groupId, expenseId } = useLocalSearchParams<{ groupId: string; expenseId?: string }>();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const {
    getGroupById,
    getMemberById,
    currentUser,
    addExpense,
    updateExpense,
    addRecurringExpense,
    expenses,
    customCategories,
    addCustomCategory,
  } = useApp();

  const existingExpense = expenseId ? expenses.find(e => e.id === expenseId) : undefined;
  const isEditing = !!existingExpense;
  const resolvedGroupId = existingExpense?.groupId ?? groupId ?? "";
  const group = getGroupById(resolvedGroupId);

  const [description, setDescription] = useState(existingExpense?.description ?? "");
  const [amountStr, setAmountStr] = useState(existingExpense ? String(existingExpense.amount) : "");
  const [paidById, setPaidById] = useState(existingExpense?.paidById ?? currentUser.id);
  const [category, setCategory] = useState<string>(existingExpense?.category ?? "food");
  const [autoCategory, setAutoCategory] = useState<string | null>(null);
  const [splitType, setSplitType] = useState<SplitType>(existingExpense?.splitType ?? "equal");
  const [exactAmounts, setExactAmounts] = useState<Record<string, string>>(
    existingExpense?.splitType === "exact"
      ? Object.fromEntries(existingExpense.splits.map(s => [s.memberId, String(s.amount)]))
      : {}
  );
  const [percentages, setPercentages] = useState<Record<string, string>>(
    existingExpense?.splitType === "percentage"
      ? Object.fromEntries(existingExpense.splits.map(s => [s.memberId, String(s.percentage ?? 0)]))
      : {}
  );
  const [scanLoading, setScanLoading] = useState(false);
  const [showAddCat, setShowAddCat] = useState(false);
  const [descError, setDescError] = useState(false);
  const [amountError, setAmountError] = useState(false);
  const [isRecurring, setIsRecurring] = useState(false);
  const [recurringFrequency, setRecurringFrequency] = useState<RecurringFrequency>("monthly");
  const [customDays, setCustomDays] = useState("30");
  const [newCatName, setNewCatName] = useState("");

  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const amount = parseFloat(amountStr) || 0;
  const currencySymbol = group ? (CURRENCY_SYMBOLS[group.currency] ?? group.currency + " ") : "$";

  const suggestTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (suggestTimer.current) clearTimeout(suggestTimer.current);
    suggestTimer.current = setTimeout(() => {
      if (description.trim().length >= 3) {
        const result = suggestCategory(description);
        if (result.confidence === "high") {
          setCategory(result.category);
          setAutoCategory(result.category);
        }
      }
    }, 250);
    return () => { if (suggestTimer.current) clearTimeout(suggestTimer.current); };
  }, [description]);

  const members = useMemo(
    () =>
      (group?.memberIds ?? [])
        .map(id => getMemberById(id))
        .filter(Boolean) as NonNullable<ReturnType<typeof getMemberById>>[],
    [group, getMemberById]
  );

  const splits = useMemo(() => {
    if (!group) return [];
    if (splitType === "equal") {
      const share = members.length > 0 ? amount / members.length : 0;
      return members.map(m => ({
        memberId: m.id,
        amount: Math.round(share * 100) / 100,
        paid: m.id === paidById ? amount : undefined,
      }));
    }
    if (splitType === "exact") {
      return members.map(m => ({
        memberId: m.id,
        amount: parseFloat(exactAmounts[m.id] ?? "0") || 0,
        paid: m.id === paidById ? amount : undefined,
      }));
    }
    return members.map(m => {
      const pct = parseFloat(percentages[m.id] ?? "0") || 0;
      return {
        memberId: m.id,
        amount: Math.round((pct / 100) * amount * 100) / 100,
        percentage: pct,
        paid: m.id === paidById ? amount : undefined,
      };
    });
  }, [splitType, amount, members, paidById, exactAmounts, percentages]);

  const splitTotal = useMemo(() => splits.reduce((s, sp) => s + sp.amount, 0), [splits]);

  const splitValid = useMemo(() => {
    if (amount <= 0) return null;
    if (splitType === "equal") return true;
    if (splitType === "exact") return Math.abs(splitTotal - amount) < 0.01;
    if (splitType === "percentage") {
      const totalPct = members.reduce((s, m) => s + (parseFloat(percentages[m.id] ?? "0") || 0), 0);
      return Math.abs(totalPct - 100) < 0.1;
    }
    return false;
  }, [amount, splitType, splitTotal, members, percentages]);

  function adjustExact(memberId: string, delta: number) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setExactAmounts(prev => {
      const current = parseFloat(prev[memberId] ?? "0") || 0;
      const next = Math.max(0, Math.round((current + delta) * 100) / 100);
      return { ...prev, [memberId]: next.toFixed(2) };
    });
  }

  function adjustPercentage(memberId: string, delta: number) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setPercentages(prev => {
      const current = parseFloat(prev[memberId] ?? "0") || 0;
      const next = Math.max(0, Math.min(100, Math.round((current + delta) * 10) / 10));
      return { ...prev, [memberId]: next.toString() };
    });
  }

  async function processImage(uri: string) {
    setScanLoading(true);
    try {
      const data = await parseReceipt(uri);
      if (data.description) {
        setDescription(data.description);
        if (data.amount > 0) setAmountStr(data.amount.toString());
        if (data.category) { setCategory(data.category); setAutoCategory(data.category); }
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } else {
        showAlert(
          "Receipt scanned",
          "Connect an LLM API in services/ai.ts to automatically extract amount, merchant, and category from photos.",
          [{ text: "Got it" }]
        );
      }
    } catch {
      showAlert("Scan failed", "Could not read the receipt. Try again.");
    } finally {
      setScanLoading(false);
    }
  }

  async function pickFromLibrary() {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      showAlert("Permission needed", "Allow photo library access to scan receipts.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: "images",
      allowsEditing: false,
      quality: 0.8,
    });
    if (!result.canceled) await processImage(result.assets[0].uri);
  }

  async function pickFromCamera() {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== "granted") {
      showAlert("Permission needed", "Allow camera access to take a receipt photo.");
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: "images",
      allowsEditing: false,
      quality: 0.8,
    });
    if (!result.canceled) await processImage(result.assets[0].uri);
  }

  function handleScanReceipt() {
    showAlert("Scan Receipt", "How would you like to add a photo?", [
      { text: "Take Photo", onPress: pickFromCamera },
      { text: "Choose from Library", onPress: pickFromLibrary },
      { text: "Cancel", style: "cancel" },
    ]);
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
    let hasError = false;
    if (!description.trim()) { setDescError(true); hasError = true; }
    if (amount <= 0) { setAmountError(true); hasError = true; }
    if (hasError) return;
    if (!group) return;
    if (splitValid === false) {
      const msg =
        splitType === "exact"
          ? `Amounts must add up to ${currencySymbol}${amount.toFixed(2)}`
          : "Percentages must add up to 100%";
      showAlert("Split doesn't balance", msg);
      return;
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    if (isEditing && existingExpense) {
      updateExpense(existingExpense.id, {
        description: description.trim(),
        amount,
        paidById,
        splitType,
        splits,
        category,
      });
    } else {
      addExpense({
        groupId: group.id,
        description: description.trim(),
        amount,
        currency: group.currency,
        paidById,
        splitType,
        splits,
        category,
      });
      if (isRecurring) {
        const days = recurringFrequency === "custom"
          ? Math.max(1, parseInt(customDays) || 30)
          : RECURRING_FREQUENCY_DAYS[recurringFrequency];
        const nextDueAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
        addRecurringExpense({
          groupId: group.id,
          description: description.trim(),
          amount,
          currency: group.currency,
          paidById,
          splitType,
          splits,
          category,
          frequency: recurringFrequency,
          ...(recurringFrequency === "custom" ? { customDays: days } : {}),
          nextDueAt,
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
        <Pressable onPress={() => router.back()}>
          <Feather name="x" size={24} color={colors.text} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.text }]}>{isEditing ? "Edit Expense" : "Add Expense"}</Text>
        <View style={styles.headerRight}>
          <Pressable
            style={[styles.scanBtn, { backgroundColor: colors.primaryLight }]}
            onPress={handleScanReceipt}
            disabled={scanLoading}
          >
            {scanLoading
              ? <ActivityIndicator size="small" color={colors.primary} />
              : <Feather name="camera" size={17} color={colors.primary} />
            }
          </Pressable>
          <Pressable style={[styles.saveBtn, { backgroundColor: colors.primary }]} onPress={handleSave}>
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
            { backgroundColor: colors.surface },
            amountError && { borderWidth: 2, borderColor: colors.danger },
          ]}>
            <Text style={[styles.currencySymbol, { color: amountError ? colors.danger : colors.primary }]}>
              {currencySymbol}
            </Text>
            <TextInput
              style={[styles.amountInput, { color: colors.text }]}
              placeholder="0.00"
              placeholderTextColor={colors.textTertiary}
              value={amountStr}
              onChangeText={t => { setAmountStr(t); if (parseFloat(t) > 0) setAmountError(false); }}
              keyboardType="decimal-pad"
              autoFocus
            />
          </View>
          {amountError && (
            <Text style={[styles.fieldErrorHint, { color: colors.danger }]}>
              Please enter a cost amount
            </Text>
          )}
        </View>

        <View style={styles.descRow}>
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

        {/* Recurring toggle — only when creating, not editing */}
        {!isEditing && (
          <View style={styles.recurringSection}>
            <View style={[styles.recurringRow, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Feather name="repeat" size={16} color={isRecurring ? colors.primary : colors.textSecondary} />
              <Text style={[styles.recurringLabel, { color: colors.text }]}>Repeat this expense</Text>
              <Switch
                value={isRecurring}
                onValueChange={v => {
                  setIsRecurring(v);
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                }}
                trackColor={{ false: colors.border, true: colors.primary }}
                thumbColor="#fff"
                style={{ marginLeft: "auto" }}
              />
            </View>
            {isRecurring && (
              <View style={styles.freqRow}>
                {(Object.entries(RECURRING_FREQUENCY_LABELS) as [RecurringFrequency, string][]).map(([val, label]) => (
                  <Pressable
                    key={val}
                    style={[
                      styles.freqChip,
                      {
                        backgroundColor: recurringFrequency === val ? colors.primary : colors.surface,
                        borderColor: recurringFrequency === val ? colors.primary : colors.border,
                      },
                    ]}
                    onPress={() => {
                      setRecurringFrequency(val);
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    }}
                  >
                    <Text style={[
                      styles.freqChipText,
                      { color: recurringFrequency === val ? "#fff" : colors.textSecondary },
                    ]}>
                      {label}
                    </Text>
                  </Pressable>
                ))}
              </View>
            )}
            {isRecurring && recurringFrequency === "custom" && (
              <View style={[styles.customDaysRow, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Text style={[styles.customDaysLabel, { color: colors.text }]}>Every</Text>
                <TextInput
                  style={[styles.customDaysInput, { color: colors.text, backgroundColor: colors.inputBg, borderColor: colors.border }]}
                  value={customDays}
                  onChangeText={t => setCustomDays(t.replace(/[^0-9]/g, ""))}
                  keyboardType="number-pad"
                  maxLength={3}
                  selectTextOnFocus
                />
                <Text style={[styles.customDaysLabel, { color: colors.text }]}>days</Text>
              </View>
            )}
            {isRecurring && (
              <Text style={[styles.recurringNote, { color: colors.textTertiary }]}>
                This expense will be added once now, then again automatically
                {recurringFrequency === "custom"
                  ? ` every ${parseInt(customDays) || 30} day${(parseInt(customDays) || 30) === 1 ? "" : "s"}.`
                  : ` ${RECURRING_FREQUENCY_LABELS[recurringFrequency].toLowerCase()}.`}
              </Text>
            )}
          </View>
        )}

        <View style={styles.sectionLabelRow}>
          <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>Category</Text>
          {autoCategory && autoCategory === category && (
            <View style={[styles.autoBadge, { backgroundColor: colors.primaryLight }]}>
              <Feather name="zap" size={10} color={colors.primary} />
              <Text style={[styles.autoBadgeText, { color: colors.primary }]}>Auto</Text>
            </View>
          )}
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.catRow}>
          {allCategories.map(c => {
            const isSelected = category === c.value;
            const config = BUILTIN_CATEGORY_CONFIG[c.value];
            return (
              <Pressable
                key={c.value}
                style={[
                  styles.catChip,
                  {
                    backgroundColor: isSelected ? colors.primary : colors.surface,
                    borderColor: isSelected ? colors.primary : colors.border,
                  },
                ]}
                onPress={() => { setCategory(c.value); setAutoCategory(null); }}
              >
                <Feather
                  name={(config?.icon ?? "tag") as any}
                  size={14}
                  color={isSelected ? "#fff" : (config?.color ?? colors.textSecondary)}
                />
                <Text style={[styles.catLabel, { color: isSelected ? "#fff" : colors.text }]}>
                  {c.label}
                </Text>
              </Pressable>
            );
          })}

          {/* Add custom category */}
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
              <Pressable onPress={handleAddCustomCategory}>
                <Feather name="check" size={16} color={colors.primary} />
              </Pressable>
              <Pressable onPress={() => { setShowAddCat(false); setNewCatName(""); }}>
                <Feather name="x" size={16} color={colors.textTertiary} />
              </Pressable>
            </View>
          ) : (
            <Pressable
              style={[styles.catChip, { borderColor: colors.border, borderStyle: "dashed", backgroundColor: "transparent" }]}
              onPress={() => setShowAddCat(true)}
            >
              <Feather name="plus" size={14} color={colors.textTertiary} />
              <Text style={[styles.catLabel, { color: colors.textTertiary }]}>Add</Text>
            </Pressable>
          )}
        </ScrollView>

        <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>Paid by</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.paidByRow}>
          {members.map(m => (
            <Pressable
              key={m.id}
              style={[
                styles.paidByChip,
                {
                  backgroundColor: paidById === m.id ? colors.primary : colors.surface,
                  borderColor: paidById === m.id ? colors.primary : colors.border,
                },
              ]}
              onPress={() => setPaidById(m.id)}
            >
              <Avatar name={m.name} color={m.id === paidById ? "#fff" : m.avatarColor} size={24} />
              <Text style={[styles.paidByLabel, { color: paidById === m.id ? "#fff" : colors.text }]}>
                {m.isCurrentUser ? "You" : m.name.split(" ")[0]}
              </Text>
            </Pressable>
          ))}
        </ScrollView>

        <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>Split</Text>
        <View style={[styles.splitTypeRow, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          {SPLIT_TYPES.map(t => (
            <Pressable
              key={t.value}
              style={[
                styles.splitTypeBtn,
                splitType === t.value && { backgroundColor: colors.primary },
              ]}
              onPress={() => setSplitType(t.value)}
            >
              <Text style={[styles.splitTypeLabel, { color: splitType === t.value ? "#fff" : colors.text }]}>
                {t.label}
              </Text>
              <Text style={[styles.splitTypeDesc, { color: splitType === t.value ? "rgba(255,255,255,0.7)" : colors.textSecondary }]}>
                {t.desc}
              </Text>
            </Pressable>
          ))}
        </View>

        <View style={styles.splitDetails}>
          {members.map(m => {
            const split = splits.find(s => s.memberId === m.id);
            return (
              <View key={m.id} style={[styles.splitRow, { backgroundColor: colors.surface }]}>
                <Avatar name={m.name} color={m.avatarColor} size={32} />
                <Text style={[styles.splitName, { color: colors.text }]}>
                  {m.isCurrentUser ? "You" : m.name.split(" ")[0]}
                </Text>
                {splitType === "equal" ? (
                  <Text style={[styles.splitAmount, { color: colors.textSecondary }]}>
                    {currencySymbol}{(split?.amount ?? 0).toFixed(2)}
                  </Text>
                ) : splitType === "exact" ? (
                  <View style={styles.stepperWrap}>
                    <Pressable
                      style={[styles.stepperBtn, { backgroundColor: colors.primaryLight, borderColor: colors.border }]}
                      onPress={() => adjustExact(m.id, -1)}
                    >
                      <Feather name="minus" size={14} color={colors.primary} />
                    </Pressable>
                    <TextInput
                      style={[styles.splitInput, { color: colors.text, borderColor: colors.border, backgroundColor: colors.inputBg }]}
                      placeholder="0.00"
                      placeholderTextColor={colors.textTertiary}
                      value={exactAmounts[m.id] ?? ""}
                      onChangeText={v => setExactAmounts(prev => ({ ...prev, [m.id]: v }))}
                      keyboardType="decimal-pad"
                    />
                    <Pressable
                      style={[styles.stepperBtn, { backgroundColor: colors.primaryLight, borderColor: colors.border }]}
                      onPress={() => adjustExact(m.id, 1)}
                    >
                      <Feather name="plus" size={14} color={colors.primary} />
                    </Pressable>
                  </View>
                ) : (
                  <View style={styles.stepperWrap}>
                    <Pressable
                      style={[styles.stepperBtn, { backgroundColor: colors.primaryLight, borderColor: colors.border }]}
                      onPress={() => adjustPercentage(m.id, -5)}
                    >
                      <Feather name="minus" size={14} color={colors.primary} />
                    </Pressable>
                    <View style={styles.pctInputWrap}>
                      <TextInput
                        style={[styles.splitInput, { color: colors.text, borderColor: colors.border, backgroundColor: colors.inputBg }]}
                        placeholder="0"
                        placeholderTextColor={colors.textTertiary}
                        value={percentages[m.id] ?? ""}
                        onChangeText={v => setPercentages(prev => ({ ...prev, [m.id]: v }))}
                        keyboardType="decimal-pad"
                      />
                      <Text style={[styles.pctLabel, { color: colors.textSecondary }]}>%</Text>
                    </View>
                    <Pressable
                      style={[styles.stepperBtn, { backgroundColor: colors.primaryLight, borderColor: colors.border }]}
                      onPress={() => adjustPercentage(m.id, 5)}
                    >
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
              {splitType === "exact"
                ? splitValid
                  ? `Splits add up to ${currencySymbol}${amount.toFixed(2)} ✓`
                  : `${currencySymbol}${splitTotal.toFixed(2)} of ${currencySymbol}${amount.toFixed(2)} assigned`
                : (() => {
                    const totalPct = members.reduce(
                      (s, m) => s + (parseFloat(percentages[m.id] ?? "0") || 0),
                      0
                    );
                    return splitValid
                      ? `Percentages add up to 100% ✓`
                      : `${totalPct.toFixed(1)}% of 100% assigned`;
                  })()}
            </Text>
          </View>
        )}

      </KeyboardAwareScrollViewCompat>
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
  scanBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  saveBtn: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20 },
  saveBtnText: { color: "#fff", fontSize: 14, fontFamily: "Inter_600SemiBold" },
  content: { padding: 20, gap: 14 },
  amountCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 24,
    borderRadius: 20,
    gap: 4,
  },
  currencySymbol: { fontSize: 36, fontFamily: "Inter_700Bold" },
  amountInput: { fontSize: 52, fontFamily: "Inter_700Bold", minWidth: 120, textAlign: "center" },
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
    borderRadius: 20,
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
  splitName: { flex: 1, fontSize: 14, fontFamily: "Inter_500Medium" },
  splitAmount: { fontSize: 14, fontFamily: "Inter_500Medium" },
  stepperWrap: { flexDirection: "row", alignItems: "center", gap: 6 },
  stepperBtn: {
    width: 30,
    height: 30,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  splitInput: {
    width: 70,
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
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: 1,
  },
  recurringLabel: { fontSize: 15, fontFamily: "Inter_500Medium" },
  freqRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  freqChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
  },
  freqChipText: { fontSize: 13, fontFamily: "Inter_500Medium" },
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
});
