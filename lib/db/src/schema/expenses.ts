import {
  pgTable,
  uuid,
  text,
  timestamp,
  date,
  numeric,
  jsonb,
  index,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { groupsTable } from "./groups";
import { usersTable } from "./users";

/**
 * An expense within a group. Monetary amounts use `numeric` for exact decimal
 * arithmetic. The payer and split targets reference members by their stable
 * per-group `memberKey` (see group_members) so an expense stays valid even for
 * pending members that have not yet mapped to a real user.
 */
export const expensesTable = pgTable(
  "expenses",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    groupId: uuid("group_id")
      .notNull()
      .references(() => groupsTable.id, { onDelete: "cascade" }),
    description: text("description").notNull(),
    amount: numeric("amount", { precision: 18, scale: 2 }).notNull(),
    currency: text("currency").notNull(),
    /** member_key of the payer within the group. */
    paidByMemberKey: text("paid_by_member_key").notNull(),
    splitType: text("split_type").notNull().default("equal"),
    category: text("category").notNull().default("other"),
    notes: text("notes"),
    /** user id of whoever recorded the expense (audit convenience). */
    addedByUserId: uuid("added_by_user_id").references(() => usersTable.id, {
      onDelete: "set null",
    }),
    /** Recurring schedule that generated this expense, if any. */
    recurringId: uuid("recurring_id"),
    /** Receipt session that produced this expense, if any. */
    receiptId: uuid("receipt_id"),
    /** Emoji reactions map: { "😀": [memberKey, ...] }. */
    reactions: jsonb("reactions"),
    /** Optional calendar date when the expense was paid; null keeps legacy createdAt fallback. */
    paymentDate: date("payment_date", { mode: "string" }),
    /** Rate locked on the day it happened: units of fxRateCurrency (the group's currency) per 1 unit of `currency`. Null when no conversion is needed. */
    fxRate: numeric("fx_rate", { precision: 24, scale: 10 }),
    fxRateCurrency: text("fx_rate_currency"),
    /** For receipts with mixed lines: amount per itemisation category, e.g. { food: 239.25, shopping: 90.75 }. */
    categoryBreakdown: jsonb("category_breakdown").$type<Record<string, number>>(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    index("expenses_group_idx").on(t.groupId),
    index("expenses_recurring_idx").on(t.recurringId),
  ],
);

/**
 * One split line per member for an expense. `amount` is the member's share;
 * `paid` optionally tracks multi-payer contributions. `percentage` is retained
 * for percentage splits so the original intent survives edits.
 */
export const expenseSplitsTable = pgTable(
  "expense_splits",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    expenseId: uuid("expense_id")
      .notNull()
      .references(() => expensesTable.id, { onDelete: "cascade" }),
    memberKey: text("member_key").notNull(),
    amount: numeric("amount", { precision: 18, scale: 2 }).notNull(),
    percentage: numeric("percentage", { precision: 9, scale: 4 }),
    paid: numeric("paid", { precision: 18, scale: 2 }),
  },
  (t) => [index("expense_splits_expense_idx").on(t.expenseId)],
);

/**
 * Threaded comments on an expense.
 */
export const expenseCommentsTable = pgTable(
  "expense_comments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    expenseId: uuid("expense_id")
      .notNull()
      .references(() => expensesTable.id, { onDelete: "cascade" }),
    memberKey: text("member_key").notNull(),
    text: text("text").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("expense_comments_expense_idx").on(t.expenseId)],
);

export const insertExpenseSchema = createInsertSchema(expensesTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertExpense = z.infer<typeof insertExpenseSchema>;
export type Expense = typeof expensesTable.$inferSelect;

export const insertExpenseSplitSchema = createInsertSchema(
  expenseSplitsTable,
).omit({ id: true });
export type InsertExpenseSplit = z.infer<typeof insertExpenseSplitSchema>;
export type ExpenseSplit = typeof expenseSplitsTable.$inferSelect;

export const insertExpenseCommentSchema = createInsertSchema(
  expenseCommentsTable,
).omit({ id: true, createdAt: true });
export type InsertExpenseComment = z.infer<typeof insertExpenseCommentSchema>;
export type ExpenseComment = typeof expenseCommentsTable.$inferSelect;
