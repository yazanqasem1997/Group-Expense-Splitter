import {
  pgTable,
  uuid,
  text,
  timestamp,
  integer,
  numeric,
  boolean,
  jsonb,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { groupsTable } from "./groups";
import { usersTable } from "./users";
import { expensesTable } from "./expenses";

export const receiptSessionsTable = pgTable(
  "receipt_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    groupId: uuid("group_id")
      .notNull()
      .references(() => groupsTable.id, { onDelete: "cascade" }),
    createdByUserId: uuid("created_by_user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    imageObjectPath: text("image_object_path").notNull(),
    contentType: text("content_type").notNull().default("image/jpeg"),
    rawOcrText: text("raw_ocr_text").notNull().default(""),
    rawOcrResponse: jsonb("raw_ocr_response"),
    ocrLanguage: text("ocr_language").notNull().default("eng"),
    ocrConfidence: numeric("ocr_confidence", { precision: 5, scale: 2 }),
    ocrLayout: jsonb("ocr_layout"),
    merchant: text("merchant"),
    /** What kind of shop or bill this is (one of the itemisation categories). */
    category: text("category"),
    receiptDate: text("receipt_date"),
    parsedTotal: numeric("parsed_total", { precision: 18, scale: 3 }),
    subtotal: numeric("subtotal", { precision: 18, scale: 3 }),
    tax: numeric("tax", { precision: 18, scale: 3 }),
    tip: numeric("tip", { precision: 18, scale: 3 }),
    discount: numeric("discount", { precision: 18, scale: 3 }),
    serviceCharge: numeric("service_charge", { precision: 18, scale: 3 }),
    rounding: numeric("rounding", { precision: 18, scale: 3 }),
    currency: text("currency"),
    reconciliationStatus: text("reconciliation_status").notNull().default("insufficient"),
    reconciliationDifference: numeric("reconciliation_difference", { precision: 18, scale: 3 }),
    reconciliationWarnings: jsonb("reconciliation_warnings").$type<string[]>().notNull().default([]),
    linkedExpenseId: uuid("linked_expense_id").references(() => expensesTable.id, {
      onDelete: "set null",
    }),
    status: text("status").notNull().default("draft"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    index("receipt_sessions_group_idx").on(t.groupId),
    index("receipt_sessions_expense_idx").on(t.linkedExpenseId),
  ],
);

export const receiptItemsTable = pgTable(
  "receipt_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    receiptId: uuid("receipt_id")
      .notNull()
      .references(() => receiptSessionsTable.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    name: text("name").notNull(),
    category: text("category"),
    amount: numeric("amount", { precision: 18, scale: 3 }),
    quantity: numeric("quantity", { precision: 18, scale: 3 }),
    unitPrice: numeric("unit_price", { precision: 18, scale: 3 }),
    printedAmount: numeric("printed_amount", { precision: 18, scale: 3 }),
    calculatedAmount: numeric("calculated_amount", { precision: 18, scale: 3 }),
    confidence: numeric("confidence", { precision: 5, scale: 2 }),
    sourceText: text("source_text"),
    sourceBbox: jsonb("source_bbox"),
    checkStatus: text("check_status").notNull().default("unavailable"),
    uncertain: boolean("uncertain").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [index("receipt_items_receipt_idx").on(t.receiptId)],
);

export const receiptClaimsTable = pgTable(
  "receipt_claims",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    receiptItemId: uuid("receipt_item_id")
      .notNull()
      .references(() => receiptItemsTable.id, { onDelete: "cascade" }),
    memberKey: text("member_key").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("receipt_claims_item_idx").on(t.receiptItemId),
    uniqueIndex("receipt_claims_item_member_idx").on(t.receiptItemId, t.memberKey),
  ],
);

export const insertReceiptSessionSchema = createInsertSchema(receiptSessionsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertReceiptSession = z.infer<typeof insertReceiptSessionSchema>;
export type ReceiptSession = typeof receiptSessionsTable.$inferSelect;
export type ReceiptItem = typeof receiptItemsTable.$inferSelect;
export type ReceiptClaim = typeof receiptClaimsTable.$inferSelect;