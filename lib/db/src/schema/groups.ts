import {
  pgTable,
  uuid,
  text,
  timestamp,
  boolean,
  integer,
  date,
  jsonb,
  index,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

/**
 * A group is a shared ledger (trip, household, couple, etc.). Membership is
 * modeled separately in `groupMembersTable` so that a user may belong to many
 * groups and a group may contain both real users and pending placeholders.
 */
export const groupsTable = pgTable(
  "groups",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    emoji: text("emoji").notNull().default("💸"),
    currency: text("currency").notNull().default("USD"),
    type: text("type").notNull().default("other"),
    /** Whether this group displays netted debt relationships instead of raw pairwise debts. */
    simplifyDebtsEnabled: boolean("simplify_debts_enabled").notNull().default(true),
    /** Owner/creator user id. Always retains admin powers. */
    createdByUserId: uuid("created_by_user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "restrict" }),
    isArchived: boolean("is_archived").notNull().default(false),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    /** Group period ended; ended groups may still have unsettled balances. */
    isEnded: boolean("is_ended").notNull().default(false),
    endedAt: timestamp("ended_at", { withTimezone: true }),
    reminderDays: integer("reminder_days"),
    startDate: date("start_date", { mode: "string" }),
    endDate: date("end_date", { mode: "string" }),
    /** Trip Pass: Plus features for everyone in the group until this time. */
    tripPassExpiresAt: timestamp("trip_pass_expires_at", { withTimezone: true }),
    tripStartReminderDays: integer("trip_start_reminder_days"),
    settleUpReminderDays: integer("settle_up_reminder_days"),
    reminderChannel: text("reminder_channel"),
    /** Nudge campaign config (opaque JSON matching client NudgeCampaign). */
    nudgeCampaign: jsonb("nudge_campaign"),
    /** Group-specific search rules for the itemization breakdown. */
    customItemizations: jsonb("custom_itemizations"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [index("groups_created_by_idx").on(t.createdByUserId)],
);

/**
 * Membership row. `userId` is null for pending/placeholder members (people who
 * have been added by name/email but have not yet joined). `memberKey` is a
 * stable per-group identifier that mirrors the client-side member id, so that
 * splits/settlements can reference members before they map to a real user.
 */
export const groupMembersTable = pgTable(
  "group_members",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    groupId: uuid("group_id")
      .notNull()
      .references(() => groupsTable.id, { onDelete: "cascade" }),
    userId: uuid("user_id").references(() => usersTable.id, {
      onDelete: "set null",
    }),
    /** Stable member identifier within the group (matches client member id). */
    memberKey: text("member_key").notNull(),
    name: text("name").notNull(),
    email: text("email"),
    phone: text("phone"),
    avatarColor: text("avatar_color").notNull().default("#6366F1"),
    photo: text("photo"),
    /** Set when the person left or was removed; row kept so old expenses keep their name. */
    leftAt: timestamp("left_at", { withTimezone: true }),
    isAdmin: boolean("is_admin").notNull().default(false),
    isPending: boolean("is_pending").notNull().default(false),
    joinedAt: timestamp("joined_at", { withTimezone: true }),
    /** Cursor for WhatsApp-style chat read receipts: messages with createdAt <= this are "read" by this member. */
    lastReadMessagesAt: timestamp("last_read_messages_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    index("group_members_group_idx").on(t.groupId),
    index("group_members_user_idx").on(t.userId),
    index("group_members_group_key_idx").on(t.groupId, t.memberKey),
  ],
);

/**
 * Pending invitations to join a group. Tracked separately from membership so
 * that decline/expiry does not create a placeholder member row.
 */
export const groupInvitationsTable = pgTable(
  "group_invitations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    groupId: uuid("group_id")
      .notNull()
      .references(() => groupsTable.id, { onDelete: "cascade" }),
    inviterUserId: uuid("inviter_user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    invitedEmail: text("invited_email").notNull(),
    invitedName: text("invited_name"),
    /** Resolved member key once accepted. */
    invitedMemberKey: text("invited_member_key"),
    status: text("status").notNull().default("pending"),
    /** Opaque token used to accept the invite via link/QR. */
    token: text("token").notNull().unique(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    index("group_invitations_group_idx").on(t.groupId),
    index("group_invitations_email_idx").on(t.invitedEmail),
  ],
);

export const insertGroupSchema = createInsertSchema(groupsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertGroup = z.infer<typeof insertGroupSchema>;
export type Group = typeof groupsTable.$inferSelect;

export const insertGroupMemberSchema = createInsertSchema(
  groupMembersTable,
).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertGroupMember = z.infer<typeof insertGroupMemberSchema>;
export type GroupMember = typeof groupMembersTable.$inferSelect;

export const insertGroupInvitationSchema = createInsertSchema(
  groupInvitationsTable,
).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertGroupInvitation = z.infer<typeof insertGroupInvitationSchema>;
export type GroupInvitation = typeof groupInvitationsTable.$inferSelect;
