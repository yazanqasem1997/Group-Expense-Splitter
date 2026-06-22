import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import React, { useState } from "react";
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
import { KeyboardAwareScrollViewCompat } from "@/components/KeyboardAwareScrollViewCompat";
import { Currency, Group, Member, useApp } from "@/context/AppContext";
import { useTheme } from "@/hooks/useTheme";

const GROUP_TYPES: { value: Group["type"]; label: string; emoji: string }[] = [
  { value: "trip", label: "Trip", emoji: "✈️" },
  { value: "home", label: "Home", emoji: "🏠" },
  { value: "friends", label: "Friends", emoji: "🎉" },
  { value: "couple", label: "Couple", emoji: "💑" },
  { value: "other", label: "Other", emoji: "📦" },
];

const CURRENCIES: Currency[] = ["USD", "EUR", "GBP", "AED", "CAD", "AUD", "JPY", "INR"];

const DEFAULT_AVATAR_COLORS = [
  "#FF6B35", "#7C3AED", "#0EA5E9", "#F59E0B",
  "#FF3366", "#00C896", "#EC4899", "#10B981",
];

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

export default function NewGroupScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { members, currentUser, addGroup, addMember } = useApp();

  const [name, setName] = useState("");
  const [groupType, setGroupType] = useState<Group["type"]>("friends");
  const [currency, setCurrency] = useState<Currency>("USD");
  const [selectedIds, setSelectedIds] = useState<string[]>([currentUser.id]);
  const [inviteEmail, setInviteEmail] = useState("");
  const [pendingInvites, setPendingInvites] = useState<{ email: string; tempId: string }[]>([]);

  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const selectedType = GROUP_TYPES.find(t => t.value === groupType)!;

  function toggleMember(id: string) {
    if (id === currentUser.id) return;
    setSelectedIds(prev =>
      prev.includes(id) ? prev.filter(m => m !== id) : [...prev, id]
    );
  }

  function handleInvite() {
    const email = inviteEmail.trim().toLowerCase();
    if (!isValidEmail(email)) {
      Alert.alert("Invalid email", "Please enter a valid email address");
      return;
    }
    const alreadyMember = members.find(m => m.email?.toLowerCase() === email);
    if (alreadyMember) {
      if (!selectedIds.includes(alreadyMember.id)) {
        setSelectedIds(prev => [...prev, alreadyMember.id]);
      }
      setInviteEmail("");
      return;
    }
    const alreadyPending = pendingInvites.find(p => p.email === email);
    if (alreadyPending) {
      setInviteEmail("");
      return;
    }
    const tempId = `pending_${Date.now()}`;
    setPendingInvites(prev => [...prev, { email, tempId }]);
    setSelectedIds(prev => [...prev, tempId]);
    setInviteEmail("");
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }

  function removePendingInvite(tempId: string) {
    setPendingInvites(prev => prev.filter(p => p.tempId !== tempId));
    setSelectedIds(prev => prev.filter(id => id !== tempId));
  }

  function handleCreate() {
    if (!name.trim()) {
      Alert.alert("Name required", "Please enter a group name");
      return;
    }
    const realSelectedIds = selectedIds.filter(id => !id.startsWith("pending_"));
    const pendingCount = pendingInvites.filter(p => selectedIds.includes(p.tempId)).length;

    if (realSelectedIds.length + pendingCount < 2) {
      Alert.alert("Add members", "Please add at least one other member");
      return;
    }

    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    const colorIndex = members.filter(m => !m.isCurrentUser).length;
    const newMemberIds: string[] = [...realSelectedIds];

    for (let i = 0; i < pendingInvites.length; i++) {
      const invite = pendingInvites[i];
      if (!selectedIds.includes(invite.tempId)) continue;
      const avatarColor = DEFAULT_AVATAR_COLORS[(colorIndex + i) % DEFAULT_AVATAR_COLORS.length];
      const namePart = invite.email.split("@")[0];
      const displayName = namePart.charAt(0).toUpperCase() + namePart.slice(1);
      const newMember = addMember({
        name: displayName,
        email: invite.email,
        avatarColor,
        isPending: true,
      });
      newMemberIds.push(newMember.id);
    }

    const group = addGroup({
      name: name.trim(),
      emoji: selectedType.emoji,
      memberIds: newMemberIds,
      currency,
      type: groupType,
    });
    router.replace({ pathname: "/group/[id]", params: { id: group.id } });
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topPad + 8, backgroundColor: colors.headerBg }]}>
        <Pressable onPress={() => router.back()}>
          <Feather name="x" size={24} color={colors.text} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.text }]}>New Group</Text>
        <Pressable
          style={[styles.createBtn, { backgroundColor: colors.primary }]}
          onPress={handleCreate}
        >
          <Text style={styles.createBtnText}>Create</Text>
        </Pressable>
      </View>

      <KeyboardAwareScrollViewCompat
        contentContainerStyle={[styles.content, { paddingBottom: Platform.OS === "web" ? 134 : 40 }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={[styles.label, { color: colors.textSecondary }]}>Group Name</Text>
        <View style={[styles.inputWrap, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={styles.inputEmoji}>{selectedType.emoji}</Text>
          <TextInput
            style={[styles.input, { color: colors.text }]}
            placeholder="e.g. Dubai Trip"
            placeholderTextColor={colors.textTertiary}
            value={name}
            onChangeText={setName}
            autoFocus
          />
        </View>

        <Text style={[styles.label, { color: colors.textSecondary }]}>Type</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.typeRow}>
          {GROUP_TYPES.map(t => (
            <Pressable
              key={t.value}
              style={[
                styles.typeChip,
                {
                  backgroundColor: groupType === t.value ? colors.primary : colors.surface,
                  borderColor: groupType === t.value ? colors.primary : colors.border,
                },
              ]}
              onPress={() => setGroupType(t.value)}
            >
              <Text style={styles.typeEmoji}>{t.emoji}</Text>
              <Text style={[styles.typeLabel, { color: groupType === t.value ? "#fff" : colors.text }]}>
                {t.label}
              </Text>
            </Pressable>
          ))}
        </ScrollView>

        <Text style={[styles.label, { color: colors.textSecondary }]}>Currency</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.typeRow}>
          {CURRENCIES.map(c => (
            <Pressable
              key={c}
              style={[
                styles.currencyChip,
                {
                  backgroundColor: currency === c ? colors.primary : colors.surface,
                  borderColor: currency === c ? colors.primary : colors.border,
                },
              ]}
              onPress={() => setCurrency(c)}
            >
              <Text style={[styles.currencyLabel, { color: currency === c ? "#fff" : colors.text }]}>
                {c}
              </Text>
            </Pressable>
          ))}
        </ScrollView>

        <Text style={[styles.label, { color: colors.textSecondary }]}>Members</Text>

        <View style={[styles.inviteWrap, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Feather name="mail" size={18} color={colors.textTertiary} />
          <TextInput
            style={[styles.inviteInput, { color: colors.text }]}
            placeholder="Invite by email address"
            placeholderTextColor={colors.textTertiary}
            value={inviteEmail}
            onChangeText={setInviteEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            returnKeyType="done"
            onSubmitEditing={handleInvite}
          />
          <Pressable
            style={[styles.inviteBtn, { backgroundColor: inviteEmail.trim() ? colors.primary : colors.border }]}
            onPress={handleInvite}
            disabled={!inviteEmail.trim()}
          >
            <Text style={[styles.inviteBtnText, { color: inviteEmail.trim() ? "#fff" : colors.textTertiary }]}>
              Add
            </Text>
          </Pressable>
        </View>

        {pendingInvites.length > 0 && (
          <View style={styles.pendingList}>
            {pendingInvites.map(invite => (
              <View
                key={invite.tempId}
                style={[styles.pendingRow, { backgroundColor: colors.accent1Light, borderColor: colors.accent1 }]}
              >
                <Feather name="clock" size={16} color={colors.accent1} />
                <View style={styles.pendingInfo}>
                  <Text style={[styles.pendingEmail, { color: colors.text }]}>{invite.email}</Text>
                  <Text style={[styles.pendingStatus, { color: colors.accent1 }]}>Invite pending</Text>
                </View>
                <Pressable onPress={() => removePendingInvite(invite.tempId)}>
                  <Feather name="x" size={18} color={colors.textTertiary} />
                </Pressable>
              </View>
            ))}
          </View>
        )}

        <View style={styles.memberList}>
          {members.map(m => {
            const selected = selectedIds.includes(m.id);
            const isMe = m.isCurrentUser;
            return (
              <Pressable
                key={m.id}
                style={[
                  styles.memberRow,
                  {
                    backgroundColor: colors.surface,
                    borderColor: selected ? colors.primary : colors.border,
                    borderWidth: selected ? 1.5 : 1,
                  },
                ]}
                onPress={() => toggleMember(m.id)}
                disabled={isMe}
              >
                <Avatar name={m.name} color={m.avatarColor} size={36} />
                <View style={styles.memberInfo}>
                  <Text style={[styles.memberName, { color: colors.text }]}>
                    {isMe ? "You" : m.name}
                  </Text>
                  {m.email && (
                    <Text style={[styles.memberEmail, { color: colors.textTertiary }]}>{m.email}</Text>
                  )}
                </View>
                {selected && (
                  <Feather name="check-circle" size={20} color={colors.primary} />
                )}
              </Pressable>
            );
          })}
        </View>
      </KeyboardAwareScrollViewCompat>
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
  createBtn: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20 },
  createBtnText: { color: "#fff", fontSize: 14, fontFamily: "Inter_600SemiBold" },
  content: { padding: 20, gap: 12 },
  label: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginTop: 8,
  },
  inputWrap: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 14,
    height: 52,
    gap: 10,
  },
  inputEmoji: { fontSize: 22 },
  input: { flex: 1, fontSize: 16, fontFamily: "Inter_400Regular" },
  typeRow: { gap: 10, paddingVertical: 4 },
  typeChip: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 20,
    borderWidth: 1,
    gap: 6,
  },
  typeEmoji: { fontSize: 16 },
  typeLabel: { fontSize: 14, fontFamily: "Inter_500Medium" },
  currencyChip: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    borderWidth: 1,
  },
  currencyLabel: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  inviteWrap: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 14,
    height: 52,
    gap: 10,
  },
  inviteInput: { flex: 1, fontSize: 15, fontFamily: "Inter_400Regular" },
  inviteBtn: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 10,
  },
  inviteBtnText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  pendingList: { gap: 8 },
  pendingRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    gap: 10,
  },
  pendingInfo: { flex: 1 },
  pendingEmail: { fontSize: 14, fontFamily: "Inter_500Medium" },
  pendingStatus: { fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 2 },
  memberList: { gap: 10 },
  memberRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    borderRadius: 14,
    gap: 12,
  },
  memberInfo: { flex: 1 },
  memberName: { fontSize: 15, fontFamily: "Inter_500Medium" },
  memberEmail: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 1 },
});
