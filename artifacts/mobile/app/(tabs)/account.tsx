import { Feather } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Avatar } from "@/components/Avatar";
import { Currency, useApp } from "@/context/AppContext";
import { useTheme } from "@/hooks/useTheme";

const NOTIF_KEY = "@spliteasy_notifs";

type NotifPrefs = {
  expenseAdded: boolean;
  settlement: boolean;
  invite: boolean;
};

const DEFAULT_NOTIFS: NotifPrefs = {
  expenseAdded: true,
  settlement: true,
  invite: true,
};

const CURRENCIES: { code: Currency; label: string; flag: string }[] = [
  { code: "USD", label: "US Dollar", flag: "🇺🇸" },
  { code: "EUR", label: "Euro", flag: "🇪🇺" },
  { code: "GBP", label: "British Pound", flag: "🇬🇧" },
  { code: "CAD", label: "Canadian Dollar", flag: "🇨🇦" },
  { code: "AUD", label: "Australian Dollar", flag: "🇦🇺" },
  { code: "JPY", label: "Japanese Yen", flag: "🇯🇵" },
  { code: "INR", label: "Indian Rupee", flag: "🇮🇳" },
  { code: "AED", label: "UAE Dirham", flag: "🇦🇪" },
];

function SectionTitle({ label }: { label: string }) {
  const { colors } = useTheme();
  return (
    <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>
      {label}
    </Text>
  );
}

function ToggleRow({
  icon,
  iconBg,
  iconColor,
  label,
  sub,
  value,
  onToggle,
  isLast,
}: {
  icon: string;
  iconBg: string;
  iconColor: string;
  label: string;
  sub?: string;
  value: boolean;
  onToggle: () => void;
  isLast?: boolean;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      style={[
        styles.row,
        { backgroundColor: colors.surface },
        !isLast && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
      ]}
      onPress={onToggle}
    >
      <View style={[styles.rowIcon, { backgroundColor: iconBg }]}>
        <Feather name={icon as any} size={18} color={iconColor} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.rowLabel, { color: colors.text }]}>{label}</Text>
        {sub ? (
          <Text style={[styles.rowSub, { color: colors.textSecondary }]}>{sub}</Text>
        ) : null}
      </View>
      <Switch
        value={value}
        onValueChange={onToggle}
        trackColor={{ false: colors.border, true: iconColor }}
        thumbColor="#FFFFFF"
      />
    </Pressable>
  );
}

