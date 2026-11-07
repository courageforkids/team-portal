"use server";
import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { apiKeys } from "@/db/schema";
import { actionAdmin } from "./auth";
import { randomToken, hashToken } from "./crypto";
import { safe, str, UserError } from "./safe-action";
import { audit } from "./audit";
import type { ActionResult } from "@/lib/action";

export async function createApiKeyAction(_: unknown, fd: FormData): Promise<ActionResult<{ key: string }>> {
  return safe(async () => {
    const me = await actionAdmin();
    const name = str(fd, "name").slice(0, 60) || "Claude";
    const days = Number(str(fd, "expiresInDays") || "0");
    const active = await db.select({ id: apiKeys.id }).from(apiKeys).where(isNull(apiKeys.revokedAt));
    if (active.length >= 10) throw new UserError("You have 10 active keys. Revoke one first.");
    const key = `cfk_${randomToken(30)}`;
    await db.insert(apiKeys).values({
      name, keyHash: hashToken(key), prefix: key.slice(0, 10), createdById: me.id,
      expiresAt: days > 0 ? new Date(Date.now() + Math.min(days, 730) * 86400_000) : null,
    });
    await audit(me.id, "api_key.create", "api_key", undefined, { name, expiresInDays: days || null });
    return { ok: true, data: { key } };
  });
}

export async function revokeApiKeyAction(id: string): Promise<ActionResult> {
  return safe(async () => {
    const me = await actionAdmin();
    const k = (await db.select().from(apiKeys).where(and(eq(apiKeys.id, z.string().uuid().parse(id)), isNull(apiKeys.revokedAt))).limit(1))[0];
    if (!k) throw new UserError("That key was already revoked.");
    await db.update(apiKeys).set({ revokedAt: new Date() }).where(eq(apiKeys.id, k.id));
    await audit(me.id, "api_key.revoke", "api_key", k.id, { name: k.name });
    return { ok: true, message: `“${k.name}” revoked. It stops working immediately.` };
  });
}
