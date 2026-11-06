import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { emailOutbox } from "@/db/schema";
import { getSettings } from "./settings";

/**
 * Queues an email. Delivery only happens when an administrator has turned email on in Settings
 * AND a provider key (RESEND_API_KEY) is configured on the server. Otherwise the message is
 * kept in the outbox with status "held" so admins can see exactly what would have been sent.
 */
export async function sendEmail(to: string, subject: string, body: string) {
  const s = await getSettings();
  const [row] = await db.insert(emailOutbox).values({ toEmail: to, subject, body, status: "held" }).returning();
  const key = process.env.RESEND_API_KEY;
  if (!s.emailEnabled || !key || !s.emailFrom) return { delivered: false, id: row.id };
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: s.emailFrom, to: [to], subject, text: body }),
    });
    if (!res.ok) throw new Error(`Email provider responded ${res.status}`);
    await db.update(emailOutbox).set({ status: "sent", sentAt: new Date() }).where(eq(emailOutbox.id, row.id));
    return { delivered: true, id: row.id };
  } catch (e) {
    await db.update(emailOutbox).set({ status: "failed", error: String(e).slice(0, 500) }).where(eq(emailOutbox.id, row.id));
    return { delivered: false, id: row.id };
  }
}

export function appUrl(path = "") {
  const base = process.env.APP_URL
    ?? (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "http://localhost:3000");
  return `${base.replace(/\/$/, "")}${path}`;
}
