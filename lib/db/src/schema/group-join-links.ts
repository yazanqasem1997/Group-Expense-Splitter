import {
  pgTable,
  uuid,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { groupsTable } from "./groups";
import { usersTable } from "./users";

/** A single revocable share link per group. Possession of its token permits joining. */
export const groupJoinLinksTable = pgTable(
  "group_join_links",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    groupId: uuid("group_id")
      .notNull()
      .references(() => groupsTable.id, { onDelete: "cascade" }),
    token: text("token").notNull().unique(),
    createdByUserId: uuid("created_by_user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [uniqueIndex("group_join_links_group_idx").on(t.groupId)],
);

export type GroupJoinLink = typeof groupJoinLinksTable.$inferSelect;
