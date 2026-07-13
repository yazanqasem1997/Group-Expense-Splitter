import { Feather } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import { router } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,

  LayoutAnimation,
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
import { showAlert } from "@/hooks/alertStore";
import { scrollRegistry } from "@/hooks/scrollRegistry";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Avatar } from "@/components/Avatar";
import { THEME_META, THEME_ORDER, ThemeId } from "@/constants/themes";
import { Currency, useApp } from "@/context/AppContext";
import { useBiometric } from "@/context/BiometricContext";
import { useTheme } from "@/hooks/useTheme";


const CURRENCIES: { code: Currency; label: string; flag: string }[] = [
  { code: "USD", label: "US Dollar",             flag: "🇺🇸" },
  { code: "EUR", label: "Euro",                  flag: "🇪🇺" },
  { code: "GBP", label: "British Pound",         flag: "🇬🇧" },
  { code: "CAD", label: "Canadian Dollar",       flag: "🇨🇦" },
  { code: "AUD", label: "Australian Dollar",     flag: "🇦🇺" },
  { code: "JPY", label: "Japanese Yen",          flag: "🇯🇵" },
  { code: "INR", label: "Indian Rupee",          flag: "🇮🇳" },
  { code: "AED", label: "UAE Dirham",            flag: "🇦🇪" },
  { code: "CHF", label: "Swiss Franc",           flag: "🇨🇭" },
  { code: "SEK", label: "Swedish Krona",         flag: "🇸🇪" },
  { code: "NOK", label: "Norwegian Krone",       flag: "🇳🇴" },
  { code: "DKK", label: "Danish Krone",          flag: "🇩🇰" },
  { code: "NZD", label: "New Zealand Dollar",    flag: "🇳🇿" },
  { code: "SGD", label: "Singapore Dollar",      flag: "🇸🇬" },
  { code: "HKD", label: "Hong Kong Dollar",      flag: "🇭🇰" },
  { code: "MXN", label: "Mexican Peso",          flag: "🇲🇽" },
  { code: "BRL", label: "Brazilian Real",        flag: "🇧🇷" },
  { code: "CNY", label: "Chinese Yuan",          flag: "🇨🇳" },
  { code: "ZAR", label: "South African Rand",    flag: "🇿🇦" },
  { code: "TRY", label: "Turkish Lira",          flag: "🇹🇷" },
  { code: "KRW", label: "South Korean Won",      flag: "🇰🇷" },
  { code: "THB", label: "Thai Baht",             flag: "🇹🇭" },
  { code: "IDR", label: "Indonesian Rupiah",     flag: "🇮🇩" },
  { code: "MYR", label: "Malaysian Ringgit",     flag: "🇲🇾" },
  { code: "PHP", label: "Philippine Peso",       flag: "🇵🇭" },
  { code: "SAR", label: "Saudi Riyal",           flag: "🇸🇦" },
  { code: "QAR", label: "Qatari Riyal",          flag: "🇶🇦" },
  { code: "KWD", label: "Kuwaiti Dinar",         flag: "🇰🇼" },
  { code: "OMR", label: "Omani Rial",            flag: "🇴🇲" },
  { code: "BHD", label: "Bahraini Dinar",        flag: "🇧🇭" },
  { code: "ILS", label: "Israeli Shekel",        flag: "🇮🇱" },
  { code: "EGP", label: "Egyptian Pound",        flag: "🇪🇬" },
  { code: "NGN", label: "Nigerian Naira",        flag: "🇳🇬" },
  { code: "KES", label: "Kenyan Shilling",       flag: "🇰🇪" },
  { code: "GHS", label: "Ghanaian Cedi",         flag: "🇬🇭" },
  { code: "MAD", label: "Moroccan Dirham",       flag: "🇲🇦" },
  { code: "XOF", label: "West African CFA",      flag: "🌍" },
  { code: "XAF", label: "Central African CFA",   flag: "🌍" },
  { code: "COP", label: "Colombian Peso",        flag: "🇨🇴" },
  { code: "CLP", label: "Chilean Peso",          flag: "🇨🇱" },
  { code: "ARS", label: "Argentine Peso",        flag: "🇦🇷" },
  { code: "PEN", label: "Peruvian Sol",          flag: "🇵🇪" },
  { code: "PKR", label: "Pakistani Rupee",       flag: "🇵🇰" },
  { code: "BDT", label: "Bangladeshi Taka",      flag: "🇧🇩" },
  { code: "LKR", label: "Sri Lankan Rupee",      flag: "🇱🇰" },
  { code: "TWD", label: "Taiwan Dollar",         flag: "🇹🇼" },
  { code: "VND", label: "Vietnamese Dong",       flag: "🇻🇳" },
  { code: "MMK", label: "Myanmar Kyat",          flag: "🇲🇲" },
  { code: "HUF", label: "Hungarian Forint",      flag: "🇭🇺" },
  { code: "PLN", label: "Polish Zloty",          flag: "🇵🇱" },
  { code: "CZK", label: "Czech Koruna",          flag: "🇨🇿" },
  { code: "RON", label: "Romanian Leu",          flag: "🇷🇴" },
  { code: "BGN", label: "Bulgarian Lev",         flag: "🇧🇬" },
  { code: "HRK", label: "Croatian Kuna",         flag: "🇭🇷" },
  { code: "RUB", label: "Russian Ruble",         flag: "🇷🇺" },
  { code: "UAH", label: "Ukrainian Hryvnia",     flag: "🇺🇦" },
];


