import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router, useLocalSearchParams } from "expo-router";
import { getScanUsage, redeemTripPass } from "@workspace/api-client-react";
import React, { useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { showAlert } from "@/hooks/alertStore";
import { useInk, useThemedStyles } from "@/utils/themedStyles";

const PERKS = ["Unlimited receipt scans", "Spending charts for all time", "Export to CSV and PDF", "Unlimited recurring expenses"];
const COMPARE = [
  ["", "Free", "Trip Pass", "Plus"],
  ["Price", "AED 0", "AED 14.99 once", "AED 9.99/mo"],
  ["Covers", "You", "One group", "You, all groups"],
  ["Lasts", "Always", "30 days", "While subscribed"],
  ["Scans", "5 a month", "Unlimited", "Unlimited"],
  ["Charts", "This month", "All time", "All time"],
  ["Export", "–", "Yes", "Yes"],
  ["Recurring", "2", "Unlimited", "Unlimited"],
];
const HEADLINES: Record<string, string> = {
  scans: "You've used this month's free scans",
  export: "Exports are part of Plus",
};

type PlanKey = "yearly" | "monthly" | "trip";

export default function PlusScreen({ embedded = false }: { embedded?: boolean } = {}) {
  const styles = useThemedStyles(baseStyles);
  const { ink, page } = useInk();
  const insets = useSafeAreaInsets();
  const { reason, groupId } = useLocalSearchParams<{ reason?: string; groupId?: string }>();
  const [choice, setChoice] = useState<PlanKey>("yearly");
  const [credits, setCredits] = useState(0);
  const [passQty, setPassQty] = useState(1);

  useEffect(() => {
    getScanUsage(groupId ? { groupId } : undefined)
      .then(usage => setCredits(usage.tripPassCredits ?? 0))
      .catch(() => {});
  }, [groupId]);

  async function redeemFreePass() {
    if (!groupId) return;
    try {
      await redeemTripPass(groupId);
      showAlert("Trip Pass on", "Everyone in this group has Plus for the next 30 days.");
      router.back();
    } catch {
      showAlert("Couldn't use the Trip Pass", "Please try again.");
    }
  }
  const plans: { key: PlanKey; title: string; price: string; note: string }[] = [
    { key: "yearly", title: "Yearly", price: "AED 79", note: "AED 6.58 a month" },
    { key: "monthly", title: "Monthly", price: "AED 9.99", note: "per month" },
  ];

  function buy() {
    showAlert(
      "Coming with the App Store release",
      "Purchases open when Split Mate launches on the App Store. Nothing has been charged.",
    );
  }

  return (
    <View style={[styles.fill, { backgroundColor: page }]}>
      <ScrollView contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + (embedded ? 130 : 24) }]}>
        <LinearGradient colors={["#04404A", "#0E7C86"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.hero, { paddingTop: insets.top + 12 }]}>
{!embedded && <Pressable onPress={() => router.back()} hitSlop={12} style={styles.close} accessibilityRole="button" accessibilityLabel="Close">
          <Feather name="x" size={24} color="#FFFFFF" />
        </Pressable>}
        <Text style={styles.eyebrow}>SPLIT MATE PLUS</Text>
        <Text style={styles.title}>{(reason && HEADLINES[reason]) || "Scan every bill. Keep every friend."}</Text>
        <View style={styles.perks}>
          {PERKS.map(perk => (
            <View key={perk} style={styles.perk}>
              <View style={styles.tick}><Feather name="check" size={13} color="#FFFFFF" /></View>
              <Text style={styles.perkText}>{perk}</Text>
            </View>
          ))}
        </View>
        </LinearGradient>
