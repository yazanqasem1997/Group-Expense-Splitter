import type { ComponentRef } from "react";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router, useLocalSearchParams } from "expo-router";
import { expenseIdAlias } from "@/utils/expenseAlias";
import React, { useEffect, useRef, useState } from "react";
import {
  Dimensions,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View, Modal } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AmountText, formatAmount } from "@/components/AmountText";
import { Avatar } from "@/components/Avatar";
import { CategoryIcon } from "@/components/CategoryIcon";
import { MemberProfileSheet } from "@/components/MemberProfileSheet";
import { AuditEntry, ExpenseComment, RecurringExpense, getExpensePaidAmounts, useApp } from "@/context/AppContext";
import { showAlert } from "@/hooks/alertStore";
import { useTheme } from "@/hooks/useTheme";
import { formatDate, timeAgo } from "@/utils/format";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const AUDIT_CARD_WIDTH = Math.min(SCREEN_WIDTH * 0.82, 320);
const AUDIT_CARD_GAP = 10;

export default function ExpenseDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const {
    expenses, getMemberById, getGroupById,
    deleteExpense, currentUser, addExpenseComment,
    updateExpense, recurringExpenses,
  } = useApp();

  const [commentText, setCommentText] = useState("");
  const [profileMemberId, setProfileMemberId] = useState<string | null>(null);
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const [showComments, setShowComments] = useState(false);
  const commentRef = useRef<ComponentRef<typeof TextInput>>(null);

  useEffect(() => {
    const show = Keyboard.addListener(
      Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow",
      () => setKeyboardVisible(true),
    );
    const hide = Keyboard.addListener(
      Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide",
      () => setKeyboardVisible(false),
    );
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  const expense = expenses.find(e => e.id === id) ?? expenses.find(e => e.id === expenseIdAlias[id]);
  const topPad = insets.top;

  if (!expense) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <Text style={{ color: colors.text }}>Expense not found</Text>
      </View>
    );
  }

  const group = getGroupById(expense.groupId);
  const payer = getMemberById(expense.paidById);
  const paidAmounts = getExpensePaidAmounts(expense);
  const payerIds = Object.keys(paidAmounts);
  const payers = payerIds.map(memberId => getMemberById(memberId)).filter(Boolean);
  const loggedByMember = expense.addedBy ? getMemberById(expense.addedBy) : undefined;
  const youPaid = (paidAmounts[currentUser.id] ?? 0) > 0;
  const youLogged = !expense.addedBy || expense.addedBy === currentUser.id;
  const sourceSchedule: RecurringExpense | undefined = expense.sourceRecurringId
    ? recurringExpenses.find(r => r.id === expense.sourceRecurringId)
    : undefined;

  const comments = expense.comments ?? [];

  const expenseCurrency = expense.currency;

  function fmtFieldName(field: string): string {
    const map: Record<string, string> = {
      description: "Description", amount: "Amount", paidById: "Paid by",
      splitType: "Split method", splits: "Split breakdown", category: "Category", notes: "Notes",
      paymentDate: "Payment date",
    };
    return map[field] ?? field;
  }

  function fmtAuditValue(field: string, raw: string): string {
    if (field === "amount") {
      const n = parseFloat(raw);
      return isNaN(n) ? raw : formatAmount(n, expenseCurrency);
    }
    if (field === "paidById") {
      const m = getMemberById(raw);
      return m ? (m.isCurrentUser ? "You" : m.name) : raw;
    }
    if (field === "splitType") {
      const labels: Record<string, string> = { equal: "Equal", percentage: "By %", exact: "Exact amounts" };
      return labels[raw] ?? raw;
    }
    if (field === "paymentDate") {
      return raw ? formatDate(raw) : "Not set";
    }
    return raw;
  }

  const effectiveAuditLog: AuditEntry[] = (() => {
    const log = expense.auditLog ?? [];
    const hasCreated = log.some(e => e.action === "created");
    if (hasCreated || log.length === 0) {
      return log.length === 0
        ? [{ id: "synthetic_created", action: "created" as const, changedBy: expense.addedBy ?? expense.paidById, changedAt: expense.createdAt }]
        : log;
    }
    return [
      { id: "synthetic_created", action: "created" as const, changedBy: expense.addedBy ?? expense.paidById, changedAt: expense.createdAt },
      ...log,
    ];
  })();

  function handleDelete() {
    showAlert("Delete Expense", "Are you sure you want to delete this expense?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
          deleteExpense(id);
          router.back();
        },
      },
    ]);
  }

  function handleAddComment() {
    if (!commentText.trim()) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    addExpenseComment(id, commentText);
    setCommentText("");
    commentRef.current?.blur();
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: topPad + 8, backgroundColor: colors.headerBg }]}>
        <Pressable onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Back">
          <Feather name="arrow-left" size={24} color={colors.text} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Expense</Text>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 16 }}>
          <Pressable
            onPress={() => router.push({ pathname: "/expense/new", params: { expenseId: id, groupId: expense.groupId } })}
           accessibilityRole="button" accessibilityLabel="Edit">
            <Feather name="edit-2" size={20} color={colors.primary} />
          </Pressable>
          <Pressable onPress={handleDelete} accessibilityRole="button" accessibilityLabel="Delete">
            <Feather name="trash-2" size={22} color={colors.danger} />
          </Pressable>
        </View>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={0}
      >
        <ScrollView
          contentContainerStyle={[
            styles.content,
            { paddingBottom: Platform.OS === "web" ? 80 : insets.bottom + 80 },
          ]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
        >
          {/* ── Hero ─────────────────────────────────────────────────── */}
          <View style={[styles.heroCard, { backgroundColor: colors.surface }]}>
            <CategoryIcon category={expense.category} description={expense.description} size={56} />
            <Text style={[styles.heroDesc, { color: colors.text }]}>{expense.description}</Text>
            <AmountText
              amount={expense.amount}
              currency={expense.currency}
              style={[styles.heroAmount, { color: colors.primary }]}
            />
            <View style={styles.heroBadges}>
              <View style={[styles.badge, { backgroundColor: colors.primaryLight }]}>
                <Text style={[styles.badgeText, { color: colors.primary }]}>
                  {expense.splitType.charAt(0).toUpperCase() + expense.splitType.slice(1)} split
                </Text>
              </View>
              <View style={[styles.badge, { backgroundColor: colors.primaryLight }]}>
                <Text style={[styles.badgeText, { color: colors.primary }]}>{group?.name}</Text>
              </View>
            </View>
          </View>

          {/* ── Info ─────────────────────────────────────────────────── */}
          <View style={[styles.infoCard, { backgroundColor: colors.surface }]}>
            <View style={styles.infoPair}>
              <Pressable
                style={styles.infoCell}
                onPress={() => {
                  if (expense.paidById) {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    setProfileMemberId(expense.paidById);
                  }
                }}
              >
                <Text style={[styles.infoLabel, { color: colors.textSecondary }]}>Paid by</Text>
                <View style={styles.infoCellValue}>
                  <View style={styles.payerAvatarStack}>
                    {payers.slice(0, 3).map((member, index) => (
                      <View key={member!.id} style={index > 0 ? styles.payerAvatarOverlap : undefined}>
                        <Avatar name={member!.name} color={member!.avatarColor} size={22} imageUri={member!.photo} />
                      </View>
                    ))}
                  </View>
                  <Text style={[styles.infoValue, { color: colors.text, flexShrink: 1 }]} numberOfLines={1}>
                    {payers.length > 1
                      ? payers.map(member => member?.isCurrentUser ? "You" : member?.name).join(", ")
                      : youPaid ? "You" : payer?.name}
                  </Text>
                </View>
              </Pressable>
              <View style={[styles.infoCell, { alignItems: "flex-end" }]}>
                <Text style={[styles.infoLabel, { color: colors.textSecondary }]}>Date</Text>
                <Text style={[styles.infoValue, { color: colors.text }]}>
                  {formatDate(expense.paymentDate ?? expense.createdAt)}
                </Text>
              </View>
            </View>
            <View style={[styles.infoDivider, { backgroundColor: colors.border }]} />
            <View style={styles.infoPair}>
              <View style={styles.infoCell}>
                <Text style={[styles.infoLabel, { color: colors.textSecondary }]}>Category</Text>
                <Text style={[styles.infoValue, { color: colors.text }]}>
                  {expense.category.charAt(0).toUpperCase() + expense.category.slice(1)}
                </Text>
              </View>
              <View style={[styles.infoCell, { alignItems: "flex-end" }]}>
                <Text style={[styles.infoLabel, { color: colors.textSecondary }]}>Logged by</Text>
                <View style={styles.infoCellValue}>
                  <Avatar
                    name={loggedByMember?.name ?? currentUser.name}
                    color={loggedByMember?.avatarColor ?? currentUser.avatarColor}
                    size={22}
                    imageUri={loggedByMember?.photo}
                  />
                  <Text style={[styles.infoValue, { color: colors.text, flexShrink: 1 }]} numberOfLines={1}>
                    {youLogged ? "You" : loggedByMember?.name ?? "Former member"}
                  </Text>
                </View>
              </View>
            </View>
            {!!expense.receiptId && (
              <>
                <View style={[styles.infoDivider, { backgroundColor: colors.border }]} />
                <Pressable
                  style={styles.infoRow}
                  onPress={() =>
                    router.push({
                      pathname: "/receipt/[id]",
                      params: { id: expense.receiptId!, groupId: expense.groupId },
                    })
                  }
                >
                  <Text style={[styles.infoLabel, { color: colors.textSecondary }]}>Receipt</Text>
                  <View style={[styles.infoRight, { gap: 6 }]}>
                    <Feather name="camera" size={15} color={colors.primary} />
                    <Text style={[styles.infoValue, { color: colors.primary }]}>View split</Text>
                    <Feather name="chevron-right" size={14} color={colors.primary} />
                  </View>
                </Pressable>
              </>
            )}
            {!!sourceSchedule && (
              <>
                <View style={[styles.infoDivider, { backgroundColor: colors.border }]} />
                <Pressable
                  style={styles.infoRow}
                  onPress={() => router.push({ pathname: "/group/[id]", params: { id: expense.groupId } })}
                >
                  <Text style={[styles.infoLabel, { color: colors.textSecondary }]}>Auto-generated by</Text>
                  <View style={[styles.infoRight, { gap: 6 }]}>
                    <View style={[styles.recurringSourceBadge, { backgroundColor: colors.primaryLight }]}>
                      <Feather name="repeat" size={12} color={colors.primary} />
                    </View>
                    <Text style={[styles.infoValue, { color: colors.primary }]} numberOfLines={1}>
                      {sourceSchedule.description}
                    </Text>
                    <Feather name="chevron-right" size={14} color={colors.primary} />
                  </View>
                </Pressable>
              </>
            )}
          </View>

          {/* ── Split Breakdown ──────────────────────────────────────── */}
          <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>Split Breakdown</Text>
          <View style={styles.splits}>
            {expense.splits.map(split => {
              const member = getMemberById(split.memberId);
              const isMe = split.memberId === currentUser.id;
              const paidAmount = paidAmounts[split.memberId] ?? 0;
              const isPayer = paidAmount > 0;
              const net = paidAmount - split.amount;
              const owes = net < 0 ? -net : 0;
              const getsBack = net > 0;

              return (
                <Pressable
                  key={split.memberId}
                  style={({ pressed }) => [
                    styles.splitCard,
                    { backgroundColor: colors.surface, borderBottomColor: colors.border, opacity: pressed ? 0.85 : 1 },
                  ]}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    setProfileMemberId(split.memberId);
                  }}
                >
                  <Avatar name={member?.name ?? ""} color={member?.avatarColor ?? "#ccc"} size={40} imageUri={member?.photo} />
                  <View style={styles.splitBody}>
                    <Text style={[styles.splitName, { color: colors.text }]}>
                      {isMe ? "You" : member?.name}
                      {isPayer && (
                        <Text style={{ color: colors.textSecondary }}>
                          {" "}({formatAmount(paidAmount, expense.currency)} paid)
                        </Text>
                      )}
                    </Text>
                    <Text style={[styles.splitShare, { color: colors.textSecondary }]}>
                      Share: {formatAmount(split.amount, expense.currency)}
                      {split.percentage !== undefined ? ` (${split.percentage}%)` : ""}
                    </Text>
                  </View>
                  <View style={styles.splitRight}>
                    {getsBack ? (
                      <AmountText amount={net} currency={expense.currency} style={[styles.splitNet, { color: colors.positive }]} />
                    ) : owes > 0 ? (
                      <AmountText amount={owes} currency={expense.currency} style={[styles.splitNet, { color: colors.negative }]} />
                    ) : (
                      <Text style={[styles.splitNet, { color: colors.textTertiary }]}>—</Text>
                    )}
                    <Text style={[styles.splitNetLabel, { color: colors.textTertiary }]}>
                      {getsBack ? "gets back" : owes > 0 ? "owes" : "settled"}
                    </Text>
                  </View>
                </Pressable>
              );
            })}
          </View>

          {/* ── Change History ───────────────────────────────────────── */}
          <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>Change History</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            snapToInterval={AUDIT_CARD_WIDTH + AUDIT_CARD_GAP}
            decelerationRate="fast"
            contentContainerStyle={styles.auditCarousel}
          >
            {[...effectiveAuditLog].reverse().map((entry: AuditEntry) => {
              const who = getMemberById(entry.changedBy);
              const isMe = entry.changedBy === currentUser.id;
              const actionColor =
                entry.action === "created" ? colors.success
                  : entry.action === "deleted" ? colors.danger
                  : colors.primary;
              const actionBg =
                entry.action === "created" ? colors.successLight
                  : entry.action === "deleted" ? colors.dangerLight
                  : colors.primaryLight;

              return (
                <View
                  key={entry.id}
                    style={[
                      styles.auditCard,
                      { backgroundColor: colors.surface, width: AUDIT_CARD_WIDTH },
                    ]}
                >
                  <View style={styles.auditTop}>
                    <Avatar
                      name={who?.name ?? "?"}
                      color={who?.avatarColor ?? "#ccc"}
                      size={32}
                      imageUri={who?.photo}
                    />
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.auditTitle, { color: colors.text }]}>
                        <Text style={{ fontFamily: "Inter_600SemiBold" }}>
                          {isMe ? "You" : who?.name ?? "Former member"}
                        </Text>
                        {entry.action === "created"
                          ? " created this expense"
                          : entry.action === "updated"
                          ? " edited this expense"
                          : " deleted this expense"}
                      </Text>
                      <Text style={[styles.auditTime, { color: colors.textTertiary }]}>
                        {formatDate(entry.changedAt)}
                      </Text>
                    </View>
                    <View style={[styles.auditActionBadge, { backgroundColor: actionBg }]}>
                      <Text style={[styles.auditActionText, { color: actionColor }]}>
                        {entry.action}
                      </Text>
                    </View>
                  </View>

                  {/* Creation snapshot */}
                  {entry.action === "created" && (() => {
                    const creation = entry.creationSnapshot;
                    const creationAmount = creation?.amount ?? expense.amount;
                    const creationCurrency = creation?.currency ?? expense.currency;
                    const creationPayerId = creation?.paidById ?? expense.paidById;
                    const creationSplitType = creation?.splitType ?? expense.splitType;
                    const creationSplits = creation?.splits ?? expense.splits;
                    const payerM = getMemberById(creationPayerId);
                    const involvedNames = creationSplits
                      .map(s => {
                        const m = getMemberById(s.memberId);
                        return m ? (m.isCurrentUser ? "You" : m.name) : null;
                      })
                      .filter(Boolean);
                    return (
                      <View style={[styles.creationDetails, { backgroundColor: colors.background, borderColor: colors.border }]}>
                        <View style={styles.creationRow}>
                          <Text style={[styles.creationKey, { color: colors.textTertiary }]}>Amount</Text>
                          <Text style={[styles.creationVal, { color: colors.text }]}>
                            {formatAmount(creationAmount, creationCurrency)}
                          </Text>
                        </View>
                        <View style={styles.creationRow}>
                          <Text style={[styles.creationKey, { color: colors.textTertiary }]}>Paid by</Text>
                          <Text style={[styles.creationVal, { color: colors.text }]}>
                            {payerM ? (payerM.isCurrentUser ? "You" : payerM.name) : "Unknown"}
                          </Text>
                        </View>
                        <View style={styles.creationRow}>
                          <Text style={[styles.creationKey, { color: colors.textTertiary }]}>Split</Text>
                          <Text style={[styles.creationVal, { color: colors.text }]}>
                            {creationSplitType.charAt(0).toUpperCase() + creationSplitType.slice(1)}
                            {" · "}{involvedNames.length} {involvedNames.length === 1 ? "person" : "people"}
                          </Text>
                        </View>
                        <View style={[styles.creationRow, { alignItems: "flex-start" }]}>
                          <Text style={[styles.creationKey, { color: colors.textTertiary }]}>Involved</Text>
                          <Text style={[styles.creationVal, { color: colors.text, flex: 2 }]} numberOfLines={3}>
                            {involvedNames.length > 0 ? involvedNames.join(", ") : "None recorded"}
                          </Text>
                        </View>
                        {creationSplits.map((sp, si) => {
                          const m = getMemberById(sp.memberId);
                          if (!m) return null;
                          return (
                            <View key={si} style={[styles.creationShareRow, { borderTopColor: colors.border }]}>
                              <Text style={[styles.creationShareName, { color: colors.textSecondary }]}>
                                {m.isCurrentUser ? "You" : m.name}
                              </Text>
                              <Text style={[styles.creationShareAmt, { color: colors.textSecondary }]}>
                                {formatAmount(sp.amount, creationCurrency)}
                              </Text>
                            </View>
                          );
                        })}
                      </View>
                    );
                  })()}

                  {/* Field changes */}
                  {(entry.fieldChanges ?? []).map((fc, i) => fc.field === "splits" ? (
                    <View key={i} style={styles.auditFieldChange}>
                      <Text style={[styles.auditChangeField, { color: colors.text }]}>Who owes what</Text>
                      {splitDiffRows(fc.oldValue, fc.newValue).map(row => (
                        <View key={row.name} style={{ flexDirection: "row", alignItems: "center", paddingVertical: 3 }}>
                          <Text style={[styles.auditValue, { color: colors.text, flex: 1 }]} numberOfLines={1}>{row.name}</Text>
                          <Text style={[styles.auditValue, { color: colors.textSecondary }]}>{row.before ?? "new"}</Text>
                          <Feather name="arrow-right" size={12} color={colors.textTertiary} style={{ marginHorizontal: 6 }} />
                          <Text style={[styles.auditValue, { color: row.before === row.after ? colors.textSecondary : colors.text, fontWeight: row.before === row.after ? "400" : "700" }]}>{row.after ?? "removed"}</Text>
                        </View>
                      ))}
                    </View>
                  ) : (
                    <View key={i} style={styles.auditFieldChange}>
                      <Text style={[styles.auditChangeField, { color: colors.text }]}>
                        {fmtFieldName(fc.field)}
                      </Text>
                      <View style={styles.auditValueColumns}>
                        <View style={styles.auditValueColumn}>
                          <Text style={[styles.auditValueLabel, { color: colors.negative }]}>Before</Text>
                          <Text style={[styles.auditValue, { color: colors.textSecondary }]}>
                            {fmtAuditValue(fc.field, fc.oldValue) || "Not set"}
                          </Text>
                        </View>
                        <Feather name="arrow-right" size={14} color={colors.textTertiary} style={styles.auditValueArrow} />
                        <View style={styles.auditValueColumn}>
                          <Text style={[styles.auditValueLabel, { color: colors.positive }]}>After</Text>
                          <Text style={[styles.auditValue, { color: colors.text }]}>
                            {fmtAuditValue(fc.field, fc.newValue) || "Not set"}
                          </Text>
                        </View>
                      </View>
                    </View>
                  ))}
                </View>
              );
            })}
          </ScrollView>

          {/* Comments: one row, opens the sheet */}
        <Pressable
          onPress={() => setShowComments(true)}
          style={({ pressed }) => [styles.commentsRow, { backgroundColor: colors.surfaceElevated, borderColor: colors.border, opacity: pressed ? 0.85 : 1 }]}
          accessibilityRole="button"
          accessibilityLabel="Open comments"
        >
          <Feather name="message-circle" size={18} color={colors.primary} />
          <Text style={{ flex: 1, fontSize: 14, fontFamily: "Inter_600SemiBold", color: colors.text }}>Comments</Text>
          {comments.length > 0 ? (
            <View style={{ backgroundColor: colors.primaryLight, borderRadius: 999, paddingHorizontal: 9, paddingVertical: 2 }}>
              <Text style={{ fontSize: 12, fontFamily: "Inter_700Bold", color: colors.primary }}>{comments.length}</Text>
            </View>
          ) : null}
          <Feather name="chevron-right" size={18} color={colors.textTertiary} />
        </Pressable>
        </ScrollView>

        </KeyboardAvoidingView>

      <Modal visible={showComments} transparent animationType="slide" onRequestClose={() => setShowComments(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1, justifyContent: "flex-end" }}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setShowComments(false)} accessibilityLabel="Close comments" />
          <View style={[styles.commentsSheet, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={[styles.commentsGrab, { backgroundColor: colors.border }]} />
            <ScrollView keyboardShouldPersistTaps="handled" style={{ flexShrink: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: 8 }}>
              {comments.length > 0 ? (
            <View style={styles.commentsList}>
              {comments.map((c: ExpenseComment) => {
                const author = getMemberById(c.memberId);
                const isMe = c.memberId === currentUser.id;
                return (
                  <View
                    key={c.id}
                    style={[
                      styles.commentBubble,
                      {
                        backgroundColor: isMe ? colors.primary + "12" : colors.surface,
                        borderColor: isMe ? colors.primary + "30" : colors.border,
                        alignSelf: isMe ? "flex-end" : "flex-start",
                      },
                    ]}
                  >
                    <View style={styles.commentAuthorRow}>
                      <Avatar
                        name={isMe ? currentUser.name : (author?.name ?? "")}
                        color={isMe ? currentUser.avatarColor : (author?.avatarColor ?? "#ccc")}
                        size={18}
                        imageUri={isMe ? currentUser.photo : author?.photo}
                      />
                      <Text style={[styles.commentAuthor, { color: isMe ? colors.primary : colors.primary }]}>
                        {isMe ? "You" : (author?.name ?? "Former member")}
                      </Text>
                    </View>
                    <Text style={[styles.commentText, { color: colors.text }]}>{c.text}</Text>
                    <Text style={[styles.commentTime, { color: colors.textTertiary }]}>{timeAgo(c.createdAt)}</Text>
                  </View>
                );
              })}
            </View>
          ) : (
            <View style={[styles.noComments, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Text style={[styles.noCommentsText, { color: colors.textTertiary }]}>
                No comments yet — add the first one
              </Text>
            </View>
          )}

        
            </ScrollView>
            {/* ── Comment input — sticky above keyboard ─────────────────── */}
        <View
          style={[
            styles.commentInputBar,
            {
              backgroundColor: colors.surface,
              borderTopColor: colors.border,
              paddingBottom: keyboardVisible ? 10 : Math.max(insets.bottom, 10),
            },
          ]}
        >
          <Avatar name={currentUser.name} color={currentUser.avatarColor} size={32} imageUri={currentUser.photo} />
          <TextInput
            ref={commentRef}
            style={[styles.commentInput, { color: colors.text, backgroundColor: colors.inputBg }]}
            value={commentText}
            onChangeText={setCommentText}
            placeholder="Add a comment…"
            placeholderTextColor={colors.textTertiary}
            returnKeyType="send"
            onSubmitEditing={handleAddComment}
            multiline
          />
          <Pressable
            style={styles.sendBtn}
            onPress={handleAddComment}
           accessibilityRole="button" accessibilityLabel="Send">
            <Feather name="send" size={19} color={commentText.trim() ? colors.primary : colors.textTertiary} />
          </Pressable>
        </View>
      
          </View>
        </KeyboardAvoidingView>
      </Modal>
      <MemberProfileSheet
        memberId={profileMemberId}
        groupId={expense.groupId}
        visible={profileMemberId !== null}
        onClose={() => setProfileMemberId(null)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  commentsRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 13, paddingVertical: 12, borderRadius: 18, borderWidth: 1 },
  commentsSheet: { borderTopLeftRadius: 22, borderTopRightRadius: 22, borderWidth: 1, paddingTop: 10, maxHeight: "80%" },
  commentsGrab: { width: 36, height: 4, borderRadius: 2, alignSelf: "center", marginBottom: 4 },
  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 20, paddingBottom: 16,
    shadowColor: "#000", shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05, shadowRadius: 4, elevation: 2,
  },
  headerTitle: { fontSize: 18, fontFamily: "Inter_700Bold" },
  content: { padding: 16, gap: 14 },

  // Hero
  heroCard: {
    alignItems: "center", padding: 28, borderRadius: 20, gap: 10,
    shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 2,
  },
  heroDesc: { fontSize: 20, fontFamily: "Inter_700Bold", textAlign: "center" },
  heroAmount: { fontSize: 36, fontFamily: "Inter_700Bold", maxWidth: "100%", textAlign: "center" },
  heroBadges: { flexDirection: "row", gap: 8 },
  badge: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 20 },
  badgeText: { fontSize: 12, fontFamily: "Inter_500Medium" },

  // Info
  infoCard: {
    borderRadius: 16, overflow: "hidden",
    shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 2,
  },
  infoRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 14 },
  infoLabel: { fontSize: 14, fontFamily: "Inter_400Regular" },
  infoRight: { flexDirection: "row", alignItems: "center", gap: 8 },
  payerAvatarStack: { flexDirection: "row", alignItems: "center" },
  payerAvatarOverlap: { marginLeft: -6 },
  infoValue: { fontSize: 14, fontFamily: "Inter_500Medium" },
  infoPair: { flexDirection: "row", justifyContent: "space-between", gap: 12, paddingHorizontal: 14, paddingVertical: 10 },
  infoCell: { flex: 1, gap: 3 },
  infoCellValue: { flexDirection: "row", alignItems: "center", gap: 6 },
  infoDivider: { height: 1, marginHorizontal: 14 },
  recurringSourceBadge: { width: 24, height: 24, borderRadius: 12, alignItems: "center", justifyContent: "center" },

  // Section label
  sectionLabel: {
    fontSize: 12, fontFamily: "Inter_600SemiBold",
    textTransform: "uppercase", letterSpacing: 0.8, marginTop: 4,
  },

  // Splits
  splits: { borderRadius: 16, overflow: "hidden" },
  splitCard: {
    flexDirection: "row", alignItems: "center", padding: 14, gap: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  splitBody: { flex: 1 },
  splitName: { fontSize: 15, fontFamily: "Inter_500Medium" },
  splitShare: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
  splitRight: { alignItems: "flex-end" },
  splitNet: { fontSize: 15, fontFamily: "Inter_700Bold" },
  splitNetLabel: { fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 2 },

  // Change history carousel
  auditCarousel: {
    paddingLeft: 0,
    paddingRight: 16,
    gap: AUDIT_CARD_GAP,
  },
  auditCard: {
    borderRadius: 16, padding: 14, gap: 6,
    shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 6, elevation: 2,
    flexShrink: 0,
  },
  auditTop: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  auditActionBadge: { paddingHorizontal: 7, paddingVertical: 3, borderRadius: 8, alignSelf: "flex-start" },
  auditActionText: { fontSize: 10, fontFamily: "Inter_600SemiBold", textTransform: "uppercase", letterSpacing: 0.4 },
  auditTitle: { fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 18, flex: 1 },
  auditFieldChange: { marginTop: 6, gap: 2 },
  auditChangeField: { fontSize: 12, fontFamily: "Inter_600SemiBold", marginTop: 6 },
  auditValueColumns: { flexDirection: "row", alignItems: "stretch", gap: 8, marginTop: 4 },
  auditValueColumn: { flex: 1, gap: 3 },
  auditValueLabel: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  auditValue: { fontSize: 12, fontFamily: "Inter_400Regular", lineHeight: 17 },
  auditValueArrow: { alignSelf: "center" },
  auditTime: { fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 1 },

  // Creation snapshot inside audit card
  creationDetails: { marginTop: 8, borderRadius: 10, borderWidth: 1, overflow: "hidden" },
  creationRow: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 10, paddingVertical: 7,
  },
  creationKey: { fontSize: 11, fontFamily: "Inter_400Regular", flex: 1 },
  creationVal: { fontSize: 11, fontFamily: "Inter_600SemiBold", textAlign: "right" },
  creationShareRow: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 10, paddingVertical: 5, borderTopWidth: StyleSheet.hairlineWidth,
  },
  creationShareName: { fontSize: 11, fontFamily: "Inter_400Regular" },
  creationShareAmt: { fontSize: 11, fontFamily: "Inter_500Medium" },

  // Comments
  commentsList: { gap: 10 },
  commentBubble: { maxWidth: "80%", borderRadius: 16, borderWidth: 1, padding: 12, gap: 4 },
  commentAuthorRow: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 2 },
  commentAuthor: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  commentText: { fontSize: 14, fontFamily: "Inter_400Regular", lineHeight: 20 },
  commentTime: { fontSize: 11, fontFamily: "Inter_400Regular" },
  noComments: { borderRadius: 14, borderWidth: 1, padding: 16, alignItems: "center" },
  noCommentsText: { fontSize: 13, fontFamily: "Inter_400Regular" },

  // Comment input — sticky above keyboard
  commentInputBar: {
    flexDirection: "row", alignItems: "flex-end", gap: 10,
    paddingHorizontal: 16, paddingTop: 10, paddingBottom: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  commentInput: {
    flex: 1, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8,
    fontSize: 14, fontFamily: "Inter_400Regular", maxHeight: 80,
  },
  sendBtn: { width: 36, height: 36, alignItems: "center", justifyContent: "center" },
});

/** Turn the stored "You: 10.00, Ali: 5.00" breakdowns into per-person before/after rows, changed people first. */
function splitDiffRows(oldValue: string, newValue: string) {
  const parse = (v: string) => new Map(
    (v || "").split(", ").filter(Boolean).map(part => {
      const i = part.lastIndexOf(": ");
      return [i > 0 ? part.slice(0, i) : part, i > 0 ? part.slice(i + 2) : ""] as [string, string];
    }),
  );
  const before = parse(oldValue);
  const after = parse(newValue);
  const names = [...new Set([...before.keys(), ...after.keys()])];
  return names
    .map(name => ({ name, before: before.get(name), after: after.get(name) }))
    .sort((x, y) => Number(x.before === x.after) - Number(y.before === y.after));
}
