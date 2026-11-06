import "server-only";
import * as webpushNs from "web-push";

// web-push is CommonJS; depending on the bundler the API is on the namespace or its default export.
const webpush = ((webpushNs as unknown as { default?: typeof webpushNs }).default ?? webpushNs) as typeof webpushNs;
import { eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { pushSubscriptions } from "@/db/schema";

/** Phone/desktop notifications. Inactive unless VAPID keys are configured on the server. */
/** Reads a key in any letter case and tolerates "NAME=value" or quotes pasted into the value. */
function envKey(name: string) {
  const raw = process.env[name] ?? process.env[name.toLowerCase()] ?? "";
  const v = raw.trim().replace(/^[A-Za-z_]+=/, "").replace(/^["']|["']$/g, "").trim();
  return v || null;
}
const PUBLIC = () => envKey("VAPID_PUBLIC_KEY");
const PRIVATE = () => envKey("VAPID_PRIVATE_KEY");

export function pushConfigured() {
  return !!(PUBLIC() && PRIVATE());
}
export function vapidPublicKey() {
  return pushConfigured() ? PUBLIC() : null;
}

let ready = false;
function setup() {
  if (ready || !pushConfigured()) return pushConfigured();
  webpush.setVapidDetails(process.env.VAPID_SUBJECT || "mailto:courageforkids.org@gmail.com", PUBLIC()!, PRIVATE()!);
  ready = true;
  return true;
}

export type PushPayload = { title: string; body?: string; href?: string; tag?: string };

/** Sends to every device the user turned notifications on for. Expired devices are cleaned up. Never throws. */
export async function sendPush(userId: string, payload: PushPayload) {
  try {
    if (!setup()) return 0;
    const subs = await db.select().from(pushSubscriptions).where(eq(pushSubscriptions.userId, userId));
    if (!subs.length) return 0;
    const body = JSON.stringify({ title: payload.title, body: (payload.body ?? "").slice(0, 180), href: payload.href ?? "/", tag: payload.tag });
    const dead: string[] = [];
    let sent = 0;
    await Promise.allSettled(subs.map(async (s) => {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, body, { TTL: 60 * 60 * 24, timeout: 5000, urgency: "normal" });
        sent++;
      } catch (e) {
        const code = (e as { statusCode?: number }).statusCode;
        if (code === 404 || code === 410) dead.push(s.id);
        else console.error("[push] send failed", code ?? e);
      }
    }));
    if (dead.length) await db.delete(pushSubscriptions).where(inArray(pushSubscriptions.id, dead));
    return sent;
  } catch (e) {
    console.error("[push] error", e);
    return 0;
  }
}
