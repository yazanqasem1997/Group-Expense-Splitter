import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import React from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppNotification, useApp } from "@/context/AppContext";
import { useTheme } from "@/hooks/useTheme";
import { timeAgo } from "@/utils/format";

function notifEmoji(n: AppNotification): string {
  switch (n.type) {
    case "expense_added":      return "💸";
    case "expense_edited":     return "✏️";
    case "expense_deleted":    return "🗑️";
    case "settlement_recorded":return "✅";
    case "settlement_deleted": return "↩️";
    case "member_added":       return "👋";
    case "member_removed":     return "👤";
    case "group_updated":      return "⚙️";
    case "group_archived":     return "📦";
    case "group_ended":        return "🔒";
    case "comment_added":      return "💬";
    case "recurring_added":    return "🔄";
    case "recurring_updated":  return "🔄";
    case "recurring_deleted":  return "🔕";
    case "recurring_fired":    return "⚡";
    case "settlement_reminder":
    default:
      if (n.tone === "friendly") return "👋";
      if (n.tone === "urgent")   return "🚨";
      return "⏰";
  }
}

interface Props {
  visible: boolean;
  onClose: () => void;
}

export function NotificationSheet({ visible, onClose }: Props) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { notifications, markAllNotificationsRead, dismissNotification, getGroupById } = useApp();

  function handleOpen() {
    markAllNotificationsRead();
  }

  function handleGroupPress(groupId: string) {
    onClose();
    router.push({ pathname: "/group/[id]", params: { id: groupId } });
  }

  const isEmpty = notifications.length === 0;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
      onShow={handleOpen}
    >
      <View style={[styles.container, { backgroundColor: colors.background, paddingBottom: insets.bottom + 16 }]}>
        {/* Handle bar */}
        <View style={[styles.handleBar, { backgroundColor: colors.border }]} />

        {/* Header */}
        <View style={[styles.header, { borderBottomColor: colors.border }]}>
          <View style={styles.headerLeft}>
            <View style={[styles.bellWrap, { backgroundColor: colors.primary + "18" }]}>
              <Feather name="bell" size={18} color={colors.primary} />
            </View>
            <Text style={[styles.headerTitle, { color: colors.text }]}>Notifications</Text>
          </View>
          <View style={styles.headerRight}>
            {notifications.length > 0 && (
              <Pressable
                style={({ pressed }) => [
                  styles.markAllBtn,
                  { backgroundColor: colors.surface, opacity: pressed ? 0.7 : 1 },
                ]}
                onPress={markAllNotificationsRead}
              >
                <Feather name="check-circle" size={13} color={colors.primary} />
                <Text style={[styles.markAllText, { color: colors.primary }]}>Mark all read</Text>
              </Pressable>
            )}
            <Pressable
              style={({ pressed }) => [styles.closeBtn, { opacity: pressed ? 0.7 : 1 }]}
              onPress={onClose}
            >
              <Feather name="x" size={20} color={colors.textSecondary} />
            </Pressable>
          </View>
        </View>

        {/* Content */}
        {isEmpty ? (
          <View style={styles.emptyState}>
            <View style={[styles.emptyIconWrap, { backgroundColor: colors.surface }]}>
              <Feather name="bell-off" size={32} color={colors.textTertiary} />
            </View>
            <Text style={[styles.emptyTitle, { color: colors.text }]}>All caught up</Text>
            <Text style={[styles.emptySubtitle, { color: colors.textSecondary }]}>
              Expenses, payments, group changes and reminders will appear here
            </Text>
          </View>
        ) : (
          <ScrollView
            style={styles.list}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
          >
            {notifications.map(n => (
              <NotificationCard
                key={n.id}
                notification={n}
                groupName={n.groupId ? getGroupById(n.groupId)?.name : undefined}
                groupEmoji={n.groupId ? getGroupById(n.groupId)?.emoji : undefined}
                onGroupPress={n.groupId ? () => handleGroupPress(n.groupId!) : undefined}
                onDismiss={() => dismissNotification(n.id)}
              />
            ))}
          </ScrollView>
        )}
      </View>
    </Modal>
  );
}

