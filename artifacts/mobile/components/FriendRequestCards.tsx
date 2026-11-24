import { Feather } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import React from "react";
import { Pressable, Text, View } from "react-native";
import { useTheme } from "@/hooks/useTheme";
import { api } from "@/services/apiSync";

type Req = { id: string; otherUser?: { name?: string | null; email?: string | null } | null };

/** Incoming friend requests, shown at the top of Activity with Accept / Decline. */
export function FriendRequestCards() {
  const { colors } = useTheme();
  const [requests, setRequests] = React.useState<Req[]>([]);
  const [busy, setBusy] = React.useState<string | null>(null);
  const load = React.useCallback(() => {
    api.listFriendRequests()
      .then(list => setRequests(list.filter(r => r.direction === "received" && r.status === "pending") as Req[]))
      .catch(() => {});
  }, []);
  useFocusEffect(React.useCallback(() => { load(); }, [load]));

  async function respond(id: string, accept: boolean) {
    setBusy(id);
    try {
      if (accept) await api.acceptFriendRequest(id);
      else await api.declineFriendRequest(id);
      setRequests(prev => prev.filter(r => r.id !== id));
    } catch {
      // keep it so they can try again
    } finally {
      setBusy(null);
    }
  }

  if (requests.length === 0) return null;
  return (
    <View style={{ marginHorizontal: 16, marginTop: 8, marginBottom: 4, gap: 8 }}>
      <Text style={{ fontSize: 12, fontWeight: "700", letterSpacing: 0.8, color: colors.textTertiary, marginLeft: 4 }}>
        FRIEND REQUESTS · {requests.length}
      </Text>
      {requests.map(r => (
        <View key={r.id} style={{ flexDirection: "row", alignItems: "center", gap: 10, padding: 12, borderRadius: 14, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }}>
          <View style={{ width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center", backgroundColor: colors.primary + "18" }}>
            <Feather name="user-plus" size={16} color={colors.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ color: colors.text, fontWeight: "700" }} numberOfLines={1}>{r.otherUser?.name || r.otherUser?.email || "Someone"}</Text>
            <Text style={{ color: colors.textSecondary, fontSize: 12 }}>wants to be friends</Text>
          </View>
          <Pressable
            disabled={busy === r.id}
            onPress={() => void respond(r.id, false)}
            style={{ paddingHorizontal: 10, paddingVertical: 7, borderRadius: 10, borderWidth: 1, borderColor: colors.border }}
            accessibilityRole="button" accessibilityLabel="Decline friend request"
          >
            <Text style={{ color: colors.textSecondary, fontWeight: "600", fontSize: 13 }}>Decline</Text>
          </Pressable>
          <Pressable
            disabled={busy === r.id}
            onPress={() => void respond(r.id, true)}
            style={{ paddingHorizontal: 12, paddingVertical: 7, borderRadius: 10, backgroundColor: colors.primary }}
            accessibilityRole="button" accessibilityLabel="Accept friend request"
          >
            <Text style={{ color: "#fff", fontWeight: "700", fontSize: 13 }}>Accept</Text>
          </Pressable>
        </View>
      ))}
    </View>
  );
}
