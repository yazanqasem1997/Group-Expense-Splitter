import { actorName, filterByPref, sendPushToUsers } from "../lib/push";
import { Router, type IRouter, type Request, type Response } from "express";
import { and, desc, eq, isNull, or, sql } from "drizzle-orm";
import { recordReferral } from "../lib/plan";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { db, friendRequestsTable, usersTable } from "@workspace/db";
import { requireAuth } from "../lib/auth";
import { param } from "../lib/params";

const router: IRouter = Router();
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FRIEND_QR_TTL_MS = 12 * 60 * 60 * 1000;

function friendQrKey(): Buffer {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET is required to issue friend QR codes");
  return createHash("sha256").update(`split-mate-friend-qr-v1:${secret}`).digest();
}

function issueFriendQrToken(userId: string): { token: string; expiresAt: string } {
  const expiresAt = Date.now() + FRIEND_QR_TTL_MS;
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", friendQrKey(), iv);
  const encrypted = Buffer.concat([
    cipher.update(JSON.stringify({ userId, expiresAt }), "utf8"),
    cipher.final(),
  ]);
  const token = `smf1.${iv.toString("base64url")}.${encrypted.toString("base64url")}.${cipher.getAuthTag().toString("base64url")}`;
  return { token, expiresAt: new Date(expiresAt).toISOString() };
}

function readFriendQrToken(token: unknown): { userId: string } | null {
  if (typeof token !== "string" || token.length > 512) return null;
  const [version, ivText, encryptedText, tagText, extra] = token.split(".");
  if (version !== "smf1" || !ivText || !encryptedText || !tagText || extra) return null;
  try {
    const decipher = createDecipheriv("aes-256-gcm", friendQrKey(), Buffer.from(ivText, "base64url"));
    decipher.setAuthTag(Buffer.from(tagText, "base64url"));
    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(encryptedText, "base64url")),
      decipher.final(),
    ]).toString("utf8");
    const payload = JSON.parse(plaintext) as { userId?: unknown; expiresAt?: unknown };
    if (
      typeof payload.userId !== "string" ||
      !UUID_RE.test(payload.userId) ||
      typeof payload.expiresAt !== "number" ||
      payload.expiresAt <= Date.now()
    ) return null;
    return { userId: payload.userId };
  } catch {
    return null;
  }
}

// Split Mate's own store pages; the deep link below opens the installed app.
const APP_STORE_URL = "https://apps.apple.com/app/id6835761115";
const PLAY_STORE_URL = "https://play.google.com/store/apps/details?id=com.yazanqasem.splitmate";

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[char] ?? char);
}

function appDeepLink(_req: Request, token: string): string | null {
  // The app's URL scheme (app.json "scheme": "mobile").
  return `mobile://add-friend?code=${encodeURIComponent(token)}`;
}