function ChevronRow({
  icon,
  iconBg,
  iconColor,
  label,
  value,
  onPress,
  isLast,
}: {
  icon: string;
  iconBg: string;
  iconColor: string;
  label: string;
  value?: string;
  onPress?: () => void;
  isLast?: boolean;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      style={({ pressed }) => [
        styles.row,
        { backgroundColor: colors.surface, opacity: pressed && onPress ? 0.85 : 1 },
        !isLast && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
      ]}
      onPress={onPress}
      disabled={!onPress}
    >
      <View style={[styles.rowIcon, { backgroundColor: iconBg }]}>
        <Feather name={icon as any} size={18} color={iconColor} />
      </View>
      <Text style={[styles.rowLabel, { color: colors.text }]}>{label}</Text>
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
  const {
    currentUser,
    updateCurrentUser,
    expenses,
    groups,
    settlements,
    simplifyDebtsEnabled,
    toggleSimplifyDebts,
    defaultCurrency,
    setDefaultCurrency,
    exchangeRates,
    ratesUpdated,
    fetchExchangeRates,
  } = useApp();

  const topPad = Platform.OS === "web" ? 67 : insets.top;

  const myExpensesCount = expenses.filter(e => e.paidById === currentUser.id).length;
  const mySettlementsCount = settlements.filter(
    s => s.fromId === currentUser.id || s.toId === currentUser.id
  ).length;

  const [notifs, setNotifs] = useState<NotifPrefs>(DEFAULT_NOTIFS);
  const [showCurrencyPicker, setShowCurrencyPicker] = useState(false);
  const [refreshingRates, setRefreshingRates] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState(currentUser.name);
  const nameInputRef = useRef<TextInput>(null);

  useEffect(() => {
    AsyncStorage.getItem(NOTIF_KEY).then(stored => {
      if (stored) {
        try {
          setNotifs({ ...DEFAULT_NOTIFS, ...JSON.parse(stored) });
        } catch {}
      }
    });
  }, []);

  const saveNotifs = useCallback((next: NotifPrefs) => {
    setNotifs(next);
    AsyncStorage.setItem(NOTIF_KEY, JSON.stringify(next));
  }, []);

  const toggleNotif = useCallback(
    (key: keyof NotifPrefs) => {
      saveNotifs({ ...notifs, [key]: !notifs[key] });
    },
    [notifs, saveNotifs]
  );

  const handleRefreshRates = useCallback(async () => {
    setRefreshingRates(true);
    await fetchExchangeRates();
    setRefreshingRates(false);
  }, [fetchExchangeRates]);

  const handleSaveName = useCallback(() => {
    const trimmed = nameInput.trim();
    if (trimmed.length > 0 && trimmed !== currentUser.name) {
      updateCurrentUser({ name: trimmed });
    } else {
      setNameInput(currentUser.name);
    }
    setEditingName(false);
  }, [nameInput, currentUser.name, updateCurrentUser]);

  function formatRatesUpdated() {
    if (!ratesUpdated) return "Not yet loaded";
    const d = new Date(ratesUpdated);
    const now = new Date();
    const diff = Math.floor((now.getTime() - d.getTime()) / 60000);
    if (diff < 1) return "Just now";
    if (diff < 60) return `${diff}m ago`;
    if (diff < 1440) return `${Math.floor(diff / 60)}h ago`;
    return d.toLocaleDateString();
  }

  const hasRates = Object.keys(exchangeRates).length > 0;
  const selectedCurrencyInfo = CURRENCIES.find(c => c.code === defaultCurrency)!;

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
          {editingName ? (
            <TextInput
              ref={nameInputRef}
              style={[styles.profileNameInput, { color: colors.text, borderColor: colors.primary }]}
              value={nameInput}
              onChangeText={setNameInput}
              onBlur={handleSaveName}
              onSubmitEditing={handleSaveName}
              autoFocus
              returnKeyType="done"
              maxLength={32}
            />
          ) : (
            <Pressable style={styles.profileNameRow} onPress={() => {
              setNameInput(currentUser.name);
              setEditingName(true);
              setTimeout(() => nameInputRef.current?.focus(), 50);
            }}>
              <Text style={[styles.profileName, { color: colors.text }]}>{currentUser.name}</Text>
              <Feather name="edit-2" size={14} color={colors.textTertiary} style={{ marginLeft: 6 }} />
            </Pressable>
          )}
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

      <SectionTitle label="Notifications" />
      <View style={[styles.section, { shadowColor: colors.shadow }]}>
        <ToggleRow
          icon="dollar-sign"
          iconBg={colors.primaryLight}
          iconColor={colors.primary}
          label="Expense alerts"
          sub="When someone adds an expense to your group"
          value={notifs.expenseAdded}
          onToggle={() => toggleNotif("expenseAdded")}
        />
        <ToggleRow
          icon="check-circle"
          iconBg={colors.tealTint}
          iconColor={colors.teal}
          label="Settlement alerts"
          sub="When a debt is paid or settled"
          value={notifs.settlement}
          onToggle={() => toggleNotif("settlement")}
        />
        <ToggleRow
          icon="users"
          iconBg={colors.accentTint}
          iconColor={colors.accent}
          label="Group invites"
          sub="When someone invites you to a group"
          value={notifs.invite}
          onToggle={() => toggleNotif("invite")}
          isLast
        />
      </View>

      <SectionTitle label="Preferences" />
      <View style={[styles.section, { shadowColor: colors.shadow }]}>
        <ToggleRow
          icon="moon"
          iconBg={colors.primaryLight}
          iconColor={colors.primary}
          label="Dark Mode"
          value={isDark}
          onToggle={toggleDark}
        />
        <ToggleRow
          icon="git-merge"
          iconBg={colors.tealTint}
          iconColor={colors.teal}
          label="Simplify Debts"
          sub={simplifyDebtsEnabled ? "Fewer payments, merged across friends" : "Show each expense debt separately"}
          value={simplifyDebtsEnabled}
          onToggle={toggleSimplifyDebts}
        />
        <ChevronRow
          icon="globe"
          iconBg={colors.accentTint}
          iconColor={colors.accent}
          label="Default Currency"
          value={`${selectedCurrencyInfo.flag}  ${defaultCurrency}`}
          onPress={() => setShowCurrencyPicker(true)}
          isLast
        />
      </View>

      <SectionTitle label="Exchange Rates" />
      <View style={[styles.section, { shadowColor: colors.shadow }]}>
        <View style={[styles.row, { backgroundColor: colors.surface, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }]}>
          <View style={[styles.rowIcon, { backgroundColor: colors.primaryLight }]}>
            <Feather name="refresh-cw" size={18} color={colors.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.rowLabel, { color: colors.text }]}>Live Rates</Text>
            <Text style={[styles.rowSub, { color: colors.textSecondary }]}>
              {hasRates ? `Updated ${formatRatesUpdated()} · ECB via frankfurter.app` : "Fetching rates…"}
            </Text>
          </View>
          <Pressable
            style={[styles.refreshBtn, { backgroundColor: colors.primaryLight }]}
            onPress={handleRefreshRates}
            disabled={refreshingRates}
          >
            {refreshingRates ? (
              <ActivityIndicator size="small" color={colors.primary} />
            ) : (
              <Text style={[styles.refreshBtnText, { color: colors.primary }]}>Refresh</Text>
            )}
          </Pressable>
        </View>
        <View style={[styles.row, { backgroundColor: colors.surface }]}>
          <View style={[styles.rowIcon, { backgroundColor: colors.tealTint }]}>
            <Feather name="info" size={18} color={colors.teal} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.rowSub, { color: colors.textSecondary, lineHeight: 18 }]}>
              Multi-currency group balances are converted to your default currency ({defaultCurrency}) using ECB daily rates. Rates are cached offline and refreshed on launch.
            </Text>
          </View>
        </View>
      </View>

      <Text style={[styles.version, { color: colors.textTertiary }]}>SplitEasy v1.0.0</Text>

      <Modal
        visible={showCurrencyPicker}
        transparent
        animationType="slide"
        onRequestClose={() => setShowCurrencyPicker(false)}
      >
        <Pressable
          style={styles.modalOverlay}
          onPress={() => setShowCurrencyPicker(false)}
        >
          <Pressable
            style={[styles.pickerSheet, { backgroundColor: colors.surface }]}
            onPress={e => e.stopPropagation()}
          >
            <View style={[styles.pickerHandle, { backgroundColor: colors.border }]} />
            <Text style={[styles.pickerTitle, { color: colors.text }]}>Default Currency</Text>
            <Text style={[styles.pickerSub, { color: colors.textSecondary }]}>
              Used for the home screen total and as the default when creating new groups
            </Text>
            {CURRENCIES.map((c, i) => {
              const isSelected = c.code === defaultCurrency;
              return (
                <Pressable
                  key={c.code}
                  style={[
                    styles.currencyRow,
                    isSelected && { backgroundColor: colors.primaryLight },
                    i < CURRENCIES.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
                  ]}
                  onPress={() => {
                    setDefaultCurrency(c.code);
                    setShowCurrencyPicker(false);
                  }}
                >
                  <Text style={styles.currencyFlag}>{c.flag}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.currencyCode, { color: colors.text }]}>{c.code}</Text>
                    <Text style={[styles.currencyLabel, { color: colors.textSecondary }]}>{c.label}</Text>
                  </View>
                  {isSelected && (
                    <Feather name="check" size={18} color={colors.primary} />
                  )}
                </Pressable>
              );
            })}
            <Pressable
              style={[styles.cancelBtn, { backgroundColor: colors.background }]}
              onPress={() => setShowCurrencyPicker(false)}
            >
              <Text style={[styles.cancelBtnText, { color: colors.textSecondary }]}>Cancel</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
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
  profileInfo: { flex: 1 },
  profileNameRow: { flexDirection: "row", alignItems: "center" },
  profileName: { fontSize: 22, fontFamily: "Inter_700Bold" },
  profileNameInput: {
    fontSize: 22,
    fontFamily: "Inter_700Bold",
    borderBottomWidth: 2,
    paddingVertical: 2,
    paddingHorizontal: 0,
  },
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
  rowSub: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 1 },
  rowValue: { fontSize: 14, fontFamily: "Inter_400Regular" },
  refreshBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    minWidth: 70,
    alignItems: "center",
  },
  refreshBtnText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  version: { textAlign: "center", fontSize: 13, fontFamily: "Inter_400Regular", marginTop: 8 },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "flex-end",
  },
  pickerSheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 12,
    paddingBottom: 32,
  },
  pickerHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    alignSelf: "center",
    marginBottom: 16,
  },
  pickerTitle: {
    fontSize: 18,
    fontFamily: "Inter_700Bold",
    marginHorizontal: 20,
    marginBottom: 4,
  },
  pickerSub: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    marginHorizontal: 20,
    marginBottom: 16,
    lineHeight: 18,
  },
  currencyRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    paddingHorizontal: 20,
    gap: 14,
  },
  currencyFlag: { fontSize: 24 },
  currencyCode: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  currencyLabel: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 1 },
  cancelBtn: {
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: "center",
  },
  cancelBtnText: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
});
