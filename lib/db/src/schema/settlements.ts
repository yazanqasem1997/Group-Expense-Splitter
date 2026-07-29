import {
  pgTable,
  uuid,
  text,
  timestamp,
  numeric,
  index,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { groupsTable } from "./groups";
import { usersTable } from "./users";

/**
 * A recorded payment from one member to another that reduces outstanding debt.
 * Members are referenced by their stable per-group `memberKey`.
 */
export const settlementsTable = pgTable(
  "settlements",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    groupId: uuid("group_id")
      .notNull()
      .references(() => groupsTable.id, { onDelete: "cascade" }),
    fromMemberKey: text("from_member_key").notNull(),
    toMemberKey: text("to_member_key").notNull(),
    amount: numeric("amount", { precision: 18, scale: 2 }).notNull(),
    currency: text("currency").notNull(),
    note: text("note"),
    /** user id of whoever recorded the settlement (audit convenience). */
    recordedByUserId: uuid("recorded_by_user_id").references(
      () => usersTable.id,
      { onDelete: "set null" },
    ),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [index("settlements_group_idx").on(t.groupId)],
);

export const insertSettlementSchema = createInsertSchema(settlementsTable).omit(
  { id: true, createdAt: true, updatedAt: true },
);
export type InsertSettlement = z.infer<typeof insertSettlementSchema>;
export type Settlement = typeof settlementsTable.$inferSelect;
