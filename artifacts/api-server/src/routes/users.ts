import { Router, type IRouter } from "express";
import { and, eq, inArray, isNull, ne, sql } from "drizzle-orm";
import { clientErrorsTable } from "@workspace/db";
import { claimInviteReward, redeemTripPass, scanUsage } from "../lib/plan";
import { getMembership } from "../lib/authz";
import { clerkClient, getAuth } from "@clerk/express";
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
import { ACCOUNT_DELETION_RECOVERY_WINDOW_MS } from "../lib/accountDeletionScheduler";
import { ObjectStorageService } from "../lib/objectStorage";

const router: IRouter = Router();
const objectStorage = new ObjectStorageService();
const PROFILE_PHOTO_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

router.get("/profile-photos/:userId", async (req, res): Promise<void> => {
  const userId = req.params.userId;
  if (typeof userId !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId)) {
    res.status(404).end();
    return;
  }
  const [user] = await db.select({ photo: usersTable.photo })
    .from(usersTable)
    .where(and(eq(usersTable.id, userId), isNull(usersTable.deletionScheduledFor)))
    .limit(1);
  if (user?.photo !== `/api/profile-photos/${userId}`) {
    res.status(404).end();
    return;
  }
  const file = await objectStorage.getObjectEntityFile(`/objects/profile-photos/${userId}/avatar`);
  const [exists] = await file.exists();
  if (!exists) {
    res.status(404).end();
    return;
  }
  const [metadata] = await file.getMetadata();
  if (!PROFILE_PHOTO_TYPES.has(String(metadata.contentType)) || Number(metadata.size) > 5 * 1024 * 1024) {
    res.status(404).end();
    return;
  }
  res.setHeader("Content-Type", String(metadata.contentType));
  res.setHeader("Cache-Control", "public, max-age=3600");
  file.createReadStream().on("error", () => {
    if (!res.headersSent) res.status(404).end();
    else res.destroy();
  }).pipe(res);
});

router.post("/me/profile-photo/upload-url", requireAuth, async (req, res): Promise<void> => {
  const contentType = (req.body as { contentType?: unknown } | undefined)?.contentType;
  if (typeof contentType !== "string" || !PROFILE_PHOTO_TYPES.has(contentType)) {
    res.status(400).json({ error: "Choose a JPEG, PNG, or WebP image." });
    return;
  }
  const target = await objectStorage.getProfilePhotoUploadTarget(req.localUser!.id);
  res.setHeader("Cache-Control", "no-store");
  res.json({ ...target, photoUri: `/api/profile-photos/${req.localUser!.id}` });
});

router.post("/me/profile-photo/complete", requireAuth, async (req, res): Promise<void> => {
  const userId = req.localUser!.id;
  const file = await objectStorage.getObjectEntityFile(`/objects/profile-photos/${userId}/avatar`);
  const [exists] = await file.exists();
  if (!exists) {
    res.status(400).json({ error: "Profile photo upload was not found." });
    return;
  }
  const [metadata] = await file.getMetadata();
  if (!PROFILE_PHOTO_TYPES.has(String(metadata.contentType)) || Number(metadata.size) < 1 || Number(metadata.size) > 5 * 1024 * 1024) {
    res.status(400).json({ error: "Profile photo must be an image up to 5 MB." });
    return;
  }
  const photo = `/api/profile-photos/${userId}`;
  await db.update(usersTable).set({ photo }).where(eq(usersTable.id, userId));
  res.setHeader("Cache-Control", "no-store");
  res.json({ photo });
});

