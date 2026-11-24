import { randomBytes } from "node:crypto";
import { Router, type IRouter, type Request } from "express";
import { and, eq } from "drizzle-orm";
import { db, groupJoinLinksTable, groupMembersTable, groupsTable } from "@workspace/db";
import { requireAuth } from "../lib/auth";
import { getMembership } from "../lib/authz";
import { param } from "../lib/params";

const router: IRouter = Router();

function makeToken() {
  return randomBytes(32).toString("base64url");
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[char] ?? char);
}

function appDeepLink(req: Request, token: string): string | null {
  const isProduction = process.env.NODE_ENV === "production";
  const forwardedHost = req.headers["x-forwarded-host"];
  const requestHost = (Array.isArray(forwardedHost) ? forwardedHost[0] : forwardedHost) ?? req.headers.host;
  const host = isProduction ? requestHost : process.env.REPLIT_EXPO_DEV_DOMAIN;
  if (!host || !/^[a-z0-9.-]+(?::\d+)?$/i.test(host)) return null;
  return `mobile://group/join?code=${encodeURIComponent(token)}`;
}

function renderLanding(groupName: string | null, deepLink: string | null, error?: string): string {
  const title = error ? "This group invite isn’t valid" : `Join ${escapeHtml(groupName ?? "a Split Mate group")}`;
  const message = error
    ? `<p class="hint">${escapeHtml(error)}</p>`
    : `<p class="hint">Join this group to share expenses and keep balances together. No friend request is required.</p>`;
  const open = deepLink && !error
    ? `<a class="primary" href="${escapeHtml(deepLink)}">Open invite in Split Mate</a>`
    : `<p class="hint">Ask a group member to share a current invite QR code.</p>`;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" /><meta name="robots" content="noindex" />
<title>Split Mate group invite</title><style>
*{box-sizing:border-box}body{margin:0;min-height:100vh;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:#F5F6F8;color:#17191F;display:flex;justify-content:center;padding:32px 20px}
main{width:100%;max-width:440px}.logo{width:64px;height:64px;border-radius:18px;background:#17191F;color:#fff;font-size:34px;font-weight:800;display:flex;align-items:center;justify-content:center;margin:0 auto 20px}
h1{text-align:center;font-size:24px;line-height:1.25;margin:0 0 8px}.hint{text-align:center;color:#667085;font-size:14px;line-height:1.5;margin:0 0 20px}
.step{background:#fff;border:1px solid #E4E7EC;border-radius:18px;padding:18px;margin-bottom:14px}.step h2{font-size:16px;margin:0 0 12px}
.stores{display:flex;gap:10px}.store{flex:1;text-align:center;padding:12px;border-radius:12px;border:1px solid #D0D5DD;color:#17191F;text-decoration:none;font-weight:600;font-size:14px}
.primary{display:block;text-align:center;padding:14px;border-radius:12px;background:#17191F;color:#fff;text-decoration:none;font-weight:600;font-size:15px}.step .hint{font-size:13px;margin:10px 0 0}
</style></head><body><main><div class="logo">S</div><h1>${title}</h1>${message}
<section class="step"><h2>1. Get Split Mate</h2><div class="stores">
<a class="store" href="https://apps.apple.com/app/id6835761115" target="_blank" rel="noopener">Download on the App Store</a></div>
<p class="hint">Already have Split Mate? It opens by itself, or tap the button below.</p></section>
<section class="step"><h2>2. Join the group</h2>${open}</section></main><script>setTimeout(function(){var a=document.querySelector("a.primary");if(a&&a.href.indexOf("mobile:")===0)location.href=a.href;},300);</script></body></html>`;
}

router.get("/group-invite", async (req, res): Promise<void> => {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.type("html");
  const token = typeof req.query.code === "string" ? req.query.code : "";
  const [link] = token
    ? await db.select().from(groupJoinLinksTable).where(eq(groupJoinLinksTable.token, token)).limit(1)
    : [];
  if (!link) {
    res.status(400).send(renderLanding(null, null, "This QR code is invalid or has been refreshed."));
    return;
  }
  const [group] = await db.select({
    id: groupsTable.id,
    name: groupsTable.name,
    isArchived: groupsTable.isArchived,
    isEnded: groupsTable.isEnded,
  }).from(groupsTable).where(eq(groupsTable.id, link.groupId)).limit(1);
  if (!group || group.isArchived || group.isEnded) {
    res.status(404).send(renderLanding(null, null, "This group is no longer accepting members."));
    return;
  }
  res.send(renderLanding(group.name, appDeepLink(req, token)));
});

router.get("/group-join/:token", async (req, res): Promise<void> => {
  const token = param(req, "token");
  const [link] = await db.select().from(groupJoinLinksTable)
    .where(eq(groupJoinLinksTable.token, token)).limit(1);
  if (!link) {
    res.status(404).json({ error: "This group invite is invalid or has been refreshed." });
    return;
  }
  const [group] = await db.select({
    id: groupsTable.id,
    name: groupsTable.name,
    emoji: groupsTable.emoji,
    isArchived: groupsTable.isArchived,
    isEnded: groupsTable.isEnded,
  }).from(groupsTable).where(eq(groupsTable.id, link.groupId)).limit(1);
  if (!group || group.isArchived || group.isEnded) {
    res.status(404).json({ error: "This group is no longer accepting members." });
    return;
  }
  res.setHeader("Cache-Control", "no-store");
  res.json({ groupId: group.id, groupName: group.name, groupEmoji: group.emoji });
});

router.post("/groups/:groupId/join-link", requireAuth, async (req, res): Promise<void> => {
  const groupId = param(req, "groupId");
  const membership = await getMembership(groupId, req.localUser!.id);
  if (!membership?.isMember) {
    res.status(404).json({ error: "Group not found" });
    return;
  }
  const [existing] = await db.select().from(groupJoinLinksTable)
    .where(eq(groupJoinLinksTable.groupId, groupId)).limit(1);
  if (existing) {
    res.setHeader("Cache-Control", "no-store");
    res.json({ token: existing.token });
    return;
  }
  const [created] = await db.insert(groupJoinLinksTable).values({
    groupId,
    token: makeToken(),
    createdByUserId: req.localUser!.id,
  }).onConflictDoNothing({ target: groupJoinLinksTable.groupId }).returning();
  const [link] = created
    ? [created]
    : await db.select().from(groupJoinLinksTable).where(eq(groupJoinLinksTable.groupId, groupId)).limit(1);
  if (!link) {
    res.status(500).json({ error: "Could not create a group invite" });
    return;
  }
  res.setHeader("Cache-Control", "no-store");
  res.status(201).json({ token: link.token });
});

router.post("/groups/:groupId/join-link/refresh", requireAuth, async (req, res): Promise<void> => {
  const groupId = param(req, "groupId");
  const membership = await getMembership(groupId, req.localUser!.id);
  if (!membership?.isMember) {
    res.status(404).json({ error: "Group not found" });
    return;
  }
  const [link] = await db.insert(groupJoinLinksTable).values({
    groupId,
    token: makeToken(),
    createdByUserId: req.localUser!.id,
  }).onConflictDoUpdate({
    target: groupJoinLinksTable.groupId,
    set: { token: makeToken(), createdByUserId: req.localUser!.id, updatedAt: new Date() },
  }).returning();
  if (!link) {
    res.status(500).json({ error: "Could not refresh the group invite" });
    return;
  }
  res.setHeader("Cache-Control", "no-store");
  res.json({ token: link.token });
});

router.post("/group-join/:token/accept", requireAuth, async (req, res): Promise<void> => {
  const token = param(req, "token");
  const [link] = await db.select().from(groupJoinLinksTable)
    .where(eq(groupJoinLinksTable.token, token)).limit(1);
  if (!link) {
    res.status(404).json({ error: "This group invite is invalid or has been refreshed." });
    return;
  }
  const user = req.localUser!;
  const result = await db.transaction(async (tx) => {
    const [group] = await tx.select({
      id: groupsTable.id,
      name: groupsTable.name,
      emoji: groupsTable.emoji,
      isArchived: groupsTable.isArchived,
      isEnded: groupsTable.isEnded,
    }).from(groupsTable).where(eq(groupsTable.id, link.groupId)).limit(1);
    if (!group || group.isArchived || group.isEnded) return null;
    const [existing] = await tx.select({ memberKey: groupMembersTable.memberKey })
      .from(groupMembersTable)
      .where(and(
        eq(groupMembersTable.groupId, group.id),
        eq(groupMembersTable.userId, user.id),
      )).limit(1);
    if (!existing) {
      const memberKey = `m_${randomBytes(12).toString("base64url")}`;
      await tx.insert(groupMembersTable).values({
        groupId: group.id,
        userId: user.id,
        memberKey,
        name: user.name,
        email: user.email,
        avatarColor: user.avatarColor,
        photo: user.photo,
        isAdmin: false,
        isPending: false,
        joinedAt: new Date(),
      });
    }
    return { groupId: group.id, groupName: group.name, groupEmoji: group.emoji };
  });
  if (!result) {
    res.status(404).json({ error: "This group is no longer accepting members." });
    return;
  }
  res.setHeader("Cache-Control", "no-store");
  res.json(result);
});

/** Opens Split Mate on the phone; if it isn't installed, offers the App Store. Used by email links. */
router.get("/open", (req, res): void => {
  const to = String(req.query.to ?? "").replace(/[^a-zA-Z0-9/_?=&.-]/g, "").slice(0, 200);
  const deep = `mobile://${to}`;
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.send(`<!doctype html><html lang="en"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><meta name="robots" content="noindex" /><title>Open Split Mate</title>
<style>body{margin:0;min-height:100vh;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:#F5F6F8;color:#17191F;display:flex;justify-content:center;padding:48px 20px;box-sizing:border-box}main{width:100%;max-width:420px;text-align:center}h1{font-size:26px;margin:0 0 8px}p{color:#667085;margin:0 0 24px}a{display:block;padding:14px;border-radius:12px;font-weight:600;font-size:15px;text-decoration:none;margin:10px 0}.p{background:#17191F;color:#fff}.s{border:1px solid #D0D5DD;color:#17191F;background:#fff}</style></head>
<body><main><h1>Split Mate</h1><p>Opening the app\u2026</p><a class="p" href="${deep}">Open Split Mate</a><a class="s" href="https://apps.apple.com/app/id6835761115">Get it on the App Store</a></main>
<script>setTimeout(function(){location.href=${JSON.stringify(deep)};},200);</script></body></html>`);
});

export default router;
