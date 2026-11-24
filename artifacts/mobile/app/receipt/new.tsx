import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import { router, useLocalSearchParams } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  Alert,
  ActivityIndicator,
  Image,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  AppState,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { api, toUserMessage } from "@/services/apiSync";
import { showAlert } from "@/hooks/alertStore";
import { useTheme } from "@/hooks/useTheme";
import { ScanAllowance } from "@/components/ScanAllowance";

// Same size the server sends to the reader, so nothing is lost; just a smaller upload.
const RECEIPT_IMAGE_MAX_WIDTH = 1568;
const RECEIPT_IMAGE_MAX_HEIGHT = 1568;

function receiptScanErrorMessage(error: unknown) {
  const message = toUserMessage(error, "We couldn't read that receipt. Please try again.");
  if (/not configured/i.test(message)) {
    return "Receipt scanning is unavailable right now. Please try again later or enter the expense manually.";
  }
  return message;
}

function receiptResizeAction(width: number, height: number) {
  if (width <= 0 || height <= 0) return [];

  const scale = Math.min(
    RECEIPT_IMAGE_MAX_WIDTH / width,
    RECEIPT_IMAGE_MAX_HEIGHT / height,
  );
  if (Math.abs(scale - 1) < 0.001) return [];

  const resizedWidth = Math.round(width * scale);
  const resizedHeight = Math.round(height * scale);
  return resizedWidth <= resizedHeight
    ? [{ resize: { width: resizedWidth } }]
    : [{ resize: { height: resizedHeight } }];
}