router.post("/contacts/match", requireAuth, async (req, res): Promise<void> => {
  const body = (req.body ?? {}) as { emails?: unknown };
  if (
    !Array.isArray(body.emails) ||
    body.emails.length < 1 ||
    body.emails.length > 500 ||
    body.emails.some((email) => typeof email !== "string")
  ) {
    res.status(400).json({ error: "Provide between 1 and 500 valid email addresses" });
    return;
  }

  // Keep this request transient: do not persist or log submitted contact data.
  const emails = [...new Set(
    (body.emails as string[])
      .map((email) => email.trim().toLowerCase())
      .filter((email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)),
  )];
  if (emails.length === 0) {
    res.status(400).json({ error: "Provide at least one valid email address" });
    return;
  }

  const matches = await db
    .select({
      id: usersTable.id,
      name: usersTable.name,
      email: usersTable.email,
      avatarColor: usersTable.avatarColor,
      photo: usersTable.photo,
    })
    .from(usersTable)
    .where(and(
      inArray(sql<string>`lower(${usersTable.email})`, emails),
      ne(usersTable.id, req.localUser!.id),
      isNull(usersTable.deletionScheduledFor),
    ));

  res.setHeader("Cache-Control", "no-store");
  res.json(matches.filter((user) => !!user.email));
});

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

router.delete("/me", requireAuth, async (req, res): Promise<void> => {
  const requestedAt = new Date();
  const scheduledFor = new Date(
    requestedAt.getTime() + ACCOUNT_DELETION_RECOVERY_WINDOW_MS,
  );
  const [updated] = await db
    .update(usersTable)
    .set({
      deletionRequestedAt: requestedAt,
      deletionScheduledFor: scheduledFor,
    })
    .where(eq(usersTable.id, req.localUser!.id))
    .returning();

  if (!updated) {
    res.status(404).json({ error: "Account not found" });
    return;
  }

  req.log.warn(
    { userId: req.localUser!.id, scheduledFor },
    "Account deletion scheduled; confirmation email transport is not configured",
  );
  const sessionId = getAuth(req).sessionId;
  if (sessionId) {
    try {
      await clerkClient.sessions.revokeSession(sessionId);
    } catch (error) {
      req.log.error({ err: error }, "Failed to revoke the account deletion session");
    }
  }
  res.status(202).json({
    status: "scheduled",
    recoveryUntil: scheduledFor.toISOString(),
    confirmationEmailSent: false,
  });
});

router.get("/me/usage", requireAuth, async (req, res): Promise<void> => {
  const groupId = typeof req.query.groupId === "string" ? req.query.groupId : null;
  res.json(await scanUsage(req.localUser!.id, groupId));
});

// Uses one free Trip Pass (earned by inviting friends) on a group.
router.post("/groups/:groupId/trip-pass/redeem", requireAuth, async (req, res): Promise<void> => {
  const groupId = String(req.params.groupId);
  const membership = await getMembership(groupId, req.localUser!.id);
  if (!membership?.isMember) {
    res.status(404).json({ error: "Group not found" });
    return;
  }
  if ((await redeemTripPass(req.localUser!.id, groupId)) === "no_credit") {
    res.status(400).json({ error: "You don't have a free Trip Pass yet. Invite a friend to earn one." });
    return;
  }
  res.json(await scanUsage(req.localUser!.id, groupId));
});

// Spends one invite reward on what the person picked: 30 days of Plus, or a free Trip Pass.
router.post("/me/invite-reward", requireAuth, async (req, res): Promise<void> => {
  const choice = (req.body ?? {}).choice;
  if (choice !== "plus" && choice !== "trip_pass") {
    res.status(400).json({ error: "choice must be plus or trip_pass" });
    return;
  }
  if ((await claimInviteReward(req.localUser!.id, choice)) === "none") {
    res.status(400).json({ error: "You don't have an invite reward to claim yet." });
    return;
  }
  res.json(await scanUsage(req.localUser!.id, null));
});

// Crash and error reports from the app. Text is trimmed so a runaway loop can't store huge rows.
router.post("/client-errors", async (req, res): Promise<void> => {
  const body = (req.body ?? {}) as { message?: unknown; stack?: unknown; context?: unknown };
  const message = typeof body.message === "string" ? body.message.slice(0, 1000) : "";
  if (!message) {
    res.status(400).json({ error: "message is required" });
    return;
  }
  await db.insert(clientErrorsTable).values({
    userId: req.localUser?.id ?? null,
    message,
    stack: typeof body.stack === "string" ? body.stack.slice(0, 8000) : null,
    context: body.context && typeof body.context === "object" ? (body.context as never) : null,
  });
  res.status(204).end();
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
