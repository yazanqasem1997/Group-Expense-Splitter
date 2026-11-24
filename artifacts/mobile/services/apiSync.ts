/**
 * apiSync.ts
 *
 * Focused API service that bridges the production backend (via the generated
 * `@workspace/api-client-react` client) and the app-local domain types used by
 * `AppContext`. It keeps `AppContext` manageable by centralizing:
 *
 *   1. Server DTO → app-type mappers (bootstrap, expense, settlement, …).
 *   2. App-type → server input builders (create/update payloads).
 *   3. Idempotency-key generation for every financially mutating write.
 *   4. User-safe error extraction so screens can surface friendly messages.
 *
 * The auth bearer token is attached by the shared client's `setAuthTokenGetter`
 * wiring (see components/AuthBridge.tsx); this module never reads or logs it.
 *
 * Member identity model: the backend scopes members per group via `memberKey`,
 * while the app uses a single global `Member.id`. We use `memberKey` as the
 * app-side member id so `paidById` / `memberId` / `fromId` / `toId` line up
 * with what the server stores. The current user is identified by matching a
 * group member's `userId` to the authenticated `/me` user id.
 */

import { customFetch } from "@workspace/api-client-react";
import {
  bootstrap as apiBootstrap,
  createExpense as apiCreateExpense,
  updateExpense as apiUpdateExpense,
  deleteExpense as apiDeleteExpense,
  addExpenseComment as apiAddExpenseComment,
  createSettlement as apiCreateSettlement,
  deleteSettlement as apiDeleteSettlement,
  createGroup as apiCreateGroup,
  updateGroup as apiUpdateGroup,
  deleteGroup as apiDeleteGroup,
  addGroupMember as apiAddGroupMember,
  updateGroupMember as apiUpdateGroupMember,
  removeGroupMember as apiRemoveGroupMember,
  createGroupMessage as apiCreateGroupMessage,
  listGroupMessages as apiListGroupMessages,
  listGroupMessageReads as apiListGroupMessageReads,
  markGroupMessagesRead as apiMarkGroupMessagesRead,
  createRecurring as apiCreateRecurring,
  updateRecurring as apiUpdateRecurring,
  deleteRecurring as apiDeleteRecurring,
  runRecurring as apiRunRecurring,
  createGroupInvitation as apiCreateGroupInvitation,
  createGroupJoinLink as apiCreateGroupJoinLink,
  refreshGroupJoinLink as apiRefreshGroupJoinLink,
  previewGroupJoin as apiPreviewGroupJoin,
  acceptGroupJoin as apiAcceptGroupJoin,
  sendAppInvitation as apiSendAppInvitation,
  matchContacts as apiMatchContacts,
  listFriendRequests as apiListFriendRequests,
  sendFriendRequest as apiSendFriendRequest,
  createFriendQr as apiCreateFriendQr,
  previewFriendQr as apiPreviewFriendQr,
  sendFriendRequestWithQr as apiSendFriendRequestWithQr,
  acceptFriendRequest as apiAcceptFriendRequest,
  declineFriendRequest as apiDeclineFriendRequest,
  requestProfilePhotoUploadUrl as apiRequestProfilePhotoUploadUrl,
  completeProfilePhotoUpload as apiCompleteProfilePhotoUpload,
  acceptInvitation as apiAcceptInvitation,
  declineInvitation as apiDeclineInvitation,
  markAllNotificationsRead as apiMarkAllNotificationsRead,
  markNotificationRead as apiMarkNotificationRead,
  sendGroupReminder as apiSendGroupReminder,
  importSnapshot as apiImportSnapshot,
  updateCurrentUser as apiUpdateCurrentUser,
  deleteCurrentUser as apiDeleteCurrentUser,
  createReceiptUploadUrl as apiCreateReceiptUploadUrl,
  createReceipt as apiCreateReceipt,
  getReceipt as apiGetReceipt,
  updateReceipt as apiUpdateReceipt,
  updateReceiptItem as apiUpdateReceiptItem,
  addReceiptItem as apiAddReceiptItem,
  deleteReceiptItem as apiDeleteReceiptItem,
  toggleReceiptClaim as apiToggleReceiptClaim,
} from "@workspace/api-client-react";
import type {
  Bootstrap as ServerBootstrap,
  Expense as ServerExpense,
  ExpenseInput,
  ExpenseUpdate,
  Group as ServerGroup,
  GroupInput,
  GroupMember as ServerGroupMember,
  GroupMemberInput,
  GroupMessage as ServerGroupMessage,
  GroupInvitation as ServerGroupInvitation,
  ImportGroup,
  ImportInput,
  Notification as ServerNotification,
  RecurringExpense as ServerRecurring,
  RecurringInput,
  RecurringUpdate,
  Settlement as ServerSettlement,
  SplitDetail as ServerSplitDetail,
  User as ServerUser,
  UserUpdate,
  Receipt as ServerReceipt,
} from "@workspace/api-client-react";

import type {
  AppNotification,
  Expense,
  Group,
  GroupInvitation,
  GroupMessage,
  Member,
  NotifPrefs,
  RecurringExpense,
  Settlement,
  SplitDetail,
  SplitType,
} from "@/context/AppContext";

export type Receipt = ServerReceipt;

type ServerRecurringWithTimeZone = ServerRecurring & { timeZone?: string | null };
type RecurringUpdateWithTimeZone = RecurringUpdate & { timeZone?: string };

// ── Idempotency ─────────────────────────────────────────────────────────────

/** Generate a replay-safe key for a mutating request (matches app genId style). */
export function newIdempotencyKey(): string {
  return `mob_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 11)}`;
}

function idemHeaders(key?: string): RequestInit {
  return { headers: { "Idempotency-Key": key ?? newIdempotencyKey() } };
}

// ── Error handling ───────────────────────────────────────────────────────────

/**
 * Extract a short, user-safe message from any thrown error. Never leaks tokens,
 * stack traces, or raw server payloads beyond the `error` field.
 */
export function toUserMessage(err: unknown, fallback = "Something went wrong. Please try again."): string {
  if (
    typeof err === "object" &&
    err !== null &&
    "status" in err &&
    typeof err.status === "number"
  ) {
    const apiError = err as { status: number; data?: unknown };
    const data = apiError.data as { error?: string } | null;
    if (apiError.status === 401) {
      const serverMessage = data?.error?.trim();
      return serverMessage && serverMessage.toLowerCase() !== "unauthorized"
        ? serverMessage
        : "Your session expired. Please sign in again.";
    }
    if (data && typeof data.error === "string" && data.error.trim()) {
      // Common statuses get friendlier phrasing.
      if (apiError.status === 403) return "You don't have permission to do that.";
      if (apiError.status === 404) return "That item no longer exists.";
      return data.error;
    }
    if (apiError.status === 403) return "You don't have permission to do that.";
    if (apiError.status === 404) return "That item no longer exists.";
    return fallback;
  }
  if (err instanceof Error && err.message) {
    // Network / offline errors surface a generic connectivity message.
    return "Couldn't reach the server. Check your connection and try again.";
  }
  return fallback;
}