<View style={styles.compare}>
          {COMPARE.map((row, i) => (
            <View key={row[0] || "head"} style={[styles.cRow, i === 0 && styles.cHead]}>
              {row.map((cell, j) => (
                <Text key={j} style={[styles.cCell, j === 0 && styles.cLabel, i === 0 && styles.cHeadText]}>{cell}</Text>
              ))}
            </View>
          ))}
        </View>
        {groupId && credits > 0 && (
          <Pressable onPress={redeemFreePass} style={styles.free} accessibilityRole="button">
            <Feather name="gift" size={18} color={ink} />
            <Text style={styles.freeText}>Use your free Trip Pass ({credits} left)</Text>
          </Pressable>
        )}
        <View style={styles.plans}>
          {plans.map(plan => {
            const on = choice === plan.key;
            return (
              <Pressable
                key={plan.key}
                onPress={() => setChoice(plan.key)}
                style={[styles.plan, on && styles.planOn]}
                accessibilityRole="radio"
                accessibilityState={{ selected: on }}
              >
                {plan.key === "yearly" && <View style={styles.saveBadge}><Text style={styles.saveBadgeText}>SAVE 34%</Text></View>}
                <Text style={styles.planTitle}>{plan.title}</Text>
                <Text style={styles.planPrice}>{plan.price}</Text>
                <Text style={styles.planNote}>{plan.note}</Text>
              </Pressable>
            );
          })}
        </View>
        <Pressable onPress={buy} style={styles.cta} accessibilityRole="button">
          <Text style={styles.ctaText}>{choice === "trip" ? "Get the Trip Pass" : "Start 7-day free trial"}</Text>
        </Pressable>
        <Text style={styles.fine}>{choice === "trip" ? "One payment for this group. No subscription." : "7 days free, with up to 30 receipt scans. Then the price above, renewing automatically each month or year until you cancel. Cancel anytime in your App Store or Google Play settings, at least 24 hours before renewal. Payment is charged to your store account."}</Text>
      <View style={styles.orRow}><View style={styles.orLine} /><Text style={styles.orText}>OR JUST ONE TRIP</Text><View style={styles.orLine} /></View>
        <View style={styles.tripBox}>
          <View style={styles.tripHead}>
            <View style={styles.planText}>
              <Text style={styles.planTitle}>Trip Pass</Text>
              <Text style={styles.planNote}>One group, 30 days, everyone in it. No subscription.</Text>
              {credits > 0 && <Text style={styles.owned}>You have {credits} unused Trip Pass{credits > 1 ? "es" : ""}</Text>}
            </View>
            <Text style={styles.tripPrice}>AED {(14.99 * passQty).toFixed(2)}</Text>
          </View>
          <View style={styles.stepRow}>
            <Pressable onPress={() => setPassQty(q => Math.max(1, q - 1))} style={styles.stepBtn} accessibilityRole="button" accessibilityLabel="One fewer Trip Pass"><Feather name="minus" size={18} color={ink} /></Pressable>
            <Text style={styles.stepQty}>{passQty}</Text>
            <Pressable onPress={() => setPassQty(q => Math.min(10, q + 1))} style={styles.stepBtn} accessibilityRole="button" accessibilityLabel="One more Trip Pass"><Feather name="plus" size={18} color={ink} /></Pressable>
            <Pressable onPress={buy} style={styles.tripCta} accessibilityRole="button">
              <Text style={styles.tripCtaText}>Buy {passQty} Trip Pass{passQty > 1 ? "es" : ""}</Text>
            </Pressable>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const baseStyles = StyleSheet.create({
  compare: { backgroundColor: "#F1F5F5", borderRadius: 16, overflow: "hidden" },
  cRow: { flexDirection: "row", paddingVertical: 8, paddingHorizontal: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: "#D3E2E3" },
  cHead: { backgroundColor: "#04404A", borderTopWidth: 0 },
  cCell: { flex: 1, color: "#0B2A2E", fontSize: 12, textAlign: "center" },
  cLabel: { flex: 0.9, textAlign: "left", color: "#557277" },
  cHeadText: { fontWeight: "800", color: "#FFFFFF" },
  fill: { flex: 1 },
  saveBadge: { position: "absolute", top: -10, right: 10, backgroundColor: "#F5A524", borderRadius: 99, paddingHorizontal: 8, paddingVertical: 3 },
  saveBadgeText: { color: "#04404A", fontSize: 10, fontWeight: "800", letterSpacing: 0.4 },
  orRow: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 6 },
  orLine: { flex: 1, height: 1, backgroundColor: "#D3E2E3" },
  orText: { color: "#557277", fontSize: 11, fontWeight: "800", letterSpacing: 1 },
  tripHead: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  tripPrice: { color: "#04404A", fontSize: 18, fontWeight: "800" },
  tripBox: { borderWidth: 1.5, borderColor: "#D3E2E3", backgroundColor: "#F1F5F5", borderRadius: 16, padding: 14, gap: 12 },
  owned: { color: "#0E8A8F", fontSize: 13, fontWeight: "700", marginTop: 2 },
  stepRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  stepBtn: { width: 38, height: 38, borderRadius: 19, borderWidth: 1.5, borderColor: "#D3E2E3", alignItems: "center", justifyContent: "center" },
  stepQty: { color: "#0B2A2E", fontSize: 18, fontWeight: "800", minWidth: 22, textAlign: "center" },
  stepTotal: { marginLeft: "auto", color: "#04404A", fontSize: 18, fontWeight: "800" },
  tripCta: { marginLeft: "auto", borderWidth: 1.5, borderColor: "#04404A", backgroundColor: "#FFFFFF", borderRadius: 12, paddingVertical: 9, paddingHorizontal: 14 },
  tripCtaText: { color: "#04404A", fontSize: 14, fontWeight: "800" },
  hero: { marginHorizontal: -22, paddingHorizontal: 22, paddingBottom: 26, gap: 18, borderBottomLeftRadius: 28, borderBottomRightRadius: 28 },
  body: { gap: 18, paddingHorizontal: 22 },
  close: { alignSelf: "flex-end", padding: 4 },
  eyebrow: { color: "#F5A524", fontSize: 12, fontWeight: "700", letterSpacing: 1.2 },
  title: { color: "#FFFFFF", fontSize: 28, fontWeight: "800", lineHeight: 34 },
  perks: { gap: 12 },
  perk: { flexDirection: "row", alignItems: "center", gap: 12 },
  tick: { width: 24, height: 24, borderRadius: 12, backgroundColor: "rgba(255,255,255,0.18)", alignItems: "center", justifyContent: "center" },
  perkText: { color: "#FFFFFF", fontSize: 16 },
  plans: { flexDirection: "row", gap: 10, marginTop: 10 },
  plan: { flex: 1, gap: 3, borderWidth: 1.5, borderColor: "#D3E2E3", backgroundColor: "#F1F5F5", borderRadius: 16, padding: 14, paddingTop: 16 },
  planOn: { borderColor: "#0E8A8F", backgroundColor: "#E6F4F4" },
  planText: { flex: 1, gap: 2 },
  planTitle: { color: "#0B2A2E", fontSize: 16, fontWeight: "700" },
  planNote: { color: "#557277", fontSize: 13 },
  planPrice: { color: "#04404A", fontSize: 18, fontWeight: "800" },
  cta: { backgroundColor: "#04404A", borderRadius: 16, paddingVertical: 17, alignItems: "center", marginTop: 6 },
  ctaText: { color: "#FFFFFF", fontSize: 17, fontWeight: "800" },
  free: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: "#FFF4DC", borderRadius: 16, paddingVertical: 15 },
  freeText: { color: "#04404A", fontSize: 16, fontWeight: "800" },
  fine: { color: "#557277", fontSize: 12, textAlign: "center" },
});
