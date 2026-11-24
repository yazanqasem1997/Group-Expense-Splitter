import { Feather } from "@expo/vector-icons";
import { customFetch } from "@workspace/api-client-react";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { showAlert } from "@/hooks/alertStore";
import { useTheme } from "@/hooks/useTheme";

type Status = "pending" | "approved" | "planned" | "declined" | "done";
type Suggestion = {
  id: string;
  title: string;
  reason: string;
  change: string;
  status: string;
  note?: string | null;
  source?: string;
  createdAt: string;
};
type Review = { store: string; country: string; rating: number; title: string; text: string; author: string; date: string };
type ReviewSnapshot = { createdAt: string; summary: string; reviews: Review[] | null; sources: { appStore?: boolean; googlePlay?: boolean } | null };
type Crash = { message: string; n: number };
type Costs = { today: number; week: number; month: number; byFeature: { feature: string; today: number; week: number; month: number; calls: number }[] };
type WarRoom = {
  stats: { users: number; newUsers7d: number; scansThisMonth: number; crashes24h: number; invites30d: number; pending: number };
  report: {
    createdAt: string;
    briefing: string;
    emails: { from: string; subject: string; date: string; preview?: string }[] | null;
    stats: { inboxConnected?: boolean } | null;
  } | null;
  crashes: Crash[];
  suggestions: Suggestion[];
  reviews: ReviewSnapshot | null;
  costs?: Costs | null;
};

const TABS = [
  { key: "pending", label: "To decide" },
  { key: "planned", label: "Planned" },
  { key: "approved", label: "Approved" },
  { key: "done", label: "Done" },
] as const;
const STATUS_LABEL: Record<string, string> = { pending: "To decide", approved: "Approved", planned: "Planned", declined: "Dismissed", done: "Built" };
const FEATURE_LABEL: Record<string, string> = { receipts: "Receipt scans", digest: "Morning briefing", reviews: "Store reviews" };
const WARN = "#C27803";

const usd = (n: number) => (n > 0 && n < 0.01 ? "<$0.01" : "$" + n.toFixed(2));
const shortDate = (s: string) => new Date(s).toLocaleDateString(undefined, { day: "numeric", month: "short" });

