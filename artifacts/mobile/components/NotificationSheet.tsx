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
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppNotification, DirectPayment, useApp } from "@/context/AppContext";
import { CategoryIcon } from "@/components/CategoryIcon";
import { useTheme } from "@/hooks/useTheme";
import { timeAgo } from "@/utils/format";
import { api } from "@/services/apiSync";

// ─── Icon mapping ─────────────────────────────────────────────────────────────

function notifIcon(type: AppNotification["type"], tone?: string): { name: string; color: string } {
  switch (type) {
    case "expense_added":        return { name: "plus-circle",    color: "#3070CC" };
    case "expense_edited":       return { name: "edit-2",         color: "#7040D0" };
    case "expense_deleted":      return { name: "trash-2",        color: "#CC3030" };
    case "settlement_recorded":  return { name: "check-circle",   color: "#0A9460" };
    case "settlement_deleted":   return { name: "rotate-ccw",     color: "#C88800" };
    case "member_added":         return { name: "user-plus",      color: "#3070CC" };
    case "member_removed":       return { name: "user-minus",     color: "#5A6070" };
    case "group_updated":        return { name: "settings",       color: "#5A6070" };
    case "simplify_debts_changed": return { name: "git-merge",    color: "#0A9460" };
    case "group_archived":       return { name: "archive",        color: "#5A6070" };
    case "group_ended":          return { name: "lock",           color: "#5A6070" };
    case "comment_added":        return { name: "message-circle", color: "#7040D0" };
    case "recurring_added":
    case "recurring_updated":
    case "recurring_fired":      return { name: "repeat",         color: "#3070CC" };
    case "recurring_deleted":    return { name: "bell-off",       color: "#5A6070" };
    case "settlement_reminder":
    default:
      if (tone === "urgent") return { name: "alert-circle", color: "#CC3030" };
      return { name: "clock", color: "#C88800" };
  }
}

// ─── Native swipeable row ─────────────────────────────────────────────────────
// Uses react-native-gesture-handler so the vertical list and horizontal gesture
// coordinate natively. A full left swipe deletes immediately.

interface SwipeProps { onDelete: () => void; children: React.ReactNode }

function SwipeableRow({ onDelete, children }: SwipeProps) {
  const translateX = useSharedValue(0);
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));
  const deletePreviewStyle = useAnimatedStyle(() => ({
    opacity: Math.min(Math.max(-translateX.value / 110, 0), 1),
  }));

  const pan = Gesture.Pan()
    .activeOffsetX([-12, 12])
    .failOffsetY([-12, 12])
    .onUpdate(event => {
      if (event.translationX < 0) {
        translateX.value = event.translationX;
      }
    })
    .onEnd(event => {
      if (event.translationX < -100 || event.velocityX < -900) {
        translateX.value = withTiming(-500, { duration: 150 }, finished => {
          if (finished) runOnJS(onDelete)();
        });
      } else {
        translateX.value = withSpring(0, { damping: 22, stiffness: 260 });
      }
    });

  return (
    <View style={styles.swipeRow}>
      <Animated.View style={[styles.deletePreview, deletePreviewStyle]}>
        <Feather name="trash-2" size={18} color="#D84848" />
        <Text style={styles.deletePreviewText}>Delete</Text>
      </Animated.View>
      <GestureDetector gesture={pan}>
        <Animated.View style={animatedStyle}>{children}</Animated.View>
      </GestureDetector>
    </View>
  );
}

// ─── Sheet ────────────────────────────────────────────────────────────────────

interface Props { visible: boolean; onClose: () => void }

