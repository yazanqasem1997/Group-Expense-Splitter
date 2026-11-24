import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router, useLocalSearchParams } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  Platform,
  Pressable,
  Share,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { MonochromeIconTile, groupIconName } from "@/components/MonochromeIconTile";
import { useApp } from "@/context/AppContext";
import { useTheme } from "@/hooks/useTheme";
import { api, toUserMessage } from "@/services/apiSync";
import { buildGroupInviteUrl } from "@/utils/groupInvite";
import QRCode from "react-native-qrcode-svg";

export default function GroupQRScreen() {
  const { id, share } = useLocalSearchParams<{ id: string; share?: string }>();
  const autoShareDone = React.useRef(false);
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { getGroupById, currentUser } = useApp();
  const [joinToken, setJoinToken] = useState("");
  const [linkLoading, setLinkLoading] = useState(true);
  const [linkError, setLinkError] = useState("");

  const group = getGroupById(id);
  const topPad = insets.top;
  useEffect(() => {
    let cancelled = false;
    void api.createGroupJoinLink(id)
      .then((link) => { if (!cancelled) setJoinToken(link.token); })
      .catch((error) => { if (!cancelled) setLinkError(toUserMessage(error, "Couldn't create a group invite.")); })
      .finally(() => { if (!cancelled) setLinkLoading(false); });
    return () => { cancelled = true; };
  }, [id]);

  const handleShareRef = React.useRef<null | (() => Promise<void>)>(null);
  const inviteLink = joinToken ? buildGroupInviteUrl(joinToken) : "";
  React.useEffect(() => {
    if (share === "1" && inviteLink && !autoShareDone.current) {
      autoShareDone.current = true;
      void handleShareRef.current?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [share, inviteLink]);

  if (!group) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <Text style={{ color: colors.text }}>Group not found</Text>
      </View>
    );
  }


  async function handleRefreshQr() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setLinkLoading(true);
    setLinkError("");
    try {
      const link = await api.refreshGroupJoinLink(id);
      setJoinToken(link.token);
    } catch (error) {
      setLinkError(toUserMessage(error, "Couldn't refresh the group invite."));
    } finally {
      setLinkLoading(false);
    }
  }

  async function handleShare() {
    if (!group || !inviteLink) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const message =
      `Hey! ${currentUser.name} is inviting you to "${group.name}" on Split Mate.\n\n` +
      `Open Split Mate and scan the QR code, or tap:\n${inviteLink}`;
    try {
      await Share.share({ message, title: `Join ${group.name} on Split Mate` });
    } catch {}
  }  handleShareRef.current = handleShare;


  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topPad + 8, backgroundColor: colors.headerBg }]}>
        <Pressable onPress={() => router.back()} style={styles.backBtn} accessibilityRole="button" accessibilityLabel="Back">
          <Feather name="arrow-left" size={24} color={colors.text} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.text }]}>QR Invite</Text>
        <View style={styles.headerActions}>
          <Pressable
            onPress={handleShare}
            style={styles.headerAction}
            accessibilityLabel="Share QR invite"
          >
            <Feather name="share-2" size={22} color={colors.primary} />
          </Pressable>
        </View>
      </View>

      <View style={styles.content}>
        <View style={[styles.groupBadge, { backgroundColor: colors.surface }]}>
          <MonochromeIconTile
            icon={groupIconName(group)}
            size={56}
            color={colors.textSecondary}
            borderColor={colors.border}
          />
          <Text style={[styles.groupName, { color: colors.text }]}>{group.name}</Text>
          <Text style={[styles.groupSub, { color: colors.textSecondary }]}>
            Scan to join this group
          </Text>
        </View>

        <View style={[styles.qrCard, { backgroundColor: colors.surface }]}>
          <View style={[styles.qrFrame, { borderColor: colors.primary + "30" }]}>
            {/* Corner marks */}
            <View style={[styles.corner, styles.cornerTL, { borderColor: colors.primary }]} />
            <View style={[styles.corner, styles.cornerTR, { borderColor: colors.primary }]} />
            <View style={[styles.corner, styles.cornerBL, { borderColor: colors.primary }]} />
            <View style={[styles.corner, styles.cornerBR, { borderColor: colors.primary }]} />
            {linkLoading ? (
              <Text style={[styles.qrWebText, { color: colors.textSecondary }]}>Preparing invite…</Text>
            ) : inviteLink ? (
              <QRCode value={inviteLink} size={230} backgroundColor="#FFFFFF" color="#000000" />
            ) : (
              <View style={[styles.qrWebFallback, { backgroundColor: colors.background }]}>
                <Feather name="alert-circle" size={40} color={colors.danger} />
                <Text style={[styles.qrWebText, { color: colors.danger }]}>{linkError || "Invite unavailable"}</Text>
              </View>
            )}
          </View>

          <Text style={[styles.qrHint, { color: colors.textSecondary }]}>
            Point another phone's camera at this code to join
          </Text>
          <Pressable
            style={({ pressed }) => [
              styles.refreshQrBtn,
              { borderColor: colors.border, opacity: pressed ? 0.7 : 1 },
            ]}
            onPress={() => void handleRefreshQr()}
          >
            <Feather name="refresh-cw" size={15} color={colors.primary} />
            <Text style={[styles.refreshQrText, { color: colors.primary }]}>Refresh QR code</Text>
          </Pressable>
        </View>

        <View style={[styles.linkCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Feather name="link" size={15} color={colors.primary} />
          <Text style={[styles.linkText, { color: colors.textSecondary }]} numberOfLines={1} selectable>{inviteLink || "Preparing invite…"}</Text>
          {inviteLink ? (
            <Pressable /* copyInvite */ onPress={async () => { try { const C = await import("expo-clipboard"); await C.setStringAsync(inviteLink); Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } catch {} }} hitSlop={10} accessibilityRole="button" accessibilityLabel="Copy invite link">
              <Feather name="copy" size={16} color={colors.teal} />
            </Pressable>
          ) : null}
        </View>

        <Pressable
          style={[styles.shareBtn, { backgroundColor: colors.primary }]}
          onPress={() => void handleShare()}
        >
          <Feather name="share-2" size={18} color="#fff" />
          <Text style={styles.shareBtnText}>Share Invite Link</Text>
        </Pressable>

        <Text style={[styles.disclaimer, { color: colors.textTertiary }]}>
          Anyone with this code can join {group.name}. The invite expires when you create a new one.
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 20, paddingBottom: 14,
    shadowColor: "#000", shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05, shadowRadius: 4, elevation: 2,
  },
  backBtn: { padding: 4 },
  headerTitle: { fontSize: 18, fontFamily: "Inter_700Bold" },
  headerActions: { flexDirection: "row", alignItems: "center", gap: 8 },
  headerAction: { padding: 4 },
  content: { flex: 1, alignItems: "center", padding: 24, gap: 18 },
  groupBadge: {
    alignItems: "center", gap: 6, padding: 20, borderRadius: 20, width: "100%",
    shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 2,
  },
  groupName: { fontSize: 20, fontFamily: "Inter_700Bold" },
  groupSub: { fontSize: 13, fontFamily: "Inter_400Regular" },
  qrCard: {
    alignItems: "center", padding: 24, borderRadius: 24, width: "100%", gap: 16,
    shadowColor: "#000", shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.08, shadowRadius: 12, elevation: 3,
  },
  qrFrame: {
    width: 260, height: 260, borderRadius: 16,
    alignItems: "center", justifyContent: "center",
    borderWidth: 1, position: "relative",
    overflow: "hidden",
  },
  corner: { position: "absolute", width: 22, height: 22, borderWidth: 3 },
  cornerTL: { top: -1, left: -1, borderBottomWidth: 0, borderRightWidth: 0, borderTopLeftRadius: 8 },
  cornerTR: { top: -1, right: -1, borderBottomWidth: 0, borderLeftWidth: 0, borderTopRightRadius: 8 },
  cornerBL: { bottom: -1, left: -1, borderTopWidth: 0, borderRightWidth: 0, borderBottomLeftRadius: 8 },
  cornerBR: { bottom: -1, right: -1, borderTopWidth: 0, borderLeftWidth: 0, borderBottomRightRadius: 8 },
  qrImage: { width: 240, height: 240 },
  qrWebFallback: { width: 240, height: 240, alignItems: "center", justifyContent: "center", borderRadius: 12, gap: 14 },
  qrWebText: { fontSize: 13, fontFamily: "Inter_400Regular", textAlign: "center" },
  qrHint: { fontSize: 12, fontFamily: "Inter_400Regular", textAlign: "center", paddingHorizontal: 12 },
  refreshQrBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
  },
  refreshQrText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  linkCard: {
    flexDirection: "row", alignItems: "center", gap: 10,
    paddingHorizontal: 14, paddingVertical: 12, borderRadius: 14, borderWidth: 1, width: "100%",
  },
  linkText: { flex: 1, fontSize: 12, fontFamily: "Inter_400Regular" },
  shareBtn: {
    flexDirection: "row", alignItems: "center", gap: 10,
    paddingHorizontal: 28, paddingVertical: 16, borderRadius: 16, width: "100%",
    justifyContent: "center",
  },
  shareBtnText: { fontSize: 16, fontFamily: "Inter_600SemiBold", color: "#fff" },
  disclaimer: { fontSize: 11, fontFamily: "Inter_400Regular", textAlign: "center", paddingHorizontal: 16 },
});