export default function NewReceiptScreen() {
  const { groupId } = useLocalSearchParams<{ groupId: string }>();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [busy, setBusy] = useState(false);
  const [waitingSince, setWaitingSince] = useState<number | null>(null);
  const scanStartRef = React.useRef(0);
  const [selectedAsset, setSelectedAsset] = useState<ImagePicker.ImagePickerAsset | null>(null);

  const pickReceipt = useCallback(
    async (camera: boolean) => {
      if (!groupId || busy) return;
      setBusy(true);
      try {
        const permission = camera
          ? await ImagePicker.requestCameraPermissionsAsync()
          : await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (permission.status !== "granted") {
          showAlert(
            camera ? "Camera access needed" : "Photo access needed",
            camera
              ? "Allow camera access to scan a receipt."
              : "Allow photo access to choose a receipt image.",
            [{ text: "OK" }],
          );
          return;
        }
        const result = camera
          ? await ImagePicker.launchCameraAsync({
              mediaTypes: "images",
              quality: 1,
            })
          : await ImagePicker.launchImageLibraryAsync({
              mediaTypes: "images",
              quality: 1,
            });
        if (result.canceled || !result.assets[0]) return;
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        setSelectedAsset(result.assets[0]);
      } catch (error) {
        showAlert("Receipt scan failed", toUserMessage(error, "We couldn't read that receipt."), [
          { text: "Try again", onPress: () => pickReceipt(camera) },
          { text: "Cancel", style: "cancel", onPress: () => router.back() },
        ]);
      } finally {
        setBusy(false);
      }
    },
    [busy, groupId],
  );

  const confirmReceipt = useCallback(async () => {
    if (!groupId || !selectedAsset || busy) return;
    setBusy(true);
    scanStartRef.current = Date.now();
    try {
      let imageUri = selectedAsset.uri;
      let contentType = selectedAsset.mimeType ?? "image/jpeg";
      if (Platform.OS !== "web") {
        const ImageManipulator = await import("expo-image-manipulator");
        const normalizedImage = await ImageManipulator.manipulateAsync(
          selectedAsset.uri,
          receiptResizeAction(selectedAsset.width, selectedAsset.height),
          { compress: 0.92, format: ImageManipulator.SaveFormat.JPEG },
        );
        imageUri = normalizedImage.uri;
        contentType = "image/jpeg";
      }
      const receipt = await api.createReceiptFromImage(
        groupId,
        imageUri,
        contentType,
      );
      router.replace({
        pathname: "/receipt/[id]",
        params: { id: receipt.id, groupId },
      });
    } catch (error) {
      // Left the app mid-scan: the server finishes and sends a "Receipt ready" push.
      if (AppState.currentState !== "active") {
        // The server keeps going and sends "Receipt ready". Wait here and pick it up.
        setWaitingSince(scanStartRef.current);
        return;
      }
      if ((error as { status?: number } | null)?.status === 402) {
        router.replace({ pathname: "/plus", params: { reason: "scans", groupId } });
        return;
      }
      Alert.alert("Receipt scan failed", receiptScanErrorMessage(error), [
        { text: "Try again", onPress: () => void confirmReceipt() },
        { text: "Choose another photo", onPress: () => void pickReceipt(false) },
        {
          text: "Enter manually",
          onPress: () => router.replace({ pathname: "/expense/new", params: { groupId, mode: "normal" } }),
        },
      ]);
    } finally {
      setBusy(false);
    }
  }, [busy, groupId, pickReceipt, selectedAsset]);

  // Back from the background mid-scan: iOS may have frozen the upload, so stop
  // waiting on it and ask the server whether the receipt is already done.
  useEffect(() => {
    if (!busy) return;
    const sub = AppState.addEventListener("change", s => {
      if (s === "active" && scanStartRef.current && Date.now() - scanStartRef.current > 2000) setWaitingSince(scanStartRef.current);
    });
    const slow = setTimeout(() => setWaitingSince(w => w ?? scanStartRef.current), 25000);
    return () => { sub.remove(); clearTimeout(slow); };
  }, [busy]);

  useEffect(() => {
    if (!waitingSince || !groupId) return;
    let stopped = false;
    const check = async () => {
      if (stopped || AppState.currentState !== "active") return;
      const found = await api.latestReceipt(String(groupId), waitingSince);
      if (found && !stopped) {
        stopped = true;
        router.replace({ pathname: "/receipt/[id]", params: { id: found.id, groupId } });
      }
    };
    void check();
    const timer = setInterval(() => { void check(); }, 3000);
    const sub = AppState.addEventListener("change", s => { if (s === "active") void check(); });
    return () => { stopped = true; clearInterval(timer); sub.remove(); };
  }, [waitingSince, groupId]);

  if (waitingSince) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 32, gap: 14, backgroundColor: colors.background }}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={{ fontSize: 18, fontFamily: "Inter_700Bold", color: colors.text, textAlign: "center" }}>Still reading your receipt…</Text>
        <Text style={{ fontSize: 14, color: colors.textSecondary, textAlign: "center", lineHeight: 20 }}>
          This screen opens the receipt as soon as it's ready. If you leave the app, we'll send you a notification.
        </Text>
        <Pressable onPress={() => router.back()} style={{ marginTop: 8, paddingVertical: 10, paddingHorizontal: 18 }} accessibilityRole="button">
          <Text style={{ color: colors.primary, fontFamily: "Inter_600SemiBold" }}>Back to group</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background, paddingTop: insets.top + 16 }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Text style={[styles.close, { color: colors.textSecondary }]}>Cancel</Text>
        </Pressable>
        <Text style={[styles.title, { color: colors.text }]}>Scan receipt</Text>
        <View style={{ width: 52 }} />
      </View>
      <ScanAllowance groupId={groupId} />
      <View style={styles.center}>
        {selectedAsset ? (
          <>
            <Image source={{ uri: selectedAsset.uri }} style={styles.previewImage} resizeMode="contain" />
            <Text style={[styles.heading, { color: colors.text }]}>Use this receipt?</Text>
            <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
              Check that the full receipt is visible. You can edit the scan results next.
            </Text>
          </>
        ) : (
          <>
            <View style={[styles.scanIcon, { backgroundColor: colors.primaryLight }]}>
              <Text style={[styles.scanIconText, { color: colors.primary }]}>▣</Text>
            </View>
            <Text style={[styles.heading, { color: colors.text }]}>Choose a receipt photo</Text>
            <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
              Take a photo or choose one from your library. We’ll read the merchant, total, tax, tip, and line items.
            </Text>
          </>
        )}
        {busy && <ActivityIndicator color={colors.primary} style={{ marginTop: 24 }} />}
      </View>
      <View style={[styles.actions, { paddingBottom: insets.bottom + 18 }]}>
        {selectedAsset ? (
          <>
            <Pressable
              style={[styles.primaryButton, { backgroundColor: colors.primary, opacity: busy ? 0.6 : 1 }]}
              onPress={() => void confirmReceipt()}
              disabled={busy}
            >
              {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryButtonText}>Use photo</Text>}
            </Pressable>
            <View style={styles.secondaryActionsRow}>
              <Pressable
                style={[styles.secondaryButton, styles.secondaryActionButton, { borderColor: colors.border, opacity: busy ? 0.6 : 1 }]}
                onPress={() => void pickReceipt(true)}
                disabled={busy}
                accessibilityRole="button"
                accessibilityLabel="Retake receipt photo"
              >
                <Text style={[styles.secondaryButtonText, { color: colors.text }]}>Retake photo</Text>
              </Pressable>
              <Pressable
                style={[styles.secondaryButton, styles.secondaryActionButton, { borderColor: colors.border, opacity: busy ? 0.6 : 1 }]}
                onPress={() => void pickReceipt(false)}
                disabled={busy}
                accessibilityRole="button"
                accessibilityLabel="Choose a different receipt photo"
              >
                <Text style={[styles.secondaryButtonText, { color: colors.text }]}>Choose another</Text>
              </Pressable>
            </View>
          </>
        ) : (
          <>
            <Pressable
              style={[styles.primaryButton, { backgroundColor: colors.primary, opacity: busy ? 0.6 : 1 }]}
              onPress={() => void pickReceipt(true)}
              disabled={busy}
            >
              <Text style={styles.primaryButtonText}>Take photo</Text>
            </Pressable>
            <Pressable
              style={[styles.secondaryButton, { borderColor: colors.border, opacity: busy ? 0.6 : 1 }]}
              onPress={() => void pickReceipt(false)}
              disabled={busy}
            >
              <Text style={[styles.secondaryButtonText, { color: colors.text }]}>Choose from library</Text>
            </Pressable>
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: 20 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  close: { fontSize: 15, fontWeight: "600" },
  title: { fontSize: 18, fontWeight: "700" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 24 },
  scanIcon: { width: 92, height: 92, borderRadius: 28, alignItems: "center", justifyContent: "center" },
  scanIconText: { fontSize: 46, fontWeight: "300" },
  previewImage: { width: "100%", height: 300, borderRadius: 18, backgroundColor: "#101820" },
  heading: { fontSize: 24, fontWeight: "700", marginTop: 24, textAlign: "center" },
  subtitle: { fontSize: 15, lineHeight: 22, textAlign: "center", marginTop: 10, maxWidth: 320 },
  actions: { gap: 12 },
  secondaryActionsRow: { flexDirection: "row", gap: 10 },
  secondaryActionButton: { flex: 1 },
  primaryButton: { minHeight: 54, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  primaryButtonText: { color: "#fff", fontSize: 16, fontWeight: "700" },
  secondaryButton: { minHeight: 54, borderRadius: 16, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  secondaryButtonText: { fontSize: 16, fontWeight: "600" },
});