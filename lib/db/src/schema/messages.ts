import { pgTable, uuid, text, timestamp, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { groupsTable } from "./groups";

/**
 * Free-form chat messages posted to a group's activity feed.
 */
export const groupMessagesTable = pgTable(
  "group_messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    groupId: uuid("group_id")
      .notNull()
      .references(() => groupsTable.id, { onDelete: "cascade" }),
    memberKey: text("member_key").notNull(),
    text: text("text").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("group_messages_group_idx").on(t.groupId)],
);

export const insertGroupMessageSchema = createInsertSchema(
  groupMessagesTable,
).omit({ id: true, createdAt: true });
export type InsertGroupMessage = z.infer<typeof insertGroupMessageSchema>;
export type GroupMessage = typeof groupMessagesTable.$inferSelect;
