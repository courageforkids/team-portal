"use server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { pushSubscriptions } from "@/db/schema";
import { actionUser } from "./auth";
import { safe, UserError } from "./safe-action";
import { pushConfigured, sendPush } from "./push";
import { headers } from "next/headers";
import type { ActionResult } from "@/lib/action";

const subSchema = z.object({
  endpoint: z.string().url().max(1000).refine((u) => u.startsWith("https://"), "Invalid push endpoint"),
  keys: z.object({ p256dh: z.string().min(10).max(200), auth: z.string().min(8).max(100) }),
});

export async function savePushSubscriptionAction(raw: unknown): Promise<ActionResult> {
  return safe(async () => {
    const me = await actionUser();
    if (!pushConfigured()) throw new UserError("Phone notifications aren't set up on the server yet.");
    const sub = subSchema.parse(raw);
    const ua = ((await headers()).get("user-agent") ?? "").slice(0, 300);
    await db.insert(pushSubscriptions).values({ userId: me.id, endpoint: sub.endpoint, p256dh: sub.keys.p256dh, auth: sub.keys.auth, userAgent: ua })
      .onConflictDoUpdate({ target: pushSubscriptions.endpoint, set: { userId: me.id, p256dh: sub.keys.p256dh, auth: sub.keys.auth, userAgent: ua } });
    await sendPush(me.id, { title: "Notifications are on 🎉", body: "You'll get alerts for new tasks, reviews and reminders.", href: "/" });
    return { ok: true, message: "Notifications are on for this device." };
  });
}

export async function removePushSubscriptionAction(endpoint: string): Promise<ActionResult> {
  return safe(async () => {
    const me = await actionUser();
    await db.delete(pushSubscriptions).where(and(eq(pushSubscriptions.userId, me.id), eq(pushSubscriptions.endpoint, String(endpoint).slice(0, 1000))));
    return { ok: true, message: "Notifications turned off for this device." };
  });
}

export async function sendTestPushAction(): Promise<ActionResult> {
  return safe(async () => {
    const me = await actionUser();
    const n = await sendPush(me.id, { title: "Test notification ✅", body: "If you can see this, phone notifications work.", href: "/profile" });
    if (!n) throw new UserError("No devices with notifications turned on yet.");
    return { ok: true, message: `Sent to ${n} device${n === 1 ? "" : "s"}.` };
  });
}
