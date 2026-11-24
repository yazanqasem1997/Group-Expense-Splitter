import { Feather } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import React, { useMemo } from "react";
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AmountText } from "@/components/AmountText";
import { Avatar } from "@/components/Avatar";
import { CategoryIcon } from "@/components/CategoryIcon";
import {
  DirectPayment,
  Expense,
  Settlement,
  formatAmount as formatContextAmount,
  useApp,
} from "@/context/AppContext";
import { useTheme } from "@/hooks/useTheme";
import { formatDate } from "@/utils/format";

type DeletedType = "expense" | "settlement" | "direct_payment";

function parseSnapshot<T>(raw: string | string[] | undefined): T | null {
  if (!raw || Array.isArray(raw)) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function deletedDateLabel(value: string | string[] | undefined): string {
  const raw = Array.isArray(value) ? value[0] : value;
  if (!raw) return "Unknown date";
  return formatDate(raw);
}

export default function DeletedActivityDetailScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { type: rawType, snapshot: rawSnapshot, deletedAt, deletedById } =
    useLocalSearchParams<{ type?: string; snapshot?: string; deletedAt?: string; deletedById?: string }>();
  const type = rawType as DeletedType | undefined;
  const { getMemberById, getGroupById, currentUser } = useApp();

  const expense = useMemo(
    () => (type === "expense" ? parseSnapshot<Expense>(rawSnapshot) : null),
    [rawSnapshot, type],
  );
  const settlement = useMemo(
    () => (type === "settlement" ? parseSnapshot<Settlement>(rawSnapshot) : null),
    [rawSnapshot, type],
  );
  const directPayment = useMemo(
    () => (type === "direct_payment" ? parseSnapshot<DirectPayment>(rawSnapshot) : null),
    [rawSnapshot, type],
  );
  const topPad = insets.top;

  const memberLabel = (memberId: string) => {
    const member = getMemberById(memberId);
    return member?.isCurrentUser || memberId === currentUser.id ? "You" : member?.name ?? "Former member";
  };

  if (!expense && !settlement && !directPayment) {
    return (
      <View style={[styles.container, styles.missing, { backgroundColor: colors.background }]}>
        <Feather name="alert-circle" size={28} color={colors.textTertiary} />
        <Text style={[styles.missingTitle, { color: colors.text }]}>Deleted item unavailable</Text>
        <Pressable onPress={() => router.back()}>
          <Text style={[styles.backLink, { color: colors.primary }]}>Go back</Text>
        </Pressable>
      </View>
    );
  }

  const groupId = expense?.groupId ?? settlement?.groupId;
  const group = groupId ? getGroupById(groupId) : undefined;
  const amount = expense?.amount ?? settlement?.amount ?? directPayment?.amount ?? 0;
  const currency = expense?.currency ?? settlement?.currency ?? directPayment?.currency ?? "USD";
  const title = expense?.description ?? directPayment?.reason ?? "Payment";
  const isPayment = Boolean(settlement || directPayment);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topPad + 8, backgroundColor: colors.headerBg }]}>
        <Pressable style={styles.headerButton} onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Back">
          <Feather name="arrow-left" size={23} color={colors.text} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.text }]}>
          {isPayment ? "Deleted payment" : "Deleted expense"}
        </Text>
        <View style={styles.headerButton} />
      </View>

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 32 }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.hero, { backgroundColor: colors.surface }]}>
          {expense ? (
            <CategoryIcon category={expense.category} description={expense.description} size={56} />
          ) : (
            <View style={[styles.statusIcon, { borderColor: colors.danger + "55", backgroundColor: colors.dangerLight }]}>
              <Feather name="trash-2" size={26} color={colors.danger} />
            </View>
          )}
          <View style={[styles.deletedBadge, { backgroundColor: colors.dangerLight }]}>
            <Feather name="trash-2" size={12} color={colors.danger} />
            <Text style={[styles.deletedBadgeText, { color: colors.danger }]}>DELETED</Text>
          </View>
          <Text style={[styles.heroTitle, { color: colors.text }]}>{title}</Text>
          <AmountText amount={amount} currency={currency} style={[styles.amount, { color: colors.text }]} />
          <Text style={[styles.heroSub, { color: colors.textSecondary }]}>
            {expense
              ? `Paid by ${memberLabel(expense.paidById)}`
              : `${memberLabel(settlement?.fromId ?? directPayment!.fromId)} paid ${memberLabel(settlement?.toId ?? directPayment!.toId)}`}
          </Text>
        </View>

        {settlement && (
          <View style={[styles.peopleCard, { backgroundColor: colors.surface }]}>
            <Person memberId={settlement.fromId} label="PAID BY" memberLabel={memberLabel} colors={colors} getMemberById={getMemberById} />
            <Feather name="arrow-right" size={18} color={colors.textTertiary} />
            <Person memberId={settlement.toId} label="RECEIVED BY" alignRight memberLabel={memberLabel} colors={colors} getMemberById={getMemberById} />
          </View>
        )}

        <View style={[styles.details, { backgroundColor: colors.surface }]}>
          <DetailRow label="Status" value="Removed from the group" colors={colors} />
          <View style={[styles.divider, { backgroundColor: colors.border }]} />
          <DetailRow
            label="Deleted by"
            value={deletedById ? memberLabel(deletedById) : "Unknown"}
            colors={colors}
          />
          <View style={[styles.divider, { backgroundColor: colors.border }]} />
          {group && (
            <>
              <DetailRow label="Group" value={group.name} colors={colors} />
              <View style={[styles.divider, { backgroundColor: colors.border }]} />
            </>
          )}
          <DetailRow
            label={expense ? "Paid by" : "From"}
            value={expense ? memberLabel(expense.paidById) : memberLabel(settlement?.fromId ?? directPayment!.fromId)}
            colors={colors}
          />
          <View style={[styles.divider, { backgroundColor: colors.border }]} />
          <DetailRow
            label={expense ? "Split method" : "To"}
            value={expense ? expense.splitType : memberLabel(settlement?.toId ?? directPayment!.toId)}
            colors={colors}
          />
          <View style={[styles.divider, { backgroundColor: colors.border }]} />
          <DetailRow label="Deleted" value={deletedDateLabel(deletedAt)} colors={colors} />
          {(settlement?.note || directPayment?.comments || directPayment?.note) && (
            <>
              <View style={[styles.divider, { backgroundColor: colors.border }]} />
              <DetailRow
                label="Note"
                value={settlement?.note ?? directPayment?.comments ?? directPayment?.note ?? ""}
                colors={colors}
              />
            </>
          )}
        </View>

        {expense && (
          <>
            <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>Split Breakdown</Text>
            <View style={[styles.splits, { backgroundColor: colors.surface }]}>
              {expense.splits.map((split, index) => (
                <View
                  key={split.memberId}
                  style={[
                    styles.splitRow,
                    index < expense.splits.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
                  ]}
                >
                  <Text style={[styles.splitName, { color: colors.text }]}>
                    {memberLabel(split.memberId)}
                    {split.memberId === expense.paidById ? " (paid)" : ""}
                  </Text>
                  <Text style={[styles.splitAmount, { color: colors.textSecondary }]}>
                    {formatContextAmount(split.amount, expense.currency)}
                  </Text>
                </View>
              ))}
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
}

function Person({
  memberId,
  label,
  alignRight,
  memberLabel,
  colors,
  getMemberById,
}: {
  memberId: string;
  label: string;
  alignRight?: boolean;
  memberLabel: (id: string) => string;
  colors: any;
  getMemberById: (id: string) => any;
}) {
  const member = getMemberById(memberId);
  return (
    <View style={[styles.person, alignRight && styles.personRight]}>
      {!alignRight && <Avatar name={member?.name ?? ""} color={member?.avatarColor ?? "#94A3B8"} imageUri={member?.photo} size={44} />}
      <View style={[styles.personText, alignRight && { alignItems: "flex-end" }]}>
        <Text style={[styles.personLabel, { color: colors.textTertiary }]}>{label}</Text>
        <Text style={[styles.personName, { color: colors.text }]}>{memberLabel(memberId)}</Text>
      </View>
      {alignRight && <Avatar name={member?.name ?? ""} color={member?.avatarColor ?? "#94A3B8"} imageUri={member?.photo} size={44} />}
    </View>
  );
}

function DetailRow({ label, value, colors }: { label: string; value: string; colors: any }) {
  return (
    <View style={styles.detailRow}>
      <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>{label}</Text>
      <Text style={[styles.detailValue, { color: colors.text }]} numberOfLines={3}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  missing: { alignItems: "center", justifyContent: "center", gap: 12 },
  missingTitle: { fontSize: 18, fontFamily: "Inter_600SemiBold" },
  backLink: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 16, paddingBottom: 14,
    shadowColor: "#000", shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05, shadowRadius: 4, elevation: 2,
  },
  headerButton: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  headerTitle: { fontSize: 18, fontFamily: "Inter_700Bold" },
  content: { padding: 16, gap: 14 },
  hero: { alignItems: "center", borderRadius: 20, padding: 26, gap: 9 },
  statusIcon: {
    width: 58, height: 58, borderRadius: 29, borderWidth: 1.5,
    alignItems: "center", justifyContent: "center",
  },
  deletedBadge: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 9, paddingVertical: 5, borderRadius: 20 },
  deletedBadgeText: { fontSize: 10, fontFamily: "Inter_700Bold", letterSpacing: 1 },
  heroTitle: { fontSize: 20, fontFamily: "Inter_700Bold", textAlign: "center" },
  amount: { fontSize: 36, fontFamily: "Inter_700Bold" },
  heroSub: { fontSize: 14, fontFamily: "Inter_500Medium" },
  peopleCard: { flexDirection: "row", alignItems: "center", borderRadius: 16, padding: 14, gap: 8 },
  person: { flex: 1, flexDirection: "row", alignItems: "center", gap: 10 },
  personRight: { justifyContent: "flex-end" },
  personText: { flexShrink: 1 },
  personLabel: { fontSize: 9, fontFamily: "Inter_700Bold", letterSpacing: 0.7 },
  personName: { fontSize: 14, fontFamily: "Inter_600SemiBold", marginTop: 2 },
  details: { borderRadius: 16, overflow: "hidden" },
  detailRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 14, paddingVertical: 14, gap: 20 },
  detailLabel: { fontSize: 14, fontFamily: "Inter_400Regular" },
  detailValue: { flex: 1, fontSize: 14, fontFamily: "Inter_600SemiBold", textAlign: "right" },
  divider: { height: StyleSheet.hairlineWidth, marginHorizontal: 14 },
  sectionLabel: { fontSize: 12, fontFamily: "Inter_600SemiBold", textTransform: "uppercase", letterSpacing: 0.8, marginTop: 4 },
  splits: { borderRadius: 16, overflow: "hidden" },
  splitRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 14, paddingVertical: 14 },
  splitName: { fontSize: 15, fontFamily: "Inter_500Medium" },
  splitAmount: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
});