import { useAuth } from "@clerk/expo";
import { Feather } from "@expo/vector-icons";
import { Redirect, router, useLocalSearchParams } from "expo-router";
import React, { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useApp } from "@/context/AppContext";
import { useTheme } from "@/hooks/useTheme";
import { api, toUserMessage } from "@/services/apiSync";
import { savePendingGroupInvite } from "@/utils/groupInvite";

type Preview = Awaited<ReturnType<typeof api.previewGroupJoin>>;

export default function GroupJoinScreen() {
  const { colors } = useTheme();
  const { isLoaded, isSignedIn } = useAuth();
  const { code } = useLocalSearchParams<{ code?: string }>();
  const insets = useSafeAreaInsets();
  const { refreshFromServer } = useApp();
  const token = typeof code === "string" ? code : "";
  const [saved, setSaved] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!isLoaded || isSignedIn || !token) return;
    void savePendingGroupInvite(token).finally(() => setSaved(true));
  }, [isLoaded, isSignedIn, token]);

  useEffect(() => {
    if (!isLoaded || !isSignedIn) return;
    if (!token) {
      setLoading(false);
      setError("This group invite is invalid or has been refreshed.");
      return;
    }
    let cancelled = false;
    api.previewGroupJoin(token)
      .then((value) => { if (!cancelled) setPreview(value); })
      .catch((err) => { if (!cancelled) setError(toUserMessage(err, "Couldn't load this group invite.")); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [isLoaded, isSignedIn, token]);

  if (isLoaded && !isSignedIn && (!token || saved)) return <Redirect href="/" />;

  async function joinGroup() {
    if (!token) return;
    setJoining(true);
    setError("");
    try {
      const joined = await api.acceptGroupJoin(token);
      await refreshFromServer();
      router.replace({ pathname: "/group/[id]", params: { id: joined.groupId } });
    } catch (err) {
      setError(toUserMessage(err, "Couldn't join this group."));
    } finally {
      setJoining(false);
    }
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background, paddingTop: insets.top + 12 }]}>
      <Pressable onPress={() => router.back()} style={styles.close} accessibilityLabel="Close invite">
        <Feather name="x" size={22} color={colors.textSecondary} />
      </Pressable>
      <View style={styles.content}>
        {loading ? <ActivityIndicator color={colors.primary} /> : preview ? (
          <>
            <Feather name="users" size={44} color={colors.primary} />
            <Text style={[styles.title, { color: colors.text }]}>Join {preview.groupName}?</Text>
            <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
              Join this group to share expenses and settle up. No friend request is needed.
            </Text>
            {!!error && <Text style={[styles.subtitle, { color: colors.danger }]}>{error}</Text>}
            <Pressable onPress={() => void joinGroup()} disabled={joining} style={[styles.button, { backgroundColor: colors.primary, opacity: joining ? 0.65 : 1 }]}>
              {joining && <ActivityIndicator size="small" color="#fff" />}
              <Text style={styles.buttonText}>{joining ? "Joining…" : "Join group"}</Text>
            </Pressable>
          </>
        ) : (
          <>
            <Feather name="alert-circle" size={36} color={colors.danger} />
            <Text style={[styles.subtitle, { color: colors.danger }]}>{error || "This group invite is invalid."}</Text>
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: 20 },
  close: { alignSelf: "flex-end", padding: 8 },
  content: { flex: 1, alignItems: "center", justifyContent: "center", gap: 16, paddingBottom: 60 },
  title: { fontSize: 22, fontFamily: "Inter_700Bold", textAlign: "center" },
  subtitle: { fontSize: 14, lineHeight: 21, textAlign: "center", maxWidth: 340 },
  button: { minHeight: 48, width: "100%", maxWidth: 360, borderRadius: 12, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  buttonText: { color: "#fff", fontSize: 15, fontFamily: "Inter_600SemiBold" },
});
