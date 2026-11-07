import "server-only";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { apiKeys, users } from "@/db/schema";
import type { CurrentUser } from "./auth";
import { hashToken } from "./crypto";
import { rateLimit } from "./rate-limit";
import { audit } from "./audit";

export class ApiError extends Error {
  constructor(public status: number, message: string, public details?: unknown) { super(message); }
}

export type ApiActor = CurrentUser & { apiKeyId: string; apiKeyName: string };

/**
 * Authenticates "Authorization: Bearer cfk_…". The key acts as the administrator who created it,
 * and stops working if that person is deactivated or is no longer an administrator.
 */
export async function apiActor(req: Request): Promise<ApiActor> {
  const header = req.headers.get("authorization") ?? "";
  const token = header.replace(/^Bearer\s+/i, "").trim();
  if (!token.startsWith("cfk_") || token.length < 30) throw new ApiError(401, "Missing or malformed API key. Send: Authorization: Bearer cfk_…");
  const row = (await db.select({ k: apiKeys, u: users }).from(apiKeys).innerJoin(users, eq(users.id, apiKeys.createdById))
    .where(and(eq(apiKeys.keyHash, hashToken(token)), isNull(apiKeys.revokedAt))).limit(1))[0];
  if (!row) throw new ApiError(401, "This API key is invalid or was revoked.");
  if (row.k.expiresAt && row.k.expiresAt < new Date()) throw new ApiError(401, "This API key has expired.");
  if (row.u.status !== "active" || row.u.role !== "admin") throw new ApiError(403, "The administrator who created this key is no longer an active administrator.");
  if (!(await rateLimit(`api:${row.k.id}`, 120, 60))) throw new ApiError(429, "Too many requests. Wait a minute and try again.");
  if (!row.k.lastUsedAt || Date.now() - row.k.lastUsedAt.getTime() > 60_000)
    await db.update(apiKeys).set({ lastUsedAt: new Date() }).where(eq(apiKeys.id, row.k.id));
  const u = row.u;
  return {
    id: u.id, email: u.email, name: u.name, title: u.title, role: u.role, departmentId: u.departmentId, avatarFileId: u.avatarFileId,
    timezone: u.timezone, onboardedAt: u.onboardedAt, apiKeyId: row.k.id, apiKeyName: row.k.name,
  };
}

/** Wraps a route: authenticates, logs writes as "via API key", and turns errors into JSON. */
export function apiRoute<C>(handler: (req: Request, actor: ApiActor, ctx: C) => Promise<unknown>) {
  return async (req: Request, ctx: C) => {
    try {
      const actor = await apiActor(req);
      const result = await handler(req, actor, ctx);
      if (req.method !== "GET") await audit(actor.id, "api.request", "api_key", actor.apiKeyId, { via: `API key: ${actor.apiKeyName}`, method: req.method, path: new URL(req.url).pathname });
      return Response.json(result ?? { ok: true }, { headers: { "Cache-Control": "no-store" } });
    } catch (e) {
      if (e instanceof ApiError) return Response.json({ error: e.message, details: e.details }, { status: e.status });
      const name = (e as Error)?.constructor?.name;
      if (name === "UserError" || name === "AuthError" || name === "UploadError") return Response.json({ error: (e as Error).message }, { status: name === "AuthError" ? 403 : 400 });
      if (name === "ZodError") return Response.json({ error: "Invalid request", details: (e as { issues?: unknown }).issues }, { status: 400 });
      console.error("[api]", e);
      return Response.json({ error: "Something went wrong on our side." }, { status: 500 });
    }
  };
}

export async function jsonBody(req: Request): Promise<Record<string, unknown>> {
  try { const b = await req.json(); if (b && typeof b === "object" && !Array.isArray(b)) return b as Record<string, unknown>; } catch { /* fallthrough */ }
  throw new ApiError(400, "Send a JSON object body with Content-Type: application/json.");
}
