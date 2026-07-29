import {
  pgTable,
  uuid,
  text,
  timestamp,
  jsonb,
  index,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

/**
 * Append-only audit log capturing mutations across the system. `entityType`
 * (e.g. "expense", "group", "settlement") + `entityId` identify the target;
 * `fieldChanges` holds a JSON diff for update actions.
 */
export const auditLogTable = pgTable(
  "audit_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    entityType: text("entity_type").notNull(),
    entityId: uuid("entity_id").notNull(),
    groupId: uuid("group_id"),
    action: text("action").notNull(),
    changedByUserId: uuid("changed_by_user_id").references(
      () => usersTable.id,
      { onDelete: "set null" },
    ),
    /** [{ field, oldValue, newValue }] */
    fieldChanges: jsonb("field_changes"),
    changedAt: timestamp("changed_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("audit_entity_idx").on(t.entityType, t.entityId),
    index("audit_group_idx").on(t.groupId),
  ],
);

export const insertAuditLogSchema = createInsertSchema(auditLogTable).omit({
  id: true,
  changedAt: true,
});
export type InsertAuditLog = z.infer<typeof insertAuditLogSchema>;
export type AuditLog = typeof auditLogTable.$inferSelect;
