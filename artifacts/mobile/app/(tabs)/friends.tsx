import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { showAlert } from "@/hooks/alertStore";
import { scrollRegistry } from "@/hooks/scrollRegistry";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { formatAmount } from "@/components/AmountText";
import { Avatar } from "@/components/Avatar";
import { EmptyState } from "@/components/EmptyState";
import { KeyboardAwareScrollViewCompat } from "@/components/KeyboardAwareScrollViewCompat";
import { Member, useApp } from "@/context/AppContext";
import { CURRENT_USER_ID_EXPORT } from "@/context/AppContext";
import { useTheme } from "@/hooks/useTheme";
import { timeAgo } from "@/utils/format";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function FriendsScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const {
    members, currentUser, getGroupBalances, groups,
    addMember, updateMember,
    checkAndAddRecurring, fetchExchangeRates,
  } = useApp();

  const scrollRef = useRef<ScrollView>(null);
  useEffect(() => {
    scrollRegistry.register("friends", () => {
      scrollRef.current?.scrollTo({ y: 0, animated: true });
    });
    return () => scrollRegistry.unregister("friends");
  }, []);

  const [refreshing, setRefreshing] = useState(false);
  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    checkAndAddRecurring();
    await fetchExchangeRates().catch(() => {});
    setRefreshing(false);
  }, [checkAndAddRecurring, fetchExchangeRates]);

  // Add-friend form
  const [showAdd, setShowAdd] = useState(false);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [emailError, setEmailError] = useState("");

  // Contact-edit sheet
  const [editingMember, setEditingMember] = useState<Member | null>(null);
  const [editName, setEditName] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editPhoto, setEditPhoto] = useState<string | undefined>(undefined);
  const [photoLoading, setPhotoLoading] = useState(false);

  const activeFriends = members.filter(m => !m.isCurrentUser && !m.isPending);
  const pendingFriends = members.filter(m => !m.isCurrentUser && m.isPending);

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

  // ── add-friend ─────────────────────────────────────────────────────────────

  function handleAddFriend() {
    const trimmedEmail = email.trim();
    if (!trimmedEmail) { setEmailError("Email is required"); return; }
    if (!EMAIL_RE.test(trimmedEmail)) { setEmailError("Enter a valid email address"); return; }
    const alreadyExists = members.some(m => m.email?.toLowerCase() === trimmedEmail.toLowerCase());
    if (alreadyExists) { setEmailError("This email is already in your friends list"); return; }
    const derivedName = name.trim() || trimmedEmail.split("@")[0];
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    addMember({ name: derivedName, email: trimmedEmail, avatarColor: "", isPending: true });
    setEmail(""); setName(""); setEmailError(""); setShowAdd(false);
  }

  function handleResend(member: Member) {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    showAlert(
      "Invite resent",
      `A new invitation has been sent to ${member.email ?? member.name}.`,
      [{ text: "OK" }]
    );
  }

  // ── contact-edit sheet ─────────────────────────────────────────────────────

  function openEditSheet(member: Member) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setEditingMember(member);
    setEditName(member.name);
    setEditEmail(member.email ?? "");
    setEditPhone(member.phone ?? "");
    setEditPhoto(member.photo);
  }

  function closeEditSheet() {
    setEditingMember(null);
    setPhotoLoading(false);
  }

  async function handlePickPhoto() {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      showAlert("Permission needed", "Allow photo library access to set a contact photo.");
      return;
    }
    setPhotoLoading(true);
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: "images",
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.7,
    });
    setPhotoLoading(false);
    if (!result.canceled) setEditPhoto(result.assets[0].uri);
  }

  function handleSaveContact() {
    if (!editingMember) return;
    const trimmedName = editName.trim();
    if (!trimmedName) {
      showAlert("Name required", "Please enter a name for this contact.");
      return;
    }
    updateMember(editingMember.id, {
      name: trimmedName,
      email: editEmail.trim() || undefined,
      phone: editPhone.trim() || undefined,
      photo: editPhoto,
    });
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    closeEditSheet();
  }

  function handleRemovePhoto() {
    setEditPhoto(undefined);
  }

  // ── render helpers ─────────────────────────────────────────────────────────

  function renderActiveFriend(member: Member) {
    const balance = friendBalances[member.id] ?? 0;
    const isSettled = Math.abs(balance) < 0.01;
    return (
      <Pressable
        key={member.id}
        style={({ pressed }) => [styles.friendCard, { backgroundColor: colors.surface, opacity: pressed ? 0.93 : 1 }]}
        onPress={() => openEditSheet(member)}
      >
        <View style={styles.avatarWrap}>
          <Avatar name={member.name} color={member.avatarColor} size={46} imageUri={member.photo} />
          {member.photo && (
            <View style={[styles.photoIndicator, { backgroundColor: colors.primary }]} />
          )}
        </View>
        <View style={styles.friendInfo}>
          <Text style={[styles.friendName, { color: colors.text }]}>{member.name}</Text>
          {member.email ? (
            <Text style={[styles.friendMeta, { color: colors.textSecondary }]} numberOfLines={1}>
              {member.email}
            </Text>
          ) : null}
          {member.phone ? (
            <Text style={[styles.friendMeta, { color: colors.textTertiary }]} numberOfLines={1}>
              {member.phone}
            </Text>
          ) : null}
          {member.joinedAt ? (
            <Text style={[styles.friendJoined, { color: colors.textTertiary }]}>
              Joined {timeAgo(member.joinedAt)}
            </Text>
          ) : null}
        </View>
        <View style={styles.friendRight}>
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
          <Feather name="chevron-right" size={14} color={colors.border} style={{ marginTop: 4 }} />
        </View>
      </Pressable>
    );
  }

  function renderPendingFriend(member: Member) {
    return (
      <View key={member.id} style={[styles.pendingCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <View style={styles.pendingLeft}>
          <Avatar name={member.name} color={member.avatarColor} size={42} imageUri={member.photo} />
          <View style={styles.pendingInfo}>
            <View style={styles.pendingNameRow}>
              <Text style={[styles.friendName, { color: colors.text }]}>{member.name}</Text>
              <View style={[styles.pendingBadge, { backgroundColor: colors.accentTint }]}>
                <Text style={[styles.pendingBadgeText, { color: colors.accent }]}>Pending</Text>
              </View>
            </View>
            {member.email ? (
              <Text style={[styles.friendMeta, { color: colors.textSecondary }]}>{member.email}</Text>
            ) : null}
          </View>
        </View>
        <Pressable
          style={[styles.resendBtn, { borderColor: colors.border }]}
          onPress={() => handleResend(member)}
        >
          <Feather name="send" size={13} color={colors.primary} />
          <Text style={[styles.resendText, { color: colors.primary }]}>Resend</Text>
        </Pressable>
      </View>
    );
  }

  // ── main render ────────────────────────────────────────────────────────────

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

      <ScrollView
        ref={scrollRef}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.listContent, { paddingBottom: Platform.OS === "web" ? 134 : 100 }]}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={colors.primary}
            colors={[colors.primary]}
          />
        }
      >
        {/* Invite form */}
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

        {/* Active friends */}
        {activeFriends.length > 0 && (
          <View style={styles.section}>
            <Text style={[styles.sectionHeader, { color: colors.textTertiary }]}>
              FRIENDS · {activeFriends.length}
            </Text>
            {activeFriends.map(renderActiveFriend)}
          </View>
        )}

        {/* Pending invitations */}
        {pendingFriends.length > 0 && (
          <View style={styles.section}>
            <Text style={[styles.sectionHeader, { color: colors.textTertiary }]}>
              PENDING INVITES · {pendingFriends.length}
            </Text>
            <Text style={[styles.sectionDesc, { color: colors.textTertiary }]}>
              Waiting for them to accept. Tap Resend to follow up.
            </Text>
            {pendingFriends.map(renderPendingFriend)}
          </View>
        )}

        {activeFriends.length === 0 && pendingFriends.length === 0 && !showAdd && (
          <EmptyState
            icon="users"
            title="No friends yet"
            subtitle="Invite friends by email to start splitting expenses"
          />
        )}
      </ScrollView>

      {/* ── Contact edit sheet ─────────────────────────────────────────────── */}
      <Modal
        visible={editingMember !== null}
        transparent
        animationType="slide"
        onRequestClose={closeEditSheet}
      >
        <Pressable style={styles.sheetOverlay} onPress={closeEditSheet}>
          <Pressable
            style={[styles.editSheet, { backgroundColor: colors.surface }]}
            onPress={e => e.stopPropagation()}
          >
            {/* Handle */}
            <View style={[styles.sheetHandle, { backgroundColor: colors.border }]} />

            {/* Header */}
            <View style={styles.sheetHeader}>
              <Text style={[styles.sheetTitle, { color: colors.text }]}>Edit Contact</Text>
              <Pressable onPress={closeEditSheet}>
                <Feather name="x" size={20} color={colors.textSecondary} />
              </Pressable>
            </View>

            <ScrollView
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.sheetBody}
              keyboardShouldPersistTaps="handled"
            >
              {/* Avatar picker */}
              <View style={styles.avatarPickerRow}>
                <Pressable style={styles.avatarPickerBtn} onPress={handlePickPhoto} disabled={photoLoading}>
                  {photoLoading ? (
                    <View style={[styles.avatarPickerCircle, { backgroundColor: colors.border }]}>
                      <ActivityIndicator color={colors.primary} />
                    </View>
                  ) : (
                    <View style={styles.avatarPickerCircle}>
                      <Avatar
                        name={editName || editingMember?.name || "?"}
                        color={editingMember?.avatarColor ?? "#ccc"}
                        size={72}
                        imageUri={editPhoto}
                      />
                      <View style={[styles.cameraOverlay, { backgroundColor: colors.primary }]}>
                        <Feather name="camera" size={13} color="#fff" />
                      </View>
                    </View>
                  )}
                </Pressable>
                <View style={styles.avatarPickerLabels}>
                  <Text style={[styles.avatarPickerTitle, { color: colors.text }]}>Profile photo</Text>
                  <Text style={[styles.avatarPickerSub, { color: colors.textSecondary }]}>
                    Tap avatar to pick from library
                  </Text>
                  {editPhoto ? (
                    <Pressable onPress={handleRemovePhoto}>
                      <Text style={[styles.removePhotoText, { color: colors.danger }]}>Remove photo</Text>
                    </Pressable>
                  ) : null}
                </View>
              </View>

              {/* Name */}
              <View style={styles.fieldGroup}>
                <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Name</Text>
                <View style={[styles.fieldInput, { backgroundColor: colors.inputBg, borderColor: colors.border }]}>
                  <Feather name="user" size={16} color={colors.textTertiary} />
                  <TextInput
                    style={[styles.fieldText, { color: colors.text }]}
                    value={editName}
                    onChangeText={setEditName}
                    placeholder="Full name"
                    placeholderTextColor={colors.textTertiary}
                    autoCapitalize="words"
                  />
                </View>
              </View>

              {/* Email */}
              <View style={styles.fieldGroup}>
                <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Email</Text>
                <View style={[styles.fieldInput, { backgroundColor: colors.inputBg, borderColor: colors.border }]}>
                  <Feather name="mail" size={16} color={colors.textTertiary} />
                  <TextInput
                    style={[styles.fieldText, { color: colors.text }]}
                    value={editEmail}
                    onChangeText={setEditEmail}
                    placeholder="Email address"
                    placeholderTextColor={colors.textTertiary}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                </View>
              </View>

              {/* Phone */}
              <View style={styles.fieldGroup}>
                <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Phone</Text>
                <View style={[styles.fieldInput, { backgroundColor: colors.inputBg, borderColor: colors.border }]}>
                  <Feather name="phone" size={16} color={colors.textTertiary} />
                  <TextInput
                    style={[styles.fieldText, { color: colors.text }]}
                    value={editPhone}
                    onChangeText={setEditPhone}
                    placeholder="+1 234 567 8900"
                    placeholderTextColor={colors.textTertiary}
                    keyboardType="phone-pad"
                  />
                </View>
              </View>

              {/* Joined */}
              {editingMember?.joinedAt ? (
                <View style={[styles.joinedRow, { backgroundColor: colors.background, borderColor: colors.border }]}>
                  <Feather name="calendar" size={14} color={colors.textTertiary} />
                  <Text style={[styles.joinedText, { color: colors.textTertiary }]}>
                    Added {timeAgo(editingMember.joinedAt)}
                  </Text>
                </View>
              ) : null}
            </ScrollView>

            {/* Actions */}
            <View style={styles.sheetActions}>
              <Pressable
                style={[styles.sheetBtn, { backgroundColor: colors.background, borderColor: colors.border }]}
                onPress={closeEditSheet}
              >
                <Text style={[styles.sheetBtnText, { color: colors.textSecondary }]}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[styles.sheetBtn, { backgroundColor: colors.primary, borderColor: colors.primary }]}
                onPress={handleSaveContact}
              >
                <Feather name="check" size={16} color="#fff" />
                <Text style={[styles.sheetBtnText, { color: "#fff" }]}>Save</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
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
  listContent: { padding: 16, gap: 0 },
  addForm: {
    marginBottom: 16,
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
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
  input: { flex: 1, fontSize: 15, fontFamily: "Inter_400Regular" },
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
  section: { marginBottom: 24 },
  sectionHeader: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 0.8,
    marginBottom: 8,
    marginLeft: 2,
  },
  sectionDesc: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    marginBottom: 10,
    marginLeft: 2,
  },
  friendCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    borderRadius: 16,
    gap: 12,
    marginBottom: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  avatarWrap: { position: "relative" },
  photoIndicator: {
    position: "absolute",
    bottom: 0,
    right: 0,
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 1.5,
    borderColor: "#fff",
  },
  friendInfo: { flex: 1, gap: 2 },
  friendName: { fontSize: 16, fontFamily: "Inter_500Medium" },
  friendMeta: { fontSize: 12, fontFamily: "Inter_400Regular" },
  friendJoined: { fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 1 },
  friendRight: { alignItems: "flex-end", gap: 2 },
  settledText: { fontSize: 13, fontFamily: "Inter_500Medium" },
  balanceLabel: { fontSize: 11, fontFamily: "Inter_400Regular" },
  balanceAmount: { fontSize: 15, fontFamily: "Inter_700Bold" },
  pendingCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
    gap: 10,
    marginBottom: 10,
  },
  pendingLeft: { flexDirection: "row", alignItems: "center", gap: 12, flex: 1 },
  pendingInfo: { flex: 1 },
  pendingNameRow: { flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" },
  pendingBadge: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6 },
  pendingBadgeText: { fontSize: 10, fontFamily: "Inter_600SemiBold" },
  resendBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: 1,
  },
  resendText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },

  // Sheet
  sheetOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "flex-end",
  },
  editSheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    paddingTop: 12,
    maxHeight: "90%",
  },
  sheetHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    alignSelf: "center",
    marginBottom: 14,
  },
  sheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 20,
  },
  sheetTitle: { fontSize: 18, fontFamily: "Inter_700Bold" },
  sheetBody: { gap: 16, paddingBottom: 8 },
  avatarPickerRow: { flexDirection: "row", alignItems: "center", gap: 16 },
  avatarPickerBtn: {},
  avatarPickerCircle: { position: "relative" },
  cameraOverlay: {
    position: "absolute",
    bottom: 0,
    right: 0,
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#fff",
  },
  avatarPickerLabels: { flex: 1, gap: 4 },
  avatarPickerTitle: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  avatarPickerSub: { fontSize: 12, fontFamily: "Inter_400Regular" },
  removePhotoText: { fontSize: 12, fontFamily: "Inter_500Medium", marginTop: 4 },
  fieldGroup: { gap: 6 },
  fieldLabel: { fontSize: 12, fontFamily: "Inter_600SemiBold", textTransform: "uppercase", letterSpacing: 0.6 },
  fieldInput: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    height: 46,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 12,
  },
  fieldText: { flex: 1, fontSize: 15, fontFamily: "Inter_400Regular" },
  joinedRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
  },
  joinedText: { fontSize: 12, fontFamily: "Inter_400Regular" },
  sheetActions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 16,
  },
  sheetBtn: {
    flex: 1,
    height: 48,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 6,
    borderWidth: 1,
  },
  sheetBtnText: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
});