// ── Split mapping ────────────────────────────────────────────────────────────

/**
 * Map a server split to an app split. The `groupKeyToAppId` map (built during
 * bootstrap) resolves group-scoped memberKeys back to stable app-side Member.id
 * values. Falls back to the raw memberKey when no mapping is available (e.g.
 * for optimistically-created splits before the first server refresh).
 */
function mapSplitToApp(
  s: ServerSplitDetail,
  groupKeyToAppId?: Map<string, string>,
  groupId?: string,
): SplitDetail {
  const appId =
    groupId && groupKeyToAppId
      ? (groupKeyToAppId.get(`${groupId}:${s.memberKey}`) ?? s.memberKey)
      : s.memberKey;
  return {
    memberId: appId,
    amount: s.amount,
    ...(s.percentage != null ? { percentage: s.percentage } : {}),
    ...(s.paid != null ? { paid: s.paid } : {}),
  };
}

/**
 * Map an app split back to a server split. The `memberKeyMap` (stored in
 * AppContext) resolves a stable Member.id to the group-scoped memberKey the
 * server expects. Falls back to `memberId` as-is when no mapping exists (the
 * memberId is already the memberKey for guests).
 */
function mapSplitToServer(
  s: SplitDetail,
  memberKeyMap?: Record<string, Record<string, string>>,
  groupId?: string,
): ServerSplitDetail {
  const memberKey =
    groupId && memberKeyMap
      ? (memberKeyMap[s.memberId]?.[groupId] ?? s.memberId)
      : s.memberId;
  return {
    memberKey,
    amount: s.amount,
    ...(s.percentage != null ? { percentage: s.percentage } : {}),
    ...(s.paid != null ? { paid: s.paid } : {}),
  };
}

// ── Server → App mappers ─────────────────────────────────────────────────────

export interface MappedBootstrap {
  currentUser: Member;
  currentUserId: string;
  members: Member[];
  groups: Group[];
  expenses: Expense[];
  settlements: Settlement[];
  recurringExpenses: RecurringExpense[];
  invitations: GroupInvitation[];
  notifications: AppNotification[];
  groupMessages: GroupMessage[];
  defaultCurrency: string;
  notifPrefs: NotifPrefs | null;
  /**
   * Reverse-lookup map: appMemberId → groupId → serverMemberKey.
   *
   * Because `memberKey` is scoped to a group, but `Member.id` is a stable
   * app-wide id (userId for registered users, memberKey for guests), every
   * financially-mutating API payload must resolve the correct serverMemberKey
   * for the group the operation belongs to.
   */
  memberKeyMap: Record<string, Record<string, string>>;
}

/**
 * Stable app-side id for a group member row.
 *
 * - Registered users (have a userId): use userId so the same person is
 *   represented by one Member across all groups.
 * - Guest / placeholder members (no userId): use memberKey which is already
 *   group-scoped and the only stable identity we have for them.
 */
function stableAppId(m: ServerGroupMember): string {
  return m.userId ?? m.memberKey;
}

function mapMember(m: ServerGroupMember, currentUserId: string | null): Member {
  return {
    id: stableAppId(m),
    name: m.name,
    ...(m.email ? { email: m.email } : {}),
    ...(m.phone ? { phone: m.phone } : {}),
    avatarColor: m.avatarColor,
    ...(m.photo ? { photo: m.photo } : {}),
    ...(m.joinedAt ? { joinedAt: m.joinedAt } : {}),
    ...(m.userId ? { userId: m.userId } : {}),
    ...(m.userId && currentUserId && m.userId === currentUserId ? { isCurrentUser: true } : {}),
    ...(m.isPending ? { isPending: true } : {}),
  };
}

function mapGroup(g: ServerGroup, membersByGroup: Map<string, ServerGroupMember[]>): Group {
  const gm = membersByGroup.get(g.id) ?? [];
  const customItemizations = (g.customItemizations ?? []) as Group["customItemizations"];
  return {
    id: g.id,
    name: g.name,
    emoji: g.emoji,
    // Use stable app-side ids (userId for registered users, memberKey for guests)
    // so memberIds align with Member.id in the global member list.
    // Removed members stay on the server for history but aren't in the group.
    memberIds: gm.filter(m => !(m as { leftAt?: string | null }).leftAt).map(stableAppId),
    currency: g.currency,
    createdAt: g.createdAt,
    type: (g.type as Group["type"]) ?? "other",
    ...(g.simplifyDebtsEnabled !== undefined ? { simplifyDebtsEnabled: g.simplifyDebtsEnabled } : {}),
    ...(g.isArchived ? { isArchived: true } : {}),
    ...(g.archivedAt ? { archivedAt: g.archivedAt } : {}),
    ...(g.isEnded ? { isEnded: true } : {}),
    ...(g.endedAt ? { endedAt: g.endedAt } : {}),
    adminIds: gm.filter((m) => m.isAdmin).map(stableAppId),
    ...(g.reminderDays != null ? { reminderDays: g.reminderDays } : {}),
    ...(g.startDate ? { startDate: g.startDate } : {}),
    ...(g.endDate ? { endDate: g.endDate } : {}),
    ...(g.tripStartReminderDays != null ? { tripStartReminderDays: g.tripStartReminderDays } : {}),
    ...(g.settleUpReminderDays != null ? { settleUpReminderDays: g.settleUpReminderDays } : {}),
    ...(customItemizations?.length ? { customItemizations } : {}),
    ...(g.reminderChannel ? { reminderChannel: g.reminderChannel as Group["reminderChannel"] } : {}),
  };
}

function mapExpense(
  e: ServerExpense,
  groupKeyToAppId?: Map<string, string>,
): Expense {
  const resolveId = (memberKey: string) =>
    groupKeyToAppId
      ? (groupKeyToAppId.get(`${e.groupId}:${memberKey}`) ?? memberKey)
      : memberKey;
  return {
    id: e.id,
    groupId: e.groupId,
    description: e.description,
    amount: e.amount,
    currency: e.currency,
    paidById: resolveId(e.paidByMemberKey),
    splitType: e.splitType as SplitType,
    splits: (e.splits ?? []).map((s) => mapSplitToApp(s, groupKeyToAppId, e.groupId)),
    createdAt: e.createdAt,
    category: e.category,
    ...(e.paymentDate ? { paymentDate: e.paymentDate } : {}),
    ...(e.fxRate != null && e.fxRateCurrency ? { fxRate: e.fxRate, fxRateCurrency: e.fxRateCurrency } : {}),
    ...(e.categoryBreakdown ? { categoryBreakdown: e.categoryBreakdown as Record<string, number> } : {}),
    ...(e.receiptId ? { receiptId: e.receiptId } : {}),
    ...(e.notes ? { notes: e.notes } : {}),
    ...(e.addedByUserId ? { addedBy: e.addedByUserId } : {}),
    ...(e.comments
      ? {
          comments: e.comments.map((c) => ({
            id: c.id,
            memberId: resolveId(c.memberKey),
            text: c.text,
            createdAt: c.createdAt,
          })),
        }
      : {}),
    ...(e.reactions ? { reactions: e.reactions as Record<string, string[]> } : {}),
  };
}

