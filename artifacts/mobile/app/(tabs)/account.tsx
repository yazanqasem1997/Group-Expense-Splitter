import type { ComponentRef } from "react";
import { Feather } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useAuth } from "@clerk/expo";
import * as ImagePicker from "expo-image-picker";
import { router } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Linking,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
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
import { CURRENCY_LIST, useApp } from "@/context/AppContext";
import { CurrencyPickerModal } from "@/components/CurrencyPickerModal";
import { TabHeader } from "@/components/TabHeader";
import { TideBackdrop } from "@/components/TideBackdrop";
import { WebPullToRefresh } from "@/components/WebPullToRefresh";
import { InviteRewardCard } from "@/components/InviteRewardCard";
import { PlanCard } from "@/components/PlanCard";
import { WarRoomLink } from "@/components/WarRoomLink";
import { api, toUserMessage } from "@/services/apiSync";

const CURRENCIES = CURRENCY_LIST;
import { useBiometric } from "@/context/BiometricContext";
import { PRODUCT_NAME, SUPPORT_EMAIL, OPERATOR_DESCRIPTION, PURCHASES_LIVE } from "@/constants/brand";
import { useTheme } from "@/hooks/useTheme";


// CURRENCIES is now sourced from AppContext so all world currencies are included


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
  icon, iconBg, iconColor, label, value, labelColor, onPress, isLast,
}: {
  icon: string; iconBg: string; iconColor: string;
  label: string; value?: string; labelColor?: string;
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
      <Text style={[styles.rowLabel, { color: labelColor ?? colors.text }]}>{label}</Text>
      {value ? <Text style={[styles.rowValue, { color: colors.textSecondary }]}>{value}</Text> : null}
      {onPress ? <Feather name="chevron-right" size={18} color={colors.textTertiary} /> : null}
    </Pressable>
  );
}

