"use server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { files, users, sessions } from "@/db/schema";
import { actionUser } from "./auth";
import { bool, filesOf, safe, str, UserError } from "./safe-action";
import { hashPassword, passwordProblem, verifyPassword, hashToken } from "./crypto";
import { saveUploads, deleteStored } from "./storage";
import { rateLimit } from "./rate-limit";
import { TIMEZONES } from "@/lib/dates";
import type { ActionResult } from "@/lib/action";
import { cookies } from "next/headers";
import { and, ne } from "drizzle-orm";

export async function updateProfileAction(_: unknown, fd: FormData): Promise<ActionResult> {
  return safe(async () => {
    const me = await actionUser();
    const name = str(fd, "name");
    if (name.length < 2 || name.length > 80) throw new UserError("Enter your name (2–80 characters).");
    const timezone = str(fd, "timezone");
    await db.update(users).set({
      name, timezone: TIMEZONES.includes(timezone) ? timezone : me.timezone, showEmail: bool(fd, "showEmail"), updatedAt: new Date(),
    }).where(eq(users.id, me.id));
    return { ok: true, message: "Profile saved." };
  });
}

export async function updateAvatarAction(_: unknown, fd: FormData): Promise<ActionResult> {
  return safe(async () => {
    const me = await actionUser();
    const [file] = filesOf(fd, "avatar");
    if (!file) throw new UserError("Choose an image first.");
    if (!/\.(png|jpe?g|webp|gif)$/i.test(file.name)) throw new UserError("Use a PNG, JPG, WEBP or GIF image.");
    if (file.size > 5 * 1024 * 1024) throw new UserError("Profile photos must be under 5 MB.");
    const [row] = await saveUploads([file], { type: "avatar", id: me.id }, me.id);
    await removeOldAvatar(me.avatarFileId);
    await db.update(users).set({ avatarFileId: row.id }).where(eq(users.id, me.id));
    return { ok: true, message: "Photo updated." };
  });
}

export async function removeAvatarAction(): Promise<ActionResult> {
  return safe(async () => {
    const me = await actionUser();
    await db.update(users).set({ avatarFileId: null }).where(eq(users.id, me.id));
    await removeOldAvatar(me.avatarFileId);
    return { ok: true, message: "Photo removed." };
  });
}

async function removeOldAvatar(id: string | null) {
  if (!id) return;
  const f = (await db.select().from(files).where(eq(files.id, id)).limit(1))[0];
  if (f) { await db.delete(files).where(eq(files.id, id)); await deleteStored(f.storageKey); }
}

export async function changePasswordAction(_: unknown, fd: FormData): Promise<ActionResult> {
  return safe(async () => {
    const me = await actionUser();
    if (!(await rateLimit(`pwchange:${me.id}`, 5, 900))) throw new UserError("Too many attempts. Try again in 15 minutes.");
    const current = String(fd.get("current") ?? "");
    const next = String(fd.get("password") ?? "");
    const u = (await db.select({ hash: users.passwordHash }).from(users).where(eq(users.id, me.id)).limit(1))[0];
    if (!(await verifyPassword(current, u?.hash))) throw new UserError("Your current password isn't right.");
    const problem = passwordProblem(next);
    if (problem) throw new UserError(problem);
    if (next !== String(fd.get("confirm") ?? "")) throw new UserError("The new passwords don't match.");
    await db.update(users).set({ passwordHash: await hashPassword(next), updatedAt: new Date() }).where(eq(users.id, me.id));
    // Sign out every other device.
    const token = (await cookies()).get("cfk_session")?.value;
    if (token) await db.delete(sessions).where(and(eq(sessions.userId, me.id), ne(sessions.id, hashToken(token))));
    return { ok: true, message: "Password changed. Other devices were signed out." };
  });
}

export async function updatePrefsAction(_: unknown, fd: FormData): Promise<ActionResult> {
  return safe(async () => {
    const me = await actionUser();
    await db.update(users).set({
      notificationPrefs: {
        announcements: bool(fd, "announcements"), deadlineReminders: bool(fd, "deadlineReminders"),
        emailAssignments: bool(fd, "emailAssignments"), emailReminders: bool(fd, "emailReminders"),
        emailAnnouncements: bool(fd, "emailAnnouncements"), emailReviews: bool(fd, "emailReviews"),
      },
    }).where(eq(users.id, me.id));
    return { ok: true, message: "Notification preferences saved." };
  });
}
