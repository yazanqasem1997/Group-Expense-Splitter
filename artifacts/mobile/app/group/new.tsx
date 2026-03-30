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
import { Currency, Group, Member, useApp } from "@/context/AppContext";
import { useTheme } from "@/hooks/useTheme";

const GROUP_TYPES: { value: Group["type"]; label: string; emoji: string }[] = [
  { value: "trip", label: "Trip", emoji: "✈️" },
  { value: "home", label: "Home", emoji: "🏠" },
  { value: "friends", label: "Friends", emoji: "🎉" },
  { value: "couple", label: "Couple", emoji: "💑" },
  { value: "other", label: "Other", emoji: "📦" },
];

const CURRENCIES: Currency[] = ["USD", "EUR", "GBP", "CAD", "AUD", "JPY", "INR"];

export default function NewGroupScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { members, currentUser, addGroup } = useApp();

  const [name, setName] = useState("");
  const [groupType, setGroupType] = useState<Group["type"]>("friends");
  const [currency, setCurrency] = useState<Currency>("USD");
  const [selectedIds, setSelectedIds] = useState<string[]>([currentUser.id]);

  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const selectedType = GROUP_TYPES.find(t => t.value === groupType)!;

  function toggleMember(id: string) {
    if (id === currentUser.id) return;
    setSelectedIds(prev =>
      prev.includes(id) ? prev.filter(m => m !== id) : [...prev, id]
    );
  }

  function handleCreate() {
    if (!name.trim()) {
      Alert.alert("Name required", "Please enter a group name");
      return;
    }
    if (selectedIds.length < 2) {
      Alert.alert("Add members", "Please add at least one other member");
      return;
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    const group = addGroup({
      name: name.trim(),
      emoji: selectedType.emoji,
      memberIds: selectedIds,
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

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: Platform.OS === "web" ? 134 : 40 }]}
        showsVerticalScrollIndicator={false}
      >
        <Text style={[styles.label, { color: colors.textSecondary }]}>Group Name</Text>
        <View style={[styles.inputWrap, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={styles.inputEmoji}>{selectedType.emoji}</Text>
          <TextInput
            style={[styles.input, { color: colors.text }]}
            placeholder="e.g. Barcelona Trip"
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
                  backgroundColor:
                    groupType === t.value ? colors.primary : colors.surface,
                  borderColor: groupType === t.value ? colors.primary : colors.border,
                },
              ]}
              onPress={() => setGroupType(t.value)}
            >
              <Text style={styles.typeEmoji}>{t.emoji}</Text>
              <Text
                style={[
                  styles.typeLabel,
                  { color: groupType === t.value ? "#fff" : colors.text },
                ]}
              >
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
              <Text
                style={[
                  styles.currencyLabel,
                  { color: currency === c ? "#fff" : colors.text },
                ]}
              >
                {c}
              </Text>
            </Pressable>
          ))}
        </ScrollView>

        <Text style={[styles.label, { color: colors.textSecondary }]}>Members</Text>
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
                <Text style={[styles.memberName, { color: colors.text }]}>
                  {isMe ? "You" : m.name}
                </Text>
                {selected && (
                  <Feather name="check-circle" size={20} color={colors.primary} />
                )}
              </Pressable>
            );
          })}
        </View>
      </ScrollView>
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
  memberList: { gap: 10 },
  memberRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    borderRadius: 14,
    gap: 12,
  },
  memberName: { flex: 1, fontSize: 15, fontFamily: "Inter_500Medium" },
});