function mapSettlement(
  s: ServerSettlement,
  groupKeyToAppId?: Map<string, string>,
): Settlement {
  const resolveId = (memberKey: string) =>
    groupKeyToAppId
      ? (groupKeyToAppId.get(`${s.groupId}:${memberKey}`) ?? memberKey)
      : memberKey;
  return {
    id: s.id,
    groupId: s.groupId,
    fromId: resolveId(s.fromMemberKey),
    toId: resolveId(s.toMemberKey),
    amount: s.amount,
    currency: s.currency,
    createdAt: s.createdAt,
    ...(s.note ? { note: s.note } : {}),
    ...(s.fxRate != null && s.fxRateCurrency ? { fxRate: s.fxRate, fxRateCurrency: s.fxRateCurrency } : {}),
  };
}

function mapRecurring(
  r: ServerRecurringWithTimeZone,
  groupKeyToAppId?: Map<string, string>,
): RecurringExpense {
  const resolveId = (memberKey: string) =>
    groupKeyToAppId
      ? (groupKeyToAppId.get(`${r.groupId}:${memberKey}`) ?? memberKey)
      : memberKey;
  return {
    id: r.id,
    groupId: r.groupId,
    description: r.description,
    amount: r.amount,
    currency: r.currency,
    paidById: resolveId(r.paidByMemberKey),
    splitType: r.splitType as SplitType,
    splits: (r.splits ?? []).map((s) => mapSplitToApp(s, groupKeyToAppId, r.groupId)),
    category: r.category,
    frequency: r.frequency as RecurringExpense["frequency"],
    ...(r.customDays != null ? { customDays: r.customDays } : {}),
    ...(r.intervalMonths != null ? { intervalMonths: r.intervalMonths } : {}),
    ...(r.intervalWeeks != null ? { intervalWeeks: r.intervalWeeks } : {}),
    ...(r.intervalDays != null ? { intervalDays: r.intervalDays } : {}),
    ...(r.dayOfWeek != null ? { dayOfWeek: r.dayOfWeek } : {}),
    ...(r.timeOfDay ? { timeOfDay: r.timeOfDay } : {}),
    ...(r.timeZone ? { timeZone: r.timeZone } : {}),
    ...(r.endType ? { endType: r.endType as RecurringExpense["endType"] } : {}),
    ...(r.endCount != null ? { endCount: r.endCount } : {}),
    ...(r.endDate ? { endDate: r.endDate } : {}),
    occurrenceCount: r.occurrenceCount,
    nextDueAt: r.nextDueAt,
    isActive: r.isActive,
    createdAt: r.createdAt,
  };
}

function mapNotification(n: ServerNotification): AppNotification {
  return {
    id: n.id,
    type: n.type as AppNotification["type"],
    ...(n.groupId ? { groupId: n.groupId } : {}),
    ...(n.expenseId ? { expenseId: n.expenseId } : {}),
    ...(n.settlementId ? { settlementId: n.settlementId } : {}),
    title: n.title,
    body: n.body,
    createdAt: n.createdAt,
    read: n.read,
    ...(n.tone ? { tone: n.tone as AppNotification["tone"] } : {}),
  };
}

function mapInvitation(
  inv: ServerGroupInvitation,
  groupsById: Map<string, ServerGroup>,
  usersById: Map<string, ServerUser>,
  currentUserId: string | null,
): GroupInvitation {
  const g = groupsById.get(inv.groupId);
  const inviter = usersById.get(inv.inviterUserId);
  return {
    id: inv.id,
    groupId: inv.groupId,
    groupName: g?.name ?? "",
    groupEmoji: g?.emoji ?? "💸",
    groupCurrency: g?.currency ?? "USD",
    groupType: (g?.type as Group["type"]) ?? "other",
    inviterUserId: inv.inviterUserId,
    inviterName: inviter?.name ?? "Someone",
    inviterAvatarColor: inviter?.avatarColor ?? "#7C3AED",
    invitedEmail: inv.invitedEmail,
    ...(inv.invitedName ? { invitedName: inv.invitedName } : {}),
    ...(inv.invitedMemberKey ? { invitedMemberId: inv.invitedMemberKey } : {}),
    status: inv.status as GroupInvitation["status"],
    createdAt: inv.createdAt,
    ...(inv.token ? { token: inv.token } : {}),
  };
}

function mapCurrentUser(u: ServerUser, members: Member[]): Member {
  // Prefer the group-member row flagged as the current user (carries memberKey
  // used across groups); fall back to a synthetic member from the /me profile.
  const meMember = members.find((m) => m.isCurrentUser);
  if (meMember) {
    return {
      ...meMember,
      name: u.name || meMember.name,
      ...(u.email ? { email: u.email } : {}),
      ...(u.phone ? { phone: u.phone } : {}),
      avatarColor: u.avatarColor || meMember.avatarColor,
      ...(u.photo ? { photo: u.photo } : {}),
      isCurrentUser: true,
    };
  }
  return {
    id: u.id,
    name: u.name,
    ...(u.email ? { email: u.email } : {}),
    ...(u.phone ? { phone: u.phone } : {}),
    avatarColor: u.avatarColor,
    ...(u.photo ? { photo: u.photo } : {}),
    isCurrentUser: true,
  };
}

function mapNotifPrefs(raw: unknown): NotifPrefs | null {
  if (!raw || typeof raw !== "object") return null;
  const p = raw as Record<string, unknown>;
  const bool = (v: unknown, d: boolean) => (typeof v === "boolean" ? v : d);
  return {
    expenseAdded: bool(p.expenseAdded, true),
    expenseEdited: bool(p.expenseEdited, false),
    expenseDeleted: bool(p.expenseDeleted, false),
    settlement: bool(p.settlement, true),
    invite: bool(p.invite, true),
    comment: bool(p.comment, false),
    reaction: bool(p.reaction, false),
    friendRequest: bool(p.friendRequest, true),
        chat: bool(p.chat, true),
    reminders: bool(p.reminders, true),

  };
}

