import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router, useLocalSearchParams } from "expo-router";
import React, { useMemo, useRef, useState } from "react";
import {
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AmountText, formatAmount } from "@/components/AmountText";
import { Avatar } from "@/components/Avatar";
import { CategoryIcon } from "@/components/CategoryIcon";
import { EmptyState } from "@/components/EmptyState";
import { ChartSeries, LineChartSvg } from "@/components/LineChartSvg";
import { Expense, GroupMessage, useApp } from "@/context/AppContext";
import { useTheme } from "@/hooks/useTheme";
import { timeAgo } from "@/utils/format";

type Tab = "expenses" | "balances" | "chat" | "charts";

export default function GroupDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const {
    getGroupById, getMemberById, getGroupExpenses, getGroupSettlements,
    getGroupBalances, getGroupPendingInvites, sendGroupInvite,
    currentUser, deleteGroup, addSettlement, addSettlements, archiveGroup, unarchiveGroup,
    addGroupMessage, getGroupMessages,
  } = useApp();

  const [tab, setTab] = useState<Tab>("expenses");
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

  const group = getGroupById(id);
  const groupExpenses = getGroupExpenses(id);
  const groupSettlements = getGroupSettlements(id);
  const debts = useMemo(() => getGroupBalances(id), [id, getGroupBalances]);
  const pendingInvites = useMemo(() => getGroupPendingInvites(id), [id, getGroupPendingInvites]);
  const messages = useMemo(() => getGroupMessages(id), [id, getGroupMessages]);

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
      Alert.alert(
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

  function handleGroupOptions() {
    if (!group) return;
    const archiveLabel = group.isArchived ? "Unarchive Group" : "Archive Group";
    Alert.alert(group.name, "Group options", [
      {
        text: "Add Expense",
        onPress: () => router.push({ pathname: "/expense/new", params: { groupId: id } }),
      },
      {
        text: "QR Invite Code",
        onPress: () => router.push({ pathname: "/group/qr/[id]", params: { id } }),
      },
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

  function handleDeleteGroup() {
    Alert.alert("Delete Group", "This will delete all expenses in this group. Continue?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => { deleteGroup(id); router.back(); },
      },
    ]);
  }

  function handleSettleAll() {
    if (!group || debts.length === 0) return;
    const total = debts.reduce((s, d) => s + d.amount, 0);
    Alert.alert(
      "Settle Up Group",
      `Record ${debts.length} payment${debts.length > 1 ? "s" : ""} totalling ${formatAmount(total, group.currency)} to mark all balances as settled?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Settle All",
          onPress: () => {
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
          },
        },
      ]
    );
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
      Alert.alert("No email", "This member doesn't have an email address on file.");
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
      Alert.alert("Can't open mail app", `Send a reminder to ${recipientEmail}`);
    }
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
    const netForMe = youPaid ? expense.amount - (myShare?.amount ?? 0) : -(myShare?.amount ?? 0);
    const reactionCount = Object.values(expense.reactions ?? {}).reduce((s, ids) => s + ids.length, 0);
    const commentCount = (expense.comments ?? []).length;

    return (
      <Pressable
        style={({ pressed }) => [
          styles.expenseRow,
          { backgroundColor: colors.surface, opacity: pressed ? 0.92 : 1 },
        ]}
        onPress={() => router.push({ pathname: "/expense/[id]", params: { id: expense.id } })}
      >
        <CategoryIcon category={expense.category} size={40} />
        <View style={styles.expenseBody}>
          <Text style={[styles.expenseName, { color: colors.text }]} numberOfLines={1}>
            {expense.description}
          </Text>
          <View style={styles.expenseMetaRow}>
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
        </View>
        <View style={styles.expenseRight}>
          <AmountText amount={expense.amount} currency={group!.currency} style={[styles.expenseTotal, { color: colors.text }]} />
          <Text style={[styles.expenseNet, { color: netForMe >= 0 ? colors.positive : colors.negative }]}>
            {netForMe >= 0 ? "+" : "-"}{formatAmount(Math.abs(netForMe), group!.currency)}
          </Text>
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
      <ScrollView showsVerticalScrollIndicator={false}>
        {debts.map(debt => {
          const from = getMemberById(debt.fromId);
          const to = getMemberById(debt.toId);
          const isMyDebt = debt.fromId === currentUser.id;
          const isMyCredit = debt.toId === currentUser.id;

          return (
            <View key={`${debt.fromId}_${debt.toId}`} style={[styles.debtCard, { backgroundColor: colors.surface }]}>
              <Avatar name={from?.name ?? ""} color={from?.avatarColor ?? "#ccc"} size={40} />
              <View style={styles.debtBody}>
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
              </View>
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
                  <Avatar name={author?.name ?? ""} color={author?.avatarColor ?? "#ccc"} size={28} />
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
        <Pressable onPress={handleGroupOptions}>
          <Feather name="more-horizontal" size={24} color={colors.text} />
        </Pressable>
      </View>

      <View style={[styles.statsBar, { backgroundColor: colors.surface }]}>
        <View style={styles.statItem}>
          <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Total</Text>
          <Text style={[styles.statValue, { color: colors.text }]}>{formatAmount(totalExpenses, group.currency)}</Text>
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

      <View style={[styles.members, { backgroundColor: colors.surface }]}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.memberList}>
          {group.memberIds.map(mid => {
            const m = getMemberById(mid);
            if (!m) return null;
            return (
              <View key={mid} style={styles.memberChip}>
                <Avatar name={m.name} color={m.avatarColor} size={32} />
                <Text style={[styles.memberName, { color: colors.textSecondary }]} numberOfLines={1}>
                  {m.isCurrentUser ? "You" : m.name.split(" ")[0]}
                </Text>
              </View>
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
          data={groupExpenses}
          keyExtractor={item => item.id}
          contentContainerStyle={[styles.listContent, { paddingBottom: Platform.OS === "web" ? 134 : 100 }]}
          ListEmptyComponent={<EmptyState icon="credit-card" title="No expenses yet" subtitle="Add your first expense to start splitting" />}
          renderItem={({ item }) => renderExpenseItem(item)}
          showsVerticalScrollIndicator={false}
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
  statsBar: {
    flexDirection: "row", marginHorizontal: 16, marginTop: 12, borderRadius: 14, overflow: "hidden",
    shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 2,
  },
  statItem: { flex: 1, alignItems: "center", paddingVertical: 12 },
  statLabel: { fontSize: 11, fontFamily: "Inter_400Regular", marginBottom: 2 },
  statValue: { fontSize: 15, fontFamily: "Inter_700Bold" },
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
  settleOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.55)", alignItems: "center", justifyContent: "center", padding: 24 },
  settleSheet: { width: "100%", borderRadius: 20, padding: 24, gap: 12 },
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
});
