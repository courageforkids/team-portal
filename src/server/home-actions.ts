"use server";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { notifications, users } from "@/db/schema";
import { actionUser } from "./auth";
import { safe } from "./safe-action";
import type { ActionResult } from "@/lib/action";

export async function finishOnboardingAction(): Promise<ActionResult> {
  return safe(async () => {
    const me = await actionUser();
    await db.update(users).set({ onboardedAt: new Date() }).where(eq(users.id, me.id));
    return { ok: true };
  });
}

export async function markNotificationReadAction(id: string): Promise<ActionResult> {
  return safe(async () => {
    const me = await actionUser();
    await db.update(notifications).set({ readAt: new Date() }).where(and(eq(notifications.id, id), eq(notifications.userId, me.id), isNull(notifications.readAt)));
    return { ok: true };
  });
}

export async function markAllReadAction(): Promise<ActionResult> {
  return safe(async () => {
    const me = await actionUser();
    await db.update(notifications).set({ readAt: new Date() }).where(and(eq(notifications.userId, me.id), isNull(notifications.readAt)));
    return { ok: true, message: "All caught up." };
  });
}
