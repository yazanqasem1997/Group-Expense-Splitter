import { Router, type IRouter } from "express";
import {
  db,
  groupsTable,
  groupMembersTable,
  expensesTable,
  expenseSplitsTable,
  settlementsTable,
  recurringExpensesTable,
  importJobsTable,
} from "@workspace/db";
import { ImportSnapshotBody } from "@workspace/api-zod";
import { requireAuth } from "../lib/auth";
import { withIdempotency } from "../lib/idempotency";
import { randomKey } from "../lib/params";
import { recordAudit } from "../lib/authz";
import { serializeImportJob } from "../lib/serialize";

const router: IRouter = Router();

type Split = {
  memberKey: string;
  amount: number;
  percentage?: number | null;
  paid?: number | null;
};

function dateOnly(value: Date | null | undefined): string | null {
  return value ? value.toISOString().slice(0, 10) : null;
}

/**
 * Bulk import a client snapshot. Everything is created inside a single
 * transaction so a partial import can never leave orphaned rows, and the whole
 * request is idempotent when an Idempotency-Key header is supplied.
 */
router.post("/imports", requireAuth, async (req, res): Promise<void> => {
  const parsed = ImportSnapshotBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const userId = req.localUser!.id;
  const user = req.localUser!;
  const body = parsed.data;

  await withIdempotency(req, res, async (record) => {
    const job = await db.transaction(async (tx) => {
      let groupsCreated = 0;
      let expensesCreated = 0;
      let settlementsCreated = 0;
      let recurringCreated = 0;
      let membersCreated = 0;

      for (const g of body.groups) {
        const [group] = await tx
          .insert(groupsTable)
          .values({
            name: g.name,
            emoji: g.emoji ?? "💸",
            currency: g.currency ?? body.defaultCurrency ?? user.defaultCurrency,
            type: g.type ?? "other",
            createdByUserId: userId,
            startDate: g.startDate ?? null,
            endDate: g.endDate ?? null,
            reminderDays: g.reminderDays ?? null,
            tripStartReminderDays: g.tripStartReminderDays ?? null,
            settleUpReminderDays: g.settleUpReminderDays ?? null,
            reminderChannel: g.reminderChannel ?? null,
          })
          .returning();
        groupsCreated++;

        // Insert provided members. Track whether the importing user is already
        // present so we can add them as admin exactly once. A member is
        // considered the creator when their email matches (legacy snapshot data
        // may not carry a userId).
        let creatorPresent = false;
        for (const mem of g.members ?? []) {
          const isCreator =
            (mem.email && user.email && mem.email.toLowerCase() === user.email.toLowerCase());
          if (isCreator) {
            creatorPresent = true;
          }
          await tx.insert(groupMembersTable).values({
            groupId: group!.id,
            // Link to the real user account if this is the creator's row.
            ...(isCreator ? { userId } : {}),
            memberKey: mem.memberKey ?? randomKey(),
            name: mem.name,
            email: mem.email ?? null,
            phone: mem.phone ?? null,
            avatarColor: mem.avatarColor ?? "#6366F1",
            photo: mem.photo ?? null,
            isAdmin: isCreator ? true : (mem.isAdmin ?? false),
            isPending: isCreator ? false : (mem.isPending ?? true),
            ...(isCreator ? { joinedAt: new Date() } : {}),
          });
          membersCreated++;
        }
        if (!creatorPresent) {
          // Creator was not in the provided members list — add them now.
          await tx.insert(groupMembersTable).values({
            groupId: group!.id,
            userId,
            memberKey: randomKey(),
            name: user.name,
            email: user.email,
            avatarColor: user.avatarColor,
            photo: user.photo,
            isAdmin: true,
            isPending: false,
            joinedAt: new Date(),
          });
          membersCreated++;
        }

        for (const e of g.expenses ?? []) {
          const [expense] = await tx
            .insert(expensesTable)
            .values({
              groupId: group!.id,
              description: e.description,
              amount: String(e.amount),
              currency: e.currency,
              paidByMemberKey: e.paidByMemberKey,
              splitType: e.splitType ?? "equal",
              category: e.category ?? "other",
              notes: e.notes ?? null,
              addedByUserId: userId,
              reactions: (e.reactions ?? null) as never,
              paymentDate: dateOnly(e.paymentDate),
            })
            .returning();
          expensesCreated++;
          const splits = (e.splits ?? []) as Split[];
          if (splits.length > 0) {
            await tx.insert(expenseSplitsTable).values(
              splits.map((s) => ({
                expenseId: expense!.id,
                memberKey: s.memberKey,
                amount: String(s.amount),
                percentage:
                  s.percentage != null ? String(s.percentage) : null,
                paid: s.paid != null ? String(s.paid) : null,
              })),
            );
          }
        }

        for (const s of g.settlements ?? []) {
          await tx.insert(settlementsTable).values({
            groupId: group!.id,
            fromMemberKey: s.fromMemberKey,
            toMemberKey: s.toMemberKey,
            amount: String(s.amount),
            currency: s.currency,
            note: s.note ?? null,
            recordedByUserId: userId,
          });
          settlementsCreated++;
        }

        for (const r of g.recurring ?? []) {
          const rsplits = (r.splits ?? []) as Split[];
          await tx.insert(recurringExpensesTable).values({
            groupId: group!.id,
            description: r.description,
            amount: String(r.amount),
            currency: r.currency,
            paidByMemberKey: r.paidByMemberKey,
            splitType: r.splitType ?? "equal",
            splits: rsplits.map((s) => ({
              memberKey: s.memberKey,
              amount: s.amount,
              percentage: s.percentage ?? null,
              paid: s.paid ?? null,
            })) as never,
            category: r.category ?? "other",
            frequency: r.frequency,
            customDays: r.customDays ?? null,
            dayOfWeek: r.dayOfWeek ?? null,
            timeOfDay: r.timeOfDay ?? null,
            timeZone: (r as typeof r & { timeZone?: string }).timeZone ?? null,
            endType: r.endType ?? "never",
            endCount: r.endCount ?? null,
            endDate: r.endDate ?? null,
            nextDueAt: r.nextDueAt,
            isActive: r.isActive ?? true,
          } as any);
          recurringCreated++;
        }

        await recordAudit(tx as never, {
          entityType: "group",
          entityId: group!.id,
          groupId: group!.id,
          action: "created",
          changedByUserId: userId,
          fieldChanges: [{ field: "source", oldValue: "", newValue: "import" }],
        } as any);
      }

      const [jobRow] = await tx
        .insert(importJobsTable)
        .values({
          userId,
          source: body.source ?? "bootstrap",
          status: "completed",
          groupsCreated,
          expensesCreated,
          counts: {
            groups: groupsCreated,
            members: membersCreated,
            expenses: expensesCreated,
            settlements: settlementsCreated,
            recurring: recurringCreated,
          } as never,
          completedAt: new Date(),
        })
        .returning();
      return jobRow!;
    });

    const payload = serializeImportJob(job);
    record(201, payload);
    res.status(201).json(payload);
  });
});

export default router;
