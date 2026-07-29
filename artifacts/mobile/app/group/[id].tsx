import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router, useLocalSearchParams } from "expo-router";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import { exportGroupToPdf } from "@/utils/exportPdf";
import React, { useCallback, useMemo, useRef, useState } from "react";
import {

  FlatList,
  KeyboardAvoidingView,
  Linking,
  Modal,
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
import { DatePickerField } from "@/components/DatePickerField";
import { MemberProfileSheet } from "@/components/MemberProfileSheet";
import { Avatar } from "@/components/Avatar";
import { CategoryIcon } from "@/components/CategoryIcon";
import { EmptyState } from "@/components/EmptyState";
import { ChartSeries, LineChartSvg } from "@/components/LineChartSvg";
import {
  CURRENCY_SYMBOLS, Expense, GroupMessage, NudgeTone, RecurringExpense, RecurringFrequency,
  RECURRING_FREQUENCY_DAYS, RECURRING_FREQUENCY_LABELS, Settlement,
  computeNextOccurrences, useApp,
} from "@/context/AppContext";
import { showAlert } from "@/hooks/alertStore";
import { useTheme } from "@/hooks/useTheme";
import { timeAgo } from "@/utils/format";

type Tab = "expenses" | "balances" | "chat" | "charts";

type FeedItem =
  | { type: "expense"; id: string; createdAt: string; data: Expense }
  | { type: "settlement"; id: string; createdAt: string; data: Settlement };

export default function GroupDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const {
    getGroupById, getMemberById, getGroupExpenses, getGroupSettlements,
    getGroupBalances, getGroupPendingInvites, sendGroupInvite,
    currentUser, deleteGroup, deleteExpense, deleteSettlement,
    addSettlement, addSettlements, archiveGroup, unarchiveGroup,
    endGroup, assignAdmin, removeAdmin,
    addGroupMessage, getGroupMessages, updateGroup,
    checkAndAddRecurring, fetchExchangeRates, checkAndSendGroupReminders,
    recurringExpenses, updateRecurringExpense, deleteRecurringExpense,
  } = useApp();

  const [tab, setTab] = useState<Tab>("expenses");
  const [recurringCollapsed, setRecurringCollapsed] = useState(false);
  const [expensesCollapsed, setExpensesCollapsed] = useState(false);
  const [showInviteForm, setShowInviteForm] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteName, setInviteName] = useState("");
  const [inviteError, setInviteError] = useState("");
  const [inviteSent, setInviteSent] = useState(false);
  const emailRef = useRef<TextInput>(null);
  const chatInputRef = useRef<TextInput>(null);
  const { width } = useWindowDimensions();

  const [chatText, setChatText] = useState("");

  const [settleModal, setSettleModal] = useState<{
    fromId: string; toId: string; fullAmount: number;
  } | null>(null);
  const [settleAmount, setSettleAmount] = useState("");
  const [showSettleAllConfirm, setShowSettleAllConfirm] = useState(false);

  const [refreshing, setRefreshing] = useState(false);

  const [profileMemberId, setProfileMemberId] = useState<string | null>(null);

  // Trip dates modal state
  const [showTripDatesModal, setShowTripDatesModal] = useState(false);
  const [tripStartInput, setTripStartInput] = useState(""); // ISO YYYY-MM-DD
  const [tripEndInput, setTripEndInput] = useState("");   // ISO YYYY-MM-DD
  const [tripStartReminderInput, setTripStartReminderInput] = useState("2");
  const [settleUpReminderInput, setSettleUpReminderInput] = useState("7");
  const [activeCalendar, setActiveCalendar] = useState<"start" | "end" | null>(null);

  // Nudge campaign state
  const [nudgeActive, setNudgeActive] = useState(false);
  const [nudgeStartDays, setNudgeStartDays] = useState("3");
  const [nudgeFreqDays, setNudgeFreqDays] = useState("7");
  const [nudgeMaxNudges, setNudgeMaxNudges] = useState("5");
  const [nudgeTone, setNudgeTone] = useState<NudgeTone>("friendly");
  // Reminder channel state
  const [reminderChannel, setReminderChannel] = useState<"push" | "email" | "both">("push");

  // Recurring expense management
  const [editingRecurring, setEditingRecurring] = useState<RecurringExpense | null>(null);
  const [editRecurDesc, setEditRecurDesc] = useState("");
  const [editRecurAmount, setEditRecurAmount] = useState("");
  const [editRecurFreq, setEditRecurFreq] = useState<RecurringFrequency>("monthly");
  const [editRecurCustomDays, setEditRecurCustomDays] = useState("30");
  const [editRecurDayOfWeek, setEditRecurDayOfWeek] = useState<number | undefined>(undefined);
  const [editRecurTimeOfDay, setEditRecurTimeOfDay] = useState("09:00");
  const [editRecurEndType, setEditRecurEndType] = useState<"never" | "count" | "date">("never");
  const [editRecurEndCount, setEditRecurEndCount] = useState("10");
  const [editRecurEndDate, setEditRecurEndDate] = useState("");

  const group = getGroupById(id);
  const groupExpenses = getGroupExpenses(id);
  const groupSettlements = getGroupSettlements(id);
  const debts = useMemo(() => getGroupBalances(id), [id, getGroupBalances]);
  const pendingInvites = useMemo(() => getGroupPendingInvites(id), [id, getGroupPendingInvites]);
  const messages = useMemo(() => getGroupMessages(id), [id, getGroupMessages]);

  const groupRecurring = useMemo(
    () => recurringExpenses.filter(r => r.groupId === id),
    [recurringExpenses, id]
  );

  const feedItems = useMemo<FeedItem[]>(() => {
    const expItems: FeedItem[] = groupExpenses.map(e => ({ type: "expense", id: e.id, createdAt: e.createdAt, data: e }));
    const settItems: FeedItem[] = groupSettlements.map(s => ({ type: "settlement", id: s.id, createdAt: s.createdAt, data: s }));
    return [...expItems, ...settItems].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [groupExpenses, groupSettlements]);

  const topPad = Platform.OS === "web" ? 67 : insets.top;

  async function handleSendInvite() {
    const email = inviteEmail.trim();
    if (!email) { setInviteError("Email is required"); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { setInviteError("Enter a valid email"); return; }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    sendGroupInvite(id, email, inviteName.trim() || undefined);

    const recipientName = inviteName.trim() || "there";
    const subject = encodeURIComponent(`Join me on SplitEasy — "${group?.name}"`);
    const body = encodeURIComponent(
      `Hi ${recipientName},\n\n${currentUser.name} has invited you to "${group?.name}" on SplitEasy.\n\n` +
      `Open SplitEasy and accept the invite from ${currentUser.name}!\n\n— ${currentUser.name}`
    );
    const mailtoUrl = `mailto:${email}?subject=${subject}&body=${body}`;
    try {
      await Linking.openURL(mailtoUrl);
    } catch {
      showAlert(
        "Couldn't open mail app",
        `Send a manual invite to:\n${email}`,
        [{ text: "OK" }]
      );
    }

    setInviteEmail(""); setInviteName(""); setInviteError("");
    setInviteSent(true);
    setTimeout(() => { setInviteSent(false); setShowInviteForm(false); }, 2000);
  }

  const chartSeries: ChartSeries[] = useMemo(() => {
    if (!group || groupExpenses.length === 0) return [];
    const sorted = [...groupExpenses].sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    );
    return group.memberIds.map(memberId => {
      const member = getMemberById(memberId);
      let cumulative = 0;
      const points: { timestamp: number; value: number }[] = [];
      sorted.forEach(expense => {
        if (expense.paidById === memberId) cumulative += expense.amount;
        points.push({ timestamp: new Date(expense.createdAt).getTime(), value: cumulative });
      });
      return {
        label: member?.isCurrentUser ? "You" : (member?.name?.split(" ")[0] ?? "?"),
        color: member?.avatarColor ?? "#ccc",
        points,
      };
    }).filter(s => s.points.some(p => p.value > 0));
  }, [group, groupExpenses, getMemberById]);

  if (!group) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <Text style={{ color: colors.text }}>Group not found</Text>
      </View>
    );
  }

  const totalExpenses = groupExpenses.reduce((s, e) => s + e.amount, 0);
  const myDebts = debts.filter(d => d.fromId === currentUser.id);
  const myCredits = debts.filter(d => d.toId === currentUser.id);

  async function handleRefresh() {
    setRefreshing(true);
    checkAndAddRecurring();
    await fetchExchangeRates().catch(() => {});
    setRefreshing(false);
  }

  function handleGroupOptions() {
    if (!group) return;
    const archiveLabel = group.isArchived ? "Unarchive Group" : "Archive Group";
    const tripDatesBtn = group.type === "trip"
      ? [{ text: "Trip Dates & Reminders", onPress: openTripDatesModal }]
      : [];
    const isAdmin = (group.adminIds ?? []).includes(currentUser.id);
    const endBtn = !group.isEnded && isAdmin
      ? [{
          text: "End Group Period",
          onPress: () => {
            showAlert(
              "End Group Period",
              "This marks the group as ended. Members can still settle up, but no new expenses should be added.",
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
    showAlert(group.name, "Group options", [
      {
        text: "Add Expense",
        onPress: () => router.push({ pathname: "/expense/new", params: { groupId: id } }),
      },
      {
        text: "QR Invite Code",
        onPress: () => router.push({ pathname: "/group/qr/[id]", params: { id } }),
      },
      {
        text: "Export to Excel",
        onPress: handleExport,
      },
      {
        text: "Export as PDF",
        onPress: handleExportPdf,
      },
      ...tripDatesBtn,
      ...endBtn,
      {
        text: archiveLabel,
        onPress: () => {
          if (group.isArchived) unarchiveGroup(id);
          else archiveGroup(id);
        },
      },
      {
        text: "Delete Group",
        style: "destructive",
        onPress: handleDeleteGroup,
      },
      { text: "Cancel", style: "cancel" },
    ]);
  }

  function openTripDatesModal() {
    setTripStartInput(group?.startDate ?? "");
    setTripEndInput(group?.endDate ?? "");
    setTripStartReminderInput(String(group?.tripStartReminderDays ?? 2));
    setSettleUpReminderInput(String(group?.settleUpReminderDays ?? 7));
    setReminderChannel(group?.reminderChannel ?? "push");
    const campaign = group?.nudgeCampaign;
    setNudgeActive(campaign?.isActive ?? false);
    setNudgeStartDays(String(campaign?.startDaysAfterEnd ?? 3));
    setNudgeFreqDays(String(campaign?.frequencyDays ?? 7));
    setNudgeMaxNudges(String(campaign?.maxNudges ?? 5));
    setNudgeTone(campaign?.tone ?? "friendly");
    setActiveCalendar(null);
    setShowTripDatesModal(true);
  }

  function saveTripDates() {
    if (!group) return;
    updateGroup(id, {
      startDate: tripStartInput.trim() || undefined,
      endDate: tripEndInput.trim() || undefined,
      tripStartReminderDays: parseInt(tripStartReminderInput) || undefined,
      settleUpReminderDays: parseInt(settleUpReminderInput) || undefined,
      reminderChannel,
      nudgeCampaign: nudgeActive ? {
        isActive: true,
        startDaysAfterEnd: parseInt(nudgeStartDays) || 3,
        frequencyDays: parseInt(nudgeFreqDays) || 7,
        maxNudges: parseInt(nudgeMaxNudges) || 5,
        nudgesSent: group.nudgeCampaign?.nudgesSent ?? 0,
        tone: nudgeTone,
        lastNudgeAt: group.nudgeCampaign?.lastNudgeAt,
      } : undefined,
    });
    setShowTripDatesModal(false);
  }

  async function handleExportPdf() {
    if (!group) return;
    try {
      const groupMembers = group.memberIds
        .map(mid => getMemberById(mid))
        .filter((m): m is NonNullable<typeof m> => m != null);
      await exportGroupToPdf({
        group,
        expenses: groupExpenses,
        settlements: groupSettlements,
        members: groupMembers,
        getMemberById,
        debts,
      });
    } catch (err) {
      showAlert("PDF export failed", String(err));
    }
  }

  function handleDeleteGroup() {
    showAlert("Delete Group", "This will delete all expenses in this group. Continue?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => { deleteGroup(id); router.back(); },
      },
    ]);
  }

  async function handleExport() {
    if (!group) return;
    try {
      const XLSX = await import("xlsx");
      const expenseHeader = ["Date","Description","Amount","Currency","Paid By","Category","Involved","Per-Person Shares"];
      const expenseRows = groupExpenses.map(e => {
        const payer = getMemberById(e.paidById);
        const shares = (e.splits ?? []).map(s => `${getMemberById(s.memberId)?.name ?? "?"}: ${e.currency} ${s.amount.toFixed(2)}`).join("; ");
        const involved = (e.splits ?? []).map(s => getMemberById(s.memberId)?.name ?? "?").join(", ");
        return [new Date(e.createdAt).toLocaleDateString("en-GB"), e.description, e.amount, e.currency, payer?.name ?? "?", e.category ?? "", involved, shares];
      });
      const settlementHeader = ["Date","From","To","Amount","Currency"];
      const settlementRows = groupSettlements.map(s => [
        new Date(s.createdAt).toLocaleDateString("en-GB"),
        getMemberById(s.fromId)?.name ?? "?",
        getMemberById(s.toId)?.name ?? "?",
        s.amount, s.currency,
      ]);
      const auditHeader = ["Date / Time","Expense","Changed By","Action","Field","Old Value","New Value"];
      const auditRows: (string | number)[][] = [];
      groupExpenses.forEach(e => {
        (e.auditLog ?? []).forEach(entry => {
          const ts = new Date(entry.changedAt).toLocaleString("en-GB");
          const changer = getMemberById(entry.changedBy)?.name ?? "?";
          if (entry.fieldChanges?.length) {
            entry.fieldChanges.forEach(fc => { auditRows.push([ts, e.description, changer, entry.action, fc.field, fc.oldValue, fc.newValue]); });
          } else {
            auditRows.push([ts, e.description, changer, entry.action, "—","—","—"]);
          }
        });
      });
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([expenseHeader, ...expenseRows]), "Expenses");
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([settlementHeader, ...settlementRows]), "Settlements");
      if (auditRows.length > 0) XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([auditHeader, ...auditRows]), "Audit Log");
      const base64 = XLSX.write(wb, { type: "base64", bookType: "xlsx" });
      const slug = group.name.replace(/[^a-z0-9]/gi, "_").toLowerCase();
      const uri = `${FileSystem.cacheDirectory}${slug}_expenses.xlsx`;
      await FileSystem.writeAsStringAsync(uri, base64, { encoding: FileSystem.EncodingType.Base64 });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, {
          mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          dialogTitle: `Export — ${group.name}`,
          UTI: "com.microsoft.excel.xlsx",
        });
      } else {
        showAlert("Export", "Sharing is not available on this device.");
      }
    } catch (err) {
      showAlert("Export failed", String(err));
    }
  }

  function handleSettleAll() {
    if (!group || debts.length === 0) return;
    setShowSettleAllConfirm(true);
  }

  function confirmSettleAll() {
    if (!group) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
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
  }

  function openSettleModal(fromId: string, toId: string, amount: number) {
    setSettleAmount(amount.toFixed(2));
    setSettleModal({ fromId, toId, fullAmount: amount });
  }

  function confirmSettle() {
    if (!settleModal || !group) return;
    const amount = parseFloat(settleAmount);
    if (isNaN(amount) || amount <= 0) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    addSettlement({
      groupId: id,
      fromId: settleModal.fromId,
      toId: settleModal.toId,
      amount: Math.min(amount, settleModal.fullAmount),
      currency: group.currency,
    });
    setSettleModal(null);
  }

  async function handleSendReminder(fromId: string, toId: string, amount: number) {
    if (!group) return;
    const fromMember = getMemberById(fromId);
    const toMember = getMemberById(toId);
    const isMyDebt = fromId === currentUser.id;
    const recipientEmail = isMyDebt ? toMember?.email : fromMember?.email;

    if (!recipientEmail) {
      showAlert("No email", "This member doesn't have an email address on file.");
      return;
    }

    const subject = encodeURIComponent(`Reminder: ${group.name} balance`);
    const body = encodeURIComponent(
      `Hi ${isMyDebt ? toMember?.name : fromMember?.name},\n\n` +
      `Just a friendly reminder about the ${formatAmount(amount, group.currency)} balance in our "${group.name}" group on SplitEasy.\n\n` +
      `${isMyDebt ? "I'll send it over soon!" : "Could you settle this when you get a chance? Thanks!"}\n\n` +
      `— ${currentUser.name}`
    );
    const url = `mailto:${recipientEmail}?subject=${subject}&body=${body}`;
    try {
      await Linking.openURL(url);
    } catch {
      showAlert("Can't open mail app", `Send a reminder to ${recipientEmail}`);
    }
  }

  function openEditRecurring(r: RecurringExpense) {
    setEditingRecurring(r);
    setEditRecurDesc(r.description);
    setEditRecurAmount(String(r.amount));
    setEditRecurFreq(r.frequency);
    setEditRecurCustomDays(String(r.customDays ?? 30));
    setEditRecurDayOfWeek(r.dayOfWeek);
    setEditRecurTimeOfDay(r.timeOfDay ?? "09:00");
    setEditRecurEndType(r.endType ?? "never");
    setEditRecurEndCount(String(r.endCount ?? 10));
    setEditRecurEndDate(r.endDate ?? "");
  }

  function saveEditRecurring() {
    if (!editingRecurring) return;
    const amount = parseFloat(editRecurAmount);
    if (!editRecurDesc.trim() || isNaN(amount) || amount <= 0) return;
    const days = editRecurFreq === "custom"
      ? Math.max(1, parseInt(editRecurCustomDays) || 30)
      : RECURRING_FREQUENCY_DAYS[editRecurFreq];
    // Recalculate nextDueAt from today if schedule changed
    const nextDueAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
    updateRecurringExpense(editingRecurring.id, {
      description: editRecurDesc.trim(),
      amount,
      frequency: editRecurFreq,
      ...(editRecurFreq === "custom" ? { customDays: parseInt(editRecurCustomDays) || 30 } : {}),
      dayOfWeek: editRecurDayOfWeek,
      timeOfDay: editRecurTimeOfDay,
      endType: editRecurEndType,
      endCount: editRecurEndType === "count" ? (parseInt(editRecurEndCount) || 10) : undefined,
      endDate: editRecurEndType === "date" && editRecurEndDate ? editRecurEndDate : undefined,
      nextDueAt,
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
      <View style={[recurStyles.section, { backgroundColor: colors.surface }]}>
        <Pressable
          style={recurStyles.sectionHeader}
          onPress={() => { setRecurringCollapsed(v => !v); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
        >
          <Feather name="repeat" size={15} color={colors.primary} />
          <Text style={[recurStyles.sectionTitle, { color: colors.text }]}>Scheduled</Text>
          <View style={[recurStyles.countBadge, { backgroundColor: colors.primaryLight }]}>
            <Text style={[recurStyles.countBadgeText, { color: colors.primary }]}>{groupRecurring.length}</Text>
          </View>
          <Feather
            name={recurringCollapsed ? "chevron-right" : "chevron-down"}
            size={16}
            color={colors.textTertiary}
          />
        </Pressable>
        {!recurringCollapsed && groupRecurring.map(r => {
          const status = getRecurringStatus(r);
          const freqLabel = r.frequency === "custom"
            ? `Every ${r.customDays ?? 30}d`
            : RECURRING_FREQUENCY_LABELS[r.frequency];
          const nextDate = new Date(r.nextDueAt);
          const nextLabel = nextDate.toLocaleDateString("en", { month: "short", day: "numeric" });
          return (
            <View key={r.id} style={[recurStyles.card, { borderTopColor: colors.border }]}>
              <View style={recurStyles.cardMain}>
                <View style={[recurStyles.iconBox, { backgroundColor: colors.primaryLight }]}>
                  <Feather name="repeat" size={16} color={colors.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[recurStyles.cardDesc, { color: colors.text }]} numberOfLines={1}>{r.description}</Text>
                  <View style={recurStyles.cardMeta}>
                    <View style={[recurStyles.freqPill, { backgroundColor: colors.border }]}>
                      <Text style={[recurStyles.freqPillText, { color: colors.textSecondary }]}>{freqLabel}</Text>
                    </View>
                    <Text style={[recurStyles.metaDot, { color: colors.textTertiary }]}>·</Text>
                    <Text style={[recurStyles.metaText, { color: colors.textSecondary }]}>Next {nextLabel}</Text>
                    <Text style={[recurStyles.metaDot, { color: colors.textTertiary }]}>·</Text>
                    <View style={[recurStyles.statusDot, { backgroundColor: status.color }]} />
                    <Text style={[recurStyles.metaText, { color: status.color }]}>{status.label}</Text>
                  </View>
                </View>
                <Text style={[recurStyles.cardAmount, { color: colors.text }]}>
                  {(group?.currency ? (CURRENCY_SYMBOLS[group.currency] ?? "") : "") + r.amount.toFixed(2)}
                </Text>
              </View>
              <View style={recurStyles.cardActions}>
                <Pressable
                  style={[recurStyles.actionBtn, { backgroundColor: colors.primaryLight }]}
                  onPress={() => { openEditRecurring(r); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
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
                    showAlert(r.description, "Delete this recurring schedule?", [
                      { text: "Cancel", style: "cancel" },
                      {
                        text: "Delete",
                        style: "destructive",
                        onPress: () => deleteRecurringExpense(r.id),
                      },
                    ]);
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
    chatInputRef.current?.blur();
  }

  function renderExpenseItem(expense: Expense) {
    const payer = getMemberById(expense.paidById);
    const youPaid = expense.paidById === currentUser.id;
    const myShare = expense.splits.find(s => s.memberId === currentUser.id);
    const isInvolved = youPaid || !!myShare;
    const netForMe = isInvolved
      ? (youPaid ? expense.amount - (myShare?.amount ?? 0) : -(myShare!.amount))
      : null;
    const reactionCount = Object.values(expense.reactions ?? {}).reduce((s, ids) => s + ids.length, 0);
    const commentCount = (expense.comments ?? []).length;

    return (
      <Pressable
        style={({ pressed }) => [
          styles.expenseRow,
          { backgroundColor: colors.surface, opacity: pressed ? 0.92 : 1 },
        ]}
        onPress={() => router.push({ pathname: "/expense/[id]", params: { id: expense.id } })}
        onLongPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          showAlert(expense.description, "What would you like to do?", [
            {
              text: "Edit",
              onPress: () =>
                router.push({ pathname: "/expense/new", params: { expenseId: expense.id, groupId: expense.groupId } }),
            },
            {
              text: "Delete",
              style: "destructive",
              onPress: () =>
                showAlert("Delete expense?", `"${expense.description}" will be removed for everyone.`, [
                  { text: "Cancel", style: "cancel" },
                  { text: "Delete", style: "destructive", onPress: () => deleteExpense(expense.id) },
                ]),
            },
            { text: "Cancel", style: "cancel" },
          ]);
        }}
      >
        <CategoryIcon category={expense.category} size={40} />
        <View style={styles.expenseBody}>
          <Text style={[styles.expenseName, { color: colors.text }]} numberOfLines={1}>
            {expense.description}
          </Text>
          <View style={styles.expenseMetaRow}>
            {!youPaid && payer && (
              <Avatar name={payer.name} color={payer.avatarColor} size={14} imageUri={payer.photo} style={{ marginRight: 4 }} />
            )}
            <Text style={[styles.expenseMeta, { color: colors.textSecondary }]}>
              {youPaid ? "You" : payer?.name ?? "Someone"} paid · {timeAgo(expense.createdAt)}
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
            <View style={styles.notInvolvedPill}>
              <Feather name="eye-off" size={10} color={colors.textTertiary} />
              <Text style={[styles.notInvolvedText, { color: colors.textTertiary }]}>Not involved</Text>
            </View>
          )}
        </View>
        <View style={styles.expenseRight}>
          <AmountText amount={expense.amount} currency={group!.currency} style={[styles.expenseTotal, { color: colors.text }]} />
          {isInvolved && netForMe !== null && (
            <Text style={[styles.expenseNet, { color: netForMe >= 0 ? colors.positive : colors.negative }]}>
              {netForMe >= 0 ? "+" : "-"}{formatAmount(Math.abs(netForMe), group!.currency)}
            </Text>
          )}
        </View>
      </Pressable>
    );
  }

  function renderSettlementItem(settlement: Settlement) {
    const from = getMemberById(settlement.fromId);
    const to = getMemberById(settlement.toId);
    const isMe = settlement.fromId === currentUser.id || settlement.toId === currentUser.id;

    return (
      <Pressable
        style={({ pressed }) => [
          styles.expenseRow,
          { backgroundColor: isMe ? colors.tealTint : colors.surface, opacity: pressed ? 0.92 : 1 },
        ]}
        onLongPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          showAlert("Settlement", "Remove this settlement record?", [
            {
              text: "Delete",
              style: "destructive",
              onPress: () =>
                showAlert("Delete settlement?", "This will restore the outstanding balance.", [
                  { text: "Cancel", style: "cancel" },
                  { text: "Delete", style: "destructive", onPress: () => deleteSettlement(settlement.id) },
                ]),
            },
            { text: "Cancel", style: "cancel" },
          ]);
        }}
      >
        <View style={[styles.settleFeedIcon, { backgroundColor: colors.tealTint }]}>
          <Feather name="check-circle" size={20} color={colors.teal} />
        </View>
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

  function renderBalances() {
    if (debts.length === 0) {
      return (
        <View style={styles.settledCard}>
          <View style={[styles.settledIcon, { backgroundColor: colors.successLight }]}>
            <Feather name="check-circle" size={28} color={colors.success} />
          </View>
          <Text style={[styles.settledTitle, { color: colors.text }]}>All settled up!</Text>
          <Text style={[styles.settledSub, { color: colors.textSecondary }]}>No outstanding balances</Text>
        </View>
      );
    }

    return (
      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={colors.primary}
            colors={[colors.primary]}
          />
        }
      >
        {debts.map(debt => {
          const from = getMemberById(debt.fromId);
          const to = getMemberById(debt.toId);
          const isMyDebt = debt.fromId === currentUser.id;
          const isMyCredit = debt.toId === currentUser.id;

          return (
            <View key={`${debt.fromId}_${debt.toId}`} style={[styles.debtCard, { backgroundColor: colors.surface }]}>
              <Pressable
                onPress={() => setProfileMemberId(isMyDebt ? debt.toId : debt.fromId)}
                style={styles.debtAvatarNamePressable}
              >
                <Avatar name={from?.name ?? ""} color={from?.avatarColor ?? "#ccc"} size={40} imageUri={from?.photo} />
              </Pressable>
              <Pressable
                style={styles.debtBody}
                onPress={() => setProfileMemberId(isMyDebt ? debt.toId : debt.fromId)}
              >
                <Text style={[styles.debtText, { color: colors.text }]}>
                  <Text style={{ fontFamily: "Inter_600SemiBold" }}>{isMyDebt ? "You" : from?.name}</Text>
                  {" owes "}
                  <Text style={{ fontFamily: "Inter_600SemiBold" }}>{isMyCredit ? "you" : to?.name}</Text>
                </Text>
                <AmountText
                  amount={debt.amount}
                  currency={group!.currency}
                  style={[styles.debtAmount, { color: isMyCredit ? colors.positive : isMyDebt ? colors.negative : colors.text }]}
                />
              </Pressable>
              <View style={styles.debtActions}>
                {(isMyDebt || isMyCredit) && (
                  <>
                    <Pressable
                      style={[styles.reminderBtn, { backgroundColor: colors.warningLight }]}
                      onPress={() => handleSendReminder(debt.fromId, debt.toId, debt.amount)}
                    >
                      <Feather name="bell" size={13} color={colors.warning} />
                    </Pressable>
                    <Pressable
                      style={[styles.settleBtn, { backgroundColor: colors.primary }]}
                      onPress={() => openSettleModal(debt.fromId, debt.toId, debt.amount)}
                    >
                      <Text style={styles.settleBtnText}>Settle</Text>
                    </Pressable>
                  </>
                )}
              </View>
            </View>
          );
        })}
      </ScrollView>
    );
  }

  function renderChat() {
    return (
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={topPad + 120}
      >
        <FlatList
          data={messages}
          keyExtractor={m => m.id}
          contentContainerStyle={styles.chatList}
          showsVerticalScrollIndicator={false}
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
                <View style={styles.chatBubbleWrap}>
                  {!isMe && (
                    <Text style={[styles.chatAuthor, { color: colors.primary }]}>
                      {author?.name ?? "Unknown"}
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
                  <Text style={[styles.chatTime, { color: colors.textTertiary, alignSelf: isMe ? "flex-end" : "flex-start" }]}>
                    {timeAgo(item.createdAt)}
                  </Text>
                </View>
              </View>
            );
          }}
        />
        <View style={[styles.chatInputBar, { backgroundColor: colors.surface, borderTopColor: colors.border }]}>
          <Avatar name={currentUser.name} color={currentUser.avatarColor} size={30} />
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
            style={[styles.chatSendBtn, { backgroundColor: chatText.trim() ? colors.primary : colors.border }]}
            onPress={handleSendChat}
          >
            <Feather name="send" size={16} color={chatText.trim() ? "#fff" : colors.textTertiary} />
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topPad + 8, backgroundColor: colors.headerBg }]}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Feather name="arrow-left" size={24} color={colors.text} />
        </Pressable>
        <View style={styles.headerCenter}>
          <Text style={styles.groupEmoji}>{group.emoji}</Text>
          <View style={{ flex: 1 }}>
            <Text style={[styles.groupName, { color: colors.text }]} numberOfLines={1}>{group.name}</Text>
            {group.isArchived && (
              <Text style={[styles.archivedBadge, { color: colors.warning }]}>Archived</Text>
            )}
          </View>
        </View>
        {debts.length > 0 && (
          <Pressable
            style={[styles.settleAllBtn, { backgroundColor: colors.teal }]}
            onPress={handleSettleAll}
          >
            <Text style={styles.settleAllBtnText}>Settle Up</Text>
          </Pressable>
        )}
        <Pressable
          onPress={handleExport}
          style={{ padding: 4, marginRight: 2 }}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Feather name="download" size={22} color={colors.text} />
        </Pressable>
        <Pressable onPress={handleGroupOptions}>
          <Feather name="more-horizontal" size={24} color={colors.text} />
        </Pressable>
      </View>

      <View style={[styles.statsBar, { backgroundColor: colors.surface }]}>
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
        <View style={[styles.statDivider, { backgroundColor: colors.border }]} />
        <View style={styles.statItem}>
          <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Chat</Text>
          <Text style={[styles.statValue, { color: colors.text }]}>{messages.length}</Text>
        </View>
      </View>

      {group.type === "trip" && (
        <Pressable
          style={[styles.tripDatesBar, { backgroundColor: colors.primaryLight }]}
          onPress={openTripDatesModal}
        >
          <Feather name="calendar" size={15} color={colors.primary} />
          {group.startDate || group.endDate ? (
            <Text style={[styles.tripDatesText, { color: colors.primary }]}>
              {group.startDate
                ? group.startDate.split("-").reverse().join("-")
                : "?"}{" → "}{group.endDate
                ? group.endDate.split("-").reverse().join("-")
                : "?"}
            </Text>
          ) : (
            <Text style={[styles.tripDatesText, { color: colors.primary }]}>Set trip dates & reminders</Text>
          )}
          <Feather name="chevron-right" size={13} color={colors.primary} style={{ marginLeft: "auto" }} />
        </Pressable>
      )}

      <View style={[styles.members, { backgroundColor: colors.surface }]}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.memberList}>
          {group.memberIds.map(mid => {
            const m = getMemberById(mid);
            if (!m) return null;
            return (
              <Pressable
                key={mid}
                style={({ pressed }) => [styles.memberChip, { opacity: pressed ? 0.7 : 1 }]}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setProfileMemberId(mid);
                }}
              >
                <Avatar name={m.name} color={m.avatarColor} size={32} imageUri={m.photo} />
                <Text style={[styles.memberName, { color: colors.textSecondary }]} numberOfLines={1}>
                  {m.isCurrentUser ? "You" : m.name.split(" ")[0]}
                </Text>
              </Pressable>
            );
          })}
          {pendingInvites.map(inv => (
            <View key={inv.id} style={styles.memberChip}>
              <View style={[styles.pendingAvatar, { borderColor: colors.border }]}>
                <Feather name="clock" size={14} color={colors.textTertiary} />
              </View>
              <Text style={[styles.memberName, { color: colors.textTertiary }]} numberOfLines={1}>
                {inv.invitedName ?? inv.invitedEmail.split("@")[0]}
              </Text>
            </View>
          ))}
          <Pressable
            style={[styles.inviteChip, { borderColor: colors.primary + "50" }]}
            onPress={() => { setShowInviteForm(v => !v); setInviteError(""); }}
          >
            <Feather name="user-plus" size={14} color={colors.primary} />
            <Text style={[styles.inviteChipText, { color: colors.primary }]}>Invite</Text>
          </Pressable>
          <Pressable
            style={[styles.inviteChip, { borderColor: colors.teal + "50" }]}
            onPress={() => router.push({ pathname: "/group/qr/[id]", params: { id } })}
          >
            <Feather name="grid" size={14} color={colors.teal} />
            <Text style={[styles.inviteChipText, { color: colors.teal }]}>QR</Text>
          </Pressable>
        </ScrollView>
      </View>

      {showInviteForm && (
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <View style={[styles.inviteForm, { backgroundColor: colors.surface, borderTopColor: colors.border }]}>
            {inviteSent ? (
              <View style={styles.inviteSentRow}>
                <Feather name="check-circle" size={18} color={colors.success} />
                <Text style={[styles.inviteSentText, { color: colors.success }]}>Invite sent!</Text>
              </View>
            ) : (
              <>
                <Text style={[styles.inviteFormTitle, { color: colors.text }]}>Invite to group</Text>
                <View style={[styles.inviteInput, { backgroundColor: colors.inputBg, borderColor: inviteError ? colors.danger : colors.inputBorder }]}>
                  <Feather name="mail" size={15} color={inviteError ? colors.danger : colors.textTertiary} style={{ marginRight: 6 }} />
                  <TextInput
                    ref={emailRef}
                    style={[styles.inviteInputText, { color: colors.text }]}
                    placeholder="Email address"
                    placeholderTextColor={colors.textTertiary}
                    value={inviteEmail}
                    onChangeText={t => { setInviteEmail(t); setInviteError(""); }}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoCorrect={false}
                    autoFocus
                    returnKeyType="next"
                  />
                </View>
                {inviteError ? (
                  <Text style={[styles.inviteErrorText, { color: colors.danger }]}>{inviteError}</Text>
                ) : null}
                <View style={[styles.inviteInput, { backgroundColor: colors.inputBg, borderColor: colors.inputBorder, marginTop: 8 }]}>
                  <Feather name="user" size={15} color={colors.textTertiary} style={{ marginRight: 6 }} />
                  <TextInput
                    style={[styles.inviteInputText, { color: colors.text }]}
                    placeholder="Name (optional)"
                    placeholderTextColor={colors.textTertiary}
                    value={inviteName}
                    onChangeText={setInviteName}
                    returnKeyType="send"
                    onSubmitEditing={handleSendInvite}
                  />
                </View>
                <View style={styles.inviteFormActions}>
                  <Pressable
                    style={[styles.inviteFormBtn, styles.inviteFormCancel, { borderColor: colors.border }]}
                    onPress={() => { setShowInviteForm(false); setInviteEmail(""); setInviteName(""); setInviteError(""); }}
                  >
                    <Text style={[styles.inviteFormBtnText, { color: colors.textSecondary }]}>Cancel</Text>
                  </Pressable>
                  <Pressable
                    style={[styles.inviteFormBtn, styles.inviteFormSend, { backgroundColor: colors.primary }]}
                    onPress={handleSendInvite}
                  >
                    <Text style={[styles.inviteFormBtnText, { color: "#fff" }]}>Send invite</Text>
                  </Pressable>
                </View>
              </>
            )}
          </View>
        </KeyboardAvoidingView>
      )}

      <View style={[styles.tabBar, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        {(["expenses", "balances", "chat", "charts"] as Tab[]).map(t => {
          const labels: Record<Tab, string> = { expenses: "Expenses", balances: "Balances", chat: "Chat", charts: "Charts" };
          const hasUnread = t === "chat" && messages.length > 0;
          return (
            <Pressable
              key={t}
              style={[styles.tabItem, tab === t && { borderBottomColor: colors.primary, borderBottomWidth: 2 }]}
              onPress={() => setTab(t)}
            >
              <Text style={[styles.tabLabel, { color: tab === t ? colors.primary : colors.textSecondary }]}>
                {labels[t]}
              </Text>
              {hasUnread && tab !== "chat" && (
                <View style={[styles.tabDot, { backgroundColor: colors.primary }]} />
              )}
            </Pressable>
          );
        })}
      </View>

      {tab === "expenses" ? (
        <FlatList
          data={expensesCollapsed ? [] : feedItems}
          keyExtractor={item => item.id}
          contentContainerStyle={[styles.listContent, { paddingBottom: Platform.OS === "web" ? 134 : 100 }]}
          ListHeaderComponent={
            <>
              {renderRecurringSection()}
              {/* Expenses section collapsible header */}
              <Pressable
                style={[styles.expensesSectionHeader, { backgroundColor: colors.surface, borderColor: colors.border }]}
                onPress={() => { setExpensesCollapsed(v => !v); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
              >
                <Feather name="credit-card" size={15} color={colors.primary} />
                <Text style={[styles.expensesSectionTitle, { color: colors.text }]}>Payments</Text>
                <View style={[styles.expensesSectionBadge, { backgroundColor: colors.primaryLight }]}>
                  <Text style={[styles.expensesSectionBadgeText, { color: colors.primary }]}>{feedItems.length}</Text>
                </View>
                <Feather
                  name={expensesCollapsed ? "chevron-right" : "chevron-down"}
                  size={16}
                  color={colors.textTertiary}
                  style={{ marginLeft: "auto" }}
                />
              </Pressable>
            </>
          }
          ListEmptyComponent={
            expensesCollapsed ? null : (
              <EmptyState icon="credit-card" title="No expenses yet" subtitle="Add your first expense to start splitting" />
            )
          }
          renderItem={({ item }) => item.type === "expense" ? renderExpenseItem(item.data) : renderSettlementItem(item.data)}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor={colors.primary}
              colors={[colors.primary]}
            />
          }
        />
      ) : tab === "balances" ? (
        <View style={[styles.listContent, { paddingBottom: Platform.OS === "web" ? 134 : 100, flex: 1 }]}>
          {renderBalances()}
        </View>
      ) : tab === "chat" ? (
        renderChat()
      ) : (
        <ScrollView
          contentContainerStyle={[styles.listContent, { paddingBottom: Platform.OS === "web" ? 134 : 100, gap: 16 }]}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor={colors.primary}
              colors={[colors.primary]}
            />
          }
        >
          <View style={[styles.chartCard, { backgroundColor: colors.surface }]}>
            <Text style={[styles.chartTitle, { color: colors.text }]}>Cumulative spending</Text>
            <Text style={[styles.chartSub, { color: colors.textSecondary }]}>Amount paid per person over time</Text>
            <LineChartSvg
              series={chartSeries}
              width={width - 64}
              height={220}
              formatY={v => v >= 1000 ? `${v >= 10000 ? (v / 1000).toFixed(0) : (v / 1000).toFixed(1)}k` : v.toFixed(0)}
              textColor={colors.textTertiary}
              gridColor={colors.border}
              legendTextColor={colors.textSecondary}
              emptyText="Add expenses to see spending trends"
            />
          </View>

          <View style={[styles.chartCard, { backgroundColor: colors.surface }]}>
            <Text style={[styles.chartTitle, { color: colors.text }]}>Per-member totals</Text>
            {group.memberIds.map(memberId => {
              const member = getMemberById(memberId);
              const paid = groupExpenses.filter(e => e.paidById === memberId).reduce((s, e) => s + e.amount, 0);
              const pct = totalExpenses > 0 ? paid / totalExpenses : 0;
              if (!member) return null;
              return (
                <View key={memberId} style={styles.memberBar}>
                  <View style={styles.memberBarLabel}>
                    <View style={[styles.memberBarDot, { backgroundColor: member.avatarColor }]} />
                    <Text style={[styles.memberBarName, { color: colors.text }]}>
                      {member.isCurrentUser ? "You" : member.name.split(" ")[0]}
                    </Text>
                  </View>
                  <View style={[styles.memberBarTrack, { backgroundColor: colors.border }]}>
                    <View style={[styles.memberBarFill, { backgroundColor: member.avatarColor, width: `${Math.max(pct * 100, paid > 0 ? 2 : 0)}%` as any }]} />
                  </View>
                  <Text style={[styles.memberBarValue, { color: colors.textSecondary }]}>{formatAmount(paid, group.currency)}</Text>
                </View>
              );
            })}
          </View>
        </ScrollView>
      )}

      {tab !== "chat" && (
        <Pressable
          style={[styles.fab, { backgroundColor: colors.primary }]}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            router.push({ pathname: "/expense/new", params: { groupId: id } });
          }}
        >
          <Feather name="plus" size={24} color="#fff" />
        </Pressable>
      )}

      {/* Partial Payment Modal */}
      <Modal
        visible={!!settleModal}
        transparent
        animationType="fade"
        onRequestClose={() => setSettleModal(null)}
      >
        <Pressable style={styles.settleOverlay} onPress={() => setSettleModal(null)}>
          <Pressable style={[styles.settleSheet, { backgroundColor: colors.surface }]} onPress={e => e.stopPropagation()}>
            <Text style={[styles.settleSheetTitle, { color: colors.text }]}>Record Payment</Text>
            {settleModal && (
              <>
                <Text style={[styles.settleSheetSub, { color: colors.textSecondary }]}>
                  {getMemberById(settleModal.fromId)?.name ?? "Unknown"} → {getMemberById(settleModal.toId)?.name ?? "Unknown"}
                  {"\n"}Full balance: {formatAmount(settleModal.fullAmount, group.currency)}
                </Text>
                <Text style={[styles.settleSheetLabel, { color: colors.textSecondary }]}>Amount to settle</Text>
                <View style={[styles.settleAmtRow, { borderColor: colors.border, backgroundColor: colors.inputBg }]}>
                  <Text style={[styles.settleAmtSymbol, { color: colors.textTertiary }]}>
                    {group.currency}
                  </Text>
                  <TextInput
                    style={[styles.settleAmtInput, { color: colors.text }]}
                    value={settleAmount}
                    onChangeText={setSettleAmount}
                    keyboardType="decimal-pad"
                    autoFocus
                    selectTextOnFocus
                  />
                </View>
                <View style={styles.settleSheetActions}>
                  <Pressable
                    style={[styles.settleSheetBtn, { backgroundColor: colors.background, borderColor: colors.border }]}
                    onPress={() => setSettleModal(null)}
                  >
                    <Text style={[styles.settleSheetBtnText, { color: colors.textSecondary }]}>Cancel</Text>
                  </Pressable>
                  <Pressable
                    style={[styles.settleSheetBtn, { backgroundColor: colors.primary }]}
                    onPress={confirmSettle}
                  >
                    <Text style={[styles.settleSheetBtnText, { color: "#fff" }]}>Confirm</Text>
                  </Pressable>
                </View>
              </>
            )}
          </Pressable>
        </Pressable>
      </Modal>

      {/* Trip Dates & Reminders Modal */}
      <Modal
        visible={showTripDatesModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowTripDatesModal(false)}
      >
        <Pressable style={styles.settleOverlay} onPress={() => setShowTripDatesModal(false)}>
          <Pressable style={[styles.settleSheet, { backgroundColor: colors.surface, gap: 0 }]} onPress={e => e.stopPropagation()}>
            <View style={[styles.tripModalHeader, { borderBottomColor: colors.border }]}>
              <Text style={[styles.settleSheetTitle, { color: colors.text }]}>Trip Dates & Reminders</Text>
              <Pressable onPress={() => setShowTripDatesModal(false)}>
                <Feather name="x" size={20} color={colors.textSecondary} />
              </Pressable>
            </View>

            <ScrollView
              style={styles.tripModalBody}
              contentContainerStyle={{ paddingBottom: 8 }}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
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

              <View style={[styles.tripRemindersSection, { borderTopColor: colors.border }]}>
                <Text style={[styles.tripModalLabel, { color: colors.textSecondary }]}>Remind me N days before trip starts</Text>
                <View style={[styles.tripModalInput, { borderColor: colors.border, backgroundColor: colors.inputBg, width: 80 }]}>
                  <TextInput
                    style={[styles.tripModalInputText, { color: colors.text, textAlign: "center" }]}
                    value={tripStartReminderInput}
                    onChangeText={setTripStartReminderInput}
                    keyboardType="number-pad"
                    maxLength={2}
                  />
                </View>

                <Text style={[styles.tripModalLabel, { color: colors.textSecondary, marginTop: 12 }]}>Settle-up reminder every N days after trip ends</Text>
                <View style={[styles.tripModalInput, { borderColor: colors.border, backgroundColor: colors.inputBg, width: 80 }]}>
                  <TextInput
                    style={[styles.tripModalInputText, { color: colors.text, textAlign: "center" }]}
                    value={settleUpReminderInput}
                    onChangeText={setSettleUpReminderInput}
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

              {/* ── Nudge Campaign ─────────────────────────────────── */}
              <View style={[styles.nudgeSection, { backgroundColor: colors.background, borderColor: colors.border }]}>
                <View style={styles.nudgeSectionHeader}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.nudgeSectionTitle, { color: colors.text }]}>Settlement Nudge Campaign</Text>
                    <Text style={[styles.nudgeSectionSub, { color: colors.textTertiary }]}>
                      Automatically remind the group after the trip ends
                    </Text>
                  </View>
                  <Switch
                    value={nudgeActive}
                    onValueChange={v => { setNudgeActive(v); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
                    trackColor={{ false: colors.switchOff, true: colors.primary }}
                    thumbColor="#fff"
                  />
                </View>

                {nudgeActive && (
                  <>
                    {/* Tone picker */}
                    <Text style={[styles.nudgeLabel, { color: colors.textSecondary }]}>Nudge tone</Text>
                    <View style={styles.nudgeToneRow}>
                      {([
                        { tone: "friendly", emoji: "👋", label: "Friendly", desc: "Gentle reminder" },
                        { tone: "firm",     emoji: "⏰", label: "Firm",     desc: "Direct & clear"  },
                        { tone: "urgent",   emoji: "🚨", label: "Urgent",   desc: "Strong push"     },
                      ] as { tone: NudgeTone; emoji: string; label: string; desc: string }[]).map(t => (
                        <Pressable
                          key={t.tone}
                          style={[
                            styles.nudgeToneCard,
                            {
                              backgroundColor: nudgeTone === t.tone ? colors.primaryLight : colors.background,
                              borderColor: nudgeTone === t.tone ? colors.primary : colors.border,
                            },
                          ]}
                          onPress={() => { setNudgeTone(t.tone); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
                        >
                          <Text style={styles.nudgeToneEmoji}>{t.emoji}</Text>
                          <Text style={[styles.nudgeToneLabel, { color: nudgeTone === t.tone ? colors.primary : colors.text }]}>{t.label}</Text>
                          <Text style={[styles.nudgeToneDesc, { color: colors.textTertiary }]}>{t.desc}</Text>
                        </Pressable>
                      ))}
                    </View>

                    {/* Timing controls */}
                    <View style={styles.nudgeTimingRow}>
                      <View style={styles.nudgeTimingItem}>
                        <Text style={[styles.nudgeLabel, { color: colors.textSecondary }]}>Start after end</Text>
                        <View style={[styles.nudgeInput, { borderColor: colors.border, backgroundColor: colors.inputBg }]}>
                          <TextInput
                            style={[styles.nudgeInputText, { color: colors.text }]}
                            value={nudgeStartDays}
                            onChangeText={setNudgeStartDays}
                            keyboardType="number-pad"
                            maxLength={2}
                          />
                          <Text style={[styles.nudgeInputUnit, { color: colors.textTertiary }]}>days</Text>
                        </View>
                      </View>
                      <View style={styles.nudgeTimingItem}>
                        <Text style={[styles.nudgeLabel, { color: colors.textSecondary }]}>Repeat every</Text>
                        <View style={[styles.nudgeInput, { borderColor: colors.border, backgroundColor: colors.inputBg }]}>
                          <TextInput
                            style={[styles.nudgeInputText, { color: colors.text }]}
                            value={nudgeFreqDays}
                            onChangeText={setNudgeFreqDays}
                            keyboardType="number-pad"
                            maxLength={2}
                          />
                          <Text style={[styles.nudgeInputUnit, { color: colors.textTertiary }]}>days</Text>
                        </View>
                      </View>
                      <View style={styles.nudgeTimingItem}>
                        <Text style={[styles.nudgeLabel, { color: colors.textSecondary }]}>Stop after</Text>
                        <View style={[styles.nudgeInput, { borderColor: colors.border, backgroundColor: colors.inputBg }]}>
                          <TextInput
                            style={[styles.nudgeInputText, { color: colors.text }]}
                            value={nudgeMaxNudges}
                            onChangeText={setNudgeMaxNudges}
                            keyboardType="number-pad"
                            maxLength={2}
                          />
                          <Text style={[styles.nudgeInputUnit, { color: colors.textTertiary }]}>nudges</Text>
                        </View>
                      </View>
                    </View>

                    <View style={[styles.nudgePreview, { backgroundColor: colors.background, borderColor: colors.border }]}>
                      <Feather name="info" size={13} color={colors.primary} />
                      <Text style={[styles.nudgePreviewText, { color: colors.textSecondary }]}>
                        First nudge {nudgeStartDays} day{nudgeStartDays !== "1" ? "s" : ""} after trip ends,
                        then every {nudgeFreqDays} day{nudgeFreqDays !== "1" ? "s" : ""} — up to {nudgeMaxNudges} times.
                        Stops automatically once everyone settles up.
                      </Text>
                    </View>
                  </>
                )}
              </View>
            </ScrollView>

            <View style={[styles.settleSheetActions, { paddingHorizontal: 16, paddingBottom: 20 }]}>
              <Pressable
                style={[styles.settleSheetBtn, { backgroundColor: colors.background, borderColor: colors.border }]}
                onPress={() => setShowTripDatesModal(false)}
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
          </Pressable>
        </Pressable>
      </Modal>

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
                style={[styles.settleSheetBtn, { backgroundColor: colors.teal, borderColor: colors.teal }]}
                onPress={confirmSettleAll}
              >
                <Text style={[styles.settleSheetBtnText, { color: "#fff" }]}>Settle All</Text>
              </Pressable>
            </View>
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

      {/* Edit Recurring Expense Modal */}
      <Modal
        visible={!!editingRecurring}
        transparent
        animationType="slide"
        onRequestClose={() => setEditingRecurring(null)}
      >
        <Pressable style={styles.settleOverlay} onPress={() => setEditingRecurring(null)}>
          <Pressable style={[styles.settleSheet, { backgroundColor: colors.surface, gap: 0 }]} onPress={e => e.stopPropagation()}>
            <View style={[styles.tripModalHeader, { borderBottomColor: colors.border }]}>
              <Text style={[styles.settleSheetTitle, { color: colors.text }]}>Edit Recurring</Text>
              <Pressable onPress={() => setEditingRecurring(null)}>
                <Feather name="x" size={20} color={colors.textSecondary} />
              </Pressable>
            </View>
            <ScrollView
              style={styles.tripModalBody}
              contentContainerStyle={{ paddingBottom: 8, gap: 14 }}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              {/* Description */}
              <View>
                <Text style={[recurStyles.editLabel, { color: colors.textSecondary }]}>Description</Text>
                <TextInput
                  style={[recurStyles.editInput, { color: colors.text, backgroundColor: colors.inputBg, borderColor: colors.border }]}
                  value={editRecurDesc}
                  onChangeText={setEditRecurDesc}
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
                  onChangeText={setEditRecurAmount}
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

              {/* Day of week (weekly/biweekly) */}
              {(editRecurFreq === "weekly" || editRecurFreq === "biweekly") && (
                <View>
                  <Text style={[recurStyles.editLabel, { color: colors.textSecondary }]}>Which day?</Text>
                  <View style={recurStyles.dayRow}>
                    {["S","M","T","W","T","F","S"].map((d, idx) => (
                      <Pressable
                        key={idx}
                        style={[
                          recurStyles.dayChip,
                          {
                            backgroundColor: editRecurDayOfWeek === idx ? colors.primary : colors.surface,
                            borderColor: editRecurDayOfWeek === idx ? colors.primary : colors.border,
                          },
                        ]}
                        onPress={() => {
                          setEditRecurDayOfWeek(editRecurDayOfWeek === idx ? undefined : idx);
                          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        }}
                      >
                        <Text style={[recurStyles.dayChipText, { color: editRecurDayOfWeek === idx ? "#fff" : colors.textSecondary }]}>
                          {d}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                </View>
              )}

              {/* Time of day */}
              <View>
                <Text style={[recurStyles.editLabel, { color: colors.textSecondary }]}>Time of day</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                  {[
                    { label: "Morning",   sub: "9 am",  value: "09:00", icon: "☀️" },
                    { label: "Noon",      sub: "12 pm", value: "12:00", icon: "🌤️" },
                    { label: "Afternoon", sub: "3 pm",  value: "15:00", icon: "⛅️" },
                    { label: "Evening",   sub: "6 pm",  value: "18:00", icon: "🌇" },
                    { label: "Night",     sub: "10 pm", value: "22:00", icon: "🌙" },
                  ].map(t => {
                    const active = editRecurTimeOfDay === t.value;
                    return (
                      <Pressable
                        key={t.value}
                        style={[
                          recurStyles.timeChip,
                          {
                            backgroundColor: active ? colors.primary : colors.surface,
                            borderColor: active ? colors.primary : colors.border,
                          },
                        ]}
                        onPress={() => { setEditRecurTimeOfDay(t.value); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
                      >
                        <Text style={recurStyles.timeChipEmoji}>{t.icon}</Text>
                        <Text style={[recurStyles.timeChipLabel, { color: active ? "#fff" : colors.text }]}>{t.label}</Text>
                        <Text style={[recurStyles.timeChipSub, { color: active ? "rgba(255,255,255,0.75)" : colors.textTertiary }]}>{t.sub}</Text>
                      </Pressable>
                    );
                  })}
                </ScrollView>
              </View>

              {/* End condition */}
              <View>
                <Text style={[recurStyles.editLabel, { color: colors.textSecondary }]}>Ends</Text>
                <View style={recurStyles.endTypeRow}>
                  {(["never", "count", "date"] as const).map(et => (
                    <Pressable
                      key={et}
                      style={[
                        recurStyles.endTypeBtn,
                        {
                          backgroundColor: editRecurEndType === et ? colors.primary : colors.surface,
                          borderColor: editRecurEndType === et ? colors.primary : colors.border,
                        },
                      ]}
                      onPress={() => { setEditRecurEndType(et); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
                    >
                      <Text style={[recurStyles.endTypeBtnText, { color: editRecurEndType === et ? "#fff" : colors.textSecondary }]}>
                        {et === "never" ? "Forever" : et === "count" ? "After N times" : "Until date"}
                      </Text>
                    </Pressable>
                  ))}
                </View>
                {editRecurEndType === "count" && (
                  <View style={[recurStyles.inlineRow, { backgroundColor: colors.inputBg, borderColor: colors.border, marginTop: 8 }]}>
                    <Text style={[recurStyles.inlineLabel, { color: colors.text }]}>After</Text>
                    <TextInput
                      style={[recurStyles.inlineInput, { color: colors.text }]}
                      value={editRecurEndCount}
                      onChangeText={t => setEditRecurEndCount(t.replace(/[^0-9]/g, ""))}
                      keyboardType="number-pad"
                      maxLength={3}
                      selectTextOnFocus
                    />
                    <Text style={[recurStyles.inlineLabel, { color: colors.text }]}>occurrences</Text>
                  </View>
                )}
                {editRecurEndType === "date" && (
                  <View style={{ marginTop: 8 }}>
                    <DatePickerField
                      label="End date"
                      value={editRecurEndDate}
                      onChange={setEditRecurEndDate}
                      colors={colors}
                    />
                  </View>
                )}
              </View>
            </ScrollView>

            <View style={[styles.settleSheetActions, { paddingHorizontal: 16, paddingBottom: 20 }]}>
              <Pressable
                style={[styles.settleSheetBtn, { backgroundColor: colors.background, borderColor: colors.border }]}
                onPress={() => setEditingRecurring(null)}
              >
                <Text style={[styles.settleSheetBtnText, { color: colors.textSecondary }]}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[styles.settleSheetBtn, { backgroundColor: colors.primary, borderColor: colors.primary }]}
                onPress={saveEditRecurring}
              >
                <Text style={[styles.settleSheetBtnText, { color: "#fff" }]}>Save</Text>
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
  headerCenter: { flex: 1, flexDirection: "row", alignItems: "center", gap: 8 },
  groupEmoji: { fontSize: 22 },
  groupName: { fontSize: 18, fontFamily: "Inter_700Bold" },
  archivedBadge: { fontSize: 11, fontFamily: "Inter_500Medium" },
  expensesSectionHeader: {
    flexDirection: "row", alignItems: "center", gap: 8,
    marginHorizontal: 16, marginBottom: 4, marginTop: 8,
    paddingHorizontal: 14, paddingVertical: 11,
    borderRadius: 12, borderWidth: 1,
  },
  expensesSectionTitle: { fontSize: 14, fontFamily: "Inter_600SemiBold", flex: 1 },
  expensesSectionBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10 },
  expensesSectionBadgeText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  statsBar: {
    flexDirection: "row", marginHorizontal: 16, marginTop: 12, borderRadius: 14, overflow: "hidden",
    shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 2,
  },
  statItem: { flex: 1, alignItems: "center", paddingVertical: 12 },
  statItemTotal: { flex: 2 },
  statLabel: { fontSize: 11, fontFamily: "Inter_400Regular", marginBottom: 2 },
  statValue: { fontSize: 15, fontFamily: "Inter_700Bold" },
  statValueTotal: { fontSize: 17, width: "100%", textAlign: "center" },
  statDivider: { width: 1, marginVertical: 8 },
  members: {
    marginHorizontal: 16, marginTop: 10, borderRadius: 14,
    shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 2,
  },
  memberList: { paddingHorizontal: 14, paddingVertical: 12, gap: 12 },
  memberChip: { alignItems: "center", gap: 4, maxWidth: 52 },
  memberName: { fontSize: 11, fontFamily: "Inter_400Regular", textAlign: "center" },
  pendingAvatar: {
    width: 32, height: 32, borderRadius: 16, borderWidth: 1.5, borderStyle: "dashed",
    alignItems: "center", justifyContent: "center",
  },
  inviteChip: {
    flexDirection: "row", alignItems: "center", gap: 5,
    paddingHorizontal: 10, paddingVertical: 6, borderRadius: 16, borderWidth: 1.5, alignSelf: "center",
  },
  inviteChipText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  inviteForm: { borderTopWidth: 1, paddingHorizontal: 16, paddingVertical: 14 },
  inviteFormTitle: { fontSize: 14, fontFamily: "Inter_600SemiBold", marginBottom: 10 },
  inviteInput: { flexDirection: "row", alignItems: "center", height: 44, borderRadius: 10, borderWidth: 1, paddingHorizontal: 12 },
  inviteInputText: { flex: 1, fontSize: 15, fontFamily: "Inter_400Regular" },
  inviteErrorText: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 4 },
  inviteSentRow: { flexDirection: "row", alignItems: "center", gap: 8, justifyContent: "center", paddingVertical: 8 },
  inviteSentText: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  inviteFormActions: { flexDirection: "row", gap: 10, marginTop: 12 },
  inviteFormBtn: { flex: 1, paddingVertical: 12, borderRadius: 12, alignItems: "center" },
  inviteFormCancel: { borderWidth: 1 },
  inviteFormSend: {},
  inviteFormBtnText: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  tabBar: { flexDirection: "row", marginTop: 10, borderBottomWidth: 1 },
  tabItem: {
    flex: 1, alignItems: "center", paddingVertical: 12,
    borderBottomWidth: 2, borderBottomColor: "transparent", position: "relative",
  },
  tabLabel: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  tabDot: { position: "absolute", top: 10, right: "25%", width: 6, height: 6, borderRadius: 3 },
  listContent: { padding: 16 },
  expenseRow: {
    flexDirection: "row", alignItems: "center", padding: 14, borderRadius: 16, marginBottom: 10, gap: 12,
    shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 2,
  },
  expenseBody: { flex: 1 },
  expenseName: { fontSize: 15, fontFamily: "Inter_500Medium", marginBottom: 3 },
  expenseMetaRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  expenseMeta: { fontSize: 12, fontFamily: "Inter_400Regular", flex: 1 },
  expenseSocialRow: { flexDirection: "row", gap: 8 },
  expenseSocial: { fontSize: 11, fontFamily: "Inter_400Regular" },
  expenseRight: { alignItems: "flex-end" },
  expenseTotal: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  expenseNet: { fontSize: 12, fontFamily: "Inter_500Medium", marginTop: 2 },
  settledCard: { alignItems: "center", paddingVertical: 48, paddingHorizontal: 32, gap: 12 },
  settledIcon: { width: 64, height: 64, borderRadius: 32, alignItems: "center", justifyContent: "center" },
  settledTitle: { fontSize: 18, fontFamily: "Inter_700Bold" },
  settledSub: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center" },
  debtCard: {
    flexDirection: "row", alignItems: "center", padding: 14, borderRadius: 16, marginBottom: 10, gap: 12,
    shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 2,
  },
  debtAvatarNamePressable: { alignItems: "center", justifyContent: "center" },
  debtBody: { flex: 1 },
  debtText: { fontSize: 14, fontFamily: "Inter_400Regular", lineHeight: 20 },
  debtAmount: { fontSize: 16, fontFamily: "Inter_700Bold", marginTop: 2 },
  debtActions: { flexDirection: "row", alignItems: "center", gap: 6 },
  reminderBtn: { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  settleBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20 },
  settleBtnText: { color: "#fff", fontSize: 13, fontFamily: "Inter_600SemiBold" },
  fab: {
    position: "absolute", bottom: Platform.OS === "web" ? 118 : 84, right: 20,
    width: 56, height: 56, borderRadius: 28, alignItems: "center", justifyContent: "center",
    shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.25, shadowRadius: 8, elevation: 8,
  },
  chartCard: {
    borderRadius: 16, padding: 16,
    shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 2,
  },
  chartTitle: { fontSize: 15, fontFamily: "Inter_600SemiBold", marginBottom: 2 },
  chartSub: { fontSize: 12, fontFamily: "Inter_400Regular", marginBottom: 14 },
  memberBar: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 12 },
  memberBarLabel: { width: 56, flexDirection: "row", alignItems: "center", gap: 6 },
  memberBarDot: { width: 8, height: 8, borderRadius: 4 },
  memberBarName: { fontSize: 12, fontFamily: "Inter_500Medium", flex: 1 },
  memberBarTrack: { flex: 1, height: 8, borderRadius: 4, overflow: "hidden" },
  memberBarFill: { height: 8, borderRadius: 4 },
  memberBarValue: { width: 64, textAlign: "right", fontSize: 12, fontFamily: "Inter_500Medium" },
  chatList: { padding: 16, gap: 12, paddingBottom: 16 },
  chatRow: { flexDirection: "row", alignItems: "flex-end", gap: 8 },
  chatRowMe: { flexDirection: "row-reverse" },
  chatBubbleWrap: { maxWidth: "72%", gap: 2 },
  chatAuthor: { fontSize: 11, fontFamily: "Inter_600SemiBold", marginLeft: 2, marginBottom: 2 },
  chatBubble: { borderRadius: 16, padding: 12, borderWidth: 1 },
  chatText: { fontSize: 14, fontFamily: "Inter_400Regular", lineHeight: 20 },
  chatTime: { fontSize: 10, fontFamily: "Inter_400Regular", marginTop: 2 },
  chatInputBar: {
    flexDirection: "row", alignItems: "flex-end", gap: 10,
    paddingHorizontal: 16, paddingVertical: 10, borderTopWidth: 1,
    paddingBottom: Platform.OS === "ios" ? 24 : 10,
  },
  chatInput: {
    flex: 1, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8,
    fontSize: 14, fontFamily: "Inter_400Regular", maxHeight: 80,
  },
  chatSendBtn: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  settleAllIconWrap: { alignItems: "center", marginBottom: 4 },
  settleAllIconCircle: { width: 60, height: 60, borderRadius: 30, alignItems: "center", justifyContent: "center" },
  settleAllSummary: { borderRadius: 12, borderWidth: 1, paddingHorizontal: 16, paddingVertical: 4 },
  settleAllSummaryRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 12 },
  settleAllSummaryLabel: { fontSize: 14, fontFamily: "Inter_400Regular" },
  settleAllSummaryValue: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  settleAllDivider: { height: 1 },
  notInvolvedPill: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 4 },
  notInvolvedText: { fontSize: 10, fontFamily: "Inter_400Regular" },
  settleFeedIcon: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  tripDatesBar: {
    flexDirection: "row", alignItems: "center", gap: 8,
    marginHorizontal: 16, marginTop: 10, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10,
  },
  tripDatesText: { fontSize: 13, fontFamily: "Inter_500Medium" },
  tripModalHeader: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1,
  },
  tripModalBody: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 8, flexShrink: 1 },
  tripModalLabel: { fontSize: 12, fontFamily: "Inter_600SemiBold", textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 6 },
  tripModalInput: {
    flexDirection: "row", alignItems: "center", gap: 8,
    borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, height: 44,
  },
  tripModalInputText: { flex: 1, fontSize: 15, fontFamily: "Inter_400Regular" },
  tripRemindersSection: { borderTopWidth: 1, marginTop: 16, paddingTop: 16 },
  settleOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.55)", alignItems: "center", justifyContent: "center", padding: 24 },
  settleSheet: { width: "100%", borderRadius: 20, padding: 24, gap: 12, maxHeight: "88%" },
  settleSheetTitle: { fontSize: 18, fontFamily: "Inter_700Bold" },
  settleSheetSub: { fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 20 },
  settleSheetLabel: { fontSize: 12, fontFamily: "Inter_600SemiBold", textTransform: "uppercase", letterSpacing: 0.6 },
  settleAmtRow: {
    flexDirection: "row", alignItems: "center", gap: 8,
    borderRadius: 12, borderWidth: 1, paddingHorizontal: 14, height: 52,
  },
  settleAmtSymbol: { fontSize: 15, fontFamily: "Inter_500Medium" },
  settleAmtInput: { flex: 1, fontSize: 24, fontFamily: "Inter_700Bold" },
  settleSheetActions: { flexDirection: "row", gap: 10, marginTop: 4 },
  settleSheetBtn: { flex: 1, paddingVertical: 14, borderRadius: 12, alignItems: "center", borderWidth: 1 },
  settleSheetBtnText: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  nudgeSection: { borderWidth: 1, borderRadius: 14, marginTop: 16, padding: 16, gap: 14 },
  channelRow: { flexDirection: "row", gap: 8, marginTop: 8 },
  channelBtn: {
    flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 6, paddingVertical: 10, borderRadius: 12, borderWidth: 1.5,
  },
  channelBtnText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  nudgeSectionHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  nudgeSectionTitle: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  nudgeSectionSub: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
  nudgeLabel: { fontSize: 11, fontFamily: "Inter_600SemiBold", textTransform: "uppercase", letterSpacing: 0.6 },
  nudgeToneRow: { flexDirection: "row", gap: 8 },
  nudgeToneCard: { flex: 1, alignItems: "center", paddingVertical: 12, borderRadius: 12, borderWidth: 1.5, gap: 3 },
  nudgeToneEmoji: { fontSize: 20 },
  nudgeToneLabel: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  nudgeToneDesc: { fontSize: 11, fontFamily: "Inter_400Regular" },
  nudgeTimingRow: { flexDirection: "row", gap: 10 },
  nudgeTimingItem: { flex: 1, gap: 6 },
  nudgeInput: { flexDirection: "row", alignItems: "center", borderWidth: 1, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8, gap: 4 },
  nudgeInputText: { flex: 1, fontSize: 16, fontFamily: "Inter_600SemiBold", textAlign: "center" },
  nudgeInputUnit: { fontSize: 12, fontFamily: "Inter_400Regular" },
  nudgePreview: { flexDirection: "row", alignItems: "flex-start", gap: 8, padding: 12, borderRadius: 10, borderWidth: 1 },
  nudgePreviewText: { flex: 1, fontSize: 12, fontFamily: "Inter_400Regular", lineHeight: 18 },
});

