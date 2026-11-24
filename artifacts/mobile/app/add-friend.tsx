import { Feather } from "@expo/vector-icons";
import { useAuth } from "@clerk/expo";
import * as Haptics from "expo-haptics";
import { Redirect, router, useLocalSearchParams } from "expo-router";
import React, { useEffect, useState } from "react";
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Avatar } from "@/components/Avatar";
import { useTheme } from "@/hooks/useTheme";
import { api, toUserMessage } from "@/services/apiSync";
import { extractFriendInviteToken, savePendingFriendInvite } from "@/utils/friendInvite";

type Profile = Awaited<ReturnType<typeof api.previewFriendQr>>;

/**
 * Deep-link target for friend QR codes (`/add-friend?code=…`). Signed-out
 * visitors are sent to sign in first and resume here afterwards; the request
 * is only sent once the user confirms, and the recipient still has to accept.
 */
export default function AddFriendScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { isLoaded, isSignedIn } = useAuth();
  const params = useLocalSearchParams<{ code?: string }>();
  const token = extractFriendInviteToken(typeof params.code === "string" ? params.code : null);

  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [savedForLater, setSavedForLater] = useState(false);

  useEffect(() => {
    if (!isLoaded || isSignedIn || !token) return;
    void savePendingFriendInvite(token).finally(() => setSavedForLater(true));
  }, [isLoaded, isSignedIn, token]);

  useEffect(() => {
    if (!isLoaded || !isSignedIn) return;
    if (!token) {
      setLoading(false);
      setError("This QR code is invalid or has expired.");
      return;
    }
    let cancelled = false;
    setLoading(true);
    api.previewFriendQr(token)
      .then((result) => { if (!cancelled) setProfile(result); })
      .catch((err) => { if (!cancelled) setError(toUserMessage(err, "This QR code is invalid or has expired.")); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [isLoaded, isSignedIn, token]);

  if (isLoaded && !isSignedIn && (!token || savedForLater)) {
    return <Redirect href="/" />;
  }

  function close() {
    router.replace("/(tabs)/friends");
  }

  async function sendRequest() {
    if (!token) return;
    setSending(true);
    setError("");
    try {
      await api.sendFriendRequestWithQr(token);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      close();
    } catch (err) {
      setError(toUserMessage(err, "Couldn't send the friend request."));
    } finally {
      setSending(false);
    }
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background, paddingTop: (Platform.OS === "web" ? 24 : insets.top) + 12 }]}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.text }]}>Friend invite</Text>
        <Pressable onPress={close} hitSlop={8} accessibilityRole="button" accessibilityLabel="Close">
          <Feather name="x" size={22} color={colors.textSecondary} />
        </Pressable>
      </View>

      <View style={styles.body}>
        {!isLoaded || loading ? (
          <ActivityIndicator color={colors.primary} />
        ) : profile ? (
          <>
            <Avatar name={profile.name} color={profile.avatarColor} size={80} imageUri={profile.photo ?? undefined} />
            <Text style={[styles.name, { color: colors.text }]}>{profile.name}</Text>
            <Text style={[styles.hint, { color: colors.textSecondary }]}>
              Send a friend request? You’ll become friends once they accept.
            </Text>
            {!!error && <Text style={[styles.hint, { color: colors.danger }]}>{error}</Text>}
            <Pressable
              onPress={() => void sendRequest()}
              disabled={sending}
              accessibilityRole="button"
              style={[styles.primary, { backgroundColor: colors.primary, opacity: sending ? 0.65 : 1 }]}
            >
              {sending ? <ActivityIndicator size="small" color="#fff" /> : <Feather name="user-plus" size={16} color="#fff" />}
              <Text style={styles.primaryText}>{sending ? "Sending…" : "Send request"}</Text>
            </Pressable>
          </>
        ) : (
          <>
            <Feather name="alert-circle" size={30} color={colors.textTertiary} />
            <Text style={[styles.hint, { color: colors.textSecondary }]}>{error || "This QR code is invalid or has expired."}</Text>
            <Pressable onPress={close} style={[styles.primary, { backgroundColor: colors.primary }]}>
              <Text style={styles.primaryText}>Go to Friends</Text>
            </Pressable>
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: 20 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  title: { fontSize: 20, fontFamily: "Inter_700Bold" },
  body: { flex: 1, alignItems: "center", justifyContent: "center", gap: 14, paddingBottom: 60 },
  name: { fontSize: 20, fontFamily: "Inter_600SemiBold" },
  hint: { fontSize: 14, lineHeight: 20, textAlign: "center", maxWidth: 320 },
  primary: { width: "100%", maxWidth: 360, minHeight: 48, borderRadius: 12, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  primaryText: { color: "#fff", fontSize: 15, fontFamily: "Inter_600SemiBold" },
});
