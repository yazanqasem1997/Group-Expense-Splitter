import { showAlert } from "@/hooks/alertStore";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router, useLocalSearchParams } from "expo-router";
import React, { useState } from "react";
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  Alert,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Avatar } from "@/components/Avatar";
import { useApp } from "@/context/AppContext";
import { useTheme } from "@/hooks/useTheme";

export default function MembersScreen() {
  const { id, mode } = useLocalSearchParams<{ id: string; mode?: string }>();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const {
    getGroupById, getMemberById, currentUser,
    members, sendGroupInvite, getGroupPendingInvites,
    getGroupBalances, leaveGroupMember,
  } = useApp();
  const topPad = insets.top;
  const isInviteMode = mode === "invite";
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isSending, setIsSending] = useState(false);
  const groupForAdmin = getGroupById(String(id));
  const amAdmin = !!groupForAdmin && (groupForAdmin.adminIds ?? []).includes(currentUser.id);
  function removeFromGroup(memberId: string, name: string) {
    if (!groupForAdmin) return;
    const debts = getGroupBalances(groupForAdmin.id).filter(d => d.fromId === memberId || d.toId === memberId);
    if (debts.length > 0) {
      showAlert(
        "Settle up first",
        `${name.split(" ")[0]} still has an open balance in this group. They can be removed once it's settled.`,
        [
          { text: "Cancel", style: "cancel" },
          { text: "Go to Balances", onPress: () => router.navigate({ pathname: "/group/[id]", params: { id: groupForAdmin.id, tab: "balances", tabAt: String(Date.now()) } }) },
        ],
      );
      return;
    }
    showAlert(`Remove ${name.split(" ")[0]}?`, "They'll no longer see this group. Past expenses stay.", [
      { text: "Cancel", style: "cancel" },
      { text: "Remove", style: "destructive", onPress: () => leaveGroupMember(groupForAdmin.id, memberId) },
    ]);
  }

  const group = getGroupById(id ?? "");
  if (!group) return null;
  const activeGroupId = group.id;

  const pendingInvites: { id: string; invitedEmail: string; invitedName?: string }[] =
    (group as any).pendingInvites ?? [];

  const memberCount = group.memberIds.length;
  const groupPendingInvites = getGroupPendingInvites(group.id);
  const pendingEmails = new Set(groupPendingInvites.map(invite => invite.invitedEmail.toLowerCase()));
  const availableFriends = members.filter(
    member =>
      !member.isCurrentUser &&
      member.id !== currentUser.id &&
      !member.isPending &&
      !group.memberIds.includes(member.id) &&
      Boolean(member.email),
  );

  function toggleFriend(memberId: string) {
    if (isSending) return;
    setSelectedIds(prev =>
      prev.includes(memberId)
        ? prev.filter(id => id !== memberId)
        : [...prev, memberId],
    );
  }

  function handleInviteSelected() {
    if (isSending || selectedIds.length === 0) return;
    setIsSending(true);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    availableFriends
      .filter(friend => selectedIds.includes(friend.id) && friend.email)
      .forEach(friend => sendGroupInvite(activeGroupId, friend.email!, friend.name));
    router.back();
  }

  if (isInviteMode) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={[styles.header, { paddingTop: topPad + 8, borderBottomColor: colors.border }]}>
          <Pressable
            style={({ pressed }) => [styles.backBtn, { opacity: pressed ? 0.6 : 1 }]}
            onPress={() => router.back()}
            hitSlop={8}
           accessibilityRole="button" accessibilityLabel="Back">
            <Feather name="arrow-left" size={22} color={colors.text} />
          </Pressable>
          <View style={styles.headerCenter}>
            <Text style={[styles.headerTitle, { color: colors.text }]}>Invite members</Text>
            <View style={[styles.countBadge, { backgroundColor: colors.primaryLight }]}>
              <Text style={[styles.countBadgeText, { color: colors.primary }]}>{selectedIds.length}</Text>
            </View>
          </View>
          <View style={styles.backBtn} />
        </View>

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[styles.inviteList, { paddingBottom: 120 }]}
        >
          <View style={[styles.inviteIntro, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={[styles.inviteIntroIcon, { backgroundColor: colors.primaryLight }]}>
              <Feather name="users" size={20} color={colors.primary} />
            </View>
            <View style={styles.inviteIntroCopy}>
              <Text style={[styles.inviteIntroTitle, { color: colors.text }]}>Invite from your friends</Text>
              <Text style={[styles.inviteIntroText, { color: colors.textSecondary }]}>
                Select accepted friends to add to {group.name}.
              </Text>
            </View>
          </View>

          {availableFriends.length > 0 ? (
            <View style={[styles.inviteFriendList, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              {availableFriends.map((friend, index) => {
                const isSelected = selectedIds.includes(friend.id);
                const isAlreadyInvited = Boolean(friend.email && pendingEmails.has(friend.email.toLowerCase()));
                return (
                  <Pressable
                    key={friend.id}
                    style={({ pressed }) => [
                      styles.inviteFriendRow,
                      index < availableFriends.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
                      { opacity: pressed && !isAlreadyInvited ? 0.78 : isAlreadyInvited ? 0.55 : 1 },
                    ]}
                    onPress={() => toggleFriend(friend.id)}
                    disabled={isAlreadyInvited}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: isSelected, disabled: isAlreadyInvited }}
                  >
                    <Avatar name={friend.name} color={friend.avatarColor} size={44} imageUri={friend.photo} />
                    <View style={styles.inviteFriendInfo}>
                      <Text style={[styles.inviteFriendName, { color: colors.text }]}>{friend.name}</Text>
                      <Text style={[styles.inviteFriendEmail, { color: colors.textSecondary }]}>
                        {isAlreadyInvited ? "Invitation pending" : friend.email}
                      </Text>
                    </View>
                    <View
                      style={[
                        styles.inviteCheckbox,
                        {
                          backgroundColor: isSelected ? colors.primary : colors.background,
                          borderColor: isSelected ? colors.primary : colors.border,
                        },
                      ]}
                    >
                      {isSelected && <Feather name="check" size={15} color="#fff" />}
                    </View>
                  </Pressable>
                );
              })}
            </View>
          ) : (
            <View style={[styles.inviteEmpty, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <View style={[styles.inviteEmptyIcon, { backgroundColor: colors.primaryLight }]}>
                <Feather name="user-plus" size={22} color={colors.primary} />
              </View>
              <Text style={[styles.inviteEmptyTitle, { color: colors.text }]}>No friends to invite</Text>
              <Text style={[styles.inviteEmptyText, { color: colors.textSecondary }]}>
                Add accepted friends first, then you can invite them to this group.
              </Text>
            </View>
          )}
        </ScrollView>

        <View style={[styles.actionBar, { borderTopColor: colors.border, backgroundColor: colors.surface, paddingBottom: Platform.OS === "web" ? 20 : insets.bottom + 12 }]}>
          <Pressable
            style={({ pressed }) => [
              styles.actionBtn,
              {
                backgroundColor: selectedIds.length > 0 ? colors.primary : colors.border,
                opacity: pressed || isSending ? 0.75 : 1,
              },
            ]}
            onPress={handleInviteSelected}
            disabled={selectedIds.length === 0 || isSending}
          >
            <Feather name="user-plus" size={16} color="#fff" />
            <Text style={styles.actionBtnText}>
              {isSending ? "Inviting..." : selectedIds.length > 0 ? `Invite ${selectedIds.length} ${selectedIds.length === 1 ? "friend" : "friends"}` : "Select friends"}
            </Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: topPad + 8, borderBottomColor: colors.border }]}>
        <Pressable
          style={({ pressed }) => [styles.backBtn, { opacity: pressed ? 0.6 : 1 }]}
          onPress={() => router.back()}
          hitSlop={8}
         accessibilityRole="button" accessibilityLabel="Back">
          <Feather name="arrow-left" size={22} color={colors.text} />
        </Pressable>
        <View style={styles.headerCenter}>
          <Text style={[styles.headerTitle, { color: colors.text }]}>Members</Text>
          <View style={[styles.countBadge, { backgroundColor: colors.primaryLight }]}>
            <Text style={[styles.countBadgeText, { color: colors.primary }]}>{memberCount}</Text>
          </View>
        </View>
        <View style={styles.backBtn} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.list}>
        {/* Members */}
        {(() => null)()}
        {group.memberIds.map((mid, idx) => {
          const m = getMemberById(mid);
          if (!m) return null;
          const isMe = m.isCurrentUser;
          const isLast = idx === group.memberIds.length - 1 && pendingInvites.length === 0;

          return (
            <Pressable disabled={!amAdmin || isMe}
              key={mid}
              style={({ pressed }) => [
                styles.memberRow,
                { backgroundColor: colors.surface, opacity: pressed ? 0.85 : 1 },
                
              ]}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  removeFromGroup(mid, m.name);
              }}
            >
              <Avatar
                name={m.name}
                color={m.avatarColor}
                size={44}
                imageUri={m.photo}
              />
              <View style={styles.memberInfo}>
                <Text style={[styles.memberName, { color: colors.text }]}>
                  {isMe ? "You" : m.name}
                  {isMe && (
                    <Text style={[styles.youTag, { color: colors.textTertiary }]}> (You)</Text>
                  )}
                </Text>
              </View>
            </Pressable>
          );
        })}

        {/* Pending invites */}
        {pendingInvites.length > 0 && (
          <>
            <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>
              Pending ({pendingInvites.length})
            </Text>
            {pendingInvites.map((inv, idx) => (
              <View
                key={inv.id}
                style={[
                  styles.memberRow,
                  { backgroundColor: colors.surface },
                  idx < pendingInvites.length - 1 && {
                    borderBottomWidth: StyleSheet.hairlineWidth,
                    borderBottomColor: colors.border,
                  },
                ]}
              >
                <View style={[styles.pendingAvatar, { borderColor: colors.border, backgroundColor: colors.surface }]}>
                  <Feather name="clock" size={18} color={colors.textTertiary} />
                </View>
                <View style={styles.memberInfo}>
                  <Text style={[styles.memberName, { color: colors.text }]}>
                    {inv.invitedName ?? inv.invitedEmail.split("@")[0]}
                  </Text>
                  <Text style={[styles.memberBalance, { color: colors.textTertiary }]}>
                    {inv.invitedEmail} · Pending
                  </Text>
                </View>
                <View style={[styles.pendingBadge, { backgroundColor: colors.warningLight ?? "#FFF8E1" }]}>
                  <Text style={[styles.pendingBadgeText, { color: colors.warning ?? "#F59E0B" }]}>Invited</Text>
                </View>
              </View>
            ))}
          </>
        )}
      </ScrollView>

      {/* Bottom action bar */}
      <View style={[styles.actionBar, { borderTopColor: colors.border, backgroundColor: colors.surface, paddingBottom: Platform.OS === "web" ? 20 : insets.bottom + 12 }]}>
        <Pressable
          style={({ pressed }) => [styles.actionBtn, { backgroundColor: colors.primary, opacity: pressed ? 0.8 : 1 }]}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            router.push({ pathname: "/group/members", params: { id: group.id, mode: "invite" } });
          }}
          accessibilityRole="button"
          accessibilityLabel="Invite people to this group"
        >
          <Feather name="user-plus" size={20} color="#fff" />
        </Pressable>
        <Pressable
          style={({ pressed }) => [styles.actionBtn, { backgroundColor: colors.primary, opacity: pressed ? 0.8 : 1 }]}
          onPress={() => router.push({ pathname: "/group/qr/[id]", params: { id: group.id } })}
          accessibilityRole="button"
          accessibilityLabel="Invite link and QR code"
        >
          <Feather name="link" size={20} color="#fff" />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backBtn: { width: 36, height: 36, alignItems: "center", justifyContent: "center" },
  headerCenter: { flexDirection: "row", alignItems: "center", gap: 8 },
  headerTitle: { fontSize: 17, fontFamily: "Inter_600SemiBold" },
  countBadge: {
    paddingHorizontal: 8, paddingVertical: 2,
    borderRadius: 10, minWidth: 24, alignItems: "center",
  },
  countBadgeText: { fontSize: 12, fontFamily: "Inter_700Bold" },
  list: { paddingBottom: 20 },
  inviteList: { padding: 16, gap: 14 },
  inviteIntro: {
    flexDirection: "row", alignItems: "center", gap: 12,
    padding: 14, borderRadius: 16, borderWidth: 1,
  },
  inviteIntroIcon: { width: 42, height: 42, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  inviteIntroCopy: { flex: 1, gap: 3 },
  inviteIntroTitle: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  inviteIntroText: { fontSize: 12, fontFamily: "Inter_400Regular", lineHeight: 17 },
  inviteFriendList: { borderRadius: 16, borderWidth: 1, overflow: "hidden" },
  inviteFriendRow: {
    flexDirection: "row", alignItems: "center", gap: 12,
    paddingHorizontal: 14, paddingVertical: 12,
  },
  inviteFriendInfo: { flex: 1, gap: 2 },
  inviteFriendName: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  inviteFriendEmail: { fontSize: 12, fontFamily: "Inter_400Regular" },
  inviteCheckbox: {
    width: 24, height: 24, borderRadius: 8, borderWidth: 1.5,
    alignItems: "center", justifyContent: "center",
  },
  inviteEmpty: {
    alignItems: "center", paddingHorizontal: 28, paddingVertical: 42,
    borderRadius: 16, borderWidth: 1,
  },
  inviteEmptyIcon: { width: 52, height: 52, borderRadius: 18, alignItems: "center", justifyContent: "center", marginBottom: 12 },
  inviteEmptyTitle: { fontSize: 16, fontFamily: "Inter_600SemiBold", marginBottom: 5 },
  inviteEmptyText: { fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 18, textAlign: "center" },
  sectionLabel: {
    fontSize: 12, fontFamily: "Inter_600SemiBold",
    textTransform: "uppercase", letterSpacing: 0.5,
    paddingHorizontal: 16, paddingTop: 20, paddingBottom: 8,
  },
  memberRow: {
    borderRadius: 16,
    marginBottom: 10,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
  },
  memberInfo: { flex: 1 },
  memberName: { fontSize: 15, fontFamily: "Inter_500Medium" },
  youTag: { fontSize: 14, fontFamily: "Inter_400Regular" },
  memberBalance: { fontSize: 13, fontFamily: "Inter_400Regular", marginTop: 2 },
  pendingAvatar: {
    width: 44, height: 44, borderRadius: 22,
    borderWidth: 1.5, alignItems: "center", justifyContent: "center",
  },
  pendingBadge: {
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8,
  },
  pendingBadgeText: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  actionBar: {
    flexDirection: "row",
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  actionBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 13,
    borderRadius: 14,
  },
  actionBtnText: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
});
