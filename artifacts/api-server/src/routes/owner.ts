import { createHmac, timingSafeEqual } from "node:crypto";
import { Router, type IRouter, type NextFunction, type Request, type Response } from "express";
import { count, desc, eq, gte, sql } from "drizzle-orm";
import {
  clientErrorsTable,
  db,
  digestReportsTable,
  ownerSuggestionsTable,
  receiptScanUsageTable,
  reviewSnapshotsTable,
  referralsTable,
  usersTable,
} from "@workspace/db";
import { aiCosts } from "../lib/aiUsage";
import { requireAuth } from "../lib/auth";
import { runDailyDigest } from "../lib/dailyDigest";
import { OWNER_DASHBOARD_HTML } from "../lib/ownerDashboard";
import { readStoreReviews } from "../lib/storeReviews";

/**
 * The owner's war room: live numbers, AI cost, the latest digest, and suggested changes
 * to approve, plan or dismiss. Only emails in OWNER_EMAILS (or DIGEST_TO) can open it.
 *
 * The same data powers a desktop page at /api/owner/dashboard. The app makes a signed
 * link for it (valid 30 days); the page sends that token in the x-owner-token header.
 */
const router: IRouter = Router();

const DAY_MS = 24 * 60 * 60 * 1000;
const LINK_DAYS = 30;
const STATUSES = new Set(["pending", "approved", "planned", "declined", "done"]);

