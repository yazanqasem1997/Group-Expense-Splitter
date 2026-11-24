import { pgTable, uuid, text, timestamp, index, uniqueIndex } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { usersTable } from "./users";

export const friendRequestsTable = pgTable(
  "friend_requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    senderUserId: uuid("sender_user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
    recipientUserId: uuid("recipient_user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
    status: text("status").notNull().default("pending"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    respondedAt: timestamp("responded_at", { withTimezone: true }),
  },
  (table) => [
    index("friend_requests_sender_idx").on(table.senderUserId),
    index("friend_requests_recipient_idx").on(table.recipientUserId),
    uniqueIndex("friend_requests_pending_pair_idx")
      .on(table.senderUserId, table.recipientUserId)
      .where(sql`${table.status} = 'pending'`),
  ],
);
