import type {
  Group as DbGroup,
  GroupMember as DbGroupMember,
  GroupInvitation as DbGroupInvitation,
  Expense as DbExpense,
  ExpenseSplit as DbExpenseSplit,
  ExpenseComment as DbExpenseComment,
  Settlement as DbSettlement,
  RecurringExpense as DbRecurringExpense,
  GroupMessage as DbGroupMessage,
  Notification as DbNotification,
  DeviceToken as DbDeviceToken,
  User as DbUser,
  ImportJob as DbImportJob,
} from "@workspace/db";

const num = (v: string | number | null | undefined): number =>
  v == null ? 0 : typeof v === "number" ? v : parseFloat(v);

const optNum = (v: string | number | null | undefined): number | null =>
  v == null ? null : typeof v === "number" ? v : parseFloat(v);

export function serializeUser(u: DbUser) {
  return {
    id: u.id,
    clerkUserId: u.clerkUserId,
    name: u.name,
    email: u.email,
    phone: u.phone,
    avatarColor: u.avatarColor,
    photo: u.photo,
    defaultCurrency: u.defaultCurrency,
    notifPrefs: u.notifPrefs ?? null,
    createdAt: u.createdAt,
    updatedAt: u.updatedAt,
  };
}

export function serializeGroup(g: DbGroup) {
  return {
    id: g.id,
    name: g.name,
    emoji: g.emoji,
    currency: g.currency,
    type: g.type,
    createdByUserId: g.createdByUserId,
    isArchived: g.isArchived,
    archivedAt: g.archivedAt,
    isEnded: g.isEnded,
    endedAt: g.endedAt,
    reminderDays: g.reminderDays,
    startDate: g.startDate,
    endDate: g.endDate,
    tripStartReminderDays: g.tripStartReminderDays,
    settleUpReminderDays: g.settleUpReminderDays,
    reminderChannel: g.reminderChannel,
    nudgeCampaign: g.nudgeCampaign ?? null,
    createdAt: g.createdAt,
    updatedAt: g.updatedAt,
  };
}

export function serializeMember(m: DbGroupMember) {
  return {
    id: m.id,
    groupId: m.groupId,
    userId: m.userId,
    memberKey: m.memberKey,
    name: m.name,
    email: m.email,
    phone: m.phone,
    avatarColor: m.avatarColor,
    photo: m.photo,
    isAdmin: m.isAdmin,
    isPending: m.isPending,
    joinedAt: m.joinedAt,
  };
}

export function serializeInvitation(i: DbGroupInvitation) {
  return {
    id: i.id,
    groupId: i.groupId,
    inviterUserId: i.inviterUserId,
    invitedEmail: i.invitedEmail,
    invitedName: i.invitedName,
    invitedMemberKey: i.invitedMemberKey,
    status: i.status,
    token: i.token,
    createdAt: i.createdAt,
  };
}

export function serializeSplit(s: DbExpenseSplit) {
  return {
    memberKey: s.memberKey,
    amount: num(s.amount),
    percentage: optNum(s.percentage),
    paid: optNum(s.paid),
  };
}

export function serializeComment(c: DbExpenseComment) {
  return {
    id: c.id,
    expenseId: c.expenseId,
    memberKey: c.memberKey,
    text: c.text,
    createdAt: c.createdAt,
  };
}

export function serializeExpense(
  e: DbExpense,
  splits: DbExpenseSplit[],
  comments: DbExpenseComment[] = [],
) {
  return {
    id: e.id,
    groupId: e.groupId,
    description: e.description,
    amount: num(e.amount),
    currency: e.currency,
    paidByMemberKey: e.paidByMemberKey,
    splitType: e.splitType,
    category: e.category,
    notes: e.notes,
    addedByUserId: e.addedByUserId,
    recurringId: e.recurringId,
    reactions: e.reactions ?? null,
    splits: splits.map(serializeSplit),
    comments: comments.map(serializeComment),
    createdAt: e.createdAt,
    updatedAt: e.updatedAt,
  };
}

export function serializeSettlement(s: DbSettlement) {
  return {
    id: s.id,
    groupId: s.groupId,
    fromMemberKey: s.fromMemberKey,
    toMemberKey: s.toMemberKey,
    amount: num(s.amount),
    currency: s.currency,
    note: s.note,
    recordedByUserId: s.recordedByUserId,
    createdAt: s.createdAt,
  };
}

type JsonSplit = {
  memberKey: string;
  amount: number;
  percentage?: number | null;
  paid?: number | null;
};

export function serializeRecurring(r: DbRecurringExpense) {
  const splits = (Array.isArray(r.splits) ? r.splits : []) as JsonSplit[];
  return {
    id: r.id,
    groupId: r.groupId,
    description: r.description,
    amount: num(r.amount),
    currency: r.currency,
    paidByMemberKey: r.paidByMemberKey,
    splitType: r.splitType,
    splits: splits.map((s) => ({
      memberKey: s.memberKey,
      amount: num(s.amount),
      percentage: optNum(s.percentage),
      paid: optNum(s.paid),
    })),
    category: r.category,
    frequency: r.frequency,
    customDays: r.customDays,
    dayOfWeek: r.dayOfWeek,
    timeOfDay: r.timeOfDay,
    endType: r.endType,
    endCount: r.endCount,
    endDate: r.endDate,
    occurrenceCount: r.occurrenceCount,
    nextDueAt: r.nextDueAt,
    isActive: r.isActive,
    lastRunAt: r.lastRunAt,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}

export function serializeMessage(m: DbGroupMessage) {
  return {
    id: m.id,
    groupId: m.groupId,
    memberKey: m.memberKey,
    text: m.text,
    createdAt: m.createdAt,
  };
}

export function serializeNotification(n: DbNotification) {
  return {
    id: n.id,
    userId: n.userId,
    type: n.type,
    groupId: n.groupId,
    expenseId: n.expenseId,
    title: n.title,
    body: n.body,
    tone: n.tone,
    read: n.read,
    createdAt: n.createdAt,
  };
}

export function serializeDeviceToken(d: DbDeviceToken) {
  return {
    id: d.id,
    userId: d.userId,
    token: d.token,
    platform: d.platform,
    createdAt: d.createdAt,
  };
}

export function serializeImportJob(j: DbImportJob) {
  return {
    id: j.id,
    userId: j.userId,
    source: j.source,
    status: j.status,
    counts: j.counts ?? null,
    groupsCreated: j.groupsCreated,
    expensesCreated: j.expensesCreated,
    error: j.error,
    createdAt: j.createdAt,
    completedAt: j.completedAt,
  };
}
