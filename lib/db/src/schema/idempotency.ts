import {
  pgTable,
  uuid,
  text,
  integer,
  timestamp,
  jsonb,
  index,
  unique,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

/**
 * Idempotency records for write operations. A client supplies an
 * `Idempotency-Key` header; the first request for a given (userId, key, method,
 * path) tuple executes and its response is cached here. Retries with the same
 * key replay the stored `responseStatus`/`responseBody` instead of re-running
 * the mutation, guaranteeing at-most-once side effects.
 *
 * Concurrency safety via atomic pending reservation:
 *   1. INSERT a row with responseStatus = NULL, lockedAt = NOW()  (ON CONFLICT DO NOTHING)
 *   2. If 1 row returned → we own the reservation; run the handler; UPDATE with the result.
 *   3. If 0 rows returned → another request owns it; poll until responseStatus IS NOT NULL
 *      or the lock is stale (lockedAt older than LOCK_TTL_MS), then replay or steal.
 */
export const idempotencyKeysTable = pgTable(
  "idempotency_keys",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    method: text("method").notNull(),
    path: text("path").notNull(),
    responseStatus: integer("response_status"),
    responseBody: jsonb("response_body"),
    /** Set when the reservation is first claimed; NULL once completed. Used for stale-lock detection. */
    lockedAt: timestamp("locked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    unique("idempotency_user_key_uq").on(t.userId, t.key, t.method, t.path),
    index("idempotency_user_idx").on(t.userId),
  ],
);

export const insertIdempotencyKeySchema = createInsertSchema(
  idempotencyKeysTable,
).omit({ id: true, createdAt: true });
export type InsertIdempotencyKey = z.infer<typeof insertIdempotencyKeySchema>;
export type IdempotencyKey = typeof idempotencyKeysTable.$inferSelect;