export function NotificationSheet({ visible, onClose }: Props) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const {
    notifications,
    markNotificationRead,
    markNotificationUnread,
    dismissNotification,
    dismissAllNotifications,
    getGroupById,
    expenses,
    settlements,
    directPayments,
  } = useApp();

  const unreadCount = notifications.filter(n => !n.read).length;

  // Friend requests waiting for this user, shown at the top of the sheet.
  const [friendRequests, setFriendRequests] = React.useState<Array<{ id: string; otherUser?: { name?: string | null; email?: string | null } | null }>>([]);
  const [respondingId, setRespondingId] = React.useState<string | null>(null);
  const loadRequests = React.useCallback(() => {
    api.listFriendRequests()
      .then(list => setFriendRequests(list.filter(r => r.direction === "received" && r.status === "pending") as any))
      .catch(() => {});
  }, []);
  React.useEffect(() => { if (visible) loadRequests(); }, [visible, loadRequests]);
  async function respondToRequest(requestId: string, accept: boolean) {
    setRespondingId(requestId);
    try {
      if (accept) await api.acceptFriendRequest(requestId);
      else await api.declineFriendRequest(requestId);
      setFriendRequests(prev => prev.filter(r => r.id !== requestId));
    } catch {
      // leave it in the list so they can try again
    } finally {
      setRespondingId(null);
    }
  }

  function openNotif(n: AppNotification) {
    markNotificationRead(n.id);
    onClose();
    const expenseExists = n.expenseId && expenses.some(e => e.id === n.expenseId);
    const paymentCandidates = n.groupId
      ? settlements.filter(s => s.groupId === n.groupId)
      : settlements;
    const exactSettlement = n.settlementId
      ? settlements.find(s => s.id === n.settlementId)
      : n.type === "settlement_recorded"
        ? paymentCandidates
            .filter(s => {
              const amount = n.body.match(/([\d,.]+)\s+[A-Z]{3}/)?.[1]?.replace(/,/g, "");
              return !amount || Math.abs(s.amount - Number(amount)) < 0.005;
            })
            .sort((a, b) =>
              Math.abs(new Date(a.createdAt).getTime() - new Date(n.createdAt).getTime()) -
              Math.abs(new Date(b.createdAt).getTime() - new Date(n.createdAt).getTime())
            )[0]
        : undefined;

    if (expenseExists) {
      router.push({ pathname: "/expense/[id]", params: { id: n.expenseId! } });
    } else if (exactSettlement) {
      // Match the user's normal path: open the group, expand its feed, then
      // focus the payment entry so it is ready to be tapped/viewed in context.
      router.push({
        pathname: "/group/[id]",
        params: {
          id: exactSettlement.groupId,
          focusId: exactSettlement.id,
          openPaymentId: exactSettlement.id,
        },
      });
    } else if (n.groupId) {
      router.push({ pathname: "/group/[id]", params: { id: n.groupId } });
    }
  }

  function clearAll() {
    // Clear immediately: this sheet has one explicit destructive action, and
    // the custom alert sits below a native page-sheet on some devices.
    dismissAllNotifications();
  }

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={[styles.sheet, { backgroundColor: colors.background, paddingBottom: insets.bottom + 8 }]}>

        {/* Handle */}
        <View style={[styles.handle, { backgroundColor: colors.border }]} />

        {/* Header */}
        <View style={[styles.hdr, { borderBottomColor: colors.border }]}>
          <View style={styles.hdrLeft}>
            <View style={[styles.bellWrap, { backgroundColor: colors.primary + "18" }]}>
              <Feather name="bell" size={18} color={colors.primary} />
            </View>
            <Text style={[styles.hdrTitle, { color: colors.text }]}>Notifications</Text>
            {unreadCount > 0 && (
              <View style={[styles.badge, { backgroundColor: colors.primary }]}>
                <Text style={styles.badgeTxt}>{unreadCount > 9 ? "9+" : unreadCount}</Text>
              </View>
            )}
          </View>
          <View style={styles.hdrRight}>
            {notifications.length > 0 && (
              <Pressable style={styles.clearAllBtn} onPress={clearAll}>
                <Text style={[styles.clearAllTxt, { color: colors.danger }]}>Clear all</Text>
              </Pressable>
            )}
            <Pressable
              style={({ pressed }) => [styles.closeBtn, { opacity: pressed ? 0.6 : 1 }]}
              onPress={onClose}
             accessibilityRole="button" accessibilityLabel="Close">
              <Feather name="x" size={20} color={colors.textSecondary} />
            </Pressable>
          </View>
        </View>

        {/* Body */}
        {notifications.length === 0 && friendRequests.length === 0 ? (
          <View style={styles.empty}>
            <View style={[styles.emptyIcon, { backgroundColor: colors.surface }]}>
              <Feather name="bell-off" size={30} color={colors.textTertiary} />
            </View>
            <Text style={[styles.emptyTitle, { color: colors.text }]}>All caught up</Text>
            <Text style={[styles.emptySub, { color: colors.textSecondary }]}>
              Expenses, payments, and group changes will appear here
            </Text>
          </View>
        ) : (
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.list}>

            {friendRequests.length > 0 && (
              <View style={{ marginBottom: 12, gap: 8 }}>
                <Text style={{ fontSize: 12, fontWeight: "700", letterSpacing: 0.8, color: colors.textTertiary, marginLeft: 4 }}>
                  FRIEND REQUESTS · {friendRequests.length}
                </Text>
                {friendRequests.map(r => (
                  <View key={r.id} style={{ flexDirection: "row", alignItems: "center", gap: 10, padding: 12, borderRadius: 14, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }}>
                    <View style={{ width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center", backgroundColor: colors.primary + "18" }}>
                      <Feather name="user-plus" size={16} color={colors.primary} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: colors.text, fontWeight: "700" }} numberOfLines={1}>{r.otherUser?.name || r.otherUser?.email || "Someone"}</Text>
                      <Text style={{ color: colors.textSecondary, fontSize: 12 }}>wants to be friends</Text>
                    </View>
                    <Pressable
                      disabled={respondingId === r.id}
                      onPress={() => void respondToRequest(r.id, false)}
                      style={{ paddingHorizontal: 10, paddingVertical: 7, borderRadius: 10, borderWidth: 1, borderColor: colors.border }}
                      accessibilityRole="button" accessibilityLabel="Decline friend request"
                    >
                      <Text style={{ color: colors.textSecondary, fontWeight: "600", fontSize: 13 }}>Decline</Text>
                    </Pressable>
                    <Pressable
                      disabled={respondingId === r.id}
                      onPress={() => void respondToRequest(r.id, true)}
                      style={{ paddingHorizontal: 12, paddingVertical: 7, borderRadius: 10, backgroundColor: colors.primary }}
                      accessibilityRole="button" accessibilityLabel="Accept friend request"
                    >
                      <Text style={{ color: "#fff", fontWeight: "700", fontSize: 13 }}>Accept</Text>
                    </Pressable>
                  </View>
                ))}
              </View>
            )}

            {notifications.map(n => (
              <SwipeableRow key={n.id} onDelete={() => dismissNotification(n.id)}>
                <NCard
                  n={n}
                  groupName={n.groupId ? getGroupById(n.groupId)?.name : undefined}
                  groupEmoji={n.groupId ? getGroupById(n.groupId)?.emoji : undefined}
                  payment={n.paymentId ? directPayments.find(p => p.id === n.paymentId) : undefined}
                  onPress={() => openNotif(n)}
                  onMarkUnread={n.read ? () => markNotificationUnread(n.id) : undefined}
                  colors={colors}
                  dimmed={n.read}
                />
              </SwipeableRow>
            ))}

            {/* Swipe hint */}
            {notifications.length > 0 && (
              <Text style={[styles.swipeHint, { color: colors.textTertiary }]}>
                Swipe left to remove a notification
              </Text>
            )}
          </ScrollView>
        )}
      </View>
    </Modal>
  );
}

