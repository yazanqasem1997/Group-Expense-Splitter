import { Router, type IRouter } from "express";
import { eq, inArray } from "drizzle-orm";
import {
  db,
  usersTable,
  groupsTable,
  groupMembersTable,
  expensesTable,
  expenseSplitsTable,
  expenseCommentsTable,
  settlementsTable,
  recurringExpensesTable,
  groupInvitationsTable,
  notificationsTable,
} from "@workspace/db";
import {
  GetCurrentUserResponse,
  UpdateCurrentUserBody,
  UpdateCurrentUserResponse,
  BootstrapResponse,
} from "@workspace/api-zod";
import { requireAuth } from "../lib/auth";
import {
  serializeUser,
  serializeGroup,
  serializeMember,
  serializeExpense,
  serializeSettlement,
  serializeRecurring,
  serializeInvitation,
  serializeNotification,
} from "../lib/serialize";

const router: IRouter = Router();

router.get("/me", requireAuth, async (req, res): Promise<void> => {
  res.json(GetCurrentUserResponse.parse(serializeUser(req.localUser!)));
});

router.patch("/me", requireAuth, async (req, res): Promise<void> => {
  const parsed = UpdateCurrentUserBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [updated] = await db
    .update(usersTable)
    .set({ ...parsed.data, notifPrefs: parsed.data.notifPrefs as never })
    .where(eq(usersTable.id, req.localUser!.id))
    .returning();
  res.json(UpdateCurrentUserResponse.parse(serializeUser(updated!)));
});

router.get("/me/bootstrap", requireAuth, async (req, res): Promise<void> => {
  const userId = req.localUser!.id;

  // Groups the user belongs to: either created by them or listed as a member.
  const memberRows = await db
    .select({ groupId: groupMembersTable.groupId })
    .from(groupMembersTable)
    .where(eq(groupMembersTable.userId, userId));
  const ownedRows = await db
    .select({ id: groupsTable.id })
    .from(groupsTable)
    .where(eq(groupsTable.createdByUserId, userId));

  const groupIds = Array.from(
    new Set([
      ...memberRows.map((r) => r.groupId),
      ...ownedRows.map((r) => r.id),
    ]),
  );

  if (groupIds.length === 0) {
    res.json(
      BootstrapResponse.parse({
        user: serializeUser(req.localUser!),
        groups: [],
        members: [],
        expenses: [],
        settlements: [],
        recurring: [],
        invitations: [],
        notifications: [],
      }),
    );
    return;
  }

  const [
    groups,
    members,
    expenses,
    settlements,
    recurring,
    invitations,
    notifications,
  ] = await Promise.all([
    db.select().from(groupsTable).where(inArray(groupsTable.id, groupIds)),
    db
      .select()
      .from(groupMembersTable)
      .where(inArray(groupMembersTable.groupId, groupIds)),
    db.select().from(expensesTable).where(inArray(expensesTable.groupId, groupIds)),
    db
      .select()
      .from(settlementsTable)
      .where(inArray(settlementsTable.groupId, groupIds)),
    db
      .select()
      .from(recurringExpensesTable)
      .where(inArray(recurringExpensesTable.groupId, groupIds)),
    db
      .select()
      .from(groupInvitationsTable)
      .where(inArray(groupInvitationsTable.groupId, groupIds)),
    db
      .select()
      .from(notificationsTable)
      .where(eq(notificationsTable.userId, userId)),
  ]);

  const expenseIds = expenses.map((e) => e.id);
  const [splits, comments] =
    expenseIds.length > 0
      ? await Promise.all([
          db
            .select()
            .from(expenseSplitsTable)
            .where(inArray(expenseSplitsTable.expenseId, expenseIds)),
          db
            .select()
            .from(expenseCommentsTable)
            .where(inArray(expenseCommentsTable.expenseId, expenseIds)),
        ])
      : [[], []];

  const splitsByExpense = new Map<string, typeof splits>();
  for (const s of splits) {
    const arr = splitsByExpense.get(s.expenseId) ?? [];
    arr.push(s);
    splitsByExpense.set(s.expenseId, arr);
  }
  const commentsByExpense = new Map<string, typeof comments>();
  for (const c of comments) {
    const arr = commentsByExpense.get(c.expenseId) ?? [];
    arr.push(c);
    commentsByExpense.set(c.expenseId, arr);
  }

  res.json(
    BootstrapResponse.parse({
      user: serializeUser(req.localUser!),
      groups: groups.map(serializeGroup),
      members: members.map(serializeMember),
      expenses: expenses.map((e) =>
        serializeExpense(
          e,
          splitsByExpense.get(e.id) ?? [],
          commentsByExpense.get(e.id) ?? [],
        ),
      ),
      settlements: settlements.map(serializeSettlement),
      recurring: recurring.map(serializeRecurring),
      invitations: invitations.map(serializeInvitation),
      notifications: notifications.map(serializeNotification),
    }),
  );
});

export default router;
