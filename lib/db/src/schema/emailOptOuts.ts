import { pgTable, text, timestamp } from "drizzle-orm/pg-core";

/** Email addresses that asked to stop receiving invitation and reminder emails. */
export const emailOptOutsTable = pgTable("email_opt_outs", {
  email: text("email").primaryKey(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
