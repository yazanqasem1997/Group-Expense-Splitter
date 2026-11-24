import { Router, type IRouter } from "express";
import { LEGAL } from "../lib/legalPages.generated";

const router: IRouter = Router();
type Section = { heading: string; paragraphs?: readonly string[]; bullets?: readonly string[] };
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const link = (s: string) => esc(s).replace(/support@infosplitmate\.com/g, '<a href="mailto:support@infosplitmate.com">support@infosplitmate.com</a>');

function page(title: string, intro: string, body: string): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title} · Split Mate</title>
<style>:root{color-scheme:light dark}body{margin:0;font:16px/1.6 -apple-system,Segoe UI,Arial,sans-serif;background:#F2F7F8;color:#0B2A2E}header{background:linear-gradient(160deg,#04404A,#0E7C86);color:#fff;padding:28px 20px}header div,main{max-width:720px;margin:0 auto}h1{margin:0 0 6px;font-size:28px}header p{margin:0;opacity:.85}main{padding:20px}h2{font-size:18px;margin:26px 0 6px}a{color:#0E8A8F}nav a{margin-right:16px;color:#fff}footer{max-width:720px;margin:0 auto;padding:10px 20px 40px;color:#557277;font-size:13px}@media (prefers-color-scheme:dark){body{background:#0C1523;color:#E8F1FA}footer{color:#A3B8D0}a{color:#4FB3BA}}</style></head>
<body><header><div><nav><a href="/api/legal/privacy">Privacy</a><a href="/api/legal/terms">Terms</a><a href="/api/legal/support">Support</a></nav><h1 style="margin-top:18px">${title}</h1><p>${intro}</p></div></header><main>${body}</main>
<footer>Split Mate · operated by ${esc(LEGAL.meta.OPERATOR_DESCRIPTION)} · <a href="mailto:${LEGAL.meta.SUPPORT_EMAIL}">${LEGAL.meta.SUPPORT_EMAIL}</a></footer></body></html>`;
}
function doc(sections: readonly Section[]): string {
  return `<p><em>Last updated ${esc(LEGAL.meta.LEGAL_LAST_UPDATED)}</em></p>` + sections.map(s =>
    `<h2>${esc(s.heading)}</h2>` + (s.paragraphs ?? []).map(p => `<p>${link(p)}</p>`).join("") +
    (s.bullets?.length ? `<ul>${s.bullets.map(b => `<li>${link(b)}</li>`).join("")}</ul>` : "")).join("");
}

router.get("/legal/privacy", (_req, res) => { res.type("html").send(page("Privacy Policy", "What Split Mate collects, why, and the choices you have.", doc(LEGAL.privacy))); });
router.get("/legal/terms", (_req, res) => { res.type("html").send(page("Terms of Service", "The rules for using Split Mate.", doc(LEGAL.terms))); });
router.get("/legal/support", (_req, res) => {
  res.type("html").send(page("Support", "We're here to help.", `<h2>Contact us</h2><p>Email <a href="mailto:${LEGAL.meta.SUPPORT_EMAIL}">${LEGAL.meta.SUPPORT_EMAIL}</a>. We usually reply within two working days.</p>
<h2>Common questions</h2><p><strong>How do I delete my account?</strong> In the app, open your profile, then Security, then Delete account. Your data is removed after a 30-day recovery period.</p><p><strong>How are balances converted between currencies?</strong> Each expense keeps the exchange rate from the day it was added, so balances don't shift with later rate changes.</p><p><strong>Someone added me to a group by mistake.</strong> You can leave any group from its menu, or email us and we'll help.</p><p><strong>I want to stop invitation emails.</strong> Use the “Stop these emails” link at the bottom of any of them.</p>`));
});

export default router;
