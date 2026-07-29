import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router, useLocalSearchParams } from "expo-router";
import React, { useRef, useState } from "react";
import {

  KeyboardAvoidingView,
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
import { MemberProfileSheet } from "@/components/MemberProfileSheet";
import { AuditEntry, ExpenseComment, useApp } from "@/context/AppContext";
import { showAlert } from "@/hooks/alertStore";
import { useTheme } from "@/hooks/useTheme";
import { formatDate, timeAgo } from "@/utils/format";

const REACTION_EMOJIS = ["👍", "❤️", "😂", "🙈", "💀", "🔥", "😬", "🎉"];

export default function ExpenseDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const {
    expenses, getMemberById, getGroupById,
    deleteExpense, currentUser, toggleReaction, addExpenseComment,
    updateExpense,
  } = useApp();

  const [commentText, setCommentText] = useState("");
  const [showAllReactions, setShowAllReactions] = useState(false);
  const [profileMemberId, setProfileMemberId] = useState<string | null>(null);
  const commentRef = useRef<TextInput>(null);

  const expense = expenses.find(e => e.id === id);
  const topPad = Platform.OS === "web" ? 67 : insets.top;

  if (!expense) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <Text style={{ color: colors.text }}>Expense not found</Text>
      </View>
    );
  }

  const group = getGroupById(expense.groupId);
  const payer = getMemberById(expense.paidById);
  const loggedByMember = expense.addedBy ? getMemberById(expense.addedBy) : undefined;
  const youPaid = expense.paidById === currentUser.id;
  const youLogged = !expense.addedBy || expense.addedBy === currentUser.id;

  const reactions = expense.reactions ?? {};
  const comments = expense.comments ?? [];
  const totalReactions = Object.values(reactions).reduce((s, ids) => s + ids.length, 0);

  // Format a raw audit field value for human-readable display
  const expenseCurrency = expense.currency;
  function fmtAuditValue(field: string, raw: string): string {
    if (field === "amount") {
      const n = parseFloat(raw);
      return isNaN(n) ? raw : formatAmount(n, expenseCurrency);
    }
    if (field === "paidById") {
      const m = getMemberById(raw);
      return m ? (m.isCurrentUser ? "You" : m.name) : raw;
    }
    return raw;
  }


  // Always have at least a synthetic "created" entry so history is never blank
  const effectiveAuditLog: AuditEntry[] =
    expense.auditLog && expense.auditLog.length > 0
      ? expense.auditLog
      : [
          {
            id: "synthetic_created",
            action: "created" as const,
            changedBy: expense.addedBy ?? expense.paidById,
            changedAt: expense.createdAt,
          },
        ];

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

  function handleReaction(emoji: string) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    toggleReaction(id, emoji);
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
      <View style={[styles.header, { paddingTop: topPad + 8, backgroundColor: colors.headerBg }]}>
        <Pressable onPress={() => router.back()}>
          <Feather name="arrow-left" size={24} color={colors.text} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Expense</Text>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 16 }}>
          <Pressable
            onPress={() => router.push({ pathname: "/expense/new", params: { expenseId: id, groupId: expense.groupId } })}
          >
            <Feather name="edit-2" size={20} color={colors.primary} />
          </Pressable>
          <Pressable onPress={handleDelete}>
            <Feather name="trash-2" size={22} color={colors.danger} />
          </Pressable>
        </View>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={topPad + 56}
      >
        <ScrollView
          contentContainerStyle={[styles.content, { paddingBottom: Platform.OS === "web" ? 60 : 40 }]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
        >
          {/* Hero */}
          <View style={[styles.heroCard, { backgroundColor: colors.surface }]}>
            <CategoryIcon category={expense.category} size={56} />
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

          {/* Reactions */}
          <View style={[styles.reactionsCard, { backgroundColor: colors.surface }]}>
            <View style={styles.reactionsHeader}>
              <Text style={[styles.reactionsTitle, { color: colors.text }]}>Reactions</Text>
              {totalReactions > 0 && (
                <Text style={[styles.reactionCount, { color: colors.textSecondary }]}>
                  {totalReactions} reaction{totalReactions !== 1 ? "s" : ""}
                </Text>
              )}
            </View>

            <View style={styles.emojiRow}>
              {(showAllReactions ? REACTION_EMOJIS : REACTION_EMOJIS.slice(0, 5)).map(emoji => {
                const emojiReactors = reactions[emoji] ?? [];
                const reacted = emojiReactors.includes(currentUser.id);
                const count = emojiReactors.length;
                return (
                  <Pressable
                    key={emoji}
                    style={[
                      styles.emojiBtn,
                      {
                        backgroundColor: reacted ? colors.primary + "18" : colors.background,
                        borderColor: reacted ? colors.primary : colors.border,
                      },
                    ]}
                    onPress={() => handleReaction(emoji)}
                  >
                    <Text style={styles.emojiText}>{emoji}</Text>
                    {count > 0 && (
                      <Text style={[styles.emojiCount, { color: reacted ? colors.primary : colors.textSecondary }]}>
                        {count}
                      </Text>
                    )}
                  </Pressable>
                );
              })}
              {!showAllReactions && (
                <Pressable
                  style={[styles.emojiBtn, { backgroundColor: colors.background, borderColor: colors.border }]}
                  onPress={() => setShowAllReactions(true)}
                >
                  <Text style={[styles.emojiCount, { color: colors.textSecondary }]}>+{REACTION_EMOJIS.length - 5}</Text>
                </Pressable>
              )}
            </View>
          </View>

          {/* Info */}
          <View style={[styles.infoCard, { backgroundColor: colors.surface }]}>
            <View style={styles.infoRow}>
              <Text style={[styles.infoLabel, { color: colors.textSecondary }]}>Paid by</Text>
              <Pressable
                style={styles.infoRight}
                onPress={() => {
                  if (expense.paidById) {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    setProfileMemberId(expense.paidById);
                  }
                }}
              >
                <Avatar name={payer?.name ?? ""} color={payer?.avatarColor ?? "#ccc"} size={24} imageUri={payer?.photo} />
                <Text style={[styles.infoValue, { color: colors.text }]}>
                  {youPaid ? "You" : payer?.name}
                </Text>
              </Pressable>
            </View>
            <View style={[styles.infoDivider, { backgroundColor: colors.border }]} />
            <View style={styles.infoRow}>
              <Text style={[styles.infoLabel, { color: colors.textSecondary }]}>Date</Text>
              <Text style={[styles.infoValue, { color: colors.text }]}>
                {formatDate(expense.createdAt)}
              </Text>
            </View>
            <View style={[styles.infoDivider, { backgroundColor: colors.border }]} />
            <View style={styles.infoRow}>
              <Text style={[styles.infoLabel, { color: colors.textSecondary }]}>Category</Text>
              <Text style={[styles.infoValue, { color: colors.text }]}>
                {expense.category.charAt(0).toUpperCase() + expense.category.slice(1)}
              </Text>
            </View>
            <View style={[styles.infoDivider, { backgroundColor: colors.border }]} />
            <View style={styles.infoRow}>
              <Text style={[styles.infoLabel, { color: colors.textSecondary }]}>Logged by</Text>
              <View style={styles.infoRight}>
                <Avatar
                  name={loggedByMember?.name ?? currentUser.name}
                  color={loggedByMember?.avatarColor ?? currentUser.avatarColor}
                  size={24}
                  imageUri={loggedByMember?.photo}
                />
                <Text style={[styles.infoValue, { color: colors.text }]}>
                  {youLogged ? "You" : loggedByMember?.name ?? "Unknown"}
                </Text>
              </View>
            </View>
          </View>

          {/* Split Breakdown */}
          <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>Split Breakdown</Text>
          <View style={styles.splits}>
            {expense.splits.map(split => {
              const member = getMemberById(split.memberId);
              const isMe = split.memberId === currentUser.id;
              const isPayer = split.memberId === expense.paidById;
              const owes = !isPayer ? split.amount : 0;
              const lent = isPayer ? expense.amount - split.amount : 0;

              return (
                <Pressable
                  key={split.memberId}
                  style={({ pressed }) => [styles.splitCard, { backgroundColor: colors.surface, opacity: pressed ? 0.85 : 1 }]}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    setProfileMemberId(split.memberId);
                  }}
                >
                  <Avatar name={member?.name ?? ""} color={member?.avatarColor ?? "#ccc"} size={40} imageUri={member?.photo} />
                  <View style={styles.splitBody}>
                    <Text style={[styles.splitName, { color: colors.text }]}>
                      {isMe ? "You" : member?.name}
                      {isPayer && <Text style={{ color: colors.textSecondary }}> (paid)</Text>}
                    </Text>
                    <Text style={[styles.splitShare, { color: colors.textSecondary }]}>
                      Share: {formatAmount(split.amount, expense.currency)}
                      {split.percentage !== undefined ? ` (${split.percentage}%)` : ""}
                    </Text>
                  </View>
                  <View style={styles.splitRight}>
                    {isPayer && lent > 0 ? (
                      <AmountText amount={lent} currency={expense.currency} style={[styles.splitNet, { color: colors.positive }]} />
                    ) : owes > 0 ? (
                      <AmountText amount={owes} currency={expense.currency} style={[styles.splitNet, { color: colors.negative }]} />
                    ) : (
                      <Text style={[styles.splitNet, { color: colors.textTertiary }]}>—</Text>
                    )}
                    <Text style={[styles.splitNetLabel, { color: colors.textTertiary }]}>
                      {isPayer && lent > 0 ? "gets back" : owes > 0 ? "owes" : "settled"}
                    </Text>
                  </View>
                </Pressable>
              );
            })}
          </View>

          {/* Audit Trail — always shown; older entries get a synthetic "created" entry */}
          <View style={styles.auditSection}>
              <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>Change History</Text>
              <View style={styles.auditList}>
                {[...effectiveAuditLog].reverse().map((entry: AuditEntry) => {
                  const who = getMemberById(entry.changedBy);
                  const isMe = entry.changedBy === currentUser.id;
                  const actionColor =
                    entry.action === "created"
                      ? colors.success
                      : entry.action === "deleted"
                      ? colors.danger
                      : colors.primary;
                  const actionBg =
                    entry.action === "created"
                      ? colors.successLight
                      : entry.action === "deleted"
                      ? colors.dangerLight
                      : colors.primaryLight;

                  return (
                    <View key={entry.id} style={[styles.auditCard, { backgroundColor: colors.surface }]}>
                      <View style={styles.auditLeft}>
                        <Avatar
                          name={who?.name ?? "?"}
                          color={who?.avatarColor ?? "#ccc"}
                          size={34}
                          imageUri={who?.photo}
                        />
                        <View style={[styles.auditActionBadge, { backgroundColor: actionBg }]}>
                          <Text style={[styles.auditActionText, { color: actionColor }]}>
                            {entry.action}
                          </Text>
                        </View>
                      </View>
                      <View style={styles.auditBody}>
                        <Text style={[styles.auditTitle, { color: colors.text }]}>
                          <Text style={{ fontFamily: "Inter_600SemiBold" }}>
                            {isMe ? "You" : who?.name ?? "Unknown"}
                          </Text>
                          {entry.action === "created"
                            ? " created this expense"
                            : entry.action === "updated"
                            ? " edited this expense"
                            : " deleted this expense"}
                        </Text>

                        {/* Rich creation snapshot */}
                        {entry.action === "created" && (() => {
                          const payerM = getMemberById(expense.paidById);
                          const involvedNames = (expense.splits ?? [])
                            .map(s => {
                              const m = getMemberById(s.memberId);
                              return m ? (m.isCurrentUser ? "You" : m.name.split(" ")[0]) : null;
                            })
                            .filter(Boolean);
                          return (
                            <View style={[styles.creationDetails, { backgroundColor: colors.background, borderColor: colors.border }]}>
                              <View style={styles.creationRow}>
                                <Text style={[styles.creationKey, { color: colors.textTertiary }]}>Amount</Text>
                                <Text style={[styles.creationVal, { color: colors.text }]}>
                                  {formatAmount(expense.amount, expense.currency)}
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
                                  {expense.splitType.charAt(0).toUpperCase() + expense.splitType.slice(1)}
                                  {" · "}{involvedNames.length} {involvedNames.length === 1 ? "person" : "people"}
                                </Text>
                              </View>
                              {(expense.splits ?? []).map((sp, si) => {
                                const m = getMemberById(sp.memberId);
                                if (!m) return null;
                                return (
                                  <View key={si} style={[styles.creationShareRow, { borderTopColor: colors.border }]}>
                                    <Text style={[styles.creationShareName, { color: colors.textSecondary }]}>
                                      {m.isCurrentUser ? "You" : m.name.split(" ")[0]}
                                    </Text>
                                    <Text style={[styles.creationShareAmt, { color: colors.textSecondary }]}>
                                      {formatAmount(sp.amount, expense.currency)}
                                    </Text>
                                  </View>
                                );
                              })}
                            </View>
                          );
                        })()}

                        {(entry.fieldChanges ?? []).map((fc, i) => (
                          <Text key={i} style={[styles.auditChange, { color: colors.textSecondary }]}>
                            <Text style={{ fontFamily: "Inter_600SemiBold", color: colors.textSecondary }}>
                              {fc.field}
                            </Text>
                            {": "}
                            <Text style={{ color: colors.negative }}>{fmtAuditValue(fc.field, fc.oldValue)}</Text>
                            {" → "}
                            <Text style={{ color: colors.positive }}>{fmtAuditValue(fc.field, fc.newValue)}</Text>
                          </Text>
                        ))}
                        <Text style={[styles.auditTime, { color: colors.textTertiary }]}>
                          {timeAgo(entry.changedAt)}
                        </Text>
                      </View>
                    </View>
                  );
                })}
              </View>
            </View>

          {/* Comments */}
          <View style={styles.commentsSection}>
            <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>
              Comments {comments.length > 0 ? `(${comments.length})` : ""}
            </Text>

            {comments.length > 0 ? (
              <View style={styles.commentsList}>
                {comments.map((c: ExpenseComment) => {
                  const author = getMemberById(c.memberId);
                  const isMe = c.memberId === currentUser.id;
                  return (
                    <View key={c.id} style={[styles.commentBubble, {
                      backgroundColor: isMe ? colors.primary + "12" : colors.surface,
                      borderColor: isMe ? colors.primary + "30" : colors.border,
                      alignSelf: isMe ? "flex-end" : "flex-start",
                    }]}>
                      {!isMe && (
                        <View style={styles.commentAuthorRow}>
                          <Avatar name={author?.name ?? ""} color={author?.avatarColor ?? "#ccc"} size={18} imageUri={author?.photo} />
                          <Text style={[styles.commentAuthor, { color: colors.primary }]}>
                            {author?.name ?? "Unknown"}
                          </Text>
                        </View>
                      )}
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
          </View>
        </ScrollView>

        {/* Comment input */}
        <View style={[styles.commentInputBar, { backgroundColor: colors.surface, borderTopColor: colors.border }]}>
          <Avatar name={currentUser.name} color={currentUser.avatarColor} size={32} />
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
            style={[styles.sendBtn, { backgroundColor: commentText.trim() ? colors.primary : colors.border }]}
            onPress={handleAddComment}
          >
            <Feather name="send" size={16} color={commentText.trim() ? "#fff" : colors.textTertiary} />
          </Pressable>
        </View>
      </KeyboardAvoidingView>

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
  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 20, paddingBottom: 16,
    shadowColor: "#000", shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05, shadowRadius: 4, elevation: 2,
  },
  headerTitle: { fontSize: 18, fontFamily: "Inter_700Bold" },
  content: { padding: 16, gap: 14 },
  heroCard: {
    alignItems: "center", padding: 28, borderRadius: 20, gap: 10,
    shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 2,
  },
  heroDesc: { fontSize: 20, fontFamily: "Inter_700Bold", textAlign: "center" },
  heroAmount: { fontSize: 36, fontFamily: "Inter_700Bold" },
  heroBadges: { flexDirection: "row", gap: 8 },
  badge: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 20 },
  badgeText: { fontSize: 12, fontFamily: "Inter_500Medium" },
  reactionsCard: {
    borderRadius: 16, padding: 16, gap: 12,
    shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 2,
  },
  reactionsHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  reactionsTitle: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  reactionCount: { fontSize: 12, fontFamily: "Inter_400Regular" },
  emojiRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  emojiBtn: {
    flexDirection: "row", alignItems: "center", gap: 5,
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, borderWidth: 1,
  },
  emojiText: { fontSize: 18 },
  emojiCount: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  infoCard: {
    borderRadius: 16, overflow: "hidden",
    shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 2,
  },
  infoRow: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 14,
  },
  infoLabel: { fontSize: 14, fontFamily: "Inter_400Regular" },
  infoRight: { flexDirection: "row", alignItems: "center", gap: 8 },
  infoValue: { fontSize: 14, fontFamily: "Inter_500Medium" },
  infoDivider: { height: 1, marginHorizontal: 14 },
  sectionLabel: {
    fontSize: 12, fontFamily: "Inter_600SemiBold", textTransform: "uppercase", letterSpacing: 0.8, marginTop: 4,
  },
  splits: { gap: 10 },
  splitCard: {
    flexDirection: "row", alignItems: "center", padding: 14, borderRadius: 16, gap: 12,
    shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 2,
  },
  splitBody: { flex: 1 },
  splitName: { fontSize: 15, fontFamily: "Inter_500Medium" },
  splitShare: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
  splitRight: { alignItems: "flex-end" },
  splitNet: { fontSize: 15, fontFamily: "Inter_700Bold" },
  splitNetLabel: { fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 2 },
  commentsSection: { gap: 10 },
  commentsList: { gap: 10 },
  commentBubble: {
    maxWidth: "80%", borderRadius: 16, borderWidth: 1, padding: 12, gap: 4,
  },
  commentAuthorRow: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 2 },
  commentAuthor: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  commentText: { fontSize: 14, fontFamily: "Inter_400Regular", lineHeight: 20 },
  commentTime: { fontSize: 11, fontFamily: "Inter_400Regular" },
  noComments: {
    borderRadius: 14, borderWidth: 1, padding: 16, alignItems: "center",
  },
  noCommentsText: { fontSize: 13, fontFamily: "Inter_400Regular" },
  commentInputBar: {
    flexDirection: "row", alignItems: "flex-end", gap: 10,
    paddingHorizontal: 16, paddingVertical: 10, borderTopWidth: 1,
  },
  commentInput: {
    flex: 1, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8,
    fontSize: 14, fontFamily: "Inter_400Regular", maxHeight: 80,
  },
  sendBtn: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  auditSection: { gap: 10 },
  auditList: { gap: 10 },
  auditCard: {
    flexDirection: "row", alignItems: "flex-start", padding: 14, borderRadius: 16, gap: 12,
    shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 6, elevation: 2,
  },
  auditLeft: { alignItems: "center", gap: 6 },
  auditActionBadge: { paddingHorizontal: 6, paddingVertical: 3, borderRadius: 8 },
  auditActionText: { fontSize: 10, fontFamily: "Inter_600SemiBold", textTransform: "uppercase", letterSpacing: 0.4 },
  auditBody: { flex: 1, gap: 3 },
  auditTitle: { fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 18 },
  auditChange: { fontSize: 12, fontFamily: "Inter_400Regular", lineHeight: 17 },
  auditTime: { fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 2 },
  creationDetails: {
    marginTop: 8, borderRadius: 10, borderWidth: 1, overflow: "hidden",
  },
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
});
