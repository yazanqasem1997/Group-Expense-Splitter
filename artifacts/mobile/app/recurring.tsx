import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import React, { useRef, useState } from "react";
import {
  FlatList,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AmountText, formatAmount } from "@/components/AmountText";
import { Avatar } from "@/components/Avatar";
import { CategoryIcon } from "@/components/CategoryIcon";
import { EmptyState } from "@/components/EmptyState";
import {
  CURRENCY_SYMBOLS,
  RECURRING_FREQUENCY_DAYS,
  RECURRING_FREQUENCY_LABELS,
  RecurringExpense,
  RecurringFrequency,
  SplitType,
  useApp,
} from "@/context/AppContext";
import { showAlert } from "@/hooks/alertStore";
import { useTheme } from "@/hooks/useTheme";

const FREQUENCIES: RecurringFrequency[] = ["weekly", "biweekly", "monthly", "quarterly"];
const CATEGORIES = ["food", "transport", "accommodation", "entertainment", "utilities", "shopping", "health", "other"];

type GroupedSection = {
  groupId: string;
  groupName: string;
  groupEmoji: string;
  items: RecurringExpense[];
};

export default function RecurringScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const {
    recurringExpenses, addRecurringExpense, updateRecurringExpense, deleteRecurringExpense,
    checkAndAddRecurring, groups, members, currentUser, getMemberById, getGroupById,
  } = useApp();

  const listRef = useRef<FlatList>(null);

  const [showAddModal, setShowAddModal] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);
  const formSnapshot = useRef<string>("");

  const [form, setForm] = useState({
    groupId: groups[0]?.id ?? "",
    description: "",
    amount: "",
    paidById: currentUser.id,
    frequency: "monthly" as RecurringFrequency,
    category: "utilities",
    nextDueAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
  });

  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const activeCount = recurringExpenses.filter(r => r.isActive).length;
  const pausedCount = recurringExpenses.filter(r => !r.isActive).length;
  const dueSoonCount = recurringExpenses.filter(r => {
    const d = new Date(r.nextDueAt);
    return r.isActive && d <= new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
  }).length;

  const grouped: GroupedSection[] = groups
    .filter(g => !g.isArchived)
    .map(g => ({
      groupId: g.id,
      groupName: g.name,
      groupEmoji: g.emoji,
      items: recurringExpenses.filter(r => r.groupId === g.id),
    }))
    .filter(s => s.items.length > 0);

  const archivedSections: GroupedSection[] = groups
    .filter(g => g.isArchived)
    .map(g => ({
      groupId: g.id,
      groupName: g.name,
      groupEmoji: g.emoji,
      items: recurringExpenses.filter(r => r.groupId === g.id),
    }))
    .filter(s => s.items.length > 0);

  const allSections = [...grouped, ...archivedSections];

  function resetForm(groupId?: string) {
    setForm({
      groupId: groupId ?? groups[0]?.id ?? "",
      description: "",
      amount: "",
      paidById: currentUser.id,
      frequency: "monthly",
      category: "utilities",
      nextDueAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
    });
    setEditId(null);
  }

  function openAdd(defaultGroupId?: string) {
    resetForm(defaultGroupId);
    setFormError("");
    setSaving(false);
    const snap: {
      groupId: string;
      description: string;
      amount: string;
      paidById: string;
      frequency: RecurringFrequency;
      category: string;
      nextDueAt: string;
    } = {
      groupId: defaultGroupId ?? groups[0]?.id ?? "",
      description: "",
      amount: "",
      paidById: currentUser.id,
      frequency: "monthly",
      category: "utilities",
      nextDueAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
    };
    formSnapshot.current = JSON.stringify(snap);
    setForm(snap);
    setShowAddModal(true);
  }

  function openEdit(r: RecurringExpense) {
    const next = {
      groupId: r.groupId,
      description: r.description,
      amount: String(r.amount),
      paidById: r.paidById,
      frequency: r.frequency,
      category: r.category,
      nextDueAt: r.nextDueAt.split("T")[0],
    };
    setForm(next);
    setEditId(r.id);
    setFormError("");
    setSaving(false);
    formSnapshot.current = JSON.stringify(next);
    setShowAddModal(true);
  }

  function closeModal() {
    if (JSON.stringify(form) !== formSnapshot.current) {
      showAlert(
        "Discard changes?",
        editId
          ? "Your edits to this recurring expense haven't been saved."
          : "You've started setting up a recurring expense but haven't saved it.",
        [
          { text: "Keep editing", style: "cancel" },
          { text: "Discard", style: "destructive", onPress: () => setShowAddModal(false) },
        ]
      );
      return;
    }
    setShowAddModal(false);
  }

  function handleSave() {
    if (saving) return;
    if (!form.description.trim()) {
      setFormError("Add a description");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return;
    }
    const amount = parseFloat(form.amount);
    if (isNaN(amount) || amount <= 0) {
      setFormError("Enter an amount greater than 0");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return;
    }
    const group = getGroupById(form.groupId);
    if (!group) {
      setFormError("Pick a group");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return;
    }
    setFormError("");
    setSaving(true);

    const splits = group.memberIds.map(mid => ({
      memberId: mid,
      amount: mid === form.paidById
        ? amount - (amount / group.memberIds.length) * (group.memberIds.length - 1)
        : amount / group.memberIds.length,
      ...(mid === form.paidById ? { paid: amount } : {}),
    }));

    const nextDueAt = new Date(form.nextDueAt + "T00:00:00").toISOString();

    if (editId) {
      updateRecurringExpense(editId, {
        description: form.description.trim(),
        amount,
        groupId: form.groupId,
        paidById: form.paidById,
        frequency: form.frequency,
        category: form.category,
        nextDueAt,
        splits,
        currency: group.currency,
      });
    } else {
      addRecurringExpense({
        groupId: form.groupId,
        description: form.description.trim(),
        amount,
        currency: group.currency,
        paidById: form.paidById,
        splitType: "equal" as SplitType,
        splits,
        category: form.category,
        frequency: form.frequency,
        nextDueAt,
        isActive: true,
      });
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setShowAddModal(false);
    setSaving(false);
  }

  function handleDelete(id: string) {
    const target = recurringExpenses.find(r => r.id === id);
    showAlert(
      "Delete this schedule?",
      target
        ? `"${target.description}" will stop repeating and be removed. Expenses it already created stay.`
        : "This recurring expense will stop and be removed.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Delete", style: "destructive", onPress: () => deleteRecurringExpense(id) },
      ]
    );
  }

  function handleCheck() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    checkAndAddRecurring();
  }

  const selectedGroup = getGroupById(form.groupId);

  function renderRecurringCard(item: RecurringExpense) {
    const now = new Date();
    const due = new Date(item.nextDueAt);
    const daysUntil = Math.ceil((due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    const isOverdue = daysUntil <= 0;
    const isDueSoon = daysUntil <= 3 && daysUntil > 0;
    const payer = getMemberById(item.paidById);
    const freqLabel = item.frequency === "custom"
      ? `Every ${item.customDays ?? 30}d`
      : RECURRING_FREQUENCY_LABELS[item.frequency];

    return (
      <Pressable
        key={item.id}
        style={[styles.card, { backgroundColor: colors.surface }]}
        onPress={() => openEdit(item)}
      >
        <View style={styles.cardLeft}>
          <CategoryIcon category={item.category} size={44} />
        </View>
        <View style={styles.cardBody}>
          <View style={styles.cardTitleRow}>
            <Text style={[styles.cardTitle, { color: colors.text }]} numberOfLines={1}>
              {item.description}
            </Text>
            {!item.isActive && (
              <View style={[styles.pausedBadge, { backgroundColor: colors.border }]}>
                <Text style={[styles.pausedText, { color: colors.textTertiary }]}>Paused</Text>
              </View>
            )}
          </View>
          <View style={styles.cardMetaRow}>
            <Feather name="repeat" size={11} color={colors.textTertiary} />
            <Text style={[styles.cardMeta, { color: colors.textSecondary }]}>{freqLabel}</Text>
            {payer && (
              <>
                <Text style={[styles.dot, { color: colors.textTertiary }]}>·</Text>
                <Avatar name={payer.name} color={payer.avatarColor} size={14} imageUri={payer.photo} />
                <Text style={[styles.cardMeta, { color: colors.textSecondary }]}>
                  {payer.isCurrentUser ? "You" : payer.name.split(" ")[0]}
                </Text>
              </>
            )}
          </View>
          <View style={styles.cardDueRow}>
            <View style={[
              styles.duePill,
              { backgroundColor: isOverdue ? colors.dangerLight : isDueSoon ? colors.warningLight : colors.primaryLight },
            ]}>
              <Feather
                name="clock"
                size={11}
                color={isOverdue ? colors.danger : isDueSoon ? colors.warning : colors.primary}
              />
              <Text style={[
                styles.dueText,
                { color: isOverdue ? colors.danger : isDueSoon ? colors.warning : colors.primary },
              ]}>
                {isOverdue ? "Overdue" : daysUntil === 1 ? "Due tomorrow" : `Due in ${daysUntil}d`}
              </Text>
            </View>
          </View>
        </View>
        <View style={styles.cardRight}>
          <AmountText
            amount={item.amount}
            currency={item.currency}
            style={[styles.cardAmount, { color: colors.text }]}
          />
          <View style={styles.cardActions}>
            <Pressable
              style={[styles.actionBtn, { backgroundColor: item.isActive ? colors.warningLight : colors.successLight }]}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                updateRecurringExpense(item.id, { isActive: !item.isActive });
              }}
            >
              <Feather
                name={item.isActive ? "pause" : "play"}
                size={13}
                color={item.isActive ? colors.warning : colors.success}
              />
              <Text style={[styles.actionBtnText, { color: item.isActive ? colors.warning : colors.success }]}>
                {item.isActive ? "Pause" : "Resume"}
              </Text>
            </Pressable>
            <Pressable
              style={[styles.actionBtn, { backgroundColor: colors.dangerLight }]}
              onPress={() => handleDelete(item.id)}
            >
              <Feather name="trash-2" size={13} color={colors.danger} />
            </Pressable>
          </View>
        </View>
      </Pressable>
    );
  }

  type ListItem =
    | { type: "summary" }
    | { type: "section_header"; section: GroupedSection }
    | { type: "recurring_card"; item: RecurringExpense; sectionId: string }
    | { type: "section_add"; section: GroupedSection };

  const listData: ListItem[] = [];

  if (recurringExpenses.length > 0) {
    listData.push({ type: "summary" });
  }

  allSections.forEach(section => {
    listData.push({ type: "section_header", section });
    section.items.forEach(item => {
      listData.push({ type: "recurring_card", item, sectionId: section.groupId });
    });
    listData.push({ type: "section_add", section });
  });

  function renderListItem({ item }: { item: ListItem }) {
    if (item.type === "summary") {
      return (
        <View style={styles.summaryRow}>
          <View style={[styles.summaryCard, { backgroundColor: colors.surface }]}>
            <Text style={[styles.summaryNum, { color: colors.text }]}>{activeCount}</Text>
            <Text style={[styles.summaryLabel, { color: colors.textSecondary }]}>Active</Text>
          </View>
          <View style={[styles.summaryCard, { backgroundColor: colors.surface }]}>
            <Text style={[styles.summaryNum, { color: colors.text }]}>{pausedCount}</Text>
            <Text style={[styles.summaryLabel, { color: colors.textSecondary }]}>Paused</Text>
          </View>
          <View style={[styles.summaryCard, { backgroundColor: colors.surface }]}>
            <Text style={[styles.summaryNum, { color: colors.warning }]}>{dueSoonCount}</Text>
            <Text style={[styles.summaryLabel, { color: colors.textSecondary }]}>Due Soon</Text>
          </View>
        </View>
      );
    }

    if (item.type === "section_header") {
      const { section } = item;
      const activeInGroup = section.items.filter(r => r.isActive).length;
      return (
        <Pressable
          style={styles.sectionHeader}
          onPress={() => router.push({ pathname: "/group/[id]", params: { id: section.groupId } })}
        >
          <Text style={styles.sectionEmoji}>{section.groupEmoji}</Text>
          <Text style={[styles.sectionName, { color: colors.text }]} numberOfLines={1}>
            {section.groupName}
          </Text>
          <View style={[styles.sectionBadge, { backgroundColor: colors.primaryLight }]}>
            <Text style={[styles.sectionBadgeText, { color: colors.primary }]}>
              {activeInGroup}/{section.items.length} active
            </Text>
          </View>
          <Feather name="chevron-right" size={15} color={colors.textTertiary} />
        </Pressable>
      );
    }

    if (item.type === "recurring_card") {
      return renderRecurringCard(item.item);
    }

    if (item.type === "section_add") {
      return (
        <Pressable
          style={[styles.addInGroupBtn, { borderColor: colors.border }]}
          onPress={() => openAdd(item.section.groupId)}
        >
          <Feather name="plus" size={14} color={colors.primary} />
          <Text style={[styles.addInGroupText, { color: colors.primary }]}>
            Add recurring to {item.section.groupName}
          </Text>
        </Pressable>
      );
    }

    return null;
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header with back button */}
      <View style={[styles.header, { paddingTop: topPad + 8, backgroundColor: colors.headerBg }]}>
        <Pressable onPress={() => router.back()} hitSlop={10} style={styles.backBtn}>
          <Feather name="arrow-left" size={22} color={colors.text} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Recurring</Text>
        <View style={styles.headerRight}>
          <Pressable style={[styles.iconBtn, { backgroundColor: colors.successLight }]} onPress={handleCheck}>
            <Feather name="refresh-cw" size={16} color={colors.success} />
          </Pressable>
          <Pressable style={[styles.iconBtn, { backgroundColor: colors.primary }]} onPress={() => openAdd()}>
            <Feather name="plus" size={20} color="#fff" />
          </Pressable>
        </View>
      </View>

      <FlatList
        ref={listRef}
        data={listData}
        keyExtractor={(item, idx) => {
          if (item.type === "summary") return "summary";
          if (item.type === "section_header") return `sh-${item.section.groupId}`;
          if (item.type === "recurring_card") return `rc-${item.item.id}`;
          if (item.type === "section_add") return `sa-${item.section.groupId}`;
          return String(idx);
        }}
        contentContainerStyle={[
          styles.list,
          { paddingBottom: Platform.OS === "web" ? 134 : insets.bottom + 100 },
        ]}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <EmptyState
            icon="repeat"
            title="No recurring schedules"
            subtitle="Set up rent, subscriptions, or bills to auto-add them on schedule"
          />
        }
        renderItem={renderListItem}
      />

      {/* Add / Edit Modal */}
      <Modal visible={showAddModal} animationType="slide" presentationStyle="pageSheet" onRequestClose={closeModal}>
        <View style={[styles.modal, { backgroundColor: colors.background }]}>
          <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
            <Pressable onPress={closeModal} hitSlop={8}>
              <Feather name="x" size={22} color={colors.textSecondary} />
            </Pressable>
            <Text style={[styles.modalTitle, { color: colors.text }]}>
              {editId ? "Edit Recurring" : "New Recurring Expense"}
            </Text>
            <Pressable onPress={handleSave} disabled={saving} style={{ opacity: saving ? 0.5 : 1 }}>
              <Text style={[styles.modalSave, { color: colors.primary }]}>Save</Text>
            </Pressable>
          </View>

          <ScrollView style={styles.modalBody} showsVerticalScrollIndicator={false}>
            {formError ? (
              <View style={[styles.formErrorBox, { backgroundColor: colors.dangerLight }]}>
                <Feather name="alert-circle" size={14} color={colors.danger} />
                <Text style={[styles.formErrorText, { color: colors.danger }]}>{formError}</Text>
              </View>
            ) : null}

            <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Description</Text>
            <View style={[styles.fieldInput, { backgroundColor: colors.inputBg, borderColor: colors.border }]}>
              <TextInput
                style={[styles.fieldText, { color: colors.text }]}
                value={form.description}
                onChangeText={t => { setForm(f => ({ ...f, description: t })); if (formError) setFormError(""); }}
                placeholder="e.g. Monthly Rent"
                placeholderTextColor={colors.textTertiary}
                autoCapitalize="words"
              />
            </View>

            <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Amount</Text>
            <View style={[styles.fieldInput, { backgroundColor: colors.inputBg, borderColor: colors.border }]}>
              <Text style={[styles.currencySymbol, { color: colors.textTertiary }]}>
                {selectedGroup ? (CURRENCY_SYMBOLS[selectedGroup.currency] ?? selectedGroup.currency) : "$"}
              </Text>
              <TextInput
                style={[styles.fieldText, { color: colors.text }]}
                value={form.amount}
                onChangeText={t => { setForm(f => ({ ...f, amount: t })); if (formError) setFormError(""); }}
                placeholder="0.00"
                placeholderTextColor={colors.textTertiary}
                keyboardType="decimal-pad"
              />
            </View>

            <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Group</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
              {groups.filter(g => !g.isArchived).map(g => (
                <Pressable
                  key={g.id}
                  style={[styles.chip, {
                    backgroundColor: form.groupId === g.id ? colors.primary : colors.surface,
                    borderColor: form.groupId === g.id ? colors.primary : colors.border,
                  }]}
                  onPress={() => setForm(f => ({ ...f, groupId: g.id, paidById: currentUser.id }))}
                >
                  <Text style={styles.chipEmoji}>{g.emoji}</Text>
                  <Text style={[styles.chipText, { color: form.groupId === g.id ? "#fff" : colors.textSecondary }]}>
                    {g.name}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>

            <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Frequency</Text>
            <View style={styles.chipRow}>
              {FREQUENCIES.map(f => (
                <Pressable
                  key={f}
                  style={[styles.chip, {
                    backgroundColor: form.frequency === f ? colors.primary : colors.surface,
                    borderColor: form.frequency === f ? colors.primary : colors.border,
                  }]}
                  onPress={() => setForm(prev => ({ ...prev, frequency: f }))}
                >
                  <Text style={[styles.chipText, { color: form.frequency === f ? "#fff" : colors.textSecondary }]}>
                    {RECURRING_FREQUENCY_LABELS[f]}
                  </Text>
                </Pressable>
              ))}
            </View>

            <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Category</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
              {CATEGORIES.map(c => (
                <Pressable
                  key={c}
                  style={[styles.chip, {
                    backgroundColor: form.category === c ? colors.primary : colors.surface,
                    borderColor: form.category === c ? colors.primary : colors.border,
                  }]}
                  onPress={() => setForm(f => ({ ...f, category: c }))}
                >
                  <Text style={[styles.chipText, { color: form.category === c ? "#fff" : colors.textSecondary }]}>
                    {c.charAt(0).toUpperCase() + c.slice(1)}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>

            <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Paid by</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
              {(selectedGroup?.memberIds ?? [currentUser.id]).map(mid => {
                const m = members.find(m => m.id === mid);
                if (!m) return null;
                return (
                  <Pressable
                    key={mid}
                    style={[styles.memberChip, {
                      backgroundColor: form.paidById === mid ? colors.primary + "20" : colors.surface,
                      borderColor: form.paidById === mid ? colors.primary : colors.border,
                    }]}
                    onPress={() => setForm(f => ({ ...f, paidById: mid }))}
                  >
                    <Avatar name={m.name} color={m.avatarColor} size={24} />
                    <Text style={[styles.chipText, { color: form.paidById === mid ? colors.primary : colors.textSecondary }]}>
                      {m.isCurrentUser ? "You" : m.name.split(" ")[0]}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>

            <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Next due date</Text>
            <View style={[styles.fieldInput, { backgroundColor: colors.inputBg, borderColor: colors.border }]}>
              <Feather name="calendar" size={16} color={colors.textTertiary} />
              <TextInput
                style={[styles.fieldText, { color: colors.text }]}
                value={form.nextDueAt}
                onChangeText={t => setForm(f => ({ ...f, nextDueAt: t }))}
                placeholder="YYYY-MM-DD"
                placeholderTextColor={colors.textTertiary}
              />
            </View>

            <Pressable
              style={[styles.saveBtn, { backgroundColor: colors.primary, opacity: saving ? 0.6 : 1 }]}
              onPress={handleSave}
              disabled={saving}
            >
              <Text style={styles.saveBtnText}>{editId ? "Save Changes" : "Create Recurring Expense"}</Text>
            </Pressable>
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingBottom: 14, gap: 10,
    shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 2,
  },
  backBtn: {
    width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center",
  },
  headerTitle: { flex: 1, fontSize: 28, fontFamily: "Inter_700Bold" },
  headerRight: { flexDirection: "row", gap: 8 },
  iconBtn: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  list: { padding: 16, gap: 8 },
  summaryRow: { flexDirection: "row", gap: 10, marginBottom: 8 },
  summaryCard: {
    flex: 1, alignItems: "center", padding: 14, borderRadius: 14,
    shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 6, elevation: 2,
  },
  summaryNum: { fontSize: 24, fontFamily: "Inter_700Bold" },
  summaryLabel: { fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 2 },
  sectionHeader: {
    flexDirection: "row", alignItems: "center", gap: 8,
    paddingHorizontal: 4, paddingTop: 16, paddingBottom: 8,
  },
  sectionEmoji: { fontSize: 18 },
  sectionName: { flex: 1, fontSize: 16, fontFamily: "Inter_700Bold" },
  sectionBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
  sectionBadgeText: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  card: {
    flexDirection: "row", borderRadius: 16, padding: 14, gap: 12,
    shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 2,
  },
  cardLeft: {},
  cardBody: { flex: 1, gap: 3 },
  cardTitleRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  cardTitle: { flex: 1, fontSize: 15, fontFamily: "Inter_600SemiBold" },
  pausedBadge: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 8 },
  pausedText: { fontSize: 10, fontFamily: "Inter_500Medium" },
  cardMetaRow: { flexDirection: "row", alignItems: "center", gap: 5 },
  cardMeta: { fontSize: 12, fontFamily: "Inter_400Regular" },
  dot: { fontSize: 12 },
  cardDueRow: { flexDirection: "row", marginTop: 4 },
  duePill: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20 },
  dueText: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  cardRight: { alignItems: "flex-end", gap: 8 },
  cardAmount: { fontSize: 16, fontFamily: "Inter_700Bold" },
  cardActions: { flexDirection: "row", gap: 6, flexWrap: "wrap", justifyContent: "flex-end" },
  actionBtn: {
    flexDirection: "row", alignItems: "center", gap: 4,
    paddingHorizontal: 9, paddingVertical: 5, borderRadius: 8,
  },
  actionBtnText: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  addInGroupBtn: {
    flexDirection: "row", alignItems: "center", gap: 8,
    paddingVertical: 10, paddingHorizontal: 14, borderRadius: 12, borderWidth: 1,
    borderStyle: "dashed", marginBottom: 6,
  },
  addInGroupText: { fontSize: 13, fontFamily: "Inter_500Medium" },
  formErrorBox: {
    flexDirection: "row", alignItems: "center", gap: 8,
    paddingHorizontal: 12, paddingVertical: 10, borderRadius: 10, marginBottom: 12,
  },
  formErrorText: { flex: 1, fontSize: 13, fontFamily: "Inter_500Medium" },
  modal: { flex: 1 },
  modalHeader: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 20, paddingTop: 20, paddingBottom: 16, borderBottomWidth: 1,
  },
  modalTitle: { fontSize: 17, fontFamily: "Inter_700Bold" },
  modalSave: { fontSize: 16, fontFamily: "Inter_600SemiBold" },
  modalBody: { flex: 1, padding: 20 },
  fieldLabel: { fontSize: 12, fontFamily: "Inter_600SemiBold", textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 8, marginTop: 18 },
  fieldInput: {
    flexDirection: "row", alignItems: "center", gap: 10,
    height: 48, borderRadius: 12, borderWidth: 1, paddingHorizontal: 14,
  },
  fieldText: { flex: 1, fontSize: 15, fontFamily: "Inter_400Regular" },
  currencySymbol: { fontSize: 15, fontFamily: "Inter_500Medium" },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, borderWidth: 1 },
  chipEmoji: { fontSize: 14 },
  chipText: { fontSize: 13, fontFamily: "Inter_500Medium" },
  memberChip: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, borderWidth: 1 },
  saveBtn: { marginTop: 24, paddingVertical: 16, borderRadius: 16, alignItems: "center", marginBottom: 40 },
  saveBtnText: { fontSize: 16, fontFamily: "Inter_600SemiBold", color: "#fff" },
});
