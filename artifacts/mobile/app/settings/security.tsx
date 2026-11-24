import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
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
import { useBiometric } from "@/context/BiometricContext";
import { useTheme } from "@/hooks/useTheme";

export default function SecurityScreen({ onBack }: { onBack?: () => void } = {}) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const {
    biometricEnabled,
    setBiometricEnabled,
    biometricAvailable,
    biometricType,
    unlockWithPasscode,
    unlock,
  } = useBiometric();
  const topPad = insets.top;

  const handleBiometricToggle = async () => {
    if (Platform.OS === "web") return;
    if (!biometricEnabled) {
      // Use the normal device-auth prompt during setup so this still works in
      // Expo Go and on devices where Face ID is not available to this build.
      const ok = biometricAvailable ? await unlock() : await unlockWithPasscode();
      if (ok) {
        await setBiometricEnabled(true);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    } else {
      await setBiometricEnabled(false);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
  };

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
        <Text style={[styles.headerTitle, { color: colors.text }]}>Security</Text>
        <View style={styles.backBtn} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>
        <View style={[styles.section, { shadowColor: colors.shadow }]}>
          <View style={[styles.row, { backgroundColor: colors.surface }]}>
            <Pressable style={styles.rowMain} onPress={handleBiometricToggle}>
              <View style={[styles.rowIcon, { backgroundColor: colors.primaryLight }]}>
                <Feather name="lock" size={18} color={colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.rowLabel, { color: colors.text }]}>
                  {biometricAvailable ? `Quick login with ${biometricType || "Face ID"}` : "Passcode lock"}
                </Text>
                <Text style={[styles.rowSub, { color: colors.textSecondary }]}>
                  {!biometricAvailable && !biometricEnabled
                    ? "Biometrics unavailable; use your device passcode to protect the app"
                    : biometricEnabled
                    ? `Split Mate opens with ${biometricType || "Face ID"}. Your passcode is the backup.`
                    : `Open Split Mate with a glance using ${biometricType || "Face ID"}`}
                </Text>
              </View>
            </Pressable>
            <Switch
              value={biometricEnabled}
              onValueChange={handleBiometricToggle}
              trackColor={{ false: colors.switchOff, true: colors.primary }}
              thumbColor="#FFFFFF"
              ios_backgroundColor={colors.switchOff}
              disabled={Platform.OS === "web"}
            />
          </View>
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
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 13,
    gap: 12,
  },
  rowMain: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  rowIcon: {
    width: 34, height: 34, borderRadius: 9,
    alignItems: "center", justifyContent: "center",
  },
  rowLabel: { fontSize: 15, fontFamily: "Inter_500Medium" },
  rowSub: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 1 },
});