function SectionTitle({ label }: { label: string }) {
  const { colors } = useTheme();
  return <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>{label}</Text>;
}

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
        trackColor={{ false: colors.switchOff, true: iconColor }}
        thumbColor="#FFFFFF"
        ios_backgroundColor={colors.switchOff}
      />
    </Pressable>
  );
}

function ChevronRow({
  icon, iconBg, iconColor, label, value, onPress, isLast,
}: {
  icon: string; iconBg: string; iconColor: string;
  label: string; value?: string;
  onPress?: () => void; isLast?: boolean;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      style={({ pressed }) => [
        styles.row, { backgroundColor: colors.surface, opacity: pressed && onPress ? 0.85 : 1 },
        !isLast && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
      ]}
      onPress={onPress}
      disabled={!onPress}
    >
      <View style={[styles.rowIcon, { backgroundColor: iconBg }]}>
        <Feather name={icon as any} size={18} color={iconColor} />
      </View>
      <Text style={[styles.rowLabel, { color: colors.text }]}>{label}</Text>
      {value ? <Text style={[styles.rowValue, { color: colors.textSecondary }]}>{value}</Text> : null}
      {onPress ? <Feather name="chevron-right" size={18} color={colors.textTertiary} /> : null}
    </Pressable>
  );
}