/** The owner's war room: a few numbers, the issues to decide, and the details one tap away. */
export default function WarRoomScreen() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const [data, setData] = useState<WarRoom | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState<"" | "inbox" | "reviews" | "link">("");
  const [tab, setTab] = useState<(typeof TABS)[number]["key"]>("pending");
  const [open, setOpen] = useState<Suggestion | null>(null);
  const [note, setNote] = useState("");
  const [section, setSection] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setData(await customFetch<WarRoom>("/api/owner/war-room"));
      setError(null);
    } catch (e) {
      setError((e as { status?: number })?.status === 403 ? "This screen is only for the app owner." : "Couldn't load. Pull to try again.");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function pullToRefresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  async function run(kind: "inbox" | "reviews") {
    if (busy) return;
    setBusy(kind);
    try {
      if (kind === "inbox") {
        await customFetch("/api/owner/refresh", { method: "POST" });
      } else {
        const r = await customFetch<{ sources: { appStore: boolean } }>("/api/owner/reviews", { method: "POST" });
        if (!r.sources.appStore) showAlert("Not connected yet", "Store reviews start after launch, once APP_STORE_ID is set in Replit.");
      }
      await load();
    } catch {
      showAlert("Couldn't refresh", "Please try again in a minute.");
    } finally {
      setBusy("");
    }
  }

  async function openOnComputer() {
    if (busy) return;
    setBusy("link");
    try {
      const { url } = await customFetch<{ url: string }>("/api/owner/dashboard-link", { method: "POST" });
      await Share.share({ message: url });
    } catch (e) {
      showAlert("Couldn't make the link", (e as { message?: string })?.message ?? "Please try again.");
    } finally {
      setBusy("");
    }
  }

  function show(item: Suggestion) {
    void Haptics.selectionAsync();
    setNote(item.note ?? "");
    setOpen(item);
  }

  async function decide(item: Suggestion, status: Status) {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setOpen(null);
    setData((prev) => prev && { ...prev, suggestions: prev.suggestions.map((s) => (s.id === item.id ? { ...s, status, note } : s)) });
    try {
      await customFetch("/api/owner/suggestions/" + item.id, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, note }),
      });
      void load();
    } catch {
      showAlert("Couldn't save that", "Please try again.");
      void load();
    }
  }

  const all = data?.suggestions ?? [];
  const counts = all.reduce<Record<string, number>>((acc, s) => ({ ...acc, [s.status]: (acc[s.status] ?? 0) + 1 }), {});
  const list = all.filter((s) => s.status === tab);
  const updated = data?.report
    ? new Date(data.report.createdAt).toLocaleString(undefined, { weekday: "short", hour: "2-digit", minute: "2-digit" })
    : null;
  const reviewList = data?.reviews?.reviews ?? [];
  const avg = reviewList.length ? (reviewList.reduce((sum, r) => sum + r.rating, 0) / reviewList.length).toFixed(1) : null;
  const emails = data?.report?.emails ?? [];

  const card = { backgroundColor: colors.cardBg, borderColor: colors.border };
  const toggle = (key: string) => setSection((s) => (s === key ? null : key));

  function Row({ id, icon, label, value, alert, children }: { id: string; icon: React.ComponentProps<typeof Feather>["name"]; label: string; value: string; alert?: boolean; children: React.ReactNode }) {
    const on = section === id;
    return (
      <View style={[styles.rowWrap, { borderColor: colors.border }]}>
        <Pressable onPress={() => toggle(id)} style={({ pressed }) => [styles.row, { opacity: pressed ? 0.6 : 1 }]} accessibilityRole="button" accessibilityState={{ expanded: on }}>
          <Feather name={icon} size={17} color={alert ? WARN : colors.textSecondary} />
          <Text style={[styles.rowLabel, { color: colors.text }]}>{label}</Text>
          <Text style={[styles.rowValue, { color: alert ? WARN : colors.textSecondary }]} numberOfLines={1}>{value}</Text>
          <Feather name={on ? "chevron-up" : "chevron-down"} size={17} color={colors.textSecondary} />
        </Pressable>
        {on ? <View style={styles.rowBody}>{children}</View> : null}
      </View>
    );
  }

  return (
    <View style={[styles.fill, { backgroundColor: colors.background }]}>
      <View style={[styles.top, { paddingTop: insets.top + 8 }]}>
        <Pressable onPress={() => router.back()} hitSlop={12} accessibilityRole="button" accessibilityLabel="Back">
          <Feather name="chevron-left" size={26} color={colors.text} />
        </Pressable>
        <View style={styles.topActions}>
          <Pressable onPress={openOnComputer} hitSlop={10} accessibilityRole="button" accessibilityLabel="Use on computer" disabled={!!busy}>
            {busy === "link" ? <ActivityIndicator color={colors.primary} /> : <Feather name="monitor" size={20} color={colors.text} />}
          </Pressable>
          <Pressable onPress={() => run("inbox")} hitSlop={10} accessibilityRole="button" accessibilityLabel="Read inbox now" disabled={!!busy}>
            {busy === "inbox" ? <ActivityIndicator color={colors.primary} /> : <Feather name="refresh-cw" size={19} color={colors.text} />}
          </Pressable>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: insets.bottom + 40 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={pullToRefresh} tintColor={colors.primary} />}
      >
        <Text style={[styles.title, { color: colors.text }]}>War room</Text>
        <Text style={[styles.sub, { color: colors.textSecondary }]}>{updated ? "Updated " + updated : "No briefing yet"}</Text>

        {error ? (
          <Text style={[styles.empty, { color: colors.textSecondary }]}>{error}</Text>
        ) : !data ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
        ) : (
          <>
            <View style={[styles.stats, card]}>
              {[
                { label: "Users", value: String(data.stats.users) },
                { label: "New, 7 d", value: String(data.stats.newUsers7d) },
                { label: "Crashes", value: String(data.stats.crashes24h), alert: data.stats.crashes24h > 0 },
                { label: "AI, 30 d", value: data.costs ? usd(data.costs.month) : "–" },
              ].map((s, i) => (
                <View key={s.label} style={[styles.stat, i > 0 && { borderLeftWidth: StyleSheet.hairlineWidth, borderColor: colors.border }]}>
                  <Text style={[styles.statValue, { color: s.alert ? WARN : colors.text }]}>{s.value}</Text>
                  <Text style={[styles.statLabel, { color: colors.textSecondary }]}>{s.label}</Text>
                </View>
              ))}
            </View>

            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabs}>
              {TABS.map((t) => {
                const on = tab === t.key;
                const n = counts[t.key] ?? 0;
                return (
                  <Pressable
                    key={t.key}
                    onPress={() => setTab(t.key)}
                    style={[styles.tab, { backgroundColor: on ? colors.text : "transparent" }]}
                    accessibilityRole="tab"
                    accessibilityState={{ selected: on }}
                  >
                    <Text style={[styles.tabText, { color: on ? colors.background : colors.textSecondary }]}>
                      {t.label}
                      {n ? "  " + n : ""}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>

            {list.length === 0 ? (
              <Text style={[styles.empty, { color: colors.textSecondary }]}>{tab === "pending" ? "Nothing to decide." : "Nothing here."}</Text>
            ) : (
              <View style={styles.issues}>
                {list.map((s) => (
                  <Pressable key={s.id} onPress={() => show(s)} style={({ pressed }) => [styles.issue, card, { transform: [{ scale: pressed ? 0.98 : 1 }] }]} accessibilityRole="button">
                    <View style={{ flex: 1, gap: 3 }}>
                      <Text style={[styles.issueTitle, { color: colors.text }]} numberOfLines={1}>{s.title}</Text>
                      <Text style={[styles.issueDo, { color: colors.textSecondary }]} numberOfLines={1}>{s.change}</Text>
                    </View>
                    <Feather name="chevron-right" size={18} color={colors.textSecondary} />
                  </Pressable>
                ))}
              </View>
            )}

            <View style={styles.more}>
              <Row id="cost" icon="dollar-sign" label="AI cost" value={data.costs ? usd(data.costs.today) + " today" : "–"}>
                {data.costs && data.costs.byFeature.length ? (
                  <>
                    {[{ feature: "Total", today: data.costs.today, week: data.costs.week, month: data.costs.month }, ...data.costs.byFeature].map((f) => (
                      <View key={f.feature} style={styles.costRow}>
                        <Text style={[styles.costName, { color: colors.text, fontWeight: f.feature === "Total" ? "700" : "500" }]}>{FEATURE_LABEL[f.feature] ?? f.feature}</Text>
                        <Text style={[styles.costNum, { color: colors.textSecondary }]}>{usd(f.week)} · 7 d</Text>
                        <Text style={[styles.costNum, { color: colors.text }]}>{usd(f.month)}</Text>
                      </View>
                    ))}
                  </>
                ) : (
                  <Text style={[styles.body, { color: colors.textSecondary }]}>No AI calls recorded yet.</Text>
                )}
              </Row>
              {data.report?.briefing ? (
                <Row id="brief" icon="sunrise" label="Briefing" value={updated ?? ""}>
                  <Text style={[styles.body, { color: colors.text }]}>{data.report.briefing}</Text>
                </Row>
              ) : null}
              <Row id="reviews" icon="star" label="Reviews" value={avg ? "★ " + avg : "–"}>
                <Text style={[styles.body, { color: colors.textSecondary }]}>
                  {!data.reviews?.sources?.appStore ? "Starts after launch." : data.reviews.summary || "No reviews yet."}
                </Text>
                <Pressable onPress={() => run("reviews")} disabled={!!busy} hitSlop={8}>
                  <Text style={[styles.link, { color: colors.primary }]}>{busy === "reviews" ? "Reading…" : "Read reviews now"}</Text>
                </Pressable>
              </Row>
              <Row id="inbox" icon="inbox" label="Inbox" value={data.report?.stats?.inboxConnected === false ? "Off" : emails.length + " new"}>
                {emails.length === 0 ? (
                  <Text style={[styles.body, { color: colors.textSecondary }]}>No new emails.</Text>
                ) : (
                  emails.map((e, i) => (
                    <Text key={i} style={[styles.body, { color: colors.text }]} numberOfLines={1}>{e.subject}</Text>
                  ))
                )}
              </Row>
              <Row id="crashes" icon="alert-triangle" label="Crashes" value={data.stats.crashes24h + " today"} alert={data.stats.crashes24h > 0}>
                {data.crashes.length === 0 ? (
                  <Text style={[styles.body, { color: colors.textSecondary }]}>None in 24 hours.</Text>
                ) : (
                  data.crashes.map((c, i) => (
                    <Text key={i} style={[styles.body, { color: colors.text }]} numberOfLines={2}>{c.n}× {c.message}</Text>
                  ))
                )}
              </Row>
            </View>
          </>
        )}
      </ScrollView>

      <Modal visible={!!open} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setOpen(null)}>
        {open ? (
          <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={[styles.fill, { backgroundColor: colors.background }]}>
            <ScrollView contentContainerStyle={styles.sheet} keyboardShouldPersistTaps="handled">
              <View style={styles.sheetTop}>
                <Text style={[styles.meta, { color: colors.textSecondary }]}>
                  {(open.source === "reviews" ? "Store reviews" : "Support and crashes") + " · " + shortDate(open.createdAt)}
                </Text>
                <Pressable onPress={() => setOpen(null)} hitSlop={12} accessibilityRole="button" accessibilityLabel="Close">
                  <Feather name="x" size={22} color={colors.textSecondary} />
                </Pressable>
              </View>
              <Text style={[styles.sheetTitle, { color: colors.text }]}>{open.title}</Text>

              <Text style={[styles.label, { color: colors.textSecondary }]}>What we should do</Text>
              <Text style={[styles.sheetDo, { color: colors.text }]}>{open.change}</Text>

              {open.reason ? (
                <>
                  <Text style={[styles.label, { color: colors.textSecondary }]}>Why</Text>
                  <Text style={[styles.body, { color: colors.textSecondary }]}>{open.reason}</Text>
                </>
              ) : null}

              <TextInput
                value={note}
                onChangeText={setNote}
                placeholder="Add a note (optional)"
                placeholderTextColor={colors.textSecondary}
                multiline
                style={[styles.note, { color: colors.text, borderColor: colors.border, backgroundColor: colors.cardBg }]}
              />

              {open.status === "pending" ? (
                <View style={styles.sheetActions}>
                  <Pressable onPress={() => decide(open, "approved")} style={[styles.btn, { backgroundColor: colors.primary }]} accessibilityRole="button">
                    <Text style={[styles.btnText, { color: "#FFFFFF" }]}>Approve</Text>
                  </Pressable>
                  <Pressable onPress={() => decide(open, "planned")} style={[styles.btn, { borderWidth: 1, borderColor: colors.border }]} accessibilityRole="button">
                    <Text style={[styles.btnText, { color: colors.text }]}>Plan for later</Text>
                  </Pressable>
                  <Pressable onPress={() => decide(open, "declined")} style={styles.btn} accessibilityRole="button">
                    <Text style={[styles.btnText, { color: colors.textSecondary }]}>Dismiss</Text>
                  </Pressable>
                </View>
              ) : (
                <View style={styles.sheetActions}>
                  <Text style={[styles.meta, { color: colors.textSecondary, textAlign: "center" }]}>{STATUS_LABEL[open.status] ?? open.status}</Text>
                  {open.status === "approved" || open.status === "planned" ? (
                    <Pressable onPress={() => decide(open, "done")} style={[styles.btn, { backgroundColor: colors.primary }]} accessibilityRole="button">
                      <Text style={[styles.btnText, { color: "#FFFFFF" }]}>Mark as built</Text>
                    </Pressable>
                  ) : null}
                  <Pressable onPress={() => decide(open, open.status as Status)} style={[styles.btn, { borderWidth: 1, borderColor: colors.border }]} accessibilityRole="button">
                    <Text style={[styles.btnText, { color: colors.text }]}>Save note</Text>
                  </Pressable>
                  <Pressable onPress={() => decide(open, "pending")} style={styles.btn} accessibilityRole="button">
                    <Text style={[styles.btnText, { color: colors.textSecondary }]}>Move back to To decide</Text>
                  </Pressable>
                </View>
              )}
            </ScrollView>
          </KeyboardAvoidingView>
        ) : null}
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  top: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingBottom: 4 },
  topActions: { flexDirection: "row", alignItems: "center", gap: 22 },
  title: { fontSize: 32, fontWeight: "800", letterSpacing: -0.5, marginTop: 4 },
  sub: { fontSize: 13, marginTop: 2 },
  stats: { flexDirection: "row", borderWidth: StyleSheet.hairlineWidth, borderRadius: 16, marginTop: 20, paddingVertical: 12 },
  stat: { flex: 1, alignItems: "center", gap: 2 },
  statValue: { fontSize: 19, fontWeight: "700", fontVariant: ["tabular-nums"] },
  statLabel: { fontSize: 11.5 },
  tabs: { gap: 6, paddingVertical: 20 },
  tab: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 99 },
  tabText: { fontSize: 14, fontWeight: "600" },
  issues: { gap: 8 },
  issue: { flexDirection: "row", alignItems: "center", gap: 10, borderWidth: StyleSheet.hairlineWidth, borderRadius: 16, paddingVertical: 14, paddingHorizontal: 16 },
  issueTitle: { fontSize: 16, fontWeight: "600" },
  issueDo: { fontSize: 14 },
  empty: { fontSize: 15, textAlign: "center", marginVertical: 28 },
  more: { marginTop: 28 },
  rowWrap: { borderTopWidth: StyleSheet.hairlineWidth },
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 15 },
  rowLabel: { fontSize: 16, flex: 1 },
  rowValue: { fontSize: 15, maxWidth: "45%", fontVariant: ["tabular-nums"] },
  rowBody: { paddingBottom: 16, paddingLeft: 29, gap: 8 },
  body: { fontSize: 14.5, lineHeight: 21 },
  link: { fontSize: 14.5, fontWeight: "600", marginTop: 2 },
  costRow: { flexDirection: "row", alignItems: "baseline", gap: 10 },
  costName: { fontSize: 14.5, flex: 1 },
  costNum: { fontSize: 14, fontVariant: ["tabular-nums"] },
  sheet: { padding: 24, paddingBottom: 48, gap: 6 },
  sheetTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 },
  meta: { fontSize: 13 },
  sheetTitle: { fontSize: 24, fontWeight: "800", letterSpacing: -0.3, marginBottom: 14 },
  label: { fontSize: 13, fontWeight: "600", marginTop: 12 },
  sheetDo: { fontSize: 17, lineHeight: 24 },
  note: { borderWidth: 1, borderRadius: 12, padding: 12, minHeight: 64, fontSize: 15, marginTop: 20, textAlignVertical: "top" },
  sheetActions: { gap: 8, marginTop: 20 },
  btn: { alignItems: "center", justifyContent: "center", paddingVertical: 14, borderRadius: 14 },
  btnText: { fontSize: 16, fontWeight: "700" },
});
