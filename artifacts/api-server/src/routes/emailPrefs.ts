import { Router, type IRouter } from "express";
import { optOut, verifyUnsubscribe } from "../lib/unsubscribe";

const router: IRouter = Router();

const page = (title: string, body: string) => `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title></head><body style="margin:0;font-family:-apple-system,Segoe UI,Arial,sans-serif;background:#F2F7F8;color:#0B2A2E"><div style="max-width:460px;margin:60px auto;padding:28px;background:#fff;border-radius:16px;border:1px solid #D3E2E3"><h1 style="font-size:22px;margin:0 0 10px">${title}</h1><p style="line-height:1.5;color:#557277">${body}</p></div></body></html>`;

router.get("/email/unsubscribe", async (req, res): Promise<void> => {
  const email = String(req.query.e ?? "");
  const t = String(req.query.t ?? "");
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  if (!email || !verifyUnsubscribe(email, t)) {
    res.status(400).send(page("Link not valid", "This unsubscribe link is incomplete or has expired. Email support@infosplitmate.com and we'll stop the emails for you."));
    return;
  }
  await optOut(email);
  res.send(page("You're unsubscribed", "We won't send any more invitation or reminder emails to this address. Questions? Email support@infosplitmate.com."));
});

export default router;
