import "server-only";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { and, eq, gt, lt } from "drizzle-orm";
import { db } from "@/db";
import { sessions, users } from "@/db/schema";
import { hashToken, randomToken } from "./crypto";

export const SESSION_COOKIE = "cfk_session";
const SESSION_DAYS = 365; // stay signed in like a phone app; renews as long as the app gets used
const RENEW_WITHIN_DAYS = 335;

export type Role = "admin" | "leader" | "volunteer";
export type CurrentUser = {
  id: string; email: string; name: string; title: string; role: Role; departmentId: string | null;
  avatarFileId: string | null; timezone: string; onboardedAt: Date | null;
};

export async function createSession(userId: string) {
  const token = randomToken();
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86400_000);
  const h = await headers();
  await db.insert(sessions).values({ id: hashToken(token), userId, expiresAt, userAgent: (h.get("user-agent") ?? "").slice(0, 300) });
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production" && !process.env.INSECURE_COOKIES,
    path: "/", expires: expiresAt,
  });
  // opportunistic cleanup of expired sessions
  await db.delete(sessions).where(lt(sessions.expiresAt, new Date()));
}

export async function destroySession() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await db.delete(sessions).where(eq(sessions.id, hashToken(token)));
  jar.delete(SESSION_COOKIE);
}

export async function destroyAllSessionsFor(userId: string) {
  await db.delete(sessions).where(eq(sessions.userId, userId));
}

/** Resolves the signed-in user from the session cookie (cached per request). */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const sid = hashToken(token);
  const rows = await db
    .select({
      s: { expiresAt: sessions.expiresAt },
      u: { id: users.id, email: users.email, name: users.name, title: users.title, role: users.role, departmentId: users.departmentId,
        avatarFileId: users.avatarFileId, timezone: users.timezone, onboardedAt: users.onboardedAt, status: users.status, lastSeenAt: users.lastSeenAt },
    })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.id, sid), gt(sessions.expiresAt, new Date())))
    .limit(1);
  const row = rows[0];
  if (!row || row.u.status !== "active") return null;
  const now = Date.now();
  if (row.s.expiresAt.getTime() - now < RENEW_WITHIN_DAYS * 86400_000) {
    await db.update(sessions).set({ expiresAt: new Date(now + SESSION_DAYS * 86400_000) }).where(eq(sessions.id, sid));
  }
  if (!row.u.lastSeenAt || now - row.u.lastSeenAt.getTime() > 5 * 60_000) {
    await db.update(users).set({ lastSeenAt: new Date() }).where(eq(users.id, row.u.id));
  }
  const u = row.u;
  return {
    id: u.id, email: u.email, name: u.name, title: u.title, role: u.role, departmentId: u.departmentId,
    avatarFileId: u.avatarFileId, timezone: u.timezone, onboardedAt: u.onboardedAt,
  };
});

/** For pages: redirects to /login when signed out. */
export async function requireUser(): Promise<CurrentUser> {
  const u = await getCurrentUser();
  if (!u) redirect("/login");
  return u;
}

/** For pages: only executive administrators. */
export async function requireAdmin(): Promise<CurrentUser> {
  const u = await requireUser();
  if (u.role !== "admin") redirect("/?denied=1");
  return u;
}

export class AuthError extends Error {
  constructor(message = "You don't have permission to do that.") { super(message); this.name = "AuthError"; }
}

/** For server actions / route handlers: throws instead of redirecting. */
export async function actionUser(): Promise<CurrentUser> {
  const u = await getCurrentUser();
  if (!u) throw new AuthError("Your session has ended. Please sign in again.");
  return u;
}
export async function actionAdmin(): Promise<CurrentUser> {
  const u = await actionUser();
  if (u.role !== "admin") throw new AuthError();
  return u;
}

export const isAdmin = (u: { role: Role }) => u.role === "admin";
export const isLeaderOrAdmin = (u: { role: Role }) => u.role === "admin" || u.role === "leader";
