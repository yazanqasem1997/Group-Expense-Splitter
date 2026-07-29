import { pgTable, uuid, text, timestamp, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

/**
 * Application users. Each row is linked 1:1 to a Clerk identity via
 * `clerkUserId`. The internal `id` (uuid) is the stable primary key used
 * across all foreign keys so that Clerk id churn never cascades into the
 * relational graph.
 */
export const usersTable = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  clerkUserId: text("clerk_user_id").notNull().unique(),
  name: text("name").notNull(),
  email: text("email"),
  phone: text("phone"),
  avatarColor: text("avatar_color").notNull().default("#6366F1"),
  photo: text("photo"),
  defaultCurrency: text("default_currency").notNull().default("USD"),
  /** Per-user notification preferences (opaque JSON matching client NotifPrefs). */
  notifPrefs: jsonb("notif_prefs"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const insertUserSchema = createInsertSchema(usersTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof usersTable.$inferSelect;