export function AccountScreenContent({
  inDrawer = false,
  onNavigate,
  onClose,
  onMainNavigate,
  initialScrollOffset = 0,
  onScrollPositionChange,
}: {
  inDrawer?: boolean;
  onNavigate?: (path: string) => void;
  onClose?: () => void;
  onMainNavigate?: (path: string, params?: Record<string, string>) => void;
  initialScrollOffset?: number;
  onScrollPositionChange?: (offset: number) => void;
}) {
  const { colors, isDark, refreshIndicatorColor } = useTheme();
  const { signOut } = useAuth();
  const insets = useSafeAreaInsets();
  const {
    currentUser, updateCurrentUser,
    defaultCurrency, setDefaultCurrency,
    exchangeRates, ratesUpdated,
    notifPrefs, updateNotifPref,
    checkAndAddRecurring,
    isLoading, syncStatus, isOffline, retrySync,
  } = useApp();
  const { biometricEnabled, biometricAvailable } = useBiometric();

  const topPad = insets.top;
  const [showCurrencyPicker, setShowCurrencyPicker] = useState(false);
  const [showSyncDetails, setShowSyncDetails] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState(currentUser.name);
  const scrollRef = useRef<ComponentRef<typeof ScrollView>>(null);
  useEffect(() => {
    if (initialScrollOffset <= 0) return;
    requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({ y: initialScrollOffset, animated: false });
    });
  }, [initialScrollOffset]);
  useEffect(() => {
    scrollRegistry.register("account", () => {
      scrollRef.current?.scrollTo({ y: 0, animated: true });
    });
    return () => scrollRegistry.unregister("account");
  }, []);
  const nameInputRef = useRef<ComponentRef<typeof TextInput>>(null);
  const profilePhotoMigrationRef = useRef<string | null>(null);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    checkAndAddRecurring();
    setRefreshing(false);
  }, [checkAndAddRecurring]);

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
        ? `data:${asset.mimeType ?? "image/jpeg"};base64,${asset.base64}`
        : asset.uri;
      try {
        const photo = await api.uploadProfilePhoto(uri, asset.mimeType ?? "image/jpeg");
        updateCurrentUser({ photo });
      } catch (error) {
        showAlert("Photo not saved", toUserMessage(error, "Couldn't save your profile photo."));
      }
    }
  }, [updateCurrentUser]);

  useEffect(() => {
    const photo = currentUser.photo;
    if (!photo || /^https?:\/\//i.test(photo) || photo.startsWith("/api/") || profilePhotoMigrationRef.current === photo) return;
    profilePhotoMigrationRef.current = photo;
    const mimeType = photo.match(/^data:(image\/[^;]+);/i)?.[1] ?? "image/jpeg";
    void api.uploadProfilePhoto(photo, mimeType)
      .then((sharedPhoto) => updateCurrentUser({ photo: sharedPhoto }))
      .catch((error) => showAlert("Photo couldn't be shared", toUserMessage(error, "Open your Account tab and choose the photo again to share it with friends.")));
  }, [currentUser.photo, updateCurrentUser]);

  const handleRemovePhoto = useCallback(() => {
    updateCurrentUser({ photo: undefined });
  }, [updateCurrentUser]);

  const handleOpenMailbox = useCallback(async (
    mailbox: "default" | "gmail" | "outlook",
    subject: string,
    body: string,
  ) => {
    const query = `to=${SUPPORT_EMAIL}&subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    const urls = {
      default: `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`,
      gmail: `googlegmail:///co?${query}`,
      outlook: `ms-outlook://compose?${query}`,
    };
    try {
      await Linking.openURL(urls[mailbox]);
    } catch {
      const appName = mailbox === "gmail" ? "Gmail" : mailbox === "outlook" ? "Outlook" : "a mail app";
        showAlert("Email app unavailable", `We couldn't open ${appName}. Choose another mailbox or email ${SUPPORT_EMAIL} manually.`);
    }
  }, []);

  const showMailboxPrompt = useCallback(() => {
    showAlert(
      "Choose a mailbox",
      "Choose which mailbox to use for your message.",
      [
        {
          text: "Default mail app",
          onPress: () => {
            void handleOpenMailbox("default", "Split Mate help and feedback", "Hi Split Mate support,\n\nI need help with:\n\n");
          },
        },
        {
          text: "Gmail",
          onPress: () => {
            void handleOpenMailbox("gmail", "Split Mate help and feedback", "Hi Split Mate support,\n\nI need help with:\n\n");
          },
        },
        {
          text: "Outlook",
          onPress: () => {
            void handleOpenMailbox("outlook", "Split Mate help and feedback", "Hi Split Mate support,\n\nI need help with:\n\n");
          },
        },
        { text: "Cancel", style: "cancel" },
      ],
    );
  }, [handleOpenMailbox]);

  const handleHelpAndFeedback = useCallback(() => {
    if (onClose) {
      onClose();
      // Let the drawer finish closing before presenting the centered alert.
      setTimeout(showMailboxPrompt, 260);
      return;
    }
    showMailboxPrompt();
  }, [onClose, showMailboxPrompt]);

  const handleLegalNavigate = useCallback((path: "/legal/terms" | "/legal/privacy") => {
    if (onMainNavigate) {
      onMainNavigate(path);
    } else {
      router.push(path);
    }
  }, [onMainNavigate]);

  const showDeletionPrompt = useCallback(() => {
    showAlert(
      "Delete your account?",
      "Your account will be deactivated now. You can recover it by signing in within 30 days. After that, your profile and groups you own are permanently deleted, and you must sign up again to use Split Mate.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete my account",
          style: "destructive",
          onPress: async () => {
            try {
              const result = await api.deleteCurrentUser();
              showAlert(
                "Deletion scheduled",
                `Your account is scheduled for permanent deletion. Sign in again before ${new Date(result.recoveryUntil).toLocaleDateString()} to recover it.`,
                [{
                  text: "OK",
                  onPress: async () => {
                    try {
                      await signOut();
                      await AsyncStorage.removeItem("@spliteasy_logged_in");
                      router.replace("/");
                    } catch {
                      showAlert("Couldn't sign out", "Your deletion request was accepted. Please sign out manually.");
                    }
                  },
                }],
              );
            } catch (error) {
              showAlert("Couldn't delete account", toUserMessage(error, "Please check your connection and try again."));
            }
          },
        },
      ],
    );
  }, [signOut]);

  const handleRequestDeletion = useCallback(() => {
    if (onClose) {
      onClose();
      // Let the drawer finish closing before presenting the confirmation modal.
      setTimeout(showDeletionPrompt, 260);
      return;
    }
    showDeletionPrompt();
  }, [onClose, showDeletionPrompt]);

  const showSignOutPrompt = useCallback(() => {
    showAlert("Sign Out", "Are you sure you want to sign out?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Sign Out",
        style: "destructive",
        onPress: async () => {
          try {
            await signOut();
            await AsyncStorage.removeItem("@spliteasy_logged_in");
            router.replace("/");
          } catch {
            showAlert(
              "Couldn't sign out",
              "Please check your connection and try again.",
            );
          }
        },
      },
    ]);
  }, [signOut]);

  const handleSignOut = useCallback(() => {
    if (onClose) {
      onClose();
      // Let the drawer finish closing before presenting the confirmation modal.
      setTimeout(showSignOutPrompt, 260);
      return;
    }
    showSignOutPrompt();
  }, [onClose, showSignOutPrompt]);

  const handleSyncStatusPress = useCallback(() => {
    setShowSyncDetails(true);
  }, []);

  const handleCheckForUpdates = useCallback(async () => {
    const ok = await retrySync();
    showAlert(
      ok ? "Up to date" : "Couldn't check for updates",
      ok
        ? "There are no new changes. Your Split Mate data is up to date."
        : "Split Mate couldn't check for new changes. Try again when your connection is available.",
    );
  }, [retrySync]);

  function formatRatesUpdated() {
    if (!ratesUpdated) return "Not yet loaded";
    const d = new Date(ratesUpdated);
    const diff = Math.floor((Date.now() - d.getTime()) / 60000);
    if (diff < 1) return "Just now";
    if (diff < 60) return `${diff}m ago`;
    if (diff < 1440) return `${Math.floor(diff / 60)}h ago`;
    return d.toLocaleDateString();
  }

  // Rates auto-refresh once they are older than 24h (see loadLocalPrefs).
  // Surface when that next automatic update is due.
  function ratesNextUpdateLabel() {
    if (!ratesUpdated) return "";
    const dueMs = new Date(ratesUpdated).getTime() + 24 * 60 * 60 * 1000 - Date.now();
    if (dueMs <= 0) return "Updates on next app open";
    const mins = Math.ceil(dueMs / 60000);
    if (mins < 60) return `Updates in ${mins}m`;
    return `Updates in ${Math.ceil(mins / 60)}h`;
  }

  const hasRates = Object.keys(exchangeRates).length > 0;
  const selectedCurrencyInfo = CURRENCIES.find(c => c.code === defaultCurrency)!;
  const syncLabel = isOffline
    ? "Offline"
    : isLoading
      ? "Syncing…"
      : syncStatus === "error"
        ? "Needs attention"
        : "Up to date";
  const syncIcon = isOffline ? "wifi-off" : syncStatus === "error" ? "alert-circle" : "check-circle";
  const syncIconColor = isOffline || syncStatus === "error" ? colors.warning : colors.success;
  const syncIconBg = isOffline || syncStatus === "error" ? colors.warningLight : colors.successLight;
  const syncDescription = isOffline
    ? "Split Mate is offline. Your changes will sync when your connection returns."
    : isLoading
      ? "Split Mate is checking for the latest updates."
      : syncStatus === "error"
        ? "Split Mate couldn't complete the last sync. Try again when your connection is available."
        : "Your Split Mate data is up to date.";

  return (
    <ScrollView
      ref={scrollRef}
      style={[styles.container, { backgroundColor: inDrawer ? "transparent" : colors.background }]}
      contentContainerStyle={[styles.content, { paddingBottom: inDrawer ? 40 : Platform.OS === "web" ? 134 : 100 }]}
      onScroll={event => onScrollPositionChange?.(event.nativeEvent.contentOffset.y)}
      scrollEventThrottle={100}
      keyboardDismissMode="on-drag"
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={handleRefresh}
          tintColor={refreshIndicatorColor}
          colors={[refreshIndicatorColor]}
          progressBackgroundColor={colors.surface}
        />
      }
    >
      {!inDrawer && (
        <>
        <TideBackdrop />
        <WebPullToRefresh onRefresh={handleRefresh} refreshing={refreshing} />
        <TabHeader titleColor="#FFFFFF" title="Account" topInset={topPad} showAvatar={false} />
        </>
      )}

      <>

      <View style={styles.inset}>
        <WarRoomLink />
      </View>

      {/* Profile hero */}
      <View
        style={[
          styles.profileCard,
          { backgroundColor: colors.surface, borderColor: colors.border, shadowColor: colors.shadow },
        ]}
      >
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
          <Text style={[styles.profileEmail, { color: colors.textSecondary }]}>
            {currentUser.email || `Personal ${PRODUCT_NAME} account`}
          </Text>
          <View style={styles.profileStatusRow}>
            <View style={[styles.profileStatusDot, { backgroundColor: colors.success }]} />
            <Text style={[styles.profileStatus, { color: colors.textSecondary }]}>Account active</Text>
          </View>
          {currentUser.photo ? (
            <Pressable onPress={handleRemovePhoto} style={{ marginTop: 4 }}>
              <Text style={[styles.removePhotoText, { color: colors.danger }]}>Remove photo</Text>
            </Pressable>
          ) : null}
        </View>
      </View>


      {PURCHASES_LIVE && (
        <>
          <SectionTitle label="Your plan" />
      <View style={styles.inset}>
        <PlanCard colors={colors} />
        <InviteRewardCard />
      </View>
        </>
      )}

      <SectionTitle label="Preferences" />
      <View style={[styles.section, { shadowColor: colors.shadow }]}>
        <ChevronRow
          icon="bell" iconBg={colors.primaryLight} iconColor={colors.primary}
          label="Notifications"
           value={`${Object.values(notifPrefs).filter(Boolean).length} enabled`}
          onPress={() => onNavigate ? onNavigate("/settings/notifications") : router.push("/settings/notifications")}
        />
        <ChevronRow
          icon="droplet" iconBg={colors.primaryLight} iconColor={colors.primary}
          label="Appearance"
          value={isDark ? "Dark" : "Light"}
          onPress={() => onNavigate ? onNavigate("/settings/appearance") : router.push("/settings/appearance")}
        />
        <ChevronRow
          icon="sliders" iconBg={colors.tealTint} iconColor={colors.teal}
           label="Default currency"
          value={selectedCurrencyInfo ? `${selectedCurrencyInfo.flag}  ${defaultCurrency}` : defaultCurrency}
          onPress={() => onNavigate ? onNavigate("/settings/preferences") : router.push("/settings/preferences")}
        />
        <ChevronRow
          icon="refresh-cw" iconBg={colors.primaryLight} iconColor={colors.primary}
          label="Exchange Rates"
          value={hasRates ? `Updated ${formatRatesUpdated()}` : "Not available"}
          onPress={() => onNavigate ? onNavigate("/settings/exchange-rates") : router.push("/settings/exchange-rates")}
          isLast
        />
      </View>

      <SectionTitle label="Sync & data" />
      <View style={[styles.section, { shadowColor: colors.shadow }]}>
        <ChevronRow
          icon={syncIcon}
          iconBg={syncIconBg}
          iconColor={syncIconColor}
          label="Sync status"
          value={syncLabel}
          onPress={handleSyncStatusPress}
        />
      </View>

      <SectionTitle label="Privacy & security" />
      <View style={[styles.section, { shadowColor: colors.shadow }]}>
        <ChevronRow
          icon="lock" iconBg={colors.primaryLight} iconColor={colors.primary}
          label="Security"
          value={!biometricAvailable ? "Unavailable" : biometricEnabled ? "Quick login on" : "Biometric lock off"}
          onPress={() => onNavigate ? onNavigate("/settings/security") : router.push("/settings/security")}
          isLast
        />
      </View>

       <SectionTitle label="Support" />
      <View style={[styles.section, { shadowColor: colors.shadow }]}>
        <ChevronRow
          icon="help-circle"
          iconBg={colors.primaryLight}
          iconColor={colors.primary}
          label="Help & feedback"
          value="Choose mailbox"
          onPress={handleHelpAndFeedback}
          isLast
        />
      </View>

      <SectionTitle label="Privacy & data" />
      <View style={[styles.section, { shadowColor: colors.shadow }]}>
        <ChevronRow
          icon="trash-2"
          iconBg={colors.dangerLight}
          iconColor={colors.danger}
           label="Delete my account"
          labelColor={colors.danger}
          onPress={handleRequestDeletion}
          isLast
        />
      </View>

      <SectionTitle label="Account" />
      <View style={[styles.section, { shadowColor: colors.shadow }]}>
        <Pressable
          style={({ pressed }) => [
            styles.row,
            { backgroundColor: colors.surface, opacity: pressed ? 0.8 : 1 },
          ]}
          onPress={handleSignOut}
        >
          <View style={[styles.rowIcon, { backgroundColor: "#FDECEA" }]}>
            <Feather name="log-out" size={18} color="#E53935" />
          </View>
          <Text style={[styles.rowLabel, { color: "#E53935", flex: 1 }]}>Sign Out</Text>
          <Feather name="chevron-right" size={16} color="#E5393580" />
        </Pressable>
      </View>

      <Text style={[styles.version, { color: colors.textTertiary }]}>{PRODUCT_NAME} v1.0.0</Text>
      <Text style={[styles.version, { color: colors.textTertiary, marginTop: 2 }]}>Operated by {OPERATOR_DESCRIPTION} · {SUPPORT_EMAIL}</Text>
      <Text style={[styles.version, { color: colors.textTertiary }]}>
        {`\u00a9 ${new Date().getFullYear()} ${PRODUCT_NAME}. All rights reserved.`}
      </Text>
      <View style={styles.legalFooterLinks}>
        <Pressable
          onPress={() => handleLegalNavigate("/legal/terms")}
          accessibilityRole="link"
        >
          <Text style={[styles.legalFooterLink, { color: colors.primary }]}>Terms of Service</Text>
        </Pressable>
        <Text style={[styles.legalFooterSeparator, { color: colors.textTertiary }]}>·</Text>
        <Pressable
          onPress={() => handleLegalNavigate("/legal/privacy")}
          accessibilityRole="link"
        >
          <Text style={[styles.legalFooterLink, { color: colors.primary }]}>Privacy Policy</Text>
        </Pressable>
      </View>

      </>

      <CurrencyPickerModal
        visible={showCurrencyPicker}
        onClose={() => setShowCurrencyPicker(false)}
        value={defaultCurrency}
        onChange={code => { setDefaultCurrency(code); }}
        title="Default Currency"
      />

      <Modal
        visible={showSyncDetails}
        transparent
        animationType="slide"
        onRequestClose={() => setShowSyncDetails(false)}
      >
         <View style={styles.modalOverlay}>
           <Pressable
             style={StyleSheet.absoluteFill}
             onPress={() => setShowSyncDetails(false)}
             accessibilityLabel="Close sync status"
           />
          <View style={[styles.modalCard, { backgroundColor: colors.surface }]}>
            <View style={[styles.modalHandle, { backgroundColor: colors.border }]} />
            <View style={styles.modalHeadingRow}>
              <View style={[styles.modalIcon, { backgroundColor: syncIconBg }]}>
                <Feather name={syncIcon as any} size={20} color={syncIconColor} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.modalTitle, { color: colors.text }]}>Sync status</Text>
                <Text style={[styles.modalSubtitle, { color: colors.textSecondary }]}>{syncLabel}</Text>
              </View>
            </View>
            <Text style={[styles.modalBody, { color: colors.textSecondary }]}>{syncDescription}</Text>
            <Pressable
              style={({ pressed }) => [
                styles.modalPrimaryButton,
                { backgroundColor: colors.primary, opacity: pressed ? 0.8 : 1 },
              ]}
              onPress={() => { void handleCheckForUpdates(); }}
            >
              <Feather name="refresh-cw" size={16} color="#fff" />
              <Text style={styles.modalPrimaryButtonText}>Check for updates</Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [styles.modalSecondaryButton, { opacity: pressed ? 0.65 : 1 }]}
              onPress={() => setShowSyncDetails(false)}
            >
              <Text style={[styles.modalSecondaryButtonText, { color: colors.textSecondary }]}>Close</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

    </ScrollView>
  );
}

