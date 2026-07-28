import { Feather } from "@expo/vector-icons";
import React from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Avatar } from "@/components/Avatar";
import { formatAmount } from "@/components/AmountText";
import { useApp } from "@/context/AppContext";
import { useTheme } from "@/hooks/useTheme";
import { timeAgo } from "@/utils/format";

interface Props {
  memberId: string | null;
  groupId?: string;
  visible: boolean;
  onClose: () => void;
}

export function MemberProfileSheet({ memberId, groupId, visible, onClose }: Props) {
  const { colors } = useTheme();
  const { getMemberById, currentUser, groups, getGroupBalances, getGroupById } = useApp();

  if (!memberId) return null;
  const member = getMemberById(memberId);
  if (!member) return null;

  const isMe = memberId === currentUser.id;

  // Financial status in this group
  let balanceInGroup: { amount: number; youOwe: boolean } | null = null;
  if (groupId) {
    const debts = getGroupBalances(groupId);
    const rel = debts.find(
      d =>
        (d.fromId === memberId && d.toId === currentUser.id) ||
        (d.toId === memberId && d.fromId === currentUser.id)
    );
    if (rel) {
      balanceInGroup = {
        amount: rel.amount,
        youOwe: rel.toId === memberId, // you owe them
      };
    }
  }

  // Shared groups (both the viewer and this member are in the group)
  const sharedGroups = groups.filter(
    g =>
      !g.archivedAt &&
      g.memberIds.includes(currentUser.id) &&
      g.memberIds.includes(memberId)
  );

  const currentGroup = groupId ? getGroupById(groupId) : undefined;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <Pressable style={s.overlay} onPress={onClose}>
        <Pressable style={[s.sheet, { backgroundColor: colors.surface }]} onPress={e => e.stopPropagation()}>
          {/* Handle */}
          <View style={[s.handle, { backgroundColor: colors.border }]} />

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: 0 }}>
            {/* Header */}
            <View style={s.hero}>
              <Avatar
                name={member.name}
                color={member.avatarColor}
                size={72}
                imageUri={member.photo}
              />
              <View style={s.heroText}>
                <Text style={[s.heroName, { color: colors.text }]}>
                  {isMe ? `${member.name} (You)` : member.name}
                </Text>
                {member.email ? (
                  <View style={s.infoRow}>
                    <Feather name="mail" size={13} color={colors.textTertiary} />
                    <Text style={[s.infoValue, { color: colors.textSecondary }]}>{member.email}</Text>
                  </View>
                ) : null}
                {member.phone ? (
                  <View style={s.infoRow}>
                    <Feather name="phone" size={13} color={colors.textTertiary} />
                    <Text style={[s.infoValue, { color: colors.textSecondary }]}>{member.phone}</Text>
                  </View>
                ) : null}
                {member.joinedAt ? (
                  <View style={s.infoRow}>
                    <Feather name="calendar" size={13} color={colors.textTertiary} />
                    <Text style={[s.infoValue, { color: colors.textSecondary }]}>
                      Joined {timeAgo(member.joinedAt)}
                    </Text>
                  </View>
                ) : null}
              </View>
            </View>

            {/* Balance in this group */}
            {groupId && !isMe && (
              <View style={[s.section, { borderTopColor: colors.border }]}>
                <Text style={[s.sectionLabel, { color: colors.textTertiary }]}>
                  BALANCE IN {currentGroup?.name?.toUpperCase() ?? "THIS GROUP"}
                </Text>
                {balanceInGroup ? (
                  <View style={[s.balanceCard, {
                    backgroundColor: balanceInGroup.youOwe ? colors.dangerLight : colors.successLight,
                  }]}>
                    <Feather
                      name={balanceInGroup.youOwe ? "arrow-up-right" : "arrow-down-left"}
                      size={20}
                      color={balanceInGroup.youOwe ? colors.danger : colors.success}
                    />
                    <Text style={[s.balanceText, { color: balanceInGroup.youOwe ? colors.danger : colors.success }]}>
                      {balanceInGroup.youOwe
                        ? `You owe ${member.name.split(" ")[0]}`
                        : `${member.name.split(" ")[0]} owes you`}
                    </Text>
                    <Text style={[s.balanceAmount, { color: balanceInGroup.youOwe ? colors.danger : colors.success }]}>
                      {formatAmount(balanceInGroup.amount, currentGroup?.currency)}
                    </Text>
                  </View>
                ) : (
                  <View style={[s.balanceCard, { backgroundColor: colors.primaryLight }]}>
                    <Feather name="check-circle" size={20} color={colors.primary} />
                    <Text style={[s.balanceText, { color: colors.primary }]}>All settled up</Text>
                  </View>
                )}
              </View>
            )}

            {/* Shared groups */}
            {!isMe && sharedGroups.length > 0 && (
              <View style={[s.section, { borderTopColor: colors.border }]}>
                <Text style={[s.sectionLabel, { color: colors.textTertiary }]}>
                  SHARED GROUPS · {sharedGroups.length}
                </Text>
                <View style={s.groupChips}>
                  {sharedGroups.map(g => (
                    <View key={g.id} style={[s.groupChip, { backgroundColor: colors.background, borderColor: colors.border }]}>
                      <Text style={s.groupEmoji}>{g.emoji ?? "👥"}</Text>
                      <Text style={[s.groupChipName, { color: colors.text }]} numberOfLines={1}>
                        {g.name}
                      </Text>
                    </View>
                  ))}
                </View>
              </View>
            )}
          </ScrollView>

          {/* Close */}
          <Pressable
            style={[s.closeBtn, { backgroundColor: colors.background, borderColor: colors.border }]}
            onPress={onClose}
          >
            <Text style={[s.closeBtnText, { color: colors.textSecondary }]}>Close</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const s = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "flex-end",
  },
  sheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    paddingTop: 12,
    maxHeight: "82%",
    gap: 0,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    alignSelf: "center",
    marginBottom: 16,
  },
  hero: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 16,
    paddingBottom: 20,
  },
  heroText: { flex: 1, gap: 5 },
  heroName: { fontSize: 20, fontFamily: "Inter_700Bold" },
  infoRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  infoValue: { fontSize: 13, fontFamily: "Inter_400Regular" },
  section: { borderTopWidth: 1, paddingTop: 16, paddingBottom: 16, gap: 10 },
  sectionLabel: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 0.8,
    marginBottom: 2,
  },
  balanceCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 14,
    borderRadius: 14,
  },
  balanceText: { flex: 1, fontSize: 14, fontFamily: "Inter_500Medium" },
  balanceAmount: { fontSize: 16, fontFamily: "Inter_700Bold" },
  groupChips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  groupChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
  },
  groupEmoji: { fontSize: 14 },
  groupChipName: { fontSize: 13, fontFamily: "Inter_500Medium", maxWidth: 100 },
  closeBtn: {
    marginTop: 12,
    height: 46,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
  closeBtnText: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
});
