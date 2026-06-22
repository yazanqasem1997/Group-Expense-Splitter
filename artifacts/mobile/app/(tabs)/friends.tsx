import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React, { useMemo, useState } from "react";
import {
  Alert,
  FlatList,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { formatAmount } from "@/components/AmountText";
import { Avatar } from "@/components/Avatar";
import { EmptyState } from "@/components/EmptyState";
import { KeyboardAwareScrollViewCompat } from "@/components/KeyboardAwareScrollViewCompat";
import { Member, useApp } from "@/context/AppContext";
import { CURRENT_USER_ID_EXPORT } from "@/context/AppContext";
import { useTheme } from "@/hooks/useTheme";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function FriendsScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { members, currentUser, getGroupBalances, groups, addMember } = useApp();

  const [showAdd, setShowAdd] = useState(false);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [emailError, setEmailError] = useState("");

  const friends = members.filter(m => !m.isCurrentUser);

  const friendBalances = useMemo(() => {
    const map: Record<string, number> = {};
    groups.forEach(group => {
      const debts = getGroupBalances(group.id);
      debts.forEach(debt => {
        if (debt.fromId === currentUser.id) {
          map[debt.toId] = (map[debt.toId] ?? 0) - debt.amount;
        } else if (debt.toId === currentUser.id) {
          map[debt.fromId] = (map[debt.fromId] ?? 0) + debt.amount;
        }
      });
    });
    return map;
  }, [groups, getGroupBalances, currentUser]);

  const topPad = Platform.OS === "web" ? 67 : insets.top;

  function handleAddFriend() {
    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      setEmailError("Email is required");
      return;
    }
    if (!EMAIL_RE.test(trimmedEmail)) {
      setEmailError("Enter a valid email address");
      return;
    }
    const alreadyExists = members.some(m => m.email?.toLowerCase() === trimmedEmail.toLowerCase());
    if (alreadyExists) {
      setEmailError("This email is already in your friends list");
      return;
    }
    const derivedName = name.trim() || trimmedEmail.split("@")[0];
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    addMember({ name: derivedName, email: trimmedEmail, avatarColor: "", isPending: true });
    setEmail("");
    setName("");
    setEmailError("");
    setShowAdd(false);
  }

  function renderFriend(member: Member) {
    const balance = friendBalances[member.id] ?? 0;
    const isSettled = Math.abs(balance) < 0.01;

    return (
      <View style={[styles.friendCard, { backgroundColor: colors.surface }]}>
        <Avatar name={member.name} color={member.avatarColor} size={46} />
        <View style={styles.friendInfo}>
          <View style={styles.friendNameRow}>
            <Text style={[styles.friendName, { color: colors.text }]}>{member.name}</Text>
            {member.isPending && (
              <View style={[styles.pendingBadge, { backgroundColor: colors.accentTint }]}>
                <Text style={[styles.pendingText, { color: colors.accent }]}>Invited</Text>
              </View>
            )}
          </View>
          {member.email ? (
            <Text style={[styles.friendEmail, { color: colors.textSecondary }]}>
              {member.email}
            </Text>
          ) : null}
        </View>
        <View style={styles.friendBalance}>
          {isSettled ? (
            <Text style={[styles.settledText, { color: colors.textTertiary }]}>Settled up</Text>
          ) : (
            <>
              <Text style={[styles.balanceLabel, { color: balance > 0 ? colors.positive : colors.negative }]}>
                {balance > 0 ? "owes you" : "you owe"}
              </Text>
              <Text style={[styles.balanceAmount, { color: balance > 0 ? colors.positive : colors.negative }]}>
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
            setShowAdd(v => !v);
            setEmailError("");
          }}
        >
          <Feather name={showAdd ? "x" : "user-plus"} size={18} color="#fff" />
        </Pressable>
      </View>

      {showAdd && (
        <KeyboardAwareScrollViewCompat
          style={[styles.addForm, { backgroundColor: colors.surface, borderColor: colors.border }]}
          contentContainerStyle={{ gap: 10 }}
          keyboardShouldPersistTaps="handled"
          scrollEnabled={false}
        >
          <Text style={[styles.addFormTitle, { color: colors.text }]}>Invite a friend</Text>
          <Text style={[styles.addFormSub, { color: colors.textSecondary }]}>
            They'll appear in your friends list right away.
          </Text>

          <View>
            <View style={[
              styles.inputWrap,
              { backgroundColor: colors.inputBg, borderColor: emailError ? colors.danger : colors.inputBorder },
            ]}>
              <Feather name="mail" size={16} color={emailError ? colors.danger : colors.textTertiary} style={styles.inputIcon} />
              <TextInput
                style={[styles.input, { color: colors.text }]}
                placeholder="Email address *"
                placeholderTextColor={colors.textTertiary}
                value={email}
                onChangeText={t => { setEmail(t); setEmailError(""); }}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>
            {emailError ? (
              <Text style={[styles.errorText, { color: colors.danger }]}>{emailError}</Text>
            ) : null}
          </View>

          <View style={[styles.inputWrap, { backgroundColor: colors.inputBg, borderColor: colors.inputBorder }]}>
            <Feather name="user" size={16} color={colors.textTertiary} style={styles.inputIcon} />
            <TextInput
              style={[styles.input, { color: colors.text }]}
              placeholder="Name (optional — defaults to email)"
              placeholderTextColor={colors.textTertiary}
              value={name}
              onChangeText={setName}
              autoCapitalize="words"
            />
          </View>

          <View style={styles.formButtons}>
            <Pressable
              style={[styles.formBtn, styles.formBtnSecondary, { borderColor: colors.border }]}
              onPress={() => { setShowAdd(false); setEmail(""); setName(""); setEmailError(""); }}
            >
              <Text style={[styles.formBtnText, { color: colors.textSecondary }]}>Cancel</Text>
            </Pressable>
            <Pressable
              style={[styles.formBtn, { backgroundColor: colors.primary }]}
              onPress={handleAddFriend}
            >
              <Feather name="user-plus" size={15} color="#fff" />
              <Text style={[styles.formBtnText, { color: "#fff" }]}>Send Invite</Text>
            </Pressable>
          </View>
        </KeyboardAwareScrollViewCompat>
      )}

      <FlatList
        data={friends}
        keyExtractor={item => item.id}
        contentContainerStyle={[styles.listContent, { paddingBottom: Platform.OS === "web" ? 134 : 100 }]}
        ListEmptyComponent={
          <EmptyState
            icon="users"
            title="No friends yet"
            subtitle="Invite friends by email to start splitting expenses"
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
    maxHeight: 320,
  },
  addFormTitle: { fontSize: 16, fontFamily: "Inter_600SemiBold" },
  addFormSub: { fontSize: 13, fontFamily: "Inter_400Regular", marginBottom: 4 },
  inputWrap: {
    flexDirection: "row",
    alignItems: "center",
    height: 46,
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 12,
    gap: 8,
  },
  inputIcon: {},
  input: {
    flex: 1,
    fontSize: 15,
    fontFamily: "Inter_400Regular",
  },
  errorText: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 4, marginLeft: 4 },
  formButtons: { flexDirection: "row", gap: 10, marginTop: 4 },
  formBtn: {
    flex: 1,
    height: 42,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 6,
  },
  formBtnSecondary: { borderWidth: 1, backgroundColor: "transparent" },
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
  friendNameRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  friendName: { fontSize: 16, fontFamily: "Inter_500Medium" },
  pendingBadge: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
  },
  pendingText: { fontSize: 10, fontFamily: "Inter_600SemiBold" },
  friendEmail: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
  friendBalance: { alignItems: "flex-end" },
  settledText: { fontSize: 13, fontFamily: "Inter_500Medium" },
  balanceLabel: { fontSize: 11, fontFamily: "Inter_400Regular", marginBottom: 2 },
  balanceAmount: { fontSize: 15, fontFamily: "Inter_700Bold" },
});
