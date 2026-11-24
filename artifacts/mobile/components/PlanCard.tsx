import { Feather } from "@expo/vector-icons";
import { claimInviteReward, getScanUsage } from "@workspace/api-client-react";
import { router, useFocusEffect } from "expo-router";
import React, { useCallback, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { useAccountDrawer } from "@/context/AccountDrawerContext";
import { showAlert } from "@/hooks/alertStore";
import { useInk, useThemedStyles } from "@/utils/themedStyles";

type Usage = Awaited<ReturnType<typeof getScanUsage>>;
type Colors = { surface: string; border: string; text: string; textTertiary: string };
const PLAN_NAMES: Record<string, string> = { free: "Free plan", plus: "Plus", trip: "Trip Pass" };

/** Your plan at a glance, a way into the plans screen, and the invite-reward picker when one is waiting. */
export function PlanCard({ colors }: { colors: Colors }) {
  const styles = useThemedStyles(baseStyles);
  const { ink, page } = useInk();
  const { closeDrawer } = useAccountDrawer();
  const [usage, setUsage] = useState<Usage | null>(null);
  const [busy, setBusy] = useState(false);

  useFocusEffect(
    useCallback(() => {
      getScanUsage().then(setUsage).catch(() => {});
    }, []),
  );

  async function claim(choice: "plus" | "trip_pass") {
    if (busy) return;
    setBusy(true);
    try {
      setUsage(await claimInviteReward({ choice }));
      if (choice === "plus") showAlert("Plus is on", "You have Plus for the next 30 days.");
      else showAlert("Trip Pass added", "Open a group and tap Plus to use it on that group.");
    } catch {
      showAlert("Couldn't claim your reward", "Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  const passes = usage?.tripPassCredits ?? 0;
  const rewards = usage?.rewardsToClaim ?? 0;
  const scans = !usage
    ? "Checking your plan"
    : usage.limit == null
      ? "Unlimited receipt scans"
      : `${usage.used} of ${usage.limit} scans used this month`;

  return (
    <View style={styles.wrap}>
      <Pressable
        onPress={() => { closeDrawer(); setTimeout(() => router.push("/plus"), 260); }}
        accessibilityRole="button"
        style={({ pressed }) => [styles.card, { backgroundColor: colors.surface, borderColor: colors.border, opacity: pressed ? 0.9 : 1 }]}
      >
        <View style={styles.icon}><Feather name="star" size={18} color={ink} /></View>
        <View style={styles.text}>
          <Text style={[styles.title, { color: colors.text }]}>{usage ? PLAN_NAMES[usage.plan] ?? "Your plan" : "Your plan"}</Text>
          <Text style={[styles.sub, { color: colors.textTertiary }]}>
            {scans}
            {passes > 0 ? ` · ${passes} free Trip Pass${passes > 1 ? "es" : ""}` : ""}
          </Text>
        </View>
        <View style={styles.pill}><Text style={styles.pillText}>See plans</Text></View>
      </Pressable>

      {rewards > 0 && (
        <View style={[styles.reward, { backgroundColor: colors.surface }]}>
          <Text style={[styles.title, { color: colors.text }]}>
            {rewards > 1 ? `You have ${rewards} invite rewards` : "You earned an invite reward"}
          </Text>
          <Text style={[styles.sub, { color: colors.textTertiary }]}>
            Tap to add 7 days of Plus to your account.
          </Text>
          <View style={styles.choices}>
            <Pressable disabled={busy} onPress={() => claim("plus")} style={[styles.choice, styles.choiceMain]} accessibilityRole="button">
              <Text style={styles.choiceMainText}>Claim 7 days of Plus</Text>
            </Pressable>
          </View>
          {busy && <ActivityIndicator />}
        </View>
      )}
    </View>
  );
}

const baseStyles = StyleSheet.create({
  wrap: { gap: 10, marginBottom: 12 },
  card: { borderRadius: 16, borderWidth: 1, padding: 14, flexDirection: "row", alignItems: "center", gap: 12 },
  icon: { width: 38, height: 38, borderRadius: 12, backgroundColor: "#F5A524", alignItems: "center", justifyContent: "center" },
  text: { flex: 1, gap: 2 },
  title: { fontSize: 15, fontWeight: "800" },
  sub: { fontSize: 12.5, lineHeight: 17 },
  pill: { backgroundColor: "#0E8A8F", borderRadius: 99, paddingHorizontal: 12, paddingVertical: 6 },
  pillText: { color: "#FFFFFF", fontWeight: "800", fontSize: 12 },
  reward: { borderRadius: 16, borderWidth: 2, borderColor: "#F5A524", padding: 14, gap: 8 },
  choices: { flexDirection: "row", gap: 8 },
  choice: { flex: 1, borderRadius: 12, borderWidth: 1, paddingVertical: 10, alignItems: "center" },
  choiceMain: { backgroundColor: "#0E8A8F", borderColor: "#0E8A8F" },
  choiceMainText: { color: "#FFFFFF", fontWeight: "800" },
  choiceText: { fontWeight: "800" },
});
