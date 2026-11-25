import { createHmac, timingSafeEqual } from "node:crypto";
import { eq } from "drizzle-orm";
import { db, emailOptOutsTable } from "@workspace/db";

const BASE = (process.env.PUBLIC_APP_URL || "https://api.infosplitmate.com").replace(/\/$/, "");

function token(email: string): string {
  return createHmac("sha256", process.env.SESSION_SECRET || "split-mate").update(email.trim().toLowerCase()).digest("hex").slice(0, 32);
}

export function verifyUnsubscribe(email: string, t: string): boolean {
  const a = Buffer.from(token(email)); const b = Buffer.from(t || "");
  return a.length === b.length && timingSafeEqual(a, b);
}

export function unsubscribeUrl(email: string): string {
  return `${BASE}/api/email/unsubscribe?e=${encodeURIComponent(email.trim().toLowerCase())}&t=${token(email)}`;
}

export async function isOptedOut(email: string): Promise<boolean> {
  const [row] = await db.select({ email: emailOptOutsTable.email }).from(emailOptOutsTable)
    .where(eq(emailOptOutsTable.email, email.trim().toLowerCase())).limit(1);
  return !!row;
}

export async function optOut(email: string): Promise<void> {
  await db.insert(emailOptOutsTable).values({ email: email.trim().toLowerCase() }).onConflictDoNothing();
}