/** Fetch the full snapshot from the server and map it into app-domain state. */
export async function fetchBootstrap(): Promise<MappedBootstrap> {
  const b: ServerBootstrap = await apiBootstrap();

  const currentUserId = b.user?.id ?? null;

  const membersByGroup = new Map<string, ServerGroupMember[]>();
  for (const m of b.members) {
    const arr = membersByGroup.get(m.groupId);
    if (arr) arr.push(m);
    else membersByGroup.set(m.groupId, [m]);
  }

  // ── Reverse-lookup maps ────────────────────────────────────────────────────
  // groupKeyToAppId: "${groupId}:${memberKey}" → stable appMemberId
  // memberKeyMap:    appMemberId → { [groupId]: memberKey }
  const groupKeyToAppId = new Map<string, string>();
  const memberKeyMap: Record<string, Record<string, string>> = {};

  for (const m of b.members) {
    const appId = stableAppId(m);
    groupKeyToAppId.set(`${m.groupId}:${m.memberKey}`, appId);
    if (!memberKeyMap[appId]) memberKeyMap[appId] = {};
    memberKeyMap[appId][m.groupId] = m.memberKey;
  }

  // Global member list: dedupe by stable app id (registered users appear once
  // across all groups; guests are scoped to one group by nature).
  const membersByAppId = new Map<string, Member>();
  for (const m of b.members) {
    const mapped = mapMember(m, currentUserId);
    const existing = membersByAppId.get(mapped.id);
    if (!existing) {
      membersByAppId.set(mapped.id, mapped);
    } else if (mapped.isCurrentUser && !existing.isCurrentUser) {
      membersByAppId.set(mapped.id, { ...existing, ...mapped });
    }
  }
  const members = Array.from(membersByAppId.values());

  const groupsById = new Map<string, ServerGroup>();
  for (const g of b.groups) groupsById.set(g.id, g);
  const usersById = new Map<string, ServerUser>();
  if (b.user) usersById.set(b.user.id, b.user);
  // Inviters are group members: use their names instead of "Someone".
  for (const m of (b.members ?? []) as Array<{ userId?: string | null; name?: string; avatarColor?: string }>) {
    if (m.userId && !usersById.has(m.userId)) {
      usersById.set(m.userId, { id: m.userId, name: m.name ?? "", avatarColor: m.avatarColor ?? "#7C3AED" } as unknown as ServerUser);
    }
  }

  const groups = b.groups.map((g) => mapGroup(g, membersByGroup));
  const currentUser = mapCurrentUser(b.user, members);

  // Ensure the current user is present in the global members list.
  if (!members.some((m) => m.isCurrentUser)) {
    members.unshift(currentUser);
  }

  return {
    currentUser,
    currentUserId: currentUser.id,
    members,
    groups,
    expenses: (b.expenses ?? []).map((e) => mapExpense(e, groupKeyToAppId)),
    settlements: (b.settlements ?? []).map((s) => mapSettlement(s, groupKeyToAppId)),
    recurringExpenses: (b.recurring ?? []).map((r) => mapRecurring(r, groupKeyToAppId)),
    invitations: (b.invitations ?? []).map((inv) =>
      mapInvitation(inv, groupsById, usersById, currentUserId),
    ),
    notifications: (b.notifications ?? []).map(mapNotification),
    groupMessages: [],
    defaultCurrency: b.user?.defaultCurrency ?? "USD",
    notifPrefs: mapNotifPrefs(b.user?.notifPrefs ?? null),
    memberKeyMap,
  };
}

// ── App → Server input builders ──────────────────────────────────────────────

/**
 * Resolve a stable app-side Member.id to the server-side memberKey for a
 * given group. Falls back to the id itself when no mapping is known (the id
 * is already a memberKey for guest members).
 */
function resolveMemberKey(
  appId: string,
  groupId: string,
  memberKeyMap: Record<string, Record<string, string>>,
): string {
  return memberKeyMap[appId]?.[groupId] ?? appId;
}

function resolveAppMemberId(
  memberKey: string,
  groupId: string,
  memberKeyMap: Record<string, Record<string, string>>,
): string {
  for (const [appId, groups] of Object.entries(memberKeyMap)) {
    if (groups[groupId] === memberKey) return appId;
  }
  return memberKey;
}

function buildGroupKeyToAppId(
  groupId: string,
  memberKeyMap: Record<string, Record<string, string>>,
): Map<string, string> {
  const reverse = new Map<string, string>();
  Object.keys(memberKeyMap).forEach((appId) => {
    const memberKey = memberKeyMap[appId]?.[groupId];
    if (memberKey) reverse.set(`${groupId}:${memberKey}`, appId);
  });
  return reverse;
}

function toExpenseInput(
  e: Omit<Expense, "id" | "createdAt">,
  memberKeyMap: Record<string, Record<string, string>>,
): ExpenseInput {
  return {
    description: e.description,
    amount: e.amount,
    currency: e.currency,
    paidByMemberKey: resolveMemberKey(e.paidById, e.groupId, memberKeyMap),
    splitType: e.splitType,
    category: e.category,
    ...(e.categoryBreakdown ? { categoryBreakdown: e.categoryBreakdown } : {}),
    ...(e.notes ? { notes: e.notes } : {}),
    ...(e.reactions ? { reactions: e.reactions as Record<string, unknown> } : {}),
    ...(e.paymentDate ? { paymentDate: e.paymentDate } : {}),
    ...(e.receiptId ? { receiptId: e.receiptId } : {}),
    splits: e.splits.map((s) => mapSplitToServer(s, memberKeyMap, e.groupId)),
  };
}

function toExpenseUpdate(
  u: Partial<Expense>,
  groupId: string,
  memberKeyMap: Record<string, Record<string, string>>,
): ExpenseUpdate {
  const out: ExpenseUpdate = {};
  if (u.description !== undefined) out.description = u.description;
  if (u.amount !== undefined) out.amount = u.amount;
  if (u.currency !== undefined) out.currency = u.currency;
  if (u.paidById !== undefined) out.paidByMemberKey = resolveMemberKey(u.paidById, groupId, memberKeyMap);
  if (u.splitType !== undefined) out.splitType = u.splitType;
  if (u.category !== undefined) out.category = u.category;
  if (u.notes !== undefined) out.notes = u.notes;
  if (u.reactions !== undefined) out.reactions = u.reactions as Record<string, unknown>;
  if (u.paymentDate !== undefined) out.paymentDate = u.paymentDate || null;
  if (u.receiptId !== undefined) out.receiptId = u.receiptId ?? null;
  if (u.splits !== undefined) out.splits = u.splits.map((s) => mapSplitToServer(s, memberKeyMap, groupId));
  return out;
}

/**
 * Build a GroupInput from the app-domain group. The current user is excluded
 * from the members list because the server always inserts the creator row
 * automatically — sending it again causes a duplicate member.
 */