export default function AccountScreen() {
  const { colors, isDark, toggleDark, themeId, setTheme } = useTheme();
  const insets = useSafeAreaInsets();
  const {
    currentUser, updateCurrentUser,
    expenses, groups, settlements, recurringExpenses,
    simplifyDebtsEnabled, toggleSimplifyDebts,
    defaultCurrency, setDefaultCurrency,
    exchangeRates, ratesUpdated, fetchExchangeRates,
    notifPrefs, updateNotifPref,
  } = useApp();
  const { biometricEnabled, setBiometricEnabled, biometricAvailable, biometricType, unlock } = useBiometric();

  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const myExpensesCount = expenses.filter(e => e.paidById === currentUser.id).length;
  const mySettlementsCount = settlements.filter(
    s => s.fromId === currentUser.id || s.toId === currentUser.id
  ).length;

  const [showCurrencyPicker, setShowCurrencyPicker] = useState(false);
  const [currencySearch, setCurrencySearch] = useState("");
  const [refreshingRates, setRefreshingRates] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState(currentUser.name);
  const scrollRef = useRef<ScrollView>(null);
  useEffect(() => {
    scrollRegistry.register("account", () => {
      scrollRef.current?.scrollTo({ y: 0, animated: true });
    });
    return () => scrollRegistry.unregister("account");
  }, []);
  const nameInputRef = useRef<TextInput>(null);
  const [expandedNotifCats, setExpandedNotifCats] = useState<string[]>([]);

  function toggleNotifCat(cat: string) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (Platform.OS !== "web") {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    }
    setExpandedNotifCats(prev =>
      prev.includes(cat) ? prev.filter(c => c !== cat) : [...prev, cat]
    );
  }


  const handleRefreshRates = useCallback(async () => {
    setRefreshingRates(true);
    await fetchExchangeRates();
    setRefreshingRates(false);
  }, [fetchExchangeRates]);

  const handleSaveName = useCallback(() => {
    const trimmed = nameInput.trim();
    if (trimmed.length > 0 && trimmed !== currentUser.name) updateCurrentUser({ name: trimmed });
    else setNameInput(currentUser.name);
    setEditingName(false);
  }, [nameInput, currentUser.name, updateCurrentUser]);

  const handlePickPhoto = useCallback(async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: "images",
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.6,
      base64: Platform.OS === "web",
    });
    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0];
      const uri = Platform.OS === "web" && asset.base64
        ? `data:image/jpeg;base64,${asset.base64}`
        : asset.uri;
      updateCurrentUser({ photo: uri });
    }
  }, [updateCurrentUser]);

  const handleRemovePhoto = useCallback(() => {
    updateCurrentUser({ photo: undefined });
  }, [updateCurrentUser]);

  function formatRatesUpdated() {
    if (!ratesUpdated) return "Not yet loaded";
    const d = new Date(ratesUpdated);
    const diff = Math.floor((Date.now() - d.getTime()) / 60000);
    if (diff < 1) return "Just now";
    if (diff < 60) return `${diff}m ago`;
    if (diff < 1440) return `${Math.floor(diff / 60)}h ago`;
    return d.toLocaleDateString();
  }

  const hasRates = Object.keys(exchangeRates).length > 0;
  const selectedCurrencyInfo = CURRENCIES.find(c => c.code === defaultCurrency)!;

  return (
    <ScrollView
      ref={scrollRef}
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={[styles.content, { paddingBottom: Platform.OS === "web" ? 134 : 100 }]}
      showsVerticalScrollIndicator={false}
    >
      <View style={[styles.header, { paddingTop: topPad + 16 }]}>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Account</Text>
      </View>

      {/* Profile card */}
      <View style={[styles.profileCard, { backgroundColor: colors.surface }]}>
        <Pressable onPress={handlePickPhoto} style={styles.avatarWrapper}>
          <Avatar
            name={currentUser.name}
            color={currentUser.avatarColor}
            size={72}
            imageUri={currentUser.photo}
          />
          <View style={[styles.cameraBadge, { backgroundColor: colors.primary }]}>
            <Feather name="camera" size={11} color="#fff" />
          </View>
        </Pressable>
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
            <Pressable
              style={styles.profileNameRow}
              onPress={() => { setNameInput(currentUser.name); setEditingName(true); }}
            >
              <Text style={[styles.profileName, { color: colors.text }]}>{currentUser.name}</Text>
              <Feather name="edit-2" size={14} color={colors.textTertiary} style={{ marginLeft: 6 }} />
            </Pressable>
          )}
          <Text style={[styles.profileSub, { color: colors.textSecondary }]}>SplitEasy User</Text>
          {currentUser.photo ? (
            <Pressable onPress={handleRemovePhoto} style={{ marginTop: 4 }}>
              <Text style={[styles.removePhotoText, { color: colors.danger }]}>Remove photo</Text>
            </Pressable>
          ) : null}
        </View>
      </View>

      {/* Stats */}
      <View style={styles.statsRow}>
        <Pressable
          style={({ pressed }) => [styles.statCard, { backgroundColor: colors.surface, opacity: pressed ? 0.7 : 1 }]}
          onPress={() => router.push("/")}
        >
          <Text style={[styles.statNum, { color: colors.text }]}>{groups.length}</Text>
          <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Groups</Text>
        </Pressable>
        <Pressable
          style={({ pressed }) => [styles.statCard, { backgroundColor: colors.surface, opacity: pressed ? 0.7 : 1 }]}
          onPress={() => router.push("/(tabs)/activity")}
        >
          <Text style={[styles.statNum, { color: colors.text }]}>{myExpensesCount}</Text>
          <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Expenses</Text>
        </Pressable>
        <Pressable
          style={({ pressed }) => [styles.statCard, { backgroundColor: colors.surface, opacity: pressed ? 0.7 : 1 }]}
          onPress={() => router.push("/(tabs)/activity")}
        >
          <Text style={[styles.statNum, { color: colors.text }]}>{mySettlementsCount}</Text>
          <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Settled</Text>
        </Pressable>
      </View>

      {/* Notifications */}
      <SectionTitle label="Notifications" />
      <View style={[styles.section, { shadowColor: colors.shadow }]}>

        {/* — Expenses category — */}
        <Pressable
          style={[styles.notifCatRow, { backgroundColor: colors.surface, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }]}
          onPress={() => toggleNotifCat("expenses")}
        >
          <View style={[styles.rowIcon, { backgroundColor: colors.primaryLight }]}>
            <Feather name="dollar-sign" size={18} color={colors.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.rowLabel, { color: colors.text }]}>Expenses</Text>
            <Text style={[styles.rowSub, { color: colors.textSecondary }]}>New, edits &amp; deletions</Text>
          </View>
          <Feather name={expandedNotifCats.includes("expenses") ? "chevron-up" : "chevron-down"} size={16} color={colors.textTertiary} />
        </Pressable>
        {expandedNotifCats.includes("expenses") && (
          <View style={[styles.notifSubGroup, { borderColor: colors.border }]}>
            <ToggleRow
              icon="plus-circle" iconBg={colors.primaryLight + "88"} iconColor={colors.primary}
              label="New expense" sub="Someone adds an expense to your group"
              value={notifPrefs.expenseAdded} onToggle={() => updateNotifPref("expenseAdded", !notifPrefs.expenseAdded)}
            />
            <ToggleRow
              icon="edit-2" iconBg={colors.primaryLight + "88"} iconColor={colors.primary}
              label="Expense edited" sub="Someone modifies an existing expense"
              value={notifPrefs.expenseEdited} onToggle={() => updateNotifPref("expenseEdited", !notifPrefs.expenseEdited)}
            />
            <ToggleRow
              icon="trash-2" iconBg={colors.dangerLight ?? colors.primaryLight + "88"} iconColor={colors.danger}
              label="Expense deleted" sub="Someone removes an expense from the group"
              value={notifPrefs.expenseDeleted} onToggle={() => updateNotifPref("expenseDeleted", !notifPrefs.expenseDeleted)}
              isLast
            />
          </View>
        )}

        {/* — Social category — */}
        <Pressable
          style={[styles.notifCatRow, { backgroundColor: colors.surface, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }]}
          onPress={() => toggleNotifCat("social")}
        >
          <View style={[styles.rowIcon, { backgroundColor: colors.accentTint }]}>
            <Feather name="message-circle" size={18} color={colors.accent} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.rowLabel, { color: colors.text }]}>Social</Text>
            <Text style={[styles.rowSub, { color: colors.textSecondary }]}>Comments &amp; reactions</Text>
          </View>
          <Feather name={expandedNotifCats.includes("social") ? "chevron-up" : "chevron-down"} size={16} color={colors.textTertiary} />
        </Pressable>
        {expandedNotifCats.includes("social") && (
          <View style={[styles.notifSubGroup, { borderColor: colors.border }]}>
            <ToggleRow
              icon="message-square" iconBg={colors.accentTint + "88"} iconColor={colors.accent}
              label="Comments" sub="Someone comments on an expense"
              value={notifPrefs.comment} onToggle={() => updateNotifPref("comment", !notifPrefs.comment)}
            />
            <ToggleRow
              icon="heart" iconBg={colors.accentTint + "88"} iconColor={colors.accent}
              label="Reactions" sub="Someone reacts to an expense"
              value={notifPrefs.reaction} onToggle={() => updateNotifPref("reaction", !notifPrefs.reaction)}
              isLast
            />
          </View>
        )}

        {/* — Financial category — */}
        <Pressable
          style={[styles.notifCatRow, { backgroundColor: colors.surface }]}
          onPress={() => toggleNotifCat("financial")}
        >
          <View style={[styles.rowIcon, { backgroundColor: colors.tealTint }]}>
            <Feather name="check-circle" size={18} color={colors.teal} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.rowLabel, { color: colors.text }]}>Financial</Text>
            <Text style={[styles.rowSub, { color: colors.textSecondary }]}>Settlements &amp; invites</Text>
          </View>
          <Feather name={expandedNotifCats.includes("financial") ? "chevron-up" : "chevron-down"} size={16} color={colors.textTertiary} />
        </Pressable>
        {expandedNotifCats.includes("financial") && (
          <View style={[styles.notifSubGroup, { borderColor: colors.border }]}>
            <ToggleRow
              icon="check-circle" iconBg={colors.tealTint + "88"} iconColor={colors.teal}
              label="Settlements" sub="When a debt is paid or settled"
              value={notifPrefs.settlement} onToggle={() => updateNotifPref("settlement", !notifPrefs.settlement)}
            />
            <ToggleRow
              icon="users" iconBg={colors.tealTint + "88"} iconColor={colors.teal}
              label="Group invites" sub="When someone invites you to a group"
              value={notifPrefs.invite} onToggle={() => updateNotifPref("invite", !notifPrefs.invite)}
              isLast
            />
          </View>
        )}
      </View>

      {/* Appearance */}
      <SectionTitle label="Appearance" />
      <View style={[styles.section, { shadowColor: colors.shadow }]}>
        <ToggleRow
          icon="moon" iconBg={colors.primaryLight} iconColor={colors.primary}
          label="Dark Mode" value={isDark} onToggle={toggleDark}
        />
        {/* Theme picker */}
        <View style={[styles.row, { backgroundColor: colors.surface, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }]}>
          <View style={[styles.rowIcon, { backgroundColor: colors.primaryLight }]}>
            <Feather name="droplet" size={18} color={colors.primary} />
          </View>
          <Text style={[styles.rowLabel, { color: colors.text }]}>Theme</Text>
        </View>
        <View style={[styles.themePickerRow, { backgroundColor: colors.surface }]}>
          {THEME_ORDER.map(id => {
            const meta = THEME_META[id];
            const swatch = isDark ? meta.darkSwatch : meta.lightSwatch;
            const isSelected = themeId === id;
            return (
              <Pressable
                key={id}
                onPress={() => setTheme(id)}
                style={[
                  styles.themeSwatch,
                  { backgroundColor: swatch },
                  isSelected && styles.themeSwatchSelected,
                ]}
              >
                {isSelected && <Feather name="check" size={14} color="#fff" />}
              </Pressable>
            );
          })}
        </View>
        <View style={[styles.themeLabelsRow, { backgroundColor: colors.surface }]}>
          {THEME_ORDER.map(id => (
            <Text
              key={id}
              style={[
                styles.themeLabel,
                { color: themeId === id ? colors.primary : colors.textTertiary,
                  fontFamily: themeId === id ? "Inter_600SemiBold" : "Inter_400Regular" },
              ]}
            >
              {THEME_META[id].label}
            </Text>
          ))}
        </View>
      </View>

      {/* Security */}
      <SectionTitle label="Security" />
      <View style={[styles.section, { shadowColor: colors.shadow }]}>
        <ToggleRow
          icon="lock" iconBg={colors.primaryLight} iconColor={colors.primary}
          label={`${biometricType || "Biometric"} Lock`}
          sub={
            !biometricAvailable
              ? "Not available on this device"
              : biometricEnabled
              ? `App locked with ${biometricType || "biometrics"}`
              : "Require biometrics to open the app"
          }
          value={biometricEnabled}
          onToggle={async () => {
            if (!biometricAvailable && !biometricEnabled) return;
            if (!biometricEnabled) {
              const ok = await unlock();
              if (ok) {
                await setBiometricEnabled(true);
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              }
            } else {
              showAlert("Disable Lock", "Remove biometric protection?", [
                { text: "Cancel", style: "cancel" },
                { text: "Remove", style: "destructive", onPress: () => setBiometricEnabled(false) },
              ]);
            }
          }}
          isLast
        />
      </View>

      {/* Preferences */}
      <SectionTitle label="Preferences" />
      <View style={[styles.section, { shadowColor: colors.shadow }]}>
        <ToggleRow
          icon="git-merge" iconBg={colors.tealTint} iconColor={colors.teal}
          label="Simplify Debts"
          sub={simplifyDebtsEnabled ? "Fewer payments, merged across friends" : "Show each expense debt separately"}
          value={simplifyDebtsEnabled} onToggle={toggleSimplifyDebts}
        />
        <ChevronRow
          icon="globe" iconBg={colors.accentTint} iconColor={colors.accent}
          label="Default Currency"
          value={`${selectedCurrencyInfo.flag}  ${defaultCurrency}`}
          onPress={() => setShowCurrencyPicker(true)}
        />
        <ChevronRow
          icon="repeat" iconBg={colors.tealTint} iconColor={colors.teal}
          label="Recurring Expenses"
          value={recurringExpenses.length > 0 ? `${recurringExpenses.filter(r => r.isActive).length} active` : "None set up"}
          onPress={() => router.push("/recurring")}
          isLast
        />
      </View>

      {/* Exchange Rates */}
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
            {refreshingRates
              ? <ActivityIndicator size="small" color={colors.primary} />
              : <Text style={[styles.refreshBtnText, { color: colors.primary }]}>Refresh</Text>}
          </Pressable>
        </View>
        <View style={[styles.row, { backgroundColor: colors.surface }]}>
          <View style={[styles.rowIcon, { backgroundColor: colors.tealTint }]}>
            <Feather name="info" size={18} color={colors.teal} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.rowSub, { color: colors.textSecondary, lineHeight: 18 }]}>
              Multi-currency totals are converted to {defaultCurrency} using ECB daily rates. Rates are cached offline and refreshed on launch.
            </Text>
          </View>
        </View>
      </View>

      {/* Sign Out */}
      <SectionTitle label="Account" />
      <View style={[styles.section, { shadowColor: colors.shadow }]}>
        <Pressable
          style={({ pressed }) => [
            styles.row,
            { backgroundColor: colors.surface, opacity: pressed ? 0.8 : 1 },
          ]}
          onPress={() => {
            showAlert("Sign Out", "Are you sure you want to sign out?", [
              { text: "Cancel", style: "cancel" },
              {
                text: "Sign Out",
                style: "destructive",
                onPress: async () => {
                  await AsyncStorage.removeItem("@spliteasy_logged_in");
                  router.replace("/");
                },
              },
            ]);
          }}
        >
          <View style={[styles.rowIcon, { backgroundColor: "#FDECEA" }]}>
            <Feather name="log-out" size={18} color="#E53935" />
          </View>
          <Text style={[styles.rowLabel, { color: "#E53935", flex: 1 }]}>Sign Out</Text>
          <Feather name="chevron-right" size={16} color="#E5393580" />
        </Pressable>
      </View>

      <Text style={[styles.version, { color: colors.textTertiary }]}>SplitEasy v1.0.0</Text>

      {/* Currency picker modal */}
      <Modal
        visible={showCurrencyPicker}
        transparent
        animationType="slide"
        onRequestClose={() => { setShowCurrencyPicker(false); setCurrencySearch(""); }}
      >
        <Pressable style={styles.modalOverlay} onPress={() => { setShowCurrencyPicker(false); setCurrencySearch(""); }}>
          <Pressable style={[styles.pickerSheet, { backgroundColor: colors.surface }]} onPress={e => e.stopPropagation()}>
            <View style={[styles.pickerHandle, { backgroundColor: colors.border }]} />
            <Text style={[styles.pickerTitle, { color: colors.text }]}>Default Currency</Text>
            <View style={[styles.currencySearchWrap, { backgroundColor: colors.inputBg, borderColor: colors.border }]}>
              <Feather name="search" size={15} color={colors.textTertiary} />
              <TextInput
                style={[styles.currencySearchInput, { color: colors.text }]}
                placeholder="Search currencies…"
                placeholderTextColor={colors.textTertiary}
                value={currencySearch}
                onChangeText={setCurrencySearch}
                autoCapitalize="none"
                autoCorrect={false}
                clearButtonMode="while-editing"
              />
            </View>
            <ScrollView style={{ maxHeight: 400 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              {CURRENCIES
                .filter(c => {
                  const q = currencySearch.toLowerCase();
                  return !q || c.code.toLowerCase().includes(q) || c.label.toLowerCase().includes(q);
                })
                .map((c, i, arr) => {
                  const isSelected = c.code === defaultCurrency;
                  return (
                    <Pressable
                      key={c.code}
                      style={[
                        styles.currencyRow,
                        isSelected && { backgroundColor: colors.primaryLight },
                        i < arr.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
                      ]}
                      onPress={() => { setDefaultCurrency(c.code); setShowCurrencyPicker(false); setCurrencySearch(""); }}
                    >
                      <Text style={styles.currencyFlag}>{c.flag}</Text>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.currencyCode, { color: colors.text }]}>{c.code}</Text>
                        <Text style={[styles.currencyLabel, { color: colors.textSecondary }]}>{c.label}</Text>
                      </View>
                      {isSelected && <Feather name="check" size={18} color={colors.primary} />}
                    </Pressable>
                  );
                })}
            </ScrollView>
            <Pressable
              style={[styles.cancelBtn, { backgroundColor: colors.background }]}
              onPress={() => { setShowCurrencyPicker(false); setCurrencySearch(""); }}
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
    paddingBottom: 12,
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
  avatarWrapper: { position: "relative" },
  cameraBadge: {
    position: "absolute",
    bottom: 0,
    right: 0,
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#fff",
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
  removePhotoText: { fontSize: 12, fontFamily: "Inter_500Medium" },
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
  notifCatRow: {
    flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 14, gap: 12,
  },
  notifSubGroup: {
    borderTopWidth: StyleSheet.hairlineWidth, borderBottomWidth: StyleSheet.hairlineWidth,
    marginBottom: 0,
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
  themePickerRow: {
    flexDirection: "row",
    justifyContent: "space-around",
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 8,
  },
  themeSwatch: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  themeSwatchSelected: {
    transform: [{ scale: 1.15 }],
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 4,
  },
  themeLabelsRow: {
    flexDirection: "row",
    justifyContent: "space-around",
    paddingHorizontal: 16,
    paddingBottom: 14,
    gap: 8,
  },
  themeLabel: {
    fontSize: 10,
    textAlign: "center",
    width: 40,
  },
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
  pickerTitle: { fontSize: 18, fontFamily: "Inter_700Bold", marginHorizontal: 20, marginBottom: 12 },
  pickerSub: {
    fontSize: 13, fontFamily: "Inter_400Regular",
    marginHorizontal: 20, marginBottom: 16, lineHeight: 18,
  },
  currencySearchWrap: {
    flexDirection: "row", alignItems: "center", gap: 8,
    marginHorizontal: 16, marginBottom: 8,
    paddingHorizontal: 12, height: 42,
    borderRadius: 12, borderWidth: 1,
  },
  currencySearchInput: {
    flex: 1, fontSize: 15, fontFamily: "Inter_400Regular",
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