interface CardProps {
  notification: AppNotification;
  groupName?: string;
  groupEmoji?: string;
  onGroupPress?: () => void;
  onDismiss: () => void;
}

function NotificationCard({ notification: n, groupName, groupEmoji, onGroupPress, onDismiss }: CardProps) {
  const { colors } = useTheme();

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: n.read ? colors.surface : colors.primary + "0D",
          borderColor: n.read ? colors.border : colors.primary + "30",
        },
      ]}
    >
      {/* Unread dot */}
      {!n.read && (
        <View style={[styles.unreadDot, { backgroundColor: colors.primary }]} />
      )}

      <View style={styles.cardInner}>
        {/* Top row: emoji + title + dismiss */}
        <View style={styles.cardTopRow}>
          <Text style={styles.cardEmoji}>{notifEmoji(n)}</Text>
          <Text style={[styles.cardTitle, { color: colors.text }]} numberOfLines={2}>
            {n.title}
          </Text>
          <Pressable
            hitSlop={8}
            style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1, marginLeft: 6 })}
            onPress={onDismiss}
          >
            <Feather name="x" size={15} color={colors.textTertiary} />
          </Pressable>
        </View>

        {/* Body */}
        <Text style={[styles.cardBody, { color: colors.textSecondary }]}>{n.body}</Text>

        {/* Footer: timestamp + group link */}
        <View style={styles.cardFooter}>
          <Text style={[styles.cardTime, { color: colors.textTertiary }]}>
            {timeAgo(n.createdAt)}
          </Text>
          {onGroupPress && groupName && (
            <Pressable
              onPress={onGroupPress}
              style={({ pressed }) => [
                styles.groupLink,
                { backgroundColor: colors.primary + "15", opacity: pressed ? 0.75 : 1 },
              ]}
            >
              {groupEmoji ? (
                <Text style={styles.groupEmoji}>{groupEmoji}</Text>
              ) : (
                <Feather name="users" size={11} color={colors.primary} />
              )}
              <Text style={[styles.groupLinkText, { color: colors.primary }]} numberOfLines={1}>
                {groupName}
              </Text>
              <Feather name="arrow-right" size={11} color={colors.primary} />
            </Pressable>
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  handleBar: {
    width: 36,
    height: 4,
    borderRadius: 2,
    alignSelf: "center",
    marginTop: 12,
    marginBottom: 4,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  bellWrap: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    fontSize: 18,
    fontFamily: "Inter_700Bold",
    letterSpacing: -0.3,
  },
  headerRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  markAllBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
  },
  markAllText: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
  },
  closeBtn: {
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  list: {
    flex: 1,
  },
  listContent: {
    padding: 16,
    gap: 10,
  },
  emptyState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 40,
    gap: 12,
  },
  emptyIconWrap: {
    width: 72,
    height: 72,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyTitle: {
    fontSize: 18,
    fontFamily: "Inter_600SemiBold",
  },
  emptySubtitle: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    lineHeight: 20,
  },
  card: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    position: "relative",
    overflow: "hidden",
  },
  unreadDot: {
    position: "absolute",
    top: 14,
    left: 8,
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  cardInner: {
    gap: 6,
    paddingLeft: 6,
  },
  cardTopRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
  },
  cardEmoji: {
    fontSize: 20,
    lineHeight: 24,
  },
  cardTitle: {
    flex: 1,
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    lineHeight: 20,
  },
  cardBody: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    lineHeight: 18,
    paddingLeft: 28,
  },
  cardFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingLeft: 28,
    marginTop: 2,
  },
  cardTime: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
  },
  groupLink: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 8,
    maxWidth: 180,
  },
  groupEmoji: {
    fontSize: 12,
  },
  groupLinkText: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
    flexShrink: 1,
  },
});