function toGroupInput(
  g: Omit<Group, "id" | "createdAt">,
  members: Member[],
  currentUserId: string | null,
  memberKeyMap: Record<string, Record<string, string>>,
  groupId?: string,
): GroupInput {
  const memberInputs: GroupMemberInput[] = (g.memberIds ?? [])
    // Skip the creator: the server route always inserts them separately.
    .filter((appId) => {
      const m = members.find((mm) => mm.id === appId);
      // Exclude the member if they are the current user (by isCurrentUser flag or userId match).
      return !m?.isCurrentUser && !(currentUserId && m?.userId === currentUserId);
    })
    .map((appId) => {
      const m = members.find((mm) => mm.id === appId);
      // Resolve to the group-scoped memberKey if we have one; otherwise use the appId.
      const memberKey = groupId
        ? resolveMemberKey(appId, groupId, memberKeyMap)
        : appId;
      return {
        memberKey,
        name: m?.name ?? "Member",
        ...(m?.email ? { email: m.email } : {}),
        ...(m?.phone ? { phone: m.phone } : {}),
        ...(m?.avatarColor ? { avatarColor: m.avatarColor } : {}),
        ...(m?.photo ? { photo: m.photo } : {}),
        isAdmin: (g.adminIds ?? []).includes(appId),
        ...(m?.isPending ? { isPending: true } : {}),
      };
    });
  return {
    name: g.name,
    ...(g.emoji ? { emoji: g.emoji } : {}),
    ...(g.currency ? { currency: g.currency } : {}),
    ...(g.type ? { type: g.type } : {}),
    ...(g.simplifyDebtsEnabled !== undefined ? { simplifyDebtsEnabled: g.simplifyDebtsEnabled } : {}),
    ...(g.startDate ? { startDate: g.startDate } : {}),
    ...(g.endDate ? { endDate: g.endDate } : {}),
    ...(g.reminderDays != null ? { reminderDays: g.reminderDays } : {}),
    ...(g.tripStartReminderDays != null ? { tripStartReminderDays: g.tripStartReminderDays } : {}),
    ...(g.settleUpReminderDays != null ? { settleUpReminderDays: g.settleUpReminderDays } : {}),
    ...(g.reminderChannel ? { reminderChannel: g.reminderChannel } : {}),
    ...(g.customItemizations ? { customItemizations: g.customItemizations } : {}),
    ...(memberInputs.length ? { members: memberInputs } : {}),
  };
}

function toGroupUpdate(u: Partial<Group>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (u.name !== undefined) out.name = u.name;
  if (u.emoji !== undefined) out.emoji = u.emoji;
  if (u.currency !== undefined) out.currency = u.currency;
  if (u.type !== undefined) out.type = u.type;
  if (u.simplifyDebtsEnabled !== undefined) out.simplifyDebtsEnabled = u.simplifyDebtsEnabled;
  if (u.isArchived !== undefined) out.isArchived = u.isArchived;
  if (u.isEnded !== undefined) out.isEnded = u.isEnded;
  if (u.reminderDays !== undefined) out.reminderDays = u.reminderDays;
  if (u.startDate !== undefined) out.startDate = u.startDate;
  if (u.endDate !== undefined) out.endDate = u.endDate;
  if (u.tripStartReminderDays !== undefined) out.tripStartReminderDays = u.tripStartReminderDays;
  if (u.settleUpReminderDays !== undefined) out.settleUpReminderDays = u.settleUpReminderDays;
  if (u.reminderChannel !== undefined) out.reminderChannel = u.reminderChannel;
  if (u.customItemizations !== undefined) out.customItemizations = u.customItemizations;
  return out;
}

function toRecurringInput(
  r: Omit<RecurringExpense, "id" | "createdAt">,
  memberKeyMap: Record<string, Record<string, string>>,
): RecurringInput {
  return {
    description: r.description,
    amount: r.amount,
    currency: r.currency,
    paidByMemberKey: resolveMemberKey(r.paidById, r.groupId, memberKeyMap),
    splitType: r.splitType,
    splits: r.splits.map((s) => mapSplitToServer(s, memberKeyMap, r.groupId)),
    category: r.category,
    frequency: r.frequency,
    ...(r.customDays != null ? { customDays: r.customDays } : {}),
    ...(r.intervalMonths != null ? { intervalMonths: r.intervalMonths } : {}),
    ...(r.intervalWeeks != null ? { intervalWeeks: r.intervalWeeks } : {}),
    ...(r.intervalDays != null ? { intervalDays: r.intervalDays } : {}),
    ...(r.dayOfWeek != null ? { dayOfWeek: r.dayOfWeek } : {}),
    ...(r.timeOfDay ? { timeOfDay: r.timeOfDay } : {}),
    ...(r.timeZone ? { timeZone: r.timeZone } : {}),
    ...(r.endType ? { endType: r.endType } : {}),
    ...(r.endCount != null ? { endCount: r.endCount } : {}),
    ...(r.endDate ? { endDate: r.endDate } : {}),
    nextDueAt: r.nextDueAt,
    ...(r.isActive != null ? { isActive: r.isActive } : {}),
  };
}

function toRecurringUpdate(
  u: Partial<RecurringExpense>,
  groupId: string,
  memberKeyMap: Record<string, Record<string, string>>,
): RecurringUpdateWithTimeZone {
  const out: RecurringUpdateWithTimeZone = {};
  if (u.description !== undefined) out.description = u.description;
  if (u.amount !== undefined) out.amount = u.amount;
  if (u.currency !== undefined) out.currency = u.currency;
  if (u.paidById !== undefined) out.paidByMemberKey = resolveMemberKey(u.paidById, groupId, memberKeyMap);
  if (u.splitType !== undefined) out.splitType = u.splitType;
  if (u.splits !== undefined) out.splits = u.splits.map((s) => mapSplitToServer(s, memberKeyMap, groupId));
  if (u.category !== undefined) out.category = u.category;
  if (u.frequency !== undefined) out.frequency = u.frequency;
  if (u.customDays !== undefined) out.customDays = u.customDays;
  if (u.intervalMonths !== undefined) out.intervalMonths = u.intervalMonths;
  if (u.intervalWeeks !== undefined) out.intervalWeeks = u.intervalWeeks;
  if (u.intervalDays !== undefined) out.intervalDays = u.intervalDays;
  if (u.dayOfWeek !== undefined) out.dayOfWeek = u.dayOfWeek;
  if (u.timeOfDay !== undefined) out.timeOfDay = u.timeOfDay;
  if (u.timeZone !== undefined) out.timeZone = u.timeZone;
  if (u.endType !== undefined) out.endType = u.endType;
  if (u.endCount !== undefined) out.endCount = u.endCount;
  if (u.endDate !== undefined) out.endDate = u.endDate;
  if (u.nextDueAt !== undefined) out.nextDueAt = u.nextDueAt;
  if (u.isActive !== undefined) out.isActive = u.isActive;
  return out;
}

// ── Mutation wrappers (server is authority; return mapped app entities) ───────

