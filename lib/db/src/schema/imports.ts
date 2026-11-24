import {
  pgTable,
  uuid,
  text,
  integer,
  timestamp,
  jsonb,
  index,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

/**
 * Metadata for bulk import / bootstrap operations (e.g. migrating a device's
 * local snapshot into the backend). Tracks the source, counts of records
 * created, status, and any error so imports are observable and re-runnable.
 */
export const importJobsTable = pgTable(
  "import_jobs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    source: text("source").notNull().default("bootstrap"),
    status: text("status").notNull().default("pending"),
    /** Counts of records created per entity type. */
    counts: jsonb("counts"),
    groupsCreated: integer("groups_created").notNull().default(0),
    expensesCreated: integer("expenses_created").notNull().default(0),
    error: text("error"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (t) => [index("import_jobs_user_idx").on(t.userId)],
);

export const insertImportJobSchema = createInsertSchema(importJobsTable).omit({
  id: true,
  createdAt: true,
});
export type InsertImportJob = z.infer<typeof insertImportJobSchema>;
export type ImportJob = typeof importJobsTable.$inferSelect;
