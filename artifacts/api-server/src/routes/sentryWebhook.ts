import { createHmac, timingSafeEqual } from "node:crypto";
import { Router, type IRouter } from "express";
import { db, clientErrorsTable } from "@workspace/db";

/**
 * Sentry -> war room. Sentry calls this for new issues and alerts; each one is
 * stored with the app's own crash reports, so it shows in the war room digest.
 * Verified with the Sentry integration's client secret (SENTRY_CLIENT_SECRET).
 */
const router: IRouter = Router();

function verified(raw: string, sig: string | undefined): boolean {
  const secret = process.env.SENTRY_CLIENT_SECRET;
  if (!secret || !sig) return false;
  const want = createHmac("sha256", secret).update(raw, "utf8").digest("hex");
  const a = Buffer.from(want);
  const b = Buffer.from(sig);
  return a.length === b.length && timingSafeEqual(a, b);
}

router.post("/webhooks/sentry", async (req, res): Promise<void> => {
  const raw = JSON.stringify(req.body ?? {});
  if (!verified(raw, req.header("sentry-hook-signature"))) {
    res.status(401).json({ error: "bad signature" });
    return;
  }
  const resource = req.header("sentry-hook-resource") ?? "";
  if (resource === "installation") { res.status(200).end(); return; }
  const data = (req.body?.data ?? {}) as Record<string, any>;
  const item = data.issue ?? data.event ?? data.error ?? {};
  const title = String(item.title ?? item.message ?? "Sentry issue").slice(0, 1000);
  await db.insert(clientErrorsTable).values({
    userId: null,
    message: "[Sentry] " + title,
    stack: typeof item.culprit === "string" ? item.culprit.slice(0, 8000) : null,
    context: {
      source: "sentry",
      resource,
      action: req.body?.action ?? null,
      level: item.level ?? null,
      url: item.web_url ?? item.permalink ?? null,
      count: item.count ?? null,
    } as never,
  });
  res.status(200).end();
});

export default router;
