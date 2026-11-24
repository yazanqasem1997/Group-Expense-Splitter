import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router, useLocalSearchParams } from "expo-router";
import React, { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useApp } from "@/context/AppContext";
import { showAlert } from "@/hooks/alertStore";
import { useInk, useThemedStyles } from "@/utils/themedStyles";

const PRICE = 14.99;
const BENEFITS: { icon: React.ComponentProps<typeof Feather>["name"]; title: string; body: string }[] = [
  { icon: "users", title: "Plus for everyone in the group", body: "Every member gets it, not just you." },
  { icon: "camera", title: "Unlimited receipt scans", body: "Snap every bill on the trip." },
  { icon: "bar-chart-2", title: "Spending charts for all time", body: "See where the money went." },
  { icon: "download", title: "Export to CSV and PDF", body: "Share a clean summary when it's over." },
  { icon: "repeat", title: "Unlimited recurring expenses", body: "Rent, bills and anything that repeats." },
  { icon: "calendar", title: "30 days, no subscription", body: "Pay once. Nothing renews." },
];

export default function TripPassScreen() {
  const styles = useThemedStyles(baseStyles);
  const { ink, page } = useInk();
  const insets = useSafeAreaInsets();
  const { groupId } = useLocalSearchParams<{ groupId?: string }>();
  const { getGroupById } = useApp();
  const group = groupId ? getGroupById(groupId) : undefined;
  const [qty, setQty] = useState(1);
  const n = group?.memberIds.length ?? 0;

  function buy() {
    showAlert("Coming with the App Store release", "Purchases open when Split Mate launches on the App Store. Nothing has been charged.");
  }

  return (
    <View style={styles.fill}>
      <View style={[styles.body, { paddingBottom: insets.bottom + 16 }]}>
        <LinearGradient colors={["#04404A", "#0E7C86"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.hero, { paddingTop: insets.top + 12 }]}>
          <Pressable onPress={() => router.back()} hitSlop={12} style={styles.close} accessibilityRole="button" accessibilityLabel="Close">
            <Feather name="x" size={24} color="#FFFFFF" />
          </Pressable>
          <Text style={styles.eyebrow}>TRIP PASS</Text>
          <Text style={styles.title}>{group ? `Unlock Plus for ${group.name}` : "Plus for one trip"}</Text>
          <Text style={styles.lead}>AED {PRICE.toFixed(2)} once{n > 1 ? `, about AED ${(PRICE / n).toFixed(2)} each if you split it with ${n} people` : ""}.</Text>
        </LinearGradient>

        <View style={styles.list}>
          {BENEFITS.map(b => (
            <View key={b.title} style={styles.benefit}>
              <View style={styles.icon}><Feather name={b.icon} size={15} color={ink} /></View>
              <View style={{ flex: 1 }}>
                <Text style={styles.bTitle}>{b.title}</Text>
                <Text style={styles.bBody}>{b.body}</Text>
              </View>
            </View>
          ))}
        </View>

        <View style={styles.buyBox}>
          <View style={styles.stepRow}>
            <Pressable onPress={() => setQty(q => Math.max(1, q - 1))} style={styles.stepBtn} accessibilityRole="button" accessibilityLabel="One fewer Trip Pass"><Feather name="minus" size={18} color={ink} /></Pressable>
            <Text style={styles.qty}>{qty}</Text>
            <Pressable onPress={() => setQty(q => Math.min(10, q + 1))} style={styles.stepBtn} accessibilityRole="button" accessibilityLabel="One more Trip Pass"><Feather name="plus" size={18} color={ink} /></Pressable>
            <Text style={styles.total}>AED {(PRICE * qty).toFixed(2)}</Text>
          </View>
          <Text style={styles.hint}>Extra passes wait in your account for your next trip.</Text>
          <Pressable onPress={buy} style={styles.cta} accessibilityRole="button">
            <Text style={styles.ctaText}>Buy {qty} Trip Pass{qty > 1 ? "es" : ""}</Text>
          </Pressable>
        </View>

        <Pressable onPress={() => router.replace({ pathname: "/plus", params: groupId ? { groupId } : {} })} style={styles.all} accessibilityRole="button">
          <Text style={styles.allText}>See all plans</Text>
          <Feather name="chevron-right" size={16} color="#0E8A8F" />
        </Pressable>
      </View>
    </View>
  );
}

const baseStyles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: "#FFFFFF" },
  body: { flex: 1, gap: 14, paddingHorizontal: 20, justifyContent: "space-between" },
  hero: { marginHorizontal: -20, paddingHorizontal: 20, paddingBottom: 18, gap: 6, borderBottomLeftRadius: 24, borderBottomRightRadius: 24 },
  close: { alignSelf: "flex-end", padding: 4 },
  eyebrow: { color: "#F5A524", fontSize: 12, fontWeight: "700", letterSpacing: 1.2 },
  title: { color: "#FFFFFF", fontSize: 22, fontWeight: "800", lineHeight: 28 },
  lead: { color: "rgba(255,255,255,0.85)", fontSize: 13.5, lineHeight: 19 },
  list: { flexDirection: "row", flexWrap: "wrap", rowGap: 12, columnGap: 10 },
  benefit: { width: "48%", flexDirection: "row", alignItems: "flex-start", gap: 8 },
  icon: { width: 30, height: 30, borderRadius: 9, backgroundColor: "#E6F4F4", alignItems: "center", justifyContent: "center" },
  bTitle: { color: "#0B2A2E", fontSize: 13, fontWeight: "700", lineHeight: 17 },
  bBody: { color: "#557277", fontSize: 11.5, lineHeight: 15, marginTop: 1 },
  buyBox: { borderWidth: 1.5, borderColor: "#D3E2E3", backgroundColor: "#F1F5F5", borderRadius: 16, padding: 14, gap: 10 },
  stepRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  stepBtn: { width: 38, height: 38, borderRadius: 19, borderWidth: 1.5, borderColor: "#D3E2E3", backgroundColor: "#FFFFFF", alignItems: "center", justifyContent: "center" },
  qty: { color: "#0B2A2E", fontSize: 18, fontWeight: "800", minWidth: 22, textAlign: "center" },
  total: { marginLeft: "auto", color: "#04404A", fontSize: 20, fontWeight: "800" },
  hint: { color: "#557277", fontSize: 12.5 },
  cta: { backgroundColor: "#04404A", borderRadius: 14, paddingVertical: 15, alignItems: "center" },
  ctaText: { color: "#FFFFFF", fontSize: 17, fontWeight: "800" },
  all: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4, paddingVertical: 2 },
  allText: { color: "#0E8A8F", fontSize: 15, fontWeight: "700" },
});