export default function AccountScreen() {
  return <AccountScreenContent />;
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: {},
  inset: { marginHorizontal: 16 },
  profileCard: {
    flexDirection: "row",
    alignItems: "center",
    margin: 16,
    padding: 20,
    borderRadius: 20,
    gap: 16,
    borderWidth: StyleSheet.hairlineWidth,
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
  profileEmail: { fontSize: 13, fontFamily: "Inter_400Regular", marginTop: 5 },
  profileStatusRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 8 },
  profileStatusDot: { width: 7, height: 7, borderRadius: 4 },
  profileStatus: { fontSize: 11, fontFamily: "Inter_500Medium" },
  editProfileButton: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 9,
    borderWidth: StyleSheet.hairlineWidth,
  },
  editProfileButtonText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  removePhotoText: { fontSize: 12, fontFamily: "Inter_500Medium" },
  modalOverlay: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0,0,0,0.45)",
  },
  modalCard: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 28,
  },
  modalHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    alignSelf: "center",
    marginBottom: 20,
  },
  modalHeadingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  modalIcon: {
    width: 42,
    height: 42,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
  },
  modalTitle: { fontSize: 20, fontFamily: "Inter_700Bold" },
  modalSubtitle: { fontSize: 13, fontFamily: "Inter_400Regular", marginTop: 2 },
  modalBody: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    lineHeight: 21,
    marginTop: 18,
    marginBottom: 20,
  },
  modalPrimaryButton: {
    minHeight: 48,
    borderRadius: 13,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  modalPrimaryButtonText: { color: "#fff", fontSize: 15, fontFamily: "Inter_600SemiBold" },
  modalSecondaryButton: {
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 4,
  },
  modalSecondaryButtonText: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  sectionTitle: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 0.8,
    textTransform: "uppercase",
    marginHorizontal: 20,
    marginBottom: 8,
    marginTop: 2,
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
    marginBottom: 22,
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
  legalFooterLinks: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginTop: 8,
  },
  legalFooterLink: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  legalFooterSeparator: { fontSize: 12, fontFamily: "Inter_500Medium" },
  searchBar: {
    flexDirection: "row", alignItems: "center", gap: 8,
    marginHorizontal: 16, marginTop: 12, marginBottom: 4,
    paddingHorizontal: 12, height: 42,
    borderRadius: 12, borderWidth: 1.5,
  },
  searchInput: { flex: 1, fontSize: 15, fontFamily: "Inter_400Regular" },
  clearBtn: {
    width: 18, height: 18, borderRadius: 9,
    alignItems: "center", justifyContent: "center",
  },
  searchResultsWrap: { paddingHorizontal: 16, paddingTop: 8 },
  searchSectionLabel: {
    fontSize: 11, fontFamily: "Inter_600SemiBold",
    letterSpacing: 0.7, textTransform: "uppercase",
    marginTop: 16, marginBottom: 6, marginLeft: 4,
  },
  searchResultRow: {
    flexDirection: "row", alignItems: "center",
    paddingVertical: 13, paddingHorizontal: 16, gap: 12,
  },
  searchEmpty: {
    alignItems: "center", paddingTop: 56, gap: 10,
  },
  searchEmptyTitle: { fontSize: 17, fontFamily: "Inter_600SemiBold" },
  searchEmptySub: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center", paddingHorizontal: 32 },
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
