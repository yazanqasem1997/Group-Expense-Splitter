import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router, useLocalSearchParams } from "expo-router";
import React, { useMemo, useState } from "react";
import {
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Avatar } from "@/components/Avatar";
import { ExpenseCategory, SplitType, useApp } from "@/context/AppContext";
import { useTheme } from "@/hooks/useTheme";

const CATEGORIES: { value: ExpenseCategory; label: string; icon: string }[] = [
  { value: "food", label: "Food", icon: "coffee" },
  { value: "transport", label: "Transport", icon: "navigation" },
  { value: "accommodation", label: "Stay", icon: "home" },
  { value: "entertainment", label: "Fun", icon: "film" },
  { value: "utilities", label: "Utilities", icon: "zap" },
  { value: "shopping", label: "Shopping", icon: "shopping-bag" },
  { value: "health", label: "Health", icon: "heart" },
  { value: "other", label: "Other", icon: "more-horizontal" },
];

const SPLIT_TYPES: { value: SplitType; label: string; desc: string }[] = [
  { value: "equal", label: "Equal", desc: "Split evenly" },
  { value: "exact", label: "Exact", desc: "Set amounts" },
  { value: "percentage", label: "%", desc: "By percentage" },
];

export default function NewExpenseScreen() {
  const { groupId } = useLocalSearchParams<{ groupId: string }>();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { getGroupById, getMemberById, currentUser, addExpense } = useApp();

  const group = getGroupById(groupId ?? "");
  const [description, setDescription] = useState("");
  const [amountStr, setAmountStr] = useState("");
  const [paidById, setPaidById] = useState(currentUser.id);
  const [category, setCategory] = useState<ExpenseCategory>("food");
  const [splitType, setSplitType] = useState<SplitType>("equal");
  const [exactAmounts, setExactAmounts] = useState<Record<string, string>>({});
  const [percentages, setPercentages] = useState<Record<string, string>>({});

  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const amount = parseFloat(amountStr) || 0;

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
      const share = amount / members.length;
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
    // percentage
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

  function handleSave() {
    if (!description.trim()) {
      Alert.alert("Description required", "Please enter a description");
      return;
    }
    if (amount <= 0) {
      Alert.alert("Amount required", "Please enter a valid amount");
      return;
    }
    if (!group) return;

    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
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
    router.back();
  }

  if (!group) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <Text style={{ color: colors.text }}>Group not found</Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topPad + 8, backgroundColor: colors.headerBg }]}>
        <Pressable onPress={() => router.back()}>
          <Feather name="x" size={24} color={colors.text} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Add Expense</Text>
        <Pressable style={[styles.saveBtn, { backgroundColor: colors.primary }]} onPress={handleSave}>
          <Text style={styles.saveBtnText}>Save</Text>
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: Platform.OS === "web" ? 134 : 40 }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={[styles.amountCard, { backgroundColor: colors.surface }]}>
          <Text style={[styles.currencySymbol, { color: colors.primary }]}>
            {group.currency === "EUR" ? "€" : group.currency === "GBP" ? "£" : "$"}
          </Text>
          <TextInput
            style={[styles.amountInput, { color: colors.text }]}
            placeholder="0.00"
            placeholderTextColor={colors.textTertiary}
            value={amountStr}
            onChangeText={setAmountStr}
            keyboardType="decimal-pad"
            autoFocus
          />
        </View>

        <TextInput
          style={[styles.descriptionInput, { color: colors.text, backgroundColor: colors.surface, borderColor: colors.border }]}
          placeholder="What's this for?"
          placeholderTextColor={colors.textTertiary}
          value={description}
          onChangeText={setDescription}
        />

        <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>Category</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.catRow}>
          {CATEGORIES.map(c => (
            <Pressable
              key={c.value}
              style={[
                styles.catChip,
                {
                  backgroundColor: category === c.value ? colors.primary : colors.surface,
                  borderColor: category === c.value ? colors.primary : colors.border,
                },
              ]}
              onPress={() => setCategory(c.value)}
            >
              <Feather
                name={c.icon as any}
                size={14}
                color={category === c.value ? "#fff" : colors.textSecondary}
              />
              <Text
                style={[
                  styles.catLabel,
                  { color: category === c.value ? "#fff" : colors.text },
                ]}
              >
                {c.label}
              </Text>
            </Pressable>
          ))}
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
              <Text
                style={[
                  styles.paidByLabel,
                  { color: paidById === m.id ? "#fff" : colors.text },
                ]}
              >
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
              <Text
                style={[
                  styles.splitTypeLabel,
                  { color: splitType === t.value ? "#fff" : colors.text },
                ]}
              >
                {t.label}
              </Text>
              <Text
                style={[
                  styles.splitTypeDesc,
                  { color: splitType === t.value ? "rgba(255,255,255,0.7)" : colors.textSecondary },
                ]}
              >
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
                    {group.currency === "EUR" ? "€" : "$"}
                    {(split?.amount ?? 0).toFixed(2)}
                  </Text>
                ) : splitType === "exact" ? (
                  <TextInput
                    style={[styles.splitInput, { color: colors.text, borderColor: colors.border }]}
                    placeholder="0.00"
                    placeholderTextColor={colors.textTertiary}
                    value={exactAmounts[m.id] ?? ""}
                    onChangeText={v => setExactAmounts(prev => ({ ...prev, [m.id]: v }))}
                    keyboardType="decimal-pad"
                  />
                ) : (
                  <View style={styles.pctWrap}>
                    <TextInput
                      style={[styles.splitInput, { color: colors.text, borderColor: colors.border }]}
                      placeholder="0"
                      placeholderTextColor={colors.textTertiary}
                      value={percentages[m.id] ?? ""}
                      onChangeText={v => setPercentages(prev => ({ ...prev, [m.id]: v }))}
                      keyboardType="decimal-pad"
                    />
                    <Text style={[styles.pctLabel, { color: colors.textSecondary }]}>%</Text>
                  </View>
                )}
              </View>
            );
          })}
        </View>
      </ScrollView>
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
  descriptionInput: {
    height: 52,
    borderRadius: 14,
    paddingHorizontal: 16,
    fontSize: 16,
    fontFamily: "Inter_400Regular",
    borderWidth: 1,
  },
  sectionLabel: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
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
  splitInput: {
    width: 80,
    height: 36,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    textAlign: "right",
  },
  pctWrap: { flexDirection: "row", alignItems: "center", gap: 4 },
  pctLabel: { fontSize: 14, fontFamily: "Inter_500Medium" },
});