function renderFriendInvitePage(options: { inviterName: string | null; deepLink: string | null; error: string | null }): string {
  const heading = options.error
    ? "This friend invite isn’t valid"
    : options.inviterName
      ? `${escapeHtml(options.inviterName)} wants to be friends on Split Mate`
      : "You’ve been invited to be friends on Split Mate";
  const subtitle = options.error
    ? escapeHtml(options.error)
    : "Split Mate makes it easy to share expenses and settle up with friends.";
  const openStep = options.deepLink && !options.error
    ? `<a class="primary" href="${escapeHtml(options.deepLink)}">Open invite in Split Mate</a>
       <p class="hint">After it opens, tap <strong>Send request</strong>. You’ll become friends once they accept.</p>`
    : `<p class="hint">Ask your friend to show you a new QR code from Friends → QR in Split Mate.</p>`;
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="robots" content="noindex" />
  <title>Split Mate friend invite</title>
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; min-height: 100vh; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Inter, sans-serif; background: #F5F6F8; color: #17191F; display: flex; justify-content: center; padding: 32px 20px; }
    main { width: 100%; max-width: 440px; }
    .logo { width: 64px; height: 64px; border-radius: 18px; background: #17191F; color: #fff; font-size: 34px; font-weight: 800; display: flex; align-items: center; justify-content: center; margin: 0 auto 20px; }
    h1 { font-size: 24px; line-height: 1.25; text-align: center; margin: 0 0 8px; }
    .subtitle { text-align: center; color: #667085; margin: 0 0 28px; font-size: 15px; line-height: 1.5; }
    .step { background: #fff; border: 1px solid #E4E7EC; border-radius: 18px; padding: 18px; margin-bottom: 14px; }
    .step h2 { display: flex; align-items: center; gap: 10px; font-size: 16px; margin: 0 0 12px; }
    .num { width: 26px; height: 26px; border-radius: 13px; background: #17191F; color: #fff; font-size: 13px; display: inline-flex; align-items: center; justify-content: center; }
    .stores { display: flex; gap: 10px; }
    .store { flex: 1; text-align: center; padding: 12px; border-radius: 12px; border: 1px solid #D0D5DD; color: #17191F; text-decoration: none; font-weight: 600; font-size: 14px; }
    .primary { display: block; text-align: center; padding: 14px; border-radius: 12px; background: #17191F; color: #fff; text-decoration: none; font-weight: 600; font-size: 15px; }
    .hint { color: #667085; font-size: 13px; line-height: 1.5; margin: 10px 0 0; }
  </style>
</head>
<body>
  <main>
    <div class="logo">S</div>
    <h1>${heading}</h1>
    <p class="subtitle">${subtitle}</p>
    <section class="step">
      <h2><span class="num">1</span> Get the app</h2>
      <div class="stores">
        <a class="store" href="${APP_STORE_URL}" target="_blank" rel="noopener">App Store</a>
        <a class="store" href="${PLAY_STORE_URL}" target="_blank" rel="noopener">Google Play</a>
      </div>
      <p class="hint">Already installed? Skip to step 2.</p>
    </section>
    <section class="step">
      <h2><span class="num">2</span> Add your friend</h2>
      ${openStep}
    </section>
  </main>
</body>
</html>`;
}

// Public landing page encoded in friend QR codes, so a phone camera without
// Split Mate installed is guided to install it before sending the request.
router.get("/friend-invite", async (req, res): Promise<void> => {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.type("html");
  const token = typeof req.query.code === "string" ? req.query.code : "";
  const invite = readFriendQrToken(token);
  if (!invite) {
    res.status(400).send(renderFriendInvitePage({ inviterName: null, deepLink: null, error: "This QR code is invalid or has expired." }));
    return;
  }
  const [user] = await db.select({ name: usersTable.name }).from(usersTable)
    .where(and(eq(usersTable.id, invite.userId), isNull(usersTable.deletionScheduledFor)))
    .limit(1);
  if (!user) {
    res.status(404).send(renderFriendInvitePage({ inviterName: null, deepLink: null, error: "This Split Mate account is no longer available." }));
    return;
  }
  res.send(renderFriendInvitePage({ inviterName: user.name, deepLink: appDeepLink(req, token), error: null }));
});

router.post("/friend-qr", requireAuth, (req, res): void => {
  res.setHeader("Cache-Control", "no-store");
  res.status(201).json(issueFriendQrToken(req.localUser!.id));
});

router.post("/friend-qr/preview", requireAuth, async (req, res): Promise<void> => {
  const invite = readFriendQrToken((req.body as { token?: unknown } | undefined)?.token);
  if (!invite) {
    res.status(400).json({ error: "This friend QR is invalid or has expired" });
    return;
  }
  const [user] = await db.select({
    name: usersTable.name,
    avatarColor: usersTable.avatarColor,
    photo: usersTable.photo,
  }).from(usersTable).where(and(
    eq(usersTable.id, invite.userId),
    isNull(usersTable.deletionScheduledFor),
  )).limit(1);
  if (!user) {
    res.status(404).json({ error: "This Split Mate account is no longer available" });
    return;
  }
  res.setHeader("Cache-Control", "no-store");
  res.json(user);
});

async function presentRequest(request: typeof friendRequestsTable.$inferSelect, currentUserId: string) {
  const direction = request.senderUserId === currentUserId ? "sent" : "received";
  const otherUserId = direction === "sent" ? request.recipientUserId : request.senderUserId;
  const [otherUser] = await db.select({
    id: usersTable.id,
    name: usersTable.name,
    email: usersTable.email,
    avatarColor: usersTable.avatarColor,
    photo: usersTable.photo,
  }).from(usersTable).where(eq(usersTable.id, otherUserId)).limit(1);
  return {
    id: request.id,
    direction,
    status: request.status,
    createdAt: request.createdAt.toISOString(),
    otherUser,
  };
}

router.get("/friend-requests", requireAuth, async (req, res): Promise<void> => {
  const userId = req.localUser!.id;
  const requests = await db.select().from(friendRequestsTable)
    .where(or(
      eq(friendRequestsTable.senderUserId, userId),
      eq(friendRequestsTable.recipientUserId, userId),
    ))
    .orderBy(desc(friendRequestsTable.createdAt))
    .limit(200);
  res.setHeader("Cache-Control", "no-store");
  res.json(await Promise.all(requests.map((request) => presentRequest(request, userId))));
});

router.post("/friend-requests", requireAuth, async (req, res): Promise<void> => {
  const body = req.body as { recipientUserId?: unknown; email?: unknown } | undefined;
  let recipientUserId = body?.recipientUserId;
  const senderUserId = req.localUser!.id;
  // Adding a friend by email: if the address belongs to an account, the request goes to their app.
  if (typeof recipientUserId !== "string" && typeof body?.email === "string" && body.email.trim()) {
    const [byEmail] = await db.select({ id: usersTable.id }).from(usersTable)
      .where(and(eq(sql`lower(${usersTable.email})`, body.email.trim().toLowerCase()), isNull(usersTable.deletionScheduledFor)))
      .limit(1);
    if (!byEmail) {
      res.status(404).json({ error: "not_registered" });
      return;
    }
    recipientUserId = byEmail.id;
  }
  if (typeof recipientUserId !== "string" || !UUID_RE.test(recipientUserId)) {
    res.status(400).json({ error: "A valid recipientUserId is required" });
    return;
  }
  if (recipientUserId === senderUserId) {
    res.status(400).json({ error: "You can't send a friend request to yourself" });
    return;
  }
  const [recipient] = await db.select({ id: usersTable.id }).from(usersTable)
    .where(and(eq(usersTable.id, recipientUserId), isNull(usersTable.deletionScheduledFor)))
    .limit(1);
  if (!recipient) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  const existing = await db.select().from(friendRequestsTable)
    .where(and(
      or(
        and(eq(friendRequestsTable.senderUserId, senderUserId), eq(friendRequestsTable.recipientUserId, recipientUserId)),
        and(eq(friendRequestsTable.senderUserId, recipientUserId), eq(friendRequestsTable.recipientUserId, senderUserId)),
      ),
      or(eq(friendRequestsTable.status, "pending"), eq(friendRequestsTable.status, "accepted")),
    ))
    .limit(1);
  if (existing.length) {
    res.status(409).json({ error: existing[0].status === "accepted" ? "You're already friends" : "A request is already pending" });
    return;
  }
  const [created] = await db.insert(friendRequestsTable).values({
    senderUserId,
    recipientUserId,
  }).returning();
  void filterByPref([recipientUserId], "friendRequest").then(ids => sendPushToUsers(ids, {
    title: "New friend request",
    body: `${actorName(req.localUser)} wants to be friends on Split Mate`,
    data: { type: "friend_request" },
  })).catch(() => {});
  res.status(201);
  res.setHeader("Cache-Control", "no-store");
  res.json(await presentRequest(created, senderUserId));
});

router.post("/friend-requests/qr", requireAuth, async (req, res): Promise<void> => {
  const invite = readFriendQrToken((req.body as { token?: unknown } | undefined)?.token);
  if (!invite) {
    res.status(400).json({ error: "This friend QR is invalid or has expired" });
    return;
  }
  const senderUserId = req.localUser!.id;
  const recipientUserId = invite.userId;
  if (recipientUserId === senderUserId) {
    res.status(400).json({ error: "You can't send a friend request to yourself" });
    return;
  }
  const [recipient] = await db.select({ id: usersTable.id }).from(usersTable)
    .where(and(eq(usersTable.id, recipientUserId), isNull(usersTable.deletionScheduledFor)))
    .limit(1);
  if (!recipient) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  const [existing] = await db.select().from(friendRequestsTable)
    .where(and(
      or(
        and(eq(friendRequestsTable.senderUserId, senderUserId), eq(friendRequestsTable.recipientUserId, recipientUserId)),
        and(eq(friendRequestsTable.senderUserId, recipientUserId), eq(friendRequestsTable.recipientUserId, senderUserId)),
      ),
      or(eq(friendRequestsTable.status, "pending"), eq(friendRequestsTable.status, "accepted")),
    ))
    .limit(1);
  if (existing) {
    res.status(409).json({ error: existing.status === "accepted" ? "You're already friends" : "A request is already pending" });
    return;
  }
  const [created] = await db.insert(friendRequestsTable).values({ senderUserId, recipientUserId }).returning();
  // A new account adding a friend from their invite QR or link counts as a referral.
  await recordReferral(senderUserId, recipientUserId).catch(() => {});
  res.status(201);
  res.setHeader("Cache-Control", "no-store");
  res.json(await presentRequest(created, senderUserId));
});

async function respondToRequest(req: Request, res: Response, status: "accepted" | "declined"): Promise<void> {
  const requestId = param(req, "id");
  if (!UUID_RE.test(requestId)) {
    res.status(404).json({ error: "Request not found" });
    return;
  }
  const [updated] = await db.update(friendRequestsTable)
    .set({ status, respondedAt: new Date() })
    .where(and(
      eq(friendRequestsTable.id, requestId),
      eq(friendRequestsTable.recipientUserId, req.localUser!.id),
      eq(friendRequestsTable.status, "pending"),
    ))
    .returning();
  if (!updated) {
    res.status(404).json({ error: "Request not found" });
    return;
  }
  if (status === "accepted") {
    void filterByPref([updated.senderUserId], "friendRequest").then(ids => sendPushToUsers(ids, {
      title: "Friend request accepted",
      body: `${actorName(req.localUser)} accepted your friend request`,
      data: { type: "friend_accepted" },
    })).catch(() => {});
  }
  res.setHeader("Cache-Control", "no-store");
  res.json(await presentRequest(updated, req.localUser!.id));
}

router.post("/friend-requests/:id/accept", requireAuth, async (req, res) => {
  await respondToRequest(req, res, "accepted");
});
router.post("/friend-requests/:id/decline", requireAuth, async (req, res) => {
  await respondToRequest(req, res, "declined");
});

router.delete("/friends/:userId", requireAuth, async (req, res): Promise<void> => {
  const me = req.localUser!.id;
  const other = String(req.params.userId ?? "");
  if (!UUID_RE.test(other)) { res.status(400).json({ error: "Invalid user" }); return; }
  await db.update(friendRequestsTable).set({ status: "removed" })
    .where(and(
      or(
        and(eq(friendRequestsTable.senderUserId, me), eq(friendRequestsTable.recipientUserId, other)),
        and(eq(friendRequestsTable.senderUserId, other), eq(friendRequestsTable.recipientUserId, me)),
      ),
      or(eq(friendRequestsTable.status, "accepted"), eq(friendRequestsTable.status, "pending")),
    ));
  res.json({ ok: true });
});

export default router;
