import { getScanUsage } from "@workspace/api-client-react";
import { router } from "expo-router";
import React, { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useTheme } from "@/hooks/useTheme";
import { PURCHASES_LIVE } from "@/constants/brand";

type Usage = { plan: string; used: number; limit: number | null; resetsOn: string };

/** "4 of 5 free scans used this month", with a way to go Plus. Hidden on Plus and Trip Pass. */
export function ScanAllowance({ groupId }: { groupId?: string }) {
  const { colors } = useTheme();
  const [usage, setUsage] = useState<Usage | null>(null);

  useEffect(() => {
    if (!PURCHASES_LIVE) return;
    let alive = true;
    getScanUsage(groupId ? { groupId } : undefined)
      .then(result => { if (alive) setUsage(result as Usage); })
      .catch(() => {});
    return () => { alive = false; };
  }, [groupId]);

  if (!PURCHASES_LIVE || !usage || usage.limit === null) return null;
  const left = Math.max(0, usage.limit - usage.used);
  const ratio = Math.min(1, usage.used / usage.limit);
  const resets = new Date(usage.resetsOn + "T00:00:00").toLocaleDateString(undefined, { day: "numeric", month: "long" });

  return (
    <View style={[styles.card, { borderColor: colors.primaryLight }]} accessibilityLabel={usage.used + " of " + usage.limit + " free scans used this month"}>
      <View style={styles.row}>
        <Text style={[styles.label, { color: colors.text }]}>Free scans this month</Text>
        <Text style={[styles.count, { color: colors.text }]}>{usage.used} of {usage.limit}</Text>
      </View>
      <View style={[styles.track, { backgroundColor: colors.primaryLight }]}>
        <View style={{ flex: ratio, backgroundColor: left === 0 ? colors.warning : colors.primary, borderRadius: 99 }} />
        <View style={{ flex: 1 - ratio }} />
      </View>
      <View style={styles.row}>
        <Text style={[styles.hint, { color: colors.textSecondary }]}>
          {left === 0 ? "No free scans left" : left + " left · resets " + resets}
        </Text>
        <Pressable
          hitSlop={10}
          accessibilityRole="button"
          onPress={() => router.push({ pathname: "/plus", params: groupId ? { reason: "scans", groupId } : { reason: "scans" } })}
        >
          <Text style={[styles.link, { color: colors.primary }]}>Go Plus</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { marginHorizontal: 20, marginTop: 8, padding: 14, borderRadius: 16, borderWidth: 1, gap: 8 },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  label: { fontSize: 14, fontWeight: "600" },
  count: { fontSize: 14, fontWeight: "700", fontVariant: ["tabular-nums"] },
  track: { height: 8, borderRadius: 99, overflow: "hidden", flexDirection: "row" },
  hint: { fontSize: 12 },
  link: { fontSize: 13, fontWeight: "700" },
});
