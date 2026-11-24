import {
  pgTable,
  uuid,
  text,
  timestamp,
  numeric,
  integer,
  boolean,
  date,
  jsonb,
  index,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { groupsTable } from "./groups";

/**
 * A recurring expense schedule. On each due date the server materializes a real
 * `expenses` row (linked back via expenses.recurringId) and advances
 * `nextDueAt`/`occurrenceCount`. `splits` is stored as JSON because the template
 * splits are re-applied verbatim to every generated expense.
 */
export const recurringExpensesTable = pgTable(
  "recurring_expenses",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    groupId: uuid("group_id")
      .notNull()
      .references(() => groupsTable.id, { onDelete: "cascade" }),
    description: text("description").notNull(),
    amount: numeric("amount", { precision: 18, scale: 2 }).notNull(),
    currency: text("currency").notNull(),
    paidByMemberKey: text("paid_by_member_key").notNull(),
    splitType: text("split_type").notNull().default("equal"),
    /** Template splits: [{ memberKey, amount, percentage?, paid? }]. */
    splits: jsonb("splits").notNull(),
    category: text("category").notNull().default("other"),
    frequency: text("frequency").notNull(),
    customDays: integer("custom_days"),
    intervalMonths: integer("interval_months"),
    intervalWeeks: integer("interval_weeks"),
    intervalDays: integer("interval_days"),
    dayOfWeek: integer("day_of_week"),
    timeOfDay: text("time_of_day"),
    /** IANA timezone of the person who created the schedule. */
    timeZone: text("time_zone"),
    endType: text("end_type").notNull().default("never"),
    endCount: integer("end_count"),
    endDate: date("end_date", { mode: "string" }),
    occurrenceCount: integer("occurrence_count").notNull().default(0),
    nextDueAt: timestamp("next_due_at", { withTimezone: true }).notNull(),
    isActive: boolean("is_active").notNull().default(true),
    /** Timestamp of the last successful materialization run (idempotency guard). */
    lastRunAt: timestamp("last_run_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    index("recurring_group_idx").on(t.groupId),
    index("recurring_next_due_idx").on(t.nextDueAt),
  ],
);

export const insertRecurringExpenseSchema = createInsertSchema(
  recurringExpensesTable,
).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertRecurringExpense = z.infer<
  typeof insertRecurringExpenseSchema
>;
export type RecurringExpense = typeof recurringExpensesTable.$inferSelect;