export const api = {
  // Expenses
  async createExpense(
    groupId: string,
    e: Omit<Expense, "id" | "createdAt">,
    memberKeyMap: Record<string, Record<string, string>>,
  ): Promise<Expense> {
    const created = await apiCreateExpense(groupId, toExpenseInput(e, memberKeyMap), idemHeaders());
    return mapExpense(created, buildGroupKeyToAppId(groupId, memberKeyMap));
  },
  async updateExpense(
    expenseId: string,
    groupId: string,
    u: Partial<Expense>,
    memberKeyMap: Record<string, Record<string, string>>,
  ): Promise<Expense> {
    const updated = await apiUpdateExpense(expenseId, toExpenseUpdate(u, groupId, memberKeyMap));
    return mapExpense(updated);
  },
  async deleteExpense(expenseId: string): Promise<void> {
    await apiDeleteExpense(expenseId);
  },
  async addExpenseComment(
    expenseId: string,
    appMemberId: string,
    groupId: string,
    text: string,
    memberKeyMap: Record<string, Record<string, string>>,
  ): Promise<Expense["comments"]> {
    const memberKey = resolveMemberKey(appMemberId, groupId, memberKeyMap);
    const c = await apiAddExpenseComment(expenseId, { memberKey, text });
    return [{ id: c.id, memberId: c.memberKey, text: c.text, createdAt: c.createdAt }];
  },

  // Receipts
  async createReceiptFromImage(
    groupId: string,
    imageUri: string,
    contentType = "image/jpeg",
  ): Promise<ServerReceipt> {
    const target = await apiCreateReceiptUploadUrl(groupId, { contentType }, idemHeaders());
    const localResponse = await fetch(imageUri);
    if (!localResponse.ok) {
      throw new Error("Receipt image could not be read.");
    }
    const imageBlob = await localResponse.blob();
    const uploadResponse = await fetch(target.uploadURL, {
      method: "PUT",
      headers: { "Content-Type": contentType },
      body: imageBlob,
    });
    if (!uploadResponse.ok) {
      throw new Error("Receipt image could not be uploaded.");
    }
    return apiCreateReceipt(
      groupId,
      { imageObjectPath: target.objectPath, contentType },
      idemHeaders(),
    );
  },
  async latestReceipt(groupId: string, since: number): Promise<{ id: string } | null> {
    try {
      return await customFetch<{ id: string }>(`/api/groups/${encodeURIComponent(groupId)}/receipts/latest?since=${since}`, { method: "GET" });
    } catch {
      return null;
    }
  },
  async getReceipt(receiptId: string): Promise<ServerReceipt> {
    return apiGetReceipt(receiptId);
  },
  async updateReceipt(
    receiptId: string,
    updates: {
      merchant?: string | null;
      total?: number | null;
      subtotal?: number | null;
      tax?: number | null;
      tip?: number | null;
      currency?: string | null;
       receiptDate?: string | null;
       discount?: number | null;
       serviceCharge?: number | null;
       rounding?: number | null;
    },
  ): Promise<ServerReceipt> {
    return apiUpdateReceipt(receiptId, updates);
  },
  async updateReceiptItem(
    receiptId: string,
    itemId: string,
     updates: {
       name?: string;
       amount?: number | null;
       quantity?: number | null;
       unitPrice?: number | null;
     },
  ): Promise<ServerReceipt> {
    return apiUpdateReceiptItem(receiptId, itemId, updates);
  },
   async addReceiptItem(
     receiptId: string,
     item: { name: string; amount?: number | null; quantity?: number | null; unitPrice?: number | null },
   ): Promise<ServerReceipt> {
     return apiAddReceiptItem(receiptId, item);
   },
   async deleteReceiptItem(receiptId: string, itemId: string): Promise<ServerReceipt> {
     return apiDeleteReceiptItem(receiptId, itemId);
   },
  async toggleReceiptClaim(receiptId: string, itemId: string, memberKey?: string): Promise<ServerReceipt> {
    return apiToggleReceiptClaim(receiptId, { itemId, ...(memberKey ? { memberKey } : {}) });
  },

  // Settlements
  async createSettlement(
    groupId: string,
    s: Omit<Settlement, "id" | "createdAt">,
    memberKeyMap: Record<string, Record<string, string>>,
  ): Promise<Settlement> {
    const created = await apiCreateSettlement(
      groupId,
      {
        fromMemberKey: resolveMemberKey(s.fromId, groupId, memberKeyMap),
        toMemberKey: resolveMemberKey(s.toId, groupId, memberKeyMap),
        amount: s.amount,
        currency: s.currency,
        ...(s.note ? { note: s.note } : {}),
        ...(s.fxRate ? { fxRate: s.fxRate } : {}),
      },
      idemHeaders(),
    );
    return mapSettlement(created);
  },
  async deleteSettlement(settlementId: string): Promise<void> {
    await apiDeleteSettlement(settlementId);
  },

  // Groups
  async createGroup(
    g: Omit<Group, "id" | "createdAt">,
    members: Member[],
    currentUserId: string | null,
    memberKeyMap: Record<string, Record<string, string>>,
  ): Promise<ServerGroup> {
    return apiCreateGroup(toGroupInput(g, members, currentUserId, memberKeyMap), idemHeaders());
  },
  async updateGroup(groupId: string, u: Partial<Group>): Promise<ServerGroup> {
    return apiUpdateGroup(groupId, toGroupUpdate(u));
  },
  async deleteGroup(groupId: string): Promise<void> {
    await apiDeleteGroup(groupId);
  },

  // Members
  async addGroupMember(
    groupId: string,
    m: Omit<Member, "id">,
    memberKey: string,
    isAdmin: boolean,
  ): Promise<ServerGroupMember> {
    return apiAddGroupMember(groupId, {
      memberKey,
      name: m.name,
      ...(m.email ? { email: m.email } : {}),
      ...(m.phone ? { phone: m.phone } : {}),
      ...(m.avatarColor ? { avatarColor: m.avatarColor } : {}),
      ...(m.photo ? { photo: m.photo } : {}),
      isAdmin,
      ...(m.isPending ? { isPending: true } : {}),
    });
  },
  async removeGroupMember(groupId: string, memberKey: string): Promise<void> {
    await apiRemoveGroupMember(groupId, memberKey);
  },

  /**
   * Update an existing member's admin status via PATCH.
   * memberKey must be the group-scoped key, NOT the stable app id.
   */
  async updateGroupMember(
    groupId: string,
    memberKey: string,
    isAdmin: boolean,
  ): Promise<void> {
    await apiUpdateGroupMember(groupId, memberKey, { isAdmin });
  },

  // Messages
  async createGroupMessage(
    groupId: string,
    appMemberId: string,
    text: string,
    memberKeyMap: Record<string, Record<string, string>>,
  ): Promise<GroupMessage> {
    const memberKey = resolveMemberKey(appMemberId, groupId, memberKeyMap);
    const msg: ServerGroupMessage = await apiCreateGroupMessage(groupId, { memberKey, text });
    return {
      id: msg.id,
      groupId: msg.groupId,
      memberId: msg.memberKey,
      text: msg.text,
      createdAt: msg.createdAt,
    };
  },

  /** Fetch messages and map server member keys back to stable app member ids. */
  async listGroupMessages(
    groupId: string,
    memberKeyMap: Record<string, Record<string, string>> = {},
  ): Promise<GroupMessage[]> {
    const rows = await apiListGroupMessages(groupId);
    return rows.map((msg) => ({
      id: msg.id,
      groupId: msg.groupId,
      memberId: resolveAppMemberId(msg.memberKey, groupId, memberKeyMap),
      text: msg.text,
      createdAt: msg.createdAt as unknown as string,
    }));
  },
  /** Per-member last-read cursor keyed by stable app member id. */
  async listGroupMessageReads(
    groupId: string,
    memberKeyMap: Record<string, Record<string, string>> = {},
  ): Promise<Record<string, string | null>> {
    const rows = await apiListGroupMessageReads(groupId);
    const out: Record<string, string | null> = {};
    for (const r of rows) {
      const appMemberId = resolveAppMemberId(r.memberKey, groupId, memberKeyMap);
      out[appMemberId] = (r.lastReadMessagesAt as unknown as string | null) ?? null;
    }
    return out;
  },
  /** Mark all of the current member's messages as read-up-to-now in this group. */
  async markGroupMessagesRead(groupId: string): Promise<{ memberKey: string; lastReadMessagesAt: string | null }> {
    const r = await apiMarkGroupMessagesRead(groupId);
    return { memberKey: r.memberKey, lastReadMessagesAt: (r.lastReadMessagesAt as unknown as string | null) ?? null };
  },

  // Recurring
  async createRecurring(
    groupId: string,
    r: Omit<RecurringExpense, "id" | "createdAt">,
    memberKeyMap: Record<string, Record<string, string>>,
  ): Promise<RecurringExpense> {
    const created = await apiCreateRecurring(groupId, toRecurringInput(r, memberKeyMap), idemHeaders());
    return mapRecurring(created);
  },
  async updateRecurring(
    recurringId: string,
    groupId: string,
    u: Partial<RecurringExpense>,
    memberKeyMap: Record<string, Record<string, string>>,
  ): Promise<RecurringExpense> {
    const updated = await apiUpdateRecurring(recurringId, toRecurringUpdate(u, groupId, memberKeyMap));
    return mapRecurring(updated);
  },
  async deleteRecurring(recurringId: string): Promise<void> {
    await apiDeleteRecurring(recurringId);
  },
  async runRecurring(): Promise<void> {
    await apiRunRecurring();
  },

  // Invitations
  async createGroupInvitation(
    groupId: string,
    invitedEmail: string,
    invitedName?: string,
  ): Promise<ServerGroupInvitation> {
    return apiCreateGroupInvitation(
      groupId,
      { invitedEmail, ...(invitedName ? { invitedName } : {}) },
      idemHeaders(),
    );
  },
  async createGroupJoinLink(groupId: string) {
    return apiCreateGroupJoinLink(groupId);
  },
  async refreshGroupJoinLink(groupId: string) {
    return apiRefreshGroupJoinLink(groupId);
  },
  async previewGroupJoin(token: string) {
    return apiPreviewGroupJoin(token);
  },
  async acceptGroupJoin(token: string) {
    return apiAcceptGroupJoin(token);
  },
  async sendAppInvitation(invitedEmail: string, invitedName: string): Promise<void> {
    await apiSendAppInvitation({ invitedEmail, invitedName });
  },
  async matchContacts(emails: string[]) {
    return apiMatchContacts({ emails });
  },
    async listDirectPayments() {
    return customFetch<Array<{
      clientId: string; fromUserId: string; toUserId: string; createdBy: string;
      amount: number; currency: string; reason: string; comments: string | null; category: string | null;
      createdAt: string; updatedAt: string; deletedAt: string | null; meta?: unknown;
    }>>("/api/direct-payments");
  },
  async saveDirectPayment(body: {
    clientId: string; fromUserId: string; toUserId: string; amount: number; currency: string;
    reason: string; comments: string | null; category: string | null; meta?: unknown;
  }) {
    return customFetch("/api/direct-payments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  },
  async deleteDirectPaymentRemote(clientId: string, quiet?: boolean) {
    return customFetch(`/api/direct-payments/${encodeURIComponent(clientId)}${quiet ? "?quiet=1" : ""}`, { method: "DELETE" });
  },
  async removeFriendRemote(userId: string) {
    return customFetch(`/api/friends/${encodeURIComponent(userId)}`, { method: "DELETE" });
  },
  async listFriendRequests() {
    return apiListFriendRequests();
  },
  async sendFriendRequest(recipientUserId: string) {
    return apiSendFriendRequest({ recipientUserId });
  },
  /** Sends an in-app request if the email has an account; rejects with "not_registered" otherwise. */
  async sendFriendRequestByEmail(email: string) {
    return apiSendFriendRequest({ email });
  },
  async createFriendQr() {
    return apiCreateFriendQr();
  },
  async previewFriendQr(token: string) {
    return apiPreviewFriendQr({ token });
  },
  async sendFriendRequestWithQr(token: string) {
    return apiSendFriendRequestWithQr({ token });
  },
  async acceptFriendRequest(requestId: string) {
    return apiAcceptFriendRequest(requestId);
  },
  async declineFriendRequest(requestId: string) {
    return apiDeclineFriendRequest(requestId);
  },
  async acceptInvitation(token: string): Promise<void> {
    await apiAcceptInvitation(token);
  },
  async declineInvitation(token: string): Promise<void> {
    await apiDeclineInvitation(token);
  },

  // Notifications
  async sendGroupReminder(
    groupId: string,
    recipientMemberId: string,
    amount: number,
    currency: string,
    memberKeyMap: Record<string, Record<string, string>>,
  ): Promise<void> {
    await apiSendGroupReminder(
      groupId,
      {
        recipientMemberKey: resolveMemberKey(recipientMemberId, groupId, memberKeyMap),
        amount,
        currency,
      },
      idemHeaders(),
    );
  },
  async markAllNotificationsRead(): Promise<void> {
    await apiMarkAllNotificationsRead();
  },
  async markNotificationRead(notificationId: string): Promise<void> {
    await apiMarkNotificationRead(notificationId);
  },

  // Current user
  async uploadProfilePhoto(imageUri: string, contentType: string): Promise<string> {
    const allowedTypes = ["image/jpeg", "image/png", "image/webp"] as const;
    const safeType = allowedTypes.includes(contentType as (typeof allowedTypes)[number])
      ? contentType as (typeof allowedTypes)[number]
      : "image/jpeg";
    const target = await apiRequestProfilePhotoUploadUrl({ contentType: safeType });
    const localResponse = await fetch(imageUri);
    if (!localResponse.ok) throw new Error("Profile photo could not be read.");
    const imageBlob = await localResponse.blob();
    if (imageBlob.size < 1 || imageBlob.size > 5 * 1024 * 1024) {
      throw new Error("Choose a profile photo smaller than 5 MB.");
    }
    const uploadResponse = await fetch(target.uploadURL, {
      method: "PUT",
      headers: { "Content-Type": safeType },
      body: imageBlob,
    });
    if (!uploadResponse.ok) throw new Error("Profile photo could not be uploaded.");
    const completed = await apiCompleteProfilePhotoUpload();
    return completed.photo;
  },
  async updateCurrentUser(u: UserUpdate): Promise<ServerUser> {
    return apiUpdateCurrentUser(u);
  },
  async deleteCurrentUser() {
    return apiDeleteCurrentUser();
  },

  // Demo seed
  async seedDemoData(): Promise<void> {
    await customFetch("/api/seed", { method: "POST" });
  },
};

// ── One-time local snapshot migration ────────────────────────────────────────

/**
 * Shape of the legacy `spliteasy_data_v3` AsyncStorage snapshot. Only real user
 * data (not the seeded demo defaults) should ever be imported.
 */
export interface LegacySnapshot {
  members?: Member[];
  groups?: Group[];
  expenses?: Expense[];
  settlements?: Settlement[];
  invitations?: GroupInvitation[];
}

/**
 * Build the server import payload from a legacy local snapshot. Groups carry
 * their members, expenses, settlements and recurring schedules inline so the
 * server can recreate the graph with consistent member keys.
 *
 * IMPORTANT: the current user IS included in the members list with their
 * original legacy memberKey. Historical expenses/settlements reference that
 * key as paidById/fromId/toId. The server's import route detects the creator
 * by email match and links their row to the authenticated userId while
 * preserving the provided memberKey, so all historical records remain valid.
 * Excluding the current user would cause the server to mint a fresh memberKey
 * for the creator, orphaning every financial record that referenced their
 * original key.
 */
export function buildImportInput(
  snapshot: LegacySnapshot,
  recurring: RecurringExpense[],
  defaultCurrency: string,
  _currentUserId?: string,
): ImportInput {
  const groups: ImportGroup[] = (snapshot.groups ?? []).map((g) => {
    const memberIds = g.memberIds ?? [];
    const members: GroupMemberInput[] = memberIds
      .map((memberKey) => {
        const m = (snapshot.members ?? []).find((mm) => mm.id === memberKey);
        return {
          memberKey,
          name: m?.name ?? "Member",
          ...(m?.email ? { email: m.email } : {}),
          ...(m?.phone ? { phone: m.phone } : {}),
          ...(m?.avatarColor ? { avatarColor: m.avatarColor } : {}),
          ...(m?.photo ? { photo: m.photo } : {}),
          isAdmin: (g.adminIds ?? []).includes(memberKey),
          ...(m?.isPending ? { isPending: true } : {}),
        };
      });

    // For legacy snapshots, member IDs are the local keys used for paidById/fromId/toId.
    // No server memberKeyMap exists yet, so pass an empty map — values are already keys.
    const emptyMap: Record<string, Record<string, string>> = {};

    const expenses: ExpenseInput[] = (snapshot.expenses ?? [])
      .filter((e) => e.groupId === g.id)
      .map((e) => toExpenseInput(e, emptyMap));

    const settlements = (snapshot.settlements ?? [])
      .filter((s) => s.groupId === g.id)
      .map((s) => ({
        fromMemberKey: s.fromId,
        toMemberKey: s.toId,
        amount: s.amount,
        currency: s.currency,
        ...(s.note ? { note: s.note } : {}),
      }));

    const recurringInputs: RecurringInput[] = recurring
      .filter((r) => r.groupId === g.id)
      .map((r) => toRecurringInput(r, emptyMap));

    return {
      clientId: g.id,
      name: g.name,
      ...(g.emoji ? { emoji: g.emoji } : {}),
      ...(g.currency ? { currency: g.currency } : {}),
      ...(g.type ? { type: g.type } : {}),
      ...(g.startDate ? { startDate: g.startDate } : {}),
      ...(g.endDate ? { endDate: g.endDate } : {}),
      ...(g.reminderDays != null ? { reminderDays: g.reminderDays } : {}),
      ...(g.tripStartReminderDays != null ? { tripStartReminderDays: g.tripStartReminderDays } : {}),
      ...(g.settleUpReminderDays != null ? { settleUpReminderDays: g.settleUpReminderDays } : {}),
      ...(g.reminderChannel ? { reminderChannel: g.reminderChannel } : {}),
      ...(members.length ? { members } : {}),
      ...(expenses.length ? { expenses } : {}),
      ...(settlements.length ? { settlements } : {}),
      ...(recurringInputs.length ? { recurring: recurringInputs } : {}),
    };
  });

  return {
    source: "mobile-local-v3",
    defaultCurrency,
    groups,
  };
}

/** Run the import (idempotent via Idempotency-Key). */
export async function importLocalSnapshot(
  snapshot: LegacySnapshot,
  recurring: RecurringExpense[],
  defaultCurrency: string,
  idempotencyKey: string,
  currentUserId?: string,
): Promise<void> {
  const input = buildImportInput(snapshot, recurring, defaultCurrency, currentUserId);
  if (input.groups.length === 0) return;
  await apiImportSnapshot(input, idemHeaders(idempotencyKey));
}

export type { UserUpdate };


// ---- Offline recording ----
// While recording, api calls are captured as plain data instead of being sent,
// so a change made offline can be saved on the phone and replayed later.
export type RecordedOp = { m: string; a: unknown[] };
let recordingOps: RecordedOp[] | null = null;
for (const key of Object.keys(api)) {
  const orig = (api as Record<string, unknown>)[key];
  if (typeof orig !== "function") continue;
  (api as Record<string, unknown>)[key] = (...args: unknown[]) => {
    if (recordingOps) { recordingOps.push({ m: key, a: args }); return Promise.resolve(undefined); }
    return (orig as (...x: unknown[]) => unknown).apply(api, args);
  };
}
export async function recordApiCalls(fn: () => Promise<unknown>): Promise<RecordedOp[] | null> {
  recordingOps = [];
  try { await fn(); return recordingOps; } catch { return null; } finally { recordingOps = null; }
}
export function replayApiCall(op: RecordedOp): Promise<unknown> {
  return ((api as Record<string, unknown>)[op.m] as (...x: unknown[]) => Promise<unknown>)(...op.a);
}
