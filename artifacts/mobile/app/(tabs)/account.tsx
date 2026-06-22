import { Feather } from "@expo/vector-icons";
import React from "react";
import { Platform, Pressable, ScrollView, StyleSheet, Switch, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Avatar } from "@/components/Avatar";
import { useApp } from "@/context/AppContext";
import { useTheme } from "@/hooks/useTheme";

function SettingRow({
  icon,
  label,
  value,
  onPress,
  danger,
}: {
  icon: string;
  label: string;
  value?: string;
  onPress?: () => void;
  danger?: boolean;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      style={({ pressed }) => [
        styles.row,
        { backgroundColor: colors.surface, opacity: pressed ? 0.85 : 1 },
      ]}
      onPress={onPress}
      disabled={!onPress}
    >
      <View style={[styles.rowIcon, { backgroundColor: danger ? colors.dangerLight : colors.primaryLight }]}>
        <Feather name={icon as any} size={18} color={danger ? colors.danger : colors.primary} />
      </View>
      <Text style={[styles.rowLabel, { color: danger ? colors.danger : colors.text }]}>{label}</Text>
      {value ? (
        <Text style={[styles.rowValue, { color: colors.textSecondary }]}>{value}</Text>
      ) : null}
      {onPress ? (
        <Feather name="chevron-right" size={18} color={colors.textTertiary} />
      ) : null}
    </Pressable>
  );
}

export default function AccountScreen() {
  const { colors, isDark, toggleDark } = useTheme();
  const insets = useSafeAreaInsets();
  const { currentUser, expenses, groups, settlements } = useApp();

  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const myExpensesCount = expenses.filter(e => e.paidById === currentUser.id).length;
  const mySettlementsCount = settlements.filter(
    s => s.fromId === currentUser.id || s.toId === currentUser.id
  ).length;

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={[styles.content, { paddingBottom: Platform.OS === "web" ? 134 : 100 }]}
      showsVerticalScrollIndicator={false}
    >
      <View style={[styles.header, { paddingTop: topPad + 16, backgroundColor: colors.headerBg }]}>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Account</Text>
      </View>

      <View style={[styles.profileCard, { backgroundColor: colors.surface }]}>
        <Avatar name={currentUser.name} color={currentUser.avatarColor} size={72} />
        <View style={styles.profileInfo}>
          <Text style={[styles.profileName, { color: colors.text }]}>{currentUser.name}</Text>
          <Text style={[styles.profileSub, { color: colors.textSecondary }]}>SplitEasy User</Text>
        </View>
      </View>

      <View style={styles.statsRow}>
        <View style={[styles.statCard, { backgroundColor: colors.surface }]}>
          <Text style={[styles.statNum, { color: colors.text }]}>{groups.length}</Text>
          <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Groups</Text>
        </View>
        <View style={[styles.statCard, { backgroundColor: colors.surface }]}>
          <Text style={[styles.statNum, { color: colors.text }]}>{myExpensesCount}</Text>
          <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Expenses</Text>
        </View>
        <View style={[styles.statCard, { backgroundColor: colors.surface }]}>
          <Text style={[styles.statNum, { color: colors.text }]}>{mySettlementsCount}</Text>
          <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Settled</Text>
        </View>
      </View>

      <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>Preferences</Text>
      <View style={styles.section}>
        <SettingRow icon="bell" label="Notifications" value="On" />
        <Pressable
          style={[styles.row, { backgroundColor: colors.surface }]}
          onPress={toggleDark}
        >
          <View style={[styles.rowIcon, { backgroundColor: colors.primaryLight }]}>
            <Feather name="moon" size={18} color={colors.primary} />
          </View>
          <Text style={[styles.rowLabel, { color: colors.text }]}>Dark Mode</Text>
          <Switch
            value={isDark}
            onValueChange={toggleDark}
            trackColor={{ false: colors.border, true: colors.primary }}
            thumbColor="#FFFFFF"
          />
        </Pressable>
        <SettingRow icon="dollar-sign" label="Default Currency" value="USD" />
      </View>

      <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>Support</Text>
      <View style={styles.section}>
        <SettingRow icon="help-circle" label="Help & FAQ" onPress={() => {}} />
        <SettingRow icon="mail" label="Contact Us" onPress={() => {}} />
        <SettingRow icon="star" label="Rate App" onPress={() => {}} />
      </View>

      <Text style={[styles.version, { color: colors.textTertiary }]}>SplitEasy v1.0.0</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: {},
  header: {
    paddingHorizontal: 20,
    paddingBottom: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  headerTitle: { fontSize: 28, fontFamily: "Inter_700Bold" },
  profileCard: {
    flexDirection: "row",
    alignItems: "center",
    margin: 16,
    padding: 20,
    borderRadius: 20,
    gap: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  profileInfo: {},
  profileName: { fontSize: 22, fontFamily: "Inter_700Bold" },
  profileSub: { fontSize: 14, fontFamily: "Inter_400Regular", marginTop: 2 },
  statsRow: {
    flexDirection: "row",
    marginHorizontal: 16,
    gap: 10,
    marginBottom: 24,
  },
  statCard: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 16,
    borderRadius: 14,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  statNum: { fontSize: 24, fontFamily: "Inter_700Bold" },
  statLabel: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
  sectionTitle: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 0.8,
    textTransform: "uppercase",
    marginHorizontal: 20,
    marginBottom: 8,
    marginTop: 4,
  },
  section: {
    marginHorizontal: 16,
    marginBottom: 24,
    borderRadius: 16,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    paddingHorizontal: 16,
    gap: 12,
  },
  rowIcon: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  rowLabel: { flex: 1, fontSize: 15, fontFamily: "Inter_500Medium" },
  rowValue: { fontSize: 14, fontFamily: "Inter_400Regular" },
  version: { textAlign: "center", fontSize: 13, fontFamily: "Inter_400Regular", marginTop: 8 },
});
