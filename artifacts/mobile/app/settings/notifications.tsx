import { useSoundEffects } from "@/context/SoundEffectsContext";
import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import React from "react";
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useApp } from "@/context/AppContext";
import { useTheme } from "@/hooks/useTheme";

function ToggleRow({
  icon, iconBg, iconColor, label, sub, value, onToggle, isLast,
}: {
  icon: string; iconBg: string; iconColor: string;
  label: string; sub?: string; value: boolean;
  onToggle: () => void; isLast?: boolean;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      style={[
        styles.row, { backgroundColor: colors.surface },
        !isLast && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
      ]}
      onPress={onToggle}
    >
      <View style={[styles.rowIcon, { backgroundColor: iconBg }]}>
        <Feather name={icon as any} size={18} color={iconColor} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.rowLabel, { color: colors.text }]}>{label}</Text>
        {sub ? <Text style={[styles.rowSub, { color: colors.textSecondary }]}>{sub}</Text> : null}
      </View>
      <Switch
        value={value}
        onValueChange={onToggle}
        trackColor={{ false: colors.switchOff, true: colors.success }}
        thumbColor={value ? "#FFFFFF" : colors.textTertiary}
        ios_backgroundColor={colors.switchOff}
      />
    </Pressable>
  );
}

export default function NotificationsScreen({ onBack }: { onBack?: () => void } = {}) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { notifPrefs, updateNotifPref } = useApp();
  const { muted, setMuted } = useSoundEffects();
  const topPad = insets.top;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topPad + 8 }]}>
        <Pressable
          style={({ pressed }) => [styles.backBtn, { opacity: pressed ? 0.6 : 1 }]}
          onPress={() => onBack ? onBack() : router.back()}
          hitSlop={8}
         accessibilityRole="button" accessibilityLabel="Back">
          <Feather name="arrow-left" size={22} color={colors.text} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Notifications</Text>
        <View style={styles.backBtn} />
      </View>

       <ScrollView showsVerticalScrollIndicator={false}>
        <Text style={[styles.explanation, { color: colors.textSecondary }]}>
          Notifications are sent only when you are involved in the affected group expense,
          settlement, or comment. You will not receive activity alerts for unrelated items.
        </Text>
        <View style={[styles.section, { shadowColor: colors.shadow }]}>
          <ToggleRow
            icon="volume-2" iconBg={colors.tealTint} iconColor={colors.teal}
            label="App sounds" sub="Chimes when you add, remove or settle"
            value={!muted}
            onToggle={() => setMuted(!muted)}
          />
          <ToggleRow
            icon="plus-circle" iconBg={colors.primaryLight} iconColor={colors.primary}
            label="New expense" sub="When someone adds an expense"
            value={notifPrefs.expenseAdded}
            onToggle={() => updateNotifPref("expenseAdded", !notifPrefs.expenseAdded)}
          />
          <ToggleRow
            icon="edit-3" iconBg={colors.primaryLight} iconColor={colors.primary}
            label="Expense edits" sub="When an involved expense is edited"
            value={notifPrefs.expenseEdited}
            onToggle={() => updateNotifPref("expenseEdited", !notifPrefs.expenseEdited)}
          />
          <ToggleRow
            icon="trash-2" iconBg={colors.dangerLight} iconColor={colors.danger}
            label="Expense deletions" sub="When an involved expense is deleted"
            value={notifPrefs.expenseDeleted}
            onToggle={() => updateNotifPref("expenseDeleted", !notifPrefs.expenseDeleted)}
          />
          <ToggleRow
            icon="check-circle" iconBg={colors.tealTint} iconColor={colors.teal}
            label="Settlements" sub="When a debt is paid or settled"
            value={notifPrefs.settlement}
            onToggle={() => updateNotifPref("settlement", !notifPrefs.settlement)}
          />
          <ToggleRow
            icon="users" iconBg={colors.tealTint} iconColor={colors.teal}
            label="Group invites" sub="When someone invites you to a group"
            value={notifPrefs.invite}
            onToggle={() => updateNotifPref("invite", !notifPrefs.invite)}
          />
          <ToggleRow
            icon="user-plus" iconBg={colors.tealTint} iconColor={colors.teal}
            label="Friend requests" sub="When someone wants to add you as a friend"
            value={notifPrefs.friendRequest}
            onToggle={() => updateNotifPref("friendRequest", !notifPrefs.friendRequest)}
          />
          <ToggleRow
            icon="message-circle" iconBg={colors.accentTint} iconColor={colors.accent}
            label="Chat messages" sub="When someone writes in a group chat"
            value={notifPrefs.chat}
            onToggle={() => updateNotifPref("chat", !notifPrefs.chat)}
          />
          <ToggleRow
            icon="bell" iconBg={colors.primaryLight} iconColor={colors.primary}
            label="Reminders" sub="A friendly nudge if you haven't split in a while"
            value={notifPrefs.reminders}
            onToggle={() => updateNotifPref("reminders", !notifPrefs.reminders)}
          />
          <ToggleRow
            icon="message-square" iconBg={colors.accentTint} iconColor={colors.accent}
            label="Comments" sub="When someone comments on an expense"
            value={notifPrefs.comment}
            onToggle={() => updateNotifPref("comment", !notifPrefs.comment)}
            isLast
          />
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
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  backBtn: { width: 36, height: 36, alignItems: "center", justifyContent: "center" },
  headerTitle: { fontSize: 17, fontFamily: "Inter_600SemiBold" },
  section: {
    marginHorizontal: 16,
    marginTop: 16,
    borderRadius: 14,
    overflow: "hidden",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  explanation: {
    fontSize: 13,
    lineHeight: 19,
    marginHorizontal: 20,
    marginTop: 16,
    marginBottom: 2,
    textAlign: "center",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 13,
    gap: 12,
  },
  rowIcon: {
    width: 34, height: 34, borderRadius: 9,
    alignItems: "center", justifyContent: "center",
  },
  rowLabel: { fontSize: 15, fontFamily: "Inter_500Medium" },
  rowSub: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 1 },
});
