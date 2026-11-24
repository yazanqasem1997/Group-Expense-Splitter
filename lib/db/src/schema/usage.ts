import { integer, jsonb, pgTable, primaryKey, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

/** Receipt scans per user per calendar month (UTC), for the free-plan limit. */
export const receiptScanUsageTable = pgTable(
  "receipt_scan_usage",
  {
    userId: uuid("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
    month: text("month").notNull(),
    scans: integer("scans").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.userId, t.month] })],
);

/** Crashes and errors reported by the app, so problems show up before reviews do. */
export const clientErrorsTable = pgTable("client_errors", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").references(() => usersTable.id, { onDelete: "set null" }),
  message: text("message").notNull(),
  stack: text("stack"),
  context: jsonb("context"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Someone who joined from a friend's invite. The inviter earns a Trip Pass once they add an expense. */
export const referralsTable = pgTable("referrals", {
  referredUserId: uuid("referred_user_id").primaryKey().references(() => usersTable.id, { onDelete: "cascade" }),
  referrerUserId: uuid("referrer_user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  rewardedAt: timestamp("rewarded_at", { withTimezone: true }),
});

/** Last run of scheduled jobs, so a restart doesn't send the daily digest twice. */
export const jobRunsTable = pgTable("job_runs", {
  name: text("name").primaryKey(),
  lastRunAt: timestamp("last_run_at", { withTimezone: true }).notNull(),
});

/** Each morning digest, kept so the war room can show the latest briefing. */
export const digestReportsTable = pgTable("digest_reports", {
  id: uuid("id").primaryKey().defaultRandom(),
  briefing: text("briefing").notNull().default(""),
  emails: jsonb("emails"),
  crashes: jsonb("crashes"),
  stats: jsonb("stats"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Suggested changes from the digest. The owner approves or declines them in the war room. */
export const ownerSuggestionsTable = pgTable("owner_suggestions", {
  id: uuid("id").primaryKey().defaultRandom(),
  reportId: uuid("report_id").references(() => digestReportsTable.id, { onDelete: "set null" }),
  /** Where the idea came from: "digest" (support email and crashes) or "reviews". */
  source: text("source").notNull().default("digest"),
  title: text("title").notNull(),
  reason: text("reason").notNull(),
  change: text("change").notNull(),
  /** pending | approved | planned | declined (dismissed) | done */
  status: text("status").notNull().default("pending"),
  /** The owner note when deciding, from the app or the desktop dashboard. */
  note: text("note"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  decidedAt: timestamp("decided_at", { withTimezone: true }),
});

/** Each time the owner reads the app store reviews: what came in and the summary. */
export const reviewSnapshotsTable = pgTable("review_snapshots", {
  id: uuid("id").primaryKey().defaultRandom(),
  summary: text("summary").notNull().default(""),
  reviews: jsonb("reviews"),
  sources: jsonb("sources"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Each Claude call (receipt scans, morning briefing, store reviews) with tokens and cost, for the war room. */
export const aiUsageTable = pgTable("ai_usage", {
  id: uuid("id").primaryKey().defaultRandom(),
  feature: text("feature").notNull(),
  model: text("model").notNull(),
  inputTokens: integer("input_tokens").notNull().default(0),
  outputTokens: integer("output_tokens").notNull().default(0),
  /** Cost in millionths of a US dollar. */
  costMicros: integer("cost_micros").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
