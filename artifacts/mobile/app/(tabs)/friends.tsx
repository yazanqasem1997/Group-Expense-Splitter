import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import React, { useMemo, useState } from "react";
import {
  Alert,
  FlatList,
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
import { EmptyState } from "@/components/EmptyState";
import { Member, useApp } from "@/context/AppContext";
import { CURRENT_USER_ID_EXPORT } from "@/context/AppContext";
import { useTheme } from "@/hooks/useTheme";

export default function FriendsScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { members, currentUser, getGroupBalances, groups, getMemberById, addMember } = useApp();

  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState("");
  const [newEmail, setNewEmail] = useState("");

  const friends = members.filter(m => !m.isCurrentUser);

  const friendBalances = useMemo(() => {
    const map: Record<string, number> = {};
    for (const group of groups) {
      const debts = getGroupBalances(group.id);
      for (const debt of debts) {
        if (debt.fromId === currentUser.id) {
          map[debt.toId] = (map[debt.toId] ?? 0) - debt.amount;
        } else if (debt.toId === currentUser.id) {
          map[debt.fromId] = (map[debt.fromId] ?? 0) + debt.amount;
        }
      }
    }
    return map;
  }, [groups, getGroupBalances, currentUser]);

  const topPad = Platform.OS === "web" ? 67 : insets.top;

  function handleAddFriend() {
    if (!newName.trim()) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    addMember({ name: newName.trim(), email: newEmail.trim() || undefined, avatarColor: "" });
    setNewName("");
    setNewEmail("");
    setShowAdd(false);
  }

  function renderFriend(member: Member) {
    const balance = friendBalances[member.id] ?? 0;
    const isSettled = Math.abs(balance) < 0.01;

    return (
      <View style={[styles.friendCard, { backgroundColor: colors.surface }]}>
        <Avatar name={member.name} color={member.avatarColor} size={44} />
        <View style={styles.friendInfo}>
          <Text style={[styles.friendName, { color: colors.text }]}>{member.name}</Text>
          {member.email ? (
            <Text style={[styles.friendEmail, { color: colors.textSecondary }]}>
              {member.email}
            </Text>
          ) : null}
        </View>
        <View style={styles.friendBalance}>
          {isSettled ? (
            <Text style={[styles.settledText, { color: colors.textTertiary }]}>Settled</Text>
          ) : (
            <>
              <Text
                style={[
                  styles.balanceLabel,
                  { color: balance > 0 ? colors.positive : colors.negative },
                ]}
              >
                {balance > 0 ? "owes you" : "you owe"}
              </Text>
              <Text
                style={[
                  styles.balanceAmount,
                  { color: balance > 0 ? colors.positive : colors.negative },
                ]}
              >
                {formatAmount(Math.abs(balance))}
              </Text>
            </>
          )}
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topPad + 16, backgroundColor: colors.headerBg }]}>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Friends</Text>
        <Pressable
          style={[styles.addBtn, { backgroundColor: colors.primary }]}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            setShowAdd(true);
          }}
        >
          <Feather name="user-plus" size={18} color="#fff" />
        </Pressable>
      </View>

      {showAdd && (
        <View style={[styles.addForm, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <TextInput
            style={[styles.input, { color: colors.text, backgroundColor: colors.inputBg, borderColor: colors.inputBorder }]}
            placeholder="Name"
            placeholderTextColor={colors.textTertiary}
            value={newName}
            onChangeText={setNewName}
          />
          <TextInput
            style={[styles.input, { color: colors.text, backgroundColor: colors.inputBg, borderColor: colors.inputBorder }]}
            placeholder="Email (optional)"
            placeholderTextColor={colors.textTertiary}
            value={newEmail}
            onChangeText={setNewEmail}
            keyboardType="email-address"
            autoCapitalize="none"
          />
          <View style={styles.formButtons}>
            <Pressable
              style={[styles.formBtn, { backgroundColor: colors.border }]}
              onPress={() => setShowAdd(false)}
            >
              <Text style={[styles.formBtnText, { color: colors.textSecondary }]}>Cancel</Text>
            </Pressable>
            <Pressable
              style={[styles.formBtn, { backgroundColor: colors.primary }]}
              onPress={handleAddFriend}
            >
              <Text style={[styles.formBtnText, { color: "#fff" }]}>Add</Text>
            </Pressable>
          </View>
        </View>
      )}

      <FlatList
        data={friends}
        keyExtractor={item => item.id}
        contentContainerStyle={[styles.listContent, { paddingBottom: Platform.OS === "web" ? 134 : 100 }]}
        ListEmptyComponent={
          <EmptyState
            icon="users"
            title="No friends yet"
            subtitle="Add friends to split expenses with them"
          />
        }
        renderItem={({ item }) => renderFriend(item)}
        showsVerticalScrollIndicator={false}
      />
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
  headerTitle: { fontSize: 28, fontFamily: "Inter_700Bold" },
  addBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
  },
  addForm: {
    margin: 16,
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    gap: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
  },
  input: {
    height: 44,
    borderRadius: 10,
    paddingHorizontal: 12,
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    borderWidth: 1,
  },
  formButtons: { flexDirection: "row", gap: 10 },
  formBtn: {
    flex: 1,
    height: 40,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  formBtnText: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  listContent: { padding: 16, gap: 10 },
  friendCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    borderRadius: 16,
    gap: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  friendInfo: { flex: 1 },
  friendName: { fontSize: 16, fontFamily: "Inter_500Medium" },
  friendEmail: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
  friendBalance: { alignItems: "flex-end" },
  settledText: { fontSize: 13, fontFamily: "Inter_500Medium" },
  balanceLabel: { fontSize: 11, fontFamily: "Inter_400Regular", marginBottom: 2 },
  balanceAmount: { fontSize: 15, fontFamily: "Inter_700Bold" },
});
