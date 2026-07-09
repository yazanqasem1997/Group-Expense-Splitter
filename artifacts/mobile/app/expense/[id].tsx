import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router, useLocalSearchParams } from "expo-router";
import React, { useRef, useState } from "react";
import {
  Alert,
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
import { ExpenseComment, useApp } from "@/context/AppContext";
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
  } = useApp();

  const [commentText, setCommentText] = useState("");
  const [showAllReactions, setShowAllReactions] = useState(false);
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

  function handleDelete() {
    Alert.alert("Delete Expense", "Are you sure you want to delete this expense?", [
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
        <Pressable onPress={handleDelete}>
          <Feather name="trash-2" size={22} color={colors.danger} />
        </Pressable>
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
              <View style={styles.infoRight}>
                <Avatar name={payer?.name ?? ""} color={payer?.avatarColor ?? "#ccc"} size={24} />
                <Text style={[styles.infoValue, { color: colors.text }]}>
                  {youPaid ? "You" : payer?.name}
                </Text>
              </View>
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
                <View key={split.memberId} style={[styles.splitCard, { backgroundColor: colors.surface }]}>
                  <Avatar name={member?.name ?? ""} color={member?.avatarColor ?? "#ccc"} size={40} />
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
                </View>
              );
            })}
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
                          <Avatar name={author?.name ?? ""} color={author?.avatarColor ?? "#ccc"} size={18} />
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
});