// ─── Notification card ────────────────────────────────────────────────────────

interface NCardProps {
  n: AppNotification;
  groupName?: string;
  groupEmoji?: string;
  payment?: DirectPayment;
  onPress: () => void;
  onMarkUnread?: () => void;
  colors: any;
  dimmed?: boolean;
}

function NCard({ n, groupName, groupEmoji, payment, onPress, onMarkUnread, colors, dimmed }: NCardProps) {
  const { name: ico, color: icoColor } = notifIcon(n.type, n.tone);
  // A one-off payment notification shows its own category icon (like an
  // expense would) instead of a generic type icon, so it reads consistently
  // with how the payment itself appears in the One-Offs list.
  const category = (payment as any)?.category;
  const paymentDescription = (payment as any)?.description as string | undefined;
  const cardBg   = dimmed ? colors.surface : n.read ? colors.surface : colors.primary + "0E";
  const cardBdr  = n.read ? colors.border : colors.primary + "35";

  return (
    <Pressable
      style={({ pressed }) => [
        styles.card,
        { backgroundColor: cardBg, borderColor: cardBdr, opacity: pressed ? 0.8 : dimmed ? 0.82 : 1 },
      ]}
      onPress={onPress}
    >
      {/* Unread dot */}
      {!n.read && <View style={[styles.dot, { backgroundColor: colors.primary }]} />}

      <View style={styles.cardRow}>
        {/* Icon — category icon for one-off payments, generic type icon otherwise */}
        {category ? (
          <CategoryIcon category={category} description={paymentDescription} size={34} borderRadius={9} />
        ) : (
          <View style={[styles.ico, { backgroundColor: icoColor + "18", borderColor: icoColor + "45" }]}>
            <Feather name={ico as any} size={15} color={icoColor} />
          </View>
        )}

        {/* Text */}
        <View style={styles.cardBody}>
          <Text style={[styles.cardTitle, { color: colors.text }]} numberOfLines={2}>{n.title}</Text>
          {!!n.body && (
            <Text style={[styles.cardMsg, { color: colors.textSecondary }]} numberOfLines={2}>{n.body}</Text>
          )}

          {/* Footer */}
          <View style={styles.cardFtr}>
            <Text style={[styles.cardTime, { color: colors.textTertiary }]}>{timeAgo(n.createdAt)}</Text>

            {groupName && (
              <View style={[styles.groupChip, { backgroundColor: colors.primary + "15" }]}>
                {groupEmoji
                  ? <Text style={styles.groupEmoji}>{groupEmoji}</Text>
                  : <Feather name="users" size={10} color={colors.primary} />}
                <Text style={[styles.groupTxt, { color: colors.primary }]} numberOfLines={1}>{groupName}</Text>
              </View>
            )}

            {dimmed && onMarkUnread && (
              <Pressable
                onPress={onMarkUnread}
                style={[styles.unreadBtn, { borderColor: colors.border }]}
              >
                <Text style={[styles.unreadBtnTxt, { color: colors.textSecondary }]}>Mark unread</Text>
              </Pressable>
            )}
          </View>
        </View>
      </View>
    </Pressable>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  sheet: { flex: 1 },
  handle: { width: 36, height: 4, borderRadius: 2, alignSelf: "center", marginTop: 12, marginBottom: 4 },

  // Header
  hdr: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth,
  },
  hdrLeft:  { flexDirection: "row", alignItems: "center", gap: 10 },
  hdrRight: { flexDirection: "row", alignItems: "center", gap: 8 },
  bellWrap: { width: 34, height: 34, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  hdrTitle: { fontSize: 18, fontFamily: "Inter_700Bold", letterSpacing: -0.3 },
  badge: { minWidth: 20, height: 20, borderRadius: 10, alignItems: "center", justifyContent: "center", paddingHorizontal: 5 },
  badgeTxt: { fontSize: 10, fontFamily: "Inter_700Bold", color: "#fff" },
  readAllBtn: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10 },
  readAllTxt: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  clearAllBtn: { paddingHorizontal: 4, paddingVertical: 6 },
  clearAllTxt: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  closeBtn: { width: 32, height: 32, alignItems: "center", justifyContent: "center" },

  // List
  list: { padding: 16, gap: 8 },
  sectionLbl: { fontSize: 10, fontFamily: "Inter_700Bold", letterSpacing: 1.2, textTransform: "uppercase", marginBottom: 2 },

  // All-read banner
  allReadBanner: { flexDirection: "row", alignItems: "flex-start", gap: 10, borderRadius: 14, borderWidth: 1, padding: 14 },
  allReadTxt: { flex: 1, fontSize: 14, fontFamily: "Inter_400Regular", lineHeight: 20 },

  // Archive
  archiveRow: {
    flexDirection: "row", alignItems: "center", gap: 8,
    paddingVertical: 12, borderTopWidth: StyleSheet.hairlineWidth, marginTop: 4,
  },
  archiveLbl: { fontSize: 13, fontFamily: "Inter_600SemiBold" },

  // Swipe hint
  swipeHint: { fontSize: 11, fontFamily: "Inter_400Regular", textAlign: "center", paddingTop: 4, paddingBottom: 8 },
  swipeRow: { position: "relative" },
  deletePreview: {
    ...StyleSheet.absoluteFill,
    backgroundColor: "#FDECEC",
    borderRadius: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 6,
    paddingRight: 18,
  },
  deletePreviewText: { color: "#D84848", fontSize: 12, fontFamily: "Inter_600SemiBold" },

  // Card
  card: { borderRadius: 14, borderWidth: 1, padding: 14, position: "relative" },
  dot: { position: "absolute", top: 14, left: 7, width: 6, height: 6, borderRadius: 3 },
  cardRow: { flexDirection: "row", gap: 12, alignItems: "flex-start" },
  ico: { width: 34, height: 34, borderRadius: 9, borderWidth: 1, alignItems: "center", justifyContent: "center", flexShrink: 0 },
  cardBody: { flex: 1, gap: 4 },
  cardTitle: { fontSize: 14, fontFamily: "Inter_600SemiBold", lineHeight: 20 },
  cardMsg: { fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 18 },
  cardFtr: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 6, marginTop: 2 },
  cardTime: { fontSize: 11, fontFamily: "Inter_400Regular" },
  groupChip: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, maxWidth: 160 },
  groupEmoji: { fontSize: 11 },
  groupTxt: { fontSize: 11, fontFamily: "Inter_600SemiBold", flexShrink: 1 },
  unreadBtn: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, borderWidth: 1 },
  unreadBtnTxt: { fontSize: 11, fontFamily: "Inter_500Medium" },

  // Empty
  empty: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 40, paddingTop: 60, gap: 12 },
  emptyIcon: { width: 72, height: 72, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  emptyTitle: { fontSize: 18, fontFamily: "Inter_600SemiBold" },
  emptySub: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 20 },
});