function owners(): string[] {
  return (process.env.OWNER_EMAILS || process.env.DIGEST_TO || "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

function ownerOnly(req: Request, res: Response, next: NextFunction): void {
  const email = ((req as unknown as { localUser?: { email?: string | null } }).localUser?.email ?? "").toLowerCase();
  if (!email || !owners().includes(email)) {
    res.status(403).json({ error: "Only the app owner can open the war room." });
    return;
  }
  next();
}

function linkSecret(): string | null {
  return (process.env.OWNER_DASHBOARD_SECRET || process.env.SESSION_SECRET || process.env.CLERK_SECRET_KEY || "").trim() || null;
}

function sign(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

function makeOwnerToken(email: string): string | null {
  const secret = linkSecret();
  if (!secret) return null;
  const payload = Date.now() + LINK_DAYS * DAY_MS + "." + Buffer.from(email).toString("base64url");
  return payload + "." + sign(payload, secret);
}

function verifyOwnerToken(token: string): boolean {
  const secret = linkSecret();
  const parts = token.split(".");
  if (!secret || parts.length !== 3) return false;
  const payload = parts[0] + "." + parts[1];
  const expected = Buffer.from(sign(payload, secret));
  const given = Buffer.from(parts[2] ?? "");
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return false;
  if (!(Number(parts[0]) > Date.now())) return false;
  const email = Buffer.from(parts[1] ?? "", "base64url").toString().toLowerCase();
  return owners().includes(email);
}

/** The app (signed-in owner) or the desktop dashboard (signed link token). */
function ownerGate(req: Request, res: Response, next: NextFunction): void {
  const token = req.get("x-owner-token");
  if (token) {
    if (verifyOwnerToken(token)) {
      next();
      return;
    }
    res.status(401).json({ error: "This link has expired. Open a new one from the app: War room, then Use on computer." });
    return;
  }
  const auth = requireAuth as unknown as (req: Request, res: Response, next: NextFunction) => unknown;
  void auth(req, res, (err?: unknown) => {
    if (err) {
      next(err);
      return;
    }
    ownerOnly(req, res, next);
  });
}

router.get("/owner/war-room", ownerGate, async (_req, res): Promise<void> => {
  const now = Date.now();
  const [users, newUsers, scans, crashes, invites, reports, suggestions, reviewRuns, costs] = await Promise.all([
    db.select({ n: count() }).from(usersTable),
    db.select({ n: count() }).from(usersTable).where(gte(usersTable.createdAt, new Date(now - 7 * DAY_MS))),
    db
      .select({ n: sql<number>`coalesce(sum(${receiptScanUsageTable.scans}), 0)::int` })
      .from(receiptScanUsageTable)
      .where(eq(receiptScanUsageTable.month, new Date().toISOString().slice(0, 7))),
    db
      .select({ message: clientErrorsTable.message, n: count() })
      .from(clientErrorsTable)
      .where(gte(clientErrorsTable.createdAt, new Date(now - DAY_MS)))
      .groupBy(clientErrorsTable.message)
      .orderBy(desc(count()))
      .limit(10),
    db.select({ n: count() }).from(referralsTable).where(gte(referralsTable.rewardedAt, new Date(now - 30 * DAY_MS))),
    db.select().from(digestReportsTable).orderBy(desc(digestReportsTable.createdAt)).limit(1),
    db.select().from(ownerSuggestionsTable).orderBy(desc(ownerSuggestionsTable.createdAt)).limit(80),
    db.select().from(reviewSnapshotsTable).orderBy(desc(reviewSnapshotsTable.createdAt)).limit(1),
    aiCosts().catch(() => null),
  ]);
  res.setHeader("Cache-Control", "no-store");
  res.json({
    stats: {
      users: users[0]?.n ?? 0,
      newUsers7d: newUsers[0]?.n ?? 0,
      scansThisMonth: scans[0]?.n ?? 0,
      crashes24h: crashes.reduce((sum, c) => sum + c.n, 0),
      invites30d: invites[0]?.n ?? 0,
      pending: suggestions.filter((s) => s.status === "pending").length,
    },
    report: reports[0] ?? null,
    reviews: reviewRuns[0] ?? null,
    costs,
    crashes,
    suggestions,
  });
});

router.post("/owner/suggestions/:id", ownerGate, async (req, res): Promise<void> => {
  const body = (req.body ?? {}) as { status?: unknown; note?: unknown };
  const status = String(body.status ?? "");
  if (!STATUSES.has(status)) {
    res.status(400).json({ error: "status must be pending, approved, planned, declined or done" });
    return;
  }
  const set: { status: string; decidedAt: Date | null; note?: string | null } = {
    status,
    decidedAt: status === "pending" ? null : new Date(),
  };
  if (typeof body.note === "string") set.note = body.note.trim().slice(0, 1000) || null;
  const [row] = await db
    .update(ownerSuggestionsTable)
    .set(set)
    .where(eq(ownerSuggestionsTable.id, String(req.params.id)))
    .returning();
  if (!row) {
    res.status(404).json({ error: "Suggestion not found" });
    return;
  }
  res.json(row);
});

/** Re-reads the inbox and crashes now, without sending the email. */
router.post("/owner/refresh", ownerGate, async (_req, res): Promise<void> => {
  res.json(await runDailyDigest(true, false));
});

/** Reads the latest app store reviews now and adds suggested fixes to the war room. */
router.post("/owner/reviews", ownerGate, async (_req, res): Promise<void> => {
  res.json(await readStoreReviews());
});

/** Makes a private link to the desktop dashboard for the signed-in owner. */
router.post("/owner/dashboard-link", requireAuth, ownerOnly, async (req, res): Promise<void> => {
  const email = ((req as unknown as { localUser?: { email?: string | null } }).localUser?.email ?? "").toLowerCase();
  const token = makeOwnerToken(email);
  if (!token) {
    res.status(503).json({ error: "Add OWNER_DASHBOARD_SECRET in Replit Secrets to use the dashboard on a computer." });
    return;
  }
  const base =
    process.env.PUBLIC_API_URL?.trim().replace(/\/+$/, "") ||
    (req.get("x-forwarded-proto") ?? req.protocol) + "://" + req.get("host");
  res.json({ url: base + "/api/owner/dashboard#t=" + token, days: LINK_DAYS });
});

/** The desktop dashboard page. It holds no data: everything loads with the link's token. */
router.get("/owner/dashboard", (_req, res): void => {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Robots-Tag", "noindex");
  res.type("html").send(OWNER_DASHBOARD_HTML);
});

export default router;
