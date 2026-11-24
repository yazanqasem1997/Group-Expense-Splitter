import { jsonb, doublePrecision, index, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

/** One-offs between two people (outside any group), shared by both of them. */
export const directPaymentsTable = pgTable(
  "direct_payments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** The id the creating phone gave it; both phones use it. */
    clientId: text("client_id").notNull(),
    createdBy: uuid("created_by").notNull(),
    fromUserId: uuid("from_user_id").notNull(),
    toUserId: uuid("to_user_id").notNull(),
    amount: doublePrecision("amount").notNull(),
    currency: text("currency").notNull(),
    reason: text("reason").notNull(),
    comments: text("comments"),
    category: text("category"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    /** The whole bill (payer, people, split) so both phones can show and edit it. */
    meta: jsonb("meta"),
  },
  (t) => [
    uniqueIndex("direct_payments_client_idx").on(t.clientId),
    index("direct_payments_from_idx").on(t.fromUserId),
    index("direct_payments_to_idx").on(t.toUserId),
  ],
);
