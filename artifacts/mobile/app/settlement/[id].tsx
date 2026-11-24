import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router, useLocalSearchParams } from "expo-router";
import React from "react";
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AmountText, formatAmount } from "@/components/AmountText";
import { Avatar } from "@/components/Avatar";
import { MemberProfileSheet } from "@/components/MemberProfileSheet";
import { useApp } from "@/context/AppContext";
import { showAlert } from "@/hooks/alertStore";
import { useTheme } from "@/hooks/useTheme";
import { formatDate } from "@/utils/format";

export default function SettlementDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const {
    settlements,
    getMemberById,
    getGroupById,
    currentUser,
    deleteSettlement,
  } = useApp();
  const [profileMemberId, setProfileMemberId] = React.useState<string | null>(null);

  const settlement = settlements.find(s => s.id === id);
  const topPad = insets.top;

  if (!settlement) {
    return (
      <View style={[styles.missing, { backgroundColor: colors.background }]}>
        <Feather name="alert-circle" size={28} color={colors.textTertiary} />
        <Text style={[styles.missingTitle, { color: colors.text }]}>Payment not found</Text>
        <Pressable onPress={() => router.back()}>
          <Text style={[styles.backLink, { color: colors.primary }]}>Go back</Text>
        </Pressable>
      </View>
    );
  }

  const from = getMemberById(settlement.fromId);
  const to = getMemberById(settlement.toId);
  const group = getGroupById(settlement.groupId);
  const fromLabel = settlement.fromId === currentUser.id ? "You" : from?.name ?? "Someone";
  const toLabel = settlement.toId === currentUser.id ? "you" : to?.name ?? "Someone";

  function removePayment() {
    showAlert(
      "Remove this payment?",
      "The outstanding balance between these members will be restored.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: () => {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
            deleteSettlement(id);
            router.back();
          },
        },
      ],
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topPad + 8, backgroundColor: colors.headerBg }]}>
        <Pressable style={styles.headerButton} onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Back">
          <Feather name="arrow-left" size={23} color={colors.text} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Payment</Text>
        <Pressable style={styles.headerButton} onPress={removePayment} accessibilityRole="button" accessibilityLabel="Delete">
          <Feather name="trash-2" size={20} color={colors.danger} />
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 32 }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.hero, { backgroundColor: colors.surface }]}>
          <View style={[styles.checkIcon, { borderColor: colors.success + "55" }]}>
            <Feather name="check" size={26} color={colors.success} />
          </View>
          <Text style={[styles.eyebrow, { color: colors.textSecondary }]}>PAYMENT RECORDED</Text>
          <AmountText
            amount={settlement.amount}
            currency={settlement.currency}
            style={[styles.amount, { color: colors.text }]}
          />
          <Text style={[styles.direction, { color: colors.textSecondary }]}>
            {fromLabel} paid {toLabel}
          </Text>
        </View>

        <View style={[styles.peopleCard, { backgroundColor: colors.surface }]}>
          <Pressable
            style={styles.person}
            onPress={() => setProfileMemberId(settlement.fromId)}
          >
            <Avatar
              name={from?.name ?? ""}
              color={from?.avatarColor ?? "#94A3B8"}
              imageUri={from?.photo}
              size={44}
            />
            <View style={styles.personText}>
              <Text style={[styles.personLabel, { color: colors.textTertiary }]}>PAID BY</Text>
              <Text style={[styles.personName, { color: colors.text }]}>{fromLabel}</Text>
            </View>
          </Pressable>

          <Feather name="arrow-right" size={18} color={colors.textTertiary} />

          <Pressable
            style={[styles.person, styles.personRight]}
            onPress={() => setProfileMemberId(settlement.toId)}
          >
            <View style={[styles.personText, { alignItems: "flex-end" }]}>
              <Text style={[styles.personLabel, { color: colors.textTertiary }]}>RECEIVED BY</Text>
              <Text style={[styles.personName, { color: colors.text }]}>{toLabel}</Text>
            </View>
            <Avatar
              name={to?.name ?? ""}
              color={to?.avatarColor ?? "#94A3B8"}
              imageUri={to?.photo}
              size={44}
            />
          </Pressable>
        </View>

        <View style={[styles.details, { backgroundColor: colors.surface }]}>
          <DetailRow label="Group" value={group?.name ?? "Unknown group"} colors={colors} />
          <View style={[styles.divider, { backgroundColor: colors.border }]} />
          <DetailRow label="Date" value={formatDate(settlement.createdAt)} colors={colors} />
          <View style={[styles.divider, { backgroundColor: colors.border }]} />
          <DetailRow label="Amount" value={formatAmount(settlement.amount, settlement.currency)} colors={colors} singleLine />
          <View style={[styles.divider, { backgroundColor: colors.border }]} />
          <DetailRow label="Currency" value={settlement.currency} colors={colors} />
          {!!settlement.note && (
            <>
              <View style={[styles.divider, { backgroundColor: colors.border }]} />
              <DetailRow label="Note" value={settlement.note} colors={colors} />
            </>
          )}
        </View>

      </ScrollView>

      <MemberProfileSheet
        memberId={profileMemberId}
        groupId={settlement.groupId}
        visible={profileMemberId !== null}
        onClose={() => setProfileMemberId(null)}
      />
    </View>
  );
}

function DetailRow({
  label,
  value,
  colors,
  singleLine = false,
}: {
  label: string;
  value: string;
  colors: any;
  singleLine?: boolean;
}) {
  return (
    <View style={styles.detailRow}>
      <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>{label}</Text>
      <Text
        style={[styles.detailValue, { color: colors.text }]}
        numberOfLines={singleLine ? 1 : 2}
        adjustsFontSizeToFit={singleLine}
        minimumFontScale={singleLine ? 0.75 : 1}
      >
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  missing: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
  missingTitle: { fontSize: 18, fontFamily: "Inter_600SemiBold" },
  backLink: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 14,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  headerButton: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  headerTitle: { fontSize: 18, fontFamily: "Inter_700Bold" },
  content: { padding: 16, gap: 14 },
  hero: {
    alignItems: "center",
    borderRadius: 20,
    padding: 28,
    gap: 9,
  },
  checkIcon: {
    width: 58,
    height: 58,
    borderRadius: 29,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
  },
  eyebrow: { fontSize: 10, fontFamily: "Inter_700Bold", letterSpacing: 1.2 },
  amount: { fontSize: 36, fontFamily: "Inter_700Bold", maxWidth: "100%", textAlign: "center" },
  direction: { fontSize: 14, fontFamily: "Inter_500Medium" },
  peopleCard: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 16,
    padding: 14,
    gap: 8,
  },
  person: { flex: 1, flexDirection: "row", alignItems: "center", gap: 10 },
  personRight: { justifyContent: "flex-end" },
  personText: { flexShrink: 1 },
  personLabel: { fontSize: 9, fontFamily: "Inter_700Bold", letterSpacing: 0.7 },
  personName: { fontSize: 14, fontFamily: "Inter_600SemiBold", marginTop: 2 },
  details: { borderRadius: 16, overflow: "hidden" },
  detailRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingVertical: 14,
    gap: 20,
  },
  detailLabel: { fontSize: 14, fontFamily: "Inter_400Regular" },
  detailValue: { flex: 1, fontSize: 14, fontFamily: "Inter_600SemiBold", textAlign: "right" },
  divider: { height: StyleSheet.hairlineWidth, marginHorizontal: 14 },
});