const recurStyles = StyleSheet.create({
  section: {
    borderRadius: 16, marginBottom: 10,
    shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 2,
    overflow: "hidden",
  },
  sectionHeader: {
    flexDirection: "row", alignItems: "center", gap: 8,
    paddingHorizontal: 14, paddingVertical: 12,
  },
  sectionTitle: { fontSize: 14, fontFamily: "Inter_600SemiBold", flex: 1 },
  countBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10 },
  countBadgeText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  card: { borderTopWidth: 1, paddingHorizontal: 14, paddingTop: 12, paddingBottom: 12 },
  cardMain: { flexDirection: "row", alignItems: "center", gap: 10 },
  iconBox: { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  cardDesc: { fontSize: 14, fontFamily: "Inter_500Medium", marginBottom: 4 },
  cardMeta: { flexDirection: "row", alignItems: "center", gap: 5 },
  freqPill: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 8 },
  freqPillText: { fontSize: 11, fontFamily: "Inter_500Medium" },
  metaDot: { fontSize: 12 },
  metaText: { fontSize: 11, fontFamily: "Inter_400Regular" },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  cardAmount: { fontSize: 15, fontFamily: "Inter_600SemiBold", marginLeft: 4 },
  cardActions: { flexDirection: "row", gap: 8, marginTop: 10 },
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
});
