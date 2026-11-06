"use server";
import { redirect } from "next/navigation";
import { and, eq, gt, isNull } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { invitations, passwordResets, users } from "@/db/schema";
import { createSession, destroyAllSessionsFor, destroySession } from "@/server/auth";
import { hashPassword, hashToken, passwordProblem, randomToken, verifyPassword } from "@/server/crypto";
import { clientIp, rateLimit, resetRateLimit } from "@/server/rate-limit";
import { safe, str, UserError } from "@/server/safe-action";
import { audit } from "@/server/audit";
import { appUrl, sendEmail } from "@/server/email";
import { adminIds, notify } from "@/server/notify";
import type { ActionResult } from "@/lib/action";

const GENERIC_LOGIN_ERROR = "That email and password don't match an active account.";

export async function signInAction(_: unknown, fd: FormData): Promise<ActionResult> {
  return safe(async () => {
    const email = str(fd, "email").toLowerCase();
    const password = String(fd.get("password") ?? "");
    const next = str(fd, "next");
    if (!email || !password) throw new UserError("Enter your email and password.");
    const ip = await clientIp();
    if (!(await rateLimit(`login:ip:${ip}`, Number(process.env.LOGIN_IP_LIMIT ?? 30), 900)) || !(await rateLimit(`login:email:${email}`, 8, 900)))
      throw new UserError("Too many sign-in attempts. Please wait 15 minutes and try again.");
    const u = (await db.select().from(users).where(eq(users.email, email)).limit(1))[0];
    const ok = await verifyPassword(password, u?.passwordHash);
    if (!u || !ok || u.status !== "active") throw new UserError(GENERIC_LOGIN_ERROR);
    await resetRateLimit(`login:email:${email}`);
    await createSession(u.id);
    await audit(u.id, "auth.sign_in", "user", u.id);
    const safeNext = next.startsWith("/") && !next.startsWith("//") ? next : "/";
    return { ok: true, redirectTo: safeNext };
  });
}

export async function signOutAction() {
  await destroySession();
  redirect("/login");
}

const pwSchema = z.string().superRefine((v, ctx) => { const p = passwordProblem(v); if (p) ctx.addIssue({ code: "custom", message: p }); });

export async function acceptInviteAction(_: unknown, fd: FormData): Promise<ActionResult> {
  return safe(async () => {
    const token = str(fd, "token");
    const name = str(fd, "name");
    const password = String(fd.get("password") ?? "");
    const confirm = String(fd.get("confirm") ?? "");
    if (!(await rateLimit(`invite:${await clientIp()}`, 20, 900))) throw new UserError("Too many attempts. Try again later.");
    if (name.length < 2) throw new UserError("Please enter your name.");
    pwSchema.parse(password);
    if (password !== confirm) throw new UserError("Those passwords don't match.");
    const inv = (await db.select().from(invitations).where(and(eq(invitations.tokenHash, hashToken(token)), isNull(invitations.acceptedAt), isNull(invitations.revokedAt), gt(invitations.expiresAt, new Date()))).limit(1))[0];
    if (!inv) throw new UserError("This invitation link is invalid or has expired. Ask an administrator for a new one.");
    const email = inv.email.toLowerCase();
    const existing = (await db.select().from(users).where(eq(users.email, email)).limit(1))[0];
    const passwordHash = await hashPassword(password);
    let userId: string;
    if (existing) {
      if (existing.passwordHash && existing.status === "active") throw new UserError("An account with this email already exists. Sign in instead.");
      await db.update(users).set({ name, passwordHash, role: inv.role, title: inv.title, departmentId: inv.departmentId, status: "active", updatedAt: new Date() }).where(eq(users.id, existing.id));
      userId = existing.id;
    } else {
      const [u] = await db.insert(users).values({ email, name, title: inv.title, role: inv.role, departmentId: inv.departmentId, passwordHash }).returning();
      userId = u.id;
    }
    await db.update(invitations).set({ acceptedAt: new Date() }).where(eq(invitations.id, inv.id));
    await audit(userId, "invite.accepted", "user", userId, { invitationId: inv.id });
    await createSession(userId);
    // Redirect on the server: the invite page re-renders as "used" once accepted.
    redirect("/");
  });
}

export async function requestResetAction(_: unknown, fd: FormData): Promise<ActionResult> {
  return safe(async () => {
    const email = str(fd, "email").toLowerCase();
    const message = "If that email belongs to an active account, a reset link is on its way. If it doesn't arrive, ask your administrator for a reset link.";
    if (!email) throw new UserError("Enter your email.");
    if (!(await rateLimit(`reset:${await clientIp()}`, 5, 900)) || !(await rateLimit(`reset:email:${email}`, 3, 3600))) return { ok: true, message };
    const u = (await db.select().from(users).where(eq(users.email, email)).limit(1))[0];
    if (u && u.status === "active") {
      const token = randomToken();
      await db.insert(passwordResets).values({ userId: u.id, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + 3600_000) });
      await sendEmail(u.email, "Reset your Courage for Kids Team Portal password",
        `Hi ${u.name},\n\nUse this link within 1 hour to choose a new password:\n${appUrl(`/reset-password/${token}`)}\n\nIf you didn't ask for this, you can ignore this email.`);
      await notify(await adminIds(), { type: "task_updated", title: `${u.name} asked to reset their password`, body: "If email delivery is off, create a reset link for them in Settings → Members.", href: "/settings/members" });
      await audit(u.id, "auth.reset_requested", "user", u.id);
    }
    return { ok: true, message };
  });
}

export async function resetPasswordAction(_: unknown, fd: FormData): Promise<ActionResult> {
  return safe(async () => {
    const token = str(fd, "token");
    const password = String(fd.get("password") ?? "");
    if (password !== String(fd.get("confirm") ?? "")) throw new UserError("Those passwords don't match.");
    pwSchema.parse(password);
    const r = (await db.select().from(passwordResets).where(and(eq(passwordResets.tokenHash, hashToken(token)), isNull(passwordResets.usedAt), gt(passwordResets.expiresAt, new Date()))).limit(1))[0];
    if (!r) throw new UserError("This reset link is invalid or has expired. Request a new one.");
    await db.update(users).set({ passwordHash: await hashPassword(password), updatedAt: new Date() }).where(eq(users.id, r.userId));
    await db.update(passwordResets).set({ usedAt: new Date() }).where(eq(passwordResets.id, r.id));
    await destroyAllSessionsFor(r.userId);
    await audit(r.userId, "auth.password_reset", "user", r.userId);
    return { ok: true, message: "Password updated. Please sign in.", redirectTo: "/login" };
  });
}
