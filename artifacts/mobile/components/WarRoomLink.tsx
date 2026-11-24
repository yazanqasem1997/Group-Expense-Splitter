import { Feather } from "@expo/vector-icons";
import { customFetch } from "@workspace/api-client-react";
import { router } from "expo-router";
import { useAccountDrawer } from "@/context/AccountDrawerContext";
import React, { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

/** Shown only to the app owner: opens the war room, with how many changes wait for a decision. */
export function WarRoomLink() {
  const { closeDrawer } = useAccountDrawer();
  const [pending, setPending] = useState<number | null>(null);

  useEffect(() => {
    let alive = true;
    customFetch<{ stats: { pending: number } }>("/api/owner/war-room")
      .then((room) => { if (alive) setPending(room.stats.pending); })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  if (pending === null) return null;
  return (
    <Pressable onPress={() => { closeDrawer(); setTimeout(() => router.push("/war-room"), 260); }} accessibilityRole="button" style={({ pressed }) => [styles.row, { opacity: pressed ? 0.9 : 1 }]}>
      <View style={styles.icon}><Feather name="radio" size={18} color="#F5A524" /></View>
      <View style={{ flex: 1 }}>
        <Text style={styles.title}>War room</Text>
        <Text style={styles.sub}>{pending > 0 ? pending + " change" + (pending === 1 ? "" : "s") + " to decide" : "Briefing, inbox and crashes"}</Text>
      </View>
      <Feather name="chevron-right" size={20} color="#FFFFFF" />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: "#04404A", borderRadius: 16, padding: 14, marginBottom: 16 },
  icon: { width: 38, height: 38, borderRadius: 12, backgroundColor: "rgba(255,255,255,0.12)", alignItems: "center", justifyContent: "center" },
  title: { color: "#FFFFFF", fontSize: 15, fontWeight: "800" },
  sub: { color: "rgba(255,255,255,0.8)", fontSize: 12.5 },
});
