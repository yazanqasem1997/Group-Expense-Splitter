import { Feather } from "@expo/vector-icons";
import { createFriendQr } from "@workspace/api-client-react";
import { LinearGradient } from "expo-linear-gradient";
import React, { useState } from "react";
import { ActivityIndicator, Pressable, Share, StyleSheet, Text, View } from "react-native";
import { showAlert } from "@/hooks/alertStore";
import { buildFriendInviteUrl } from "@/utils/friendInvite";

/** "Invite a friend, earn a reward": shares your personal invite link. */
export function InviteRewardCard() {
  const [busy, setBusy] = useState(false);

  async function share() {
    if (busy) return;
    setBusy(true);
    try {
      const qr = (await createFriendQr()) as { token: string };
      const url = buildFriendInviteUrl(qr.token);
      await Share.share({
        message: "I split bills with Split Mate. Add me as a friend so we can split things easily: " + url,
      });
    } catch {
      showAlert("Couldn't create your invite", "Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Pressable onPress={share} accessibilityRole="button" style={({ pressed }) => [styles.wrap, { opacity: pressed ? 0.92 : 1 }]}>
      <LinearGradient colors={["#04404A", "#0E7C86", "#18B6A4"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.card}>
        <View style={styles.icon}><Feather name="gift" size={20} color="#04404A" /></View>
        <View style={styles.text}>
          <Text style={styles.title}>Invite a friend, earn a reward</Text>
          <Text style={styles.body}>When they join and add their first expense, you get 7 days of Plus free. Up to 3 a year.</Text>
        </View>
        {busy ? <ActivityIndicator color="#FFFFFF" /> : <Feather name="share" size={18} color="#FFFFFF" />}
      </LinearGradient>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: 16 },
  card: { borderRadius: 16, padding: 16, flexDirection: "row", alignItems: "center", gap: 12 },
  icon: { width: 40, height: 40, borderRadius: 12, backgroundColor: "#F5A524", alignItems: "center", justifyContent: "center" },
  text: { flex: 1, gap: 3 },
  title: { color: "#FFFFFF", fontSize: 15, fontWeight: "800" },
  body: { color: "rgba(255,255,255,0.85)", fontSize: 12.5, lineHeight: 17 },
});
