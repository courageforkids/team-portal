"use server";
import { and, count, eq, inArray, isNull, ne } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { departments, invitations, passwordResets, taskCategories, taskSeries, users } from "@/db/schema";
import { actionAdmin, destroyAllSessionsFor } from "@/server/auth";
import { hashToken, randomToken } from "@/server/crypto";
import { audit } from "@/server/audit";
import { appUrl, sendEmail } from "@/server/email";
import { getSettings, saveSettings } from "@/server/settings";
import { nextOccurrence } from "@/server/maintenance";
import { all, bool, optStr, safe, str, UserError } from "@/server/safe-action";
import { parseLocalInput, TIMEZONES } from "@/lib/dates";
import type { ActionResult } from "@/lib/action";
import { PALETTE_VALUES, REMINDER_OPTIONS } from "@/components/settings/palette";

const ROLES = ["admin", "leader", "volunteer"] as const;
const uuid = z.string().uuid();
const INVITE_DAYS = 7;
const RESET_HOURS = 24;

async function otherActiveAdmins(exceptId: string) {
  const [r] = await db.select({ n: count() }).from(users).where(and(eq(users.role, "admin"), eq(users.status, "active"), ne(users.id, exceptId)));
  return r.n;
}
async function validDepartment(id: string | null) {
  if (!id) return null;
  const d = (await db.select({ id: departments.id }).from(departments).where(eq(departments.id, id)).limit(1))[0];
  if (!d) throw new UserError("That department no longer exists.");
  return d.id;
}

/* ───────── Members ───────── */

export async function updateMemberAction(_: unknown, fd: FormData): Promise<ActionResult> {
  return safe(async () => {
    const me = await actionAdmin();
    const id = uuid.parse(str(fd, "id"));
    const role = z.enum(ROLES, { message: "Choose a role." }).parse(str(fd, "role"));
    const title = z.string().max(120, "Keep the title under 120 characters.").parse(str(fd, "title"));
    const responsibilities = z.string().max(2000, "Responsibilities are limited to 2,000 characters.").parse(str(fd, "responsibilities"));
    const departmentId = await validDepartment(optStr(fd, "departmentId"));
    const u = (await db.select().from(users).where(eq(users.id, id)).limit(1))[0];
    if (!u) throw new UserError("That member no longer exists.");
    if (u.id === me.id && role !== "admin") throw new UserError("You can't remove your own administrator access. Ask another administrator to do it.");
    if (u.role === "admin" && role !== "admin" && u.status === "active" && (await otherActiveAdmins(u.id)) === 0)
      throw new UserError("The team needs at least one active administrator.");
    await db.update(users).set({ role, title, responsibilities, departmentId, updatedAt: new Date() }).where(eq(users.id, id));
    await audit(me.id, "member.update", "user", id, {
      ...(u.role !== role ? { role: { from: u.role, to: role } } : {}),
      ...(u.title !== title ? { title } : {}),
      ...(u.departmentId !== departmentId ? { departmentId } : {}),
      ...(u.responsibilities !== responsibilities ? { responsibilities: true } : {}),
    });
    return { ok: true, message: `Saved changes for ${u.name}.` };
  });
}

export async function setMemberStatusAction(id: string, status: "active" | "deactivated"): Promise<ActionResult> {
  return safe(async () => {
    const me = await actionAdmin();
    uuid.parse(id);
    const u = (await db.select().from(users).where(eq(users.id, id)).limit(1))[0];
    if (!u) throw new UserError("That member no longer exists.");
    if (status === "deactivated") {
      if (u.id === me.id) throw new UserError("You can't deactivate your own account.");
      if (u.role === "admin" && (await otherActiveAdmins(u.id)) === 0) throw new UserError("The team needs at least one active administrator.");
      await db.update(users).set({ status: "deactivated", updatedAt: new Date() }).where(eq(users.id, id));
      await destroyAllSessionsFor(id);
      await audit(me.id, "member.deactivate", "user", id, { name: u.name });
      return { ok: true, message: `${u.name} was deactivated and signed out everywhere.` };
    }
    await db.update(users).set({ status: "active", updatedAt: new Date() }).where(eq(users.id, id));
    await audit(me.id, "member.reactivate", "user", id, { name: u.name });
    return { ok: true, message: u.passwordHash ? `${u.name} can sign in again.` : `${u.name} is active. Create a reset link so they can set a password.` };
  });
}

export async function createResetLinkAction(id: string): Promise<ActionResult<{ link: string; expiresHours: number }>> {
  return safe(async () => {
    const me = await actionAdmin();
    uuid.parse(id);
    const u = (await db.select().from(users).where(eq(users.id, id)).limit(1))[0];
    if (!u) throw new UserError("That member no longer exists.");
    if (u.status !== "active") throw new UserError("Reactivate this member before creating a reset link.");
    const token = randomToken();
    await db.insert(passwordResets).values({ userId: u.id, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + RESET_HOURS * 3600_000), createdById: me.id });
    const link = appUrl(`/reset-password/${token}`);
    await sendEmail(u.email, "Set a new password for the Courage for Kids Team Portal",
      `Hi ${u.name},\n\n${me.name} created a password reset link for you. Use it within ${RESET_HOURS} hours to choose a new password:\n${link}\n\nIf you weren't expecting this, let an administrator know.`);
    await audit(me.id, "member.reset_link", "user", u.id, { expiresHours: RESET_HOURS });
    return { ok: true, message: "Reset link created.", data: { link, expiresHours: RESET_HOURS } };
  });
}

/* ───────── Invitations ───────── */

const inviteSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email address.").max(200),
  name: z.string().trim().min(2, "Enter their name.").max(120),
  title: z.string().trim().max(120, "Keep the title under 120 characters."),
  role: z.enum(ROLES, { message: "Choose a role." }),
});

async function issueInviteLink(invId: string, email: string, name: string, inviter: string) {
  const token = randomToken();
  const expiresAt = new Date(Date.now() + INVITE_DAYS * 86400_000);
  await db.update(invitations).set({ tokenHash: hashToken(token), expiresAt, revokedAt: null }).where(eq(invitations.id, invId));
  const link = appUrl(`/invite/${token}`);
  await sendEmail(email, "You're invited to the Courage for Kids Team Portal",
    `Hi ${name},\n\n${inviter} invited you to join the Courage for Kids Team Portal. Use this link within ${INVITE_DAYS} days to set your password:\n${link}\n\nTheir fight. Our mission.`);
  return link;
}

export async function inviteAction(_: unknown, fd: FormData): Promise<ActionResult<{ link: string; email: string }>> {
  return safe(async () => {
    const me = await actionAdmin();
    const v = inviteSchema.parse({ email: str(fd, "email"), name: str(fd, "name"), title: str(fd, "title"), role: str(fd, "role") || "volunteer" });
    const departmentId = await validDepartment(optStr(fd, "departmentId"));
    const existing = (await db.select({ status: users.status }).from(users).where(eq(users.email, v.email)).limit(1))[0];
    if (existing?.status === "active") throw new UserError("Someone with that email is already an active member.");
    // Only one live invitation per email: revoke older pending ones.
    await db.update(invitations).set({ revokedAt: new Date() }).where(and(eq(invitations.email, v.email), isNull(invitations.acceptedAt), isNull(invitations.revokedAt)));
    const [inv] = await db.insert(invitations).values({
      ...v, departmentId, invitedById: me.id, tokenHash: hashToken(randomToken()), expiresAt: new Date(Date.now() + INVITE_DAYS * 86400_000),
    }).returning({ id: invitations.id });
    const link = await issueInviteLink(inv.id, v.email, v.name, me.name);
    await audit(me.id, "invite.create", "invitation", inv.id, { email: v.email, role: v.role, reactivates: existing?.status === "deactivated" });
    return { ok: true, message: `Invitation created for ${v.name}.`, data: { link, email: v.email } };
  });
}

export async function resendInviteAction(id: string): Promise<ActionResult<{ link: string; email: string }>> {
  return safe(async () => {
    const me = await actionAdmin();
    uuid.parse(id);
    const inv = (await db.select().from(invitations).where(eq(invitations.id, id)).limit(1))[0];
    if (!inv) throw new UserError("That invitation no longer exists.");
    if (inv.acceptedAt) throw new UserError("This invitation was already accepted.");
    const active = (await db.select({ id: users.id }).from(users).where(and(eq(users.email, inv.email), eq(users.status, "active"))).limit(1))[0];
    if (active) throw new UserError("Someone with that email is already an active member.");
    const link = await issueInviteLink(inv.id, inv.email, inv.name, me.name);
    await audit(me.id, "invite.resend", "invitation", inv.id, { email: inv.email });
    return { ok: true, message: "New invitation link created. The old link no longer works.", data: { link, email: inv.email } };
  });
}

export async function revokeInviteAction(id: string): Promise<ActionResult> {
  return safe(async () => {
    const me = await actionAdmin();
    uuid.parse(id);
    const [r] = await db.update(invitations).set({ revokedAt: new Date() })
      .where(and(eq(invitations.id, id), isNull(invitations.acceptedAt), isNull(invitations.revokedAt))).returning({ email: invitations.email });
    if (!r) throw new UserError("That invitation was already accepted or revoked.");
    await audit(me.id, "invite.revoke", "invitation", id, { email: r.email });
    return { ok: true, message: "Invitation revoked. The link no longer works." };
  });
}

/* ───────── Departments ───────── */

function slugify(s: string) {
  return s.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/&/g, " and ").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "department";
}
async function uniqueSlug(base: string, exceptId?: string) {
  const taken = new Set((await db.select({ slug: departments.slug, id: departments.id }).from(departments)).filter((d) => d.id !== exceptId).map((d) => d.slug));
  let slug = base, i = 2;
  while (taken.has(slug)) slug = `${base}-${i++}`;
  return slug;
}

const deptSchema = z.object({
  name: z.string().trim().min(2, "Give the department a name.").max(80, "Keep the name under 80 characters."),
  description: z.string().trim().max(500, "Keep the description under 500 characters."),
  color: z.string().refine((c) => PALETTE_VALUES.includes(c), "Pick one of the colors."),
});

export async function saveDepartmentAction(_: unknown, fd: FormData): Promise<ActionResult> {
  return safe(async () => {
    const me = await actionAdmin();
    const id = optStr(fd, "id");
    const v = deptSchema.parse({ name: str(fd, "name"), description: str(fd, "description"), color: str(fd, "color") });
    const leadId = optStr(fd, "leadId");
    if (leadId) {
      const lead = (await db.select({ id: users.id }).from(users).where(and(eq(users.id, uuid.parse(leadId)), eq(users.status, "active"))).limit(1))[0];
      if (!lead) throw new UserError("The selected lead is no longer an active member.");
    }
    const dupe = (await db.select({ id: departments.id, name: departments.name }).from(departments)).find((d) => d.id !== id && d.name.toLowerCase() === v.name.toLowerCase());
    if (dupe) throw new UserError("A department with that name already exists.");
    if (id) {
      const before = (await db.select().from(departments).where(eq(departments.id, uuid.parse(id))).limit(1))[0];
      if (!before) throw new UserError("That department no longer exists.");
      const slug = before.name === v.name ? before.slug : await uniqueSlug(slugify(v.name), id);
      await db.update(departments).set({ ...v, slug, leadId }).where(eq(departments.id, id));
      await audit(me.id, "department.update", "department", id, { name: v.name, slug, leadId });
      return { ok: true, message: `${v.name} updated.` };
    }
    const slug = await uniqueSlug(slugify(v.name));
    const [d] = await db.insert(departments).values({ ...v, slug, leadId }).returning({ id: departments.id });
    await audit(me.id, "department.create", "department", d.id, { name: v.name, slug });
    return { ok: true, message: `${v.name} created.` };
  });
}

export async function setDepartmentArchivedAction(id: string, archived: boolean): Promise<ActionResult> {
  return safe(async () => {
    const me = await actionAdmin();
    const [d] = await db.update(departments).set({ archived }).where(eq(departments.id, uuid.parse(id))).returning({ name: departments.name });
    if (!d) throw new UserError("That department no longer exists.");
    await audit(me.id, archived ? "department.archive" : "department.restore", "department", id, { name: d.name });
    return { ok: true, message: archived ? `${d.name} archived.` : `${d.name} restored.` };
  });
}

/* ───────── Task categories ───────── */

export async function saveCategoryAction(_: unknown, fd: FormData): Promise<ActionResult> {
  return safe(async () => {
    const me = await actionAdmin();
    const id = optStr(fd, "id");
    const name = z.string().trim().min(2, "Give the category a name.").max(60, "Keep the name under 60 characters.").parse(str(fd, "name"));
    const color = str(fd, "color");
    const before = id ? (await db.select().from(taskCategories).where(eq(taskCategories.id, uuid.parse(id))).limit(1))[0] : undefined;
    if (id && !before) throw new UserError("That category no longer exists.");
    if (!PALETTE_VALUES.includes(color) && color !== before?.color) throw new UserError("Pick one of the colors.");
    const dupe = (await db.select({ id: taskCategories.id, name: taskCategories.name }).from(taskCategories)).find((c) => c.id !== id && c.name.toLowerCase() === name.toLowerCase());
    if (dupe) throw new UserError("A category with that name already exists.");
    if (before) {
      await db.update(taskCategories).set({ name, color }).where(eq(taskCategories.id, before.id));
      await audit(me.id, "category.update", "category", before.id, { from: before.name, name, color });
      return { ok: true, message: "Category updated." };
    }
    const [c] = await db.insert(taskCategories).values({ name, color }).returning({ id: taskCategories.id });
    await audit(me.id, "category.create", "category", c.id, { name, color });
    return { ok: true, message: `${name} added.` };
  });
}

export async function deleteCategoryAction(id: string): Promise<ActionResult> {
  return safe(async () => {
    const me = await actionAdmin();
    const [c] = await db.delete(taskCategories).where(eq(taskCategories.id, uuid.parse(id))).returning({ name: taskCategories.name });
    if (!c) throw new UserError("That category was already deleted.");
    await audit(me.id, "category.delete", "category", id, { name: c.name });
    return { ok: true, message: `${c.name} deleted. Tasks that used it now have no category.` };
  });
}

/* ───────── Reminders & branding ───────── */

export async function saveRemindersAction(_: unknown, fd: FormData): Promise<ActionResult> {
  return safe(async () => {
    const me = await actionAdmin();
    const hours = [...new Set(all(fd, "reminderHours").map(Number))].filter((h) => (REMINDER_OPTIONS as readonly number[]).includes(h)).sort((a, b) => b - a);
    const quietOn = bool(fd, "quietOn");
    const qs = Number(str(fd, "quietHoursStart")), qe = Number(str(fd, "quietHoursEnd"));
    const timezone = str(fd, "timezone");
    if (!TIMEZONES.includes(timezone)) throw new UserError("Choose a time zone from the list.");
    if (quietOn && (!Number.isInteger(qs) || !Number.isInteger(qe) || qs < 0 || qs > 23 || qe < 0 || qe > 23)) throw new UserError("Choose start and end hours for quiet hours.");
    if (quietOn && qs === qe) throw new UserError("Quiet hours need different start and end times.");
    const patch = {
      reminderHours: hours, overdueReminders: bool(fd, "overdueReminders"), timezone,
      // Equal start/end means "no quiet hours" to the reminder job (undefined would fall back to defaults).
      quietHoursStart: quietOn ? qs : 0, quietHoursEnd: quietOn ? qe : 0,
    };
    await saveSettings(patch);
    await audit(me.id, "settings.reminders", "settings", "1", patch);
    return { ok: true, message: "Reminder settings saved." };
  });
}

export async function saveBrandingAction(_: unknown, fd: FormData): Promise<ActionResult> {
  return safe(async () => {
    const me = await actionAdmin();
    const orgName = z.string().trim().min(2, "Enter the organization's name.").max(60, "Keep the name under 60 characters.").parse(str(fd, "orgName"));
    const tagline = z.string().trim().max(100, "Keep the tagline under 100 characters.").parse(str(fd, "tagline"));
    await saveSettings({ orgName, tagline });
    await audit(me.id, "settings.branding", "settings", "1", { orgName, tagline });
    return { ok: true, message: "Branding saved." };
  });
}

/* ───────── Email ───────── */

const SENDER_RE = /^(?:[^<>@]{1,80}\s<[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+>|[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+)$/;

export async function saveEmailFromAction(_: unknown, fd: FormData): Promise<ActionResult> {
  return safe(async () => {
    const me = await actionAdmin();
    const emailFrom = str(fd, "emailFrom");
    if (emailFrom && !SENDER_RE.test(emailFrom)) throw new UserError("Use an address like portal@example.org or Courage for Kids <portal@example.org>.");
    const s = await getSettings();
    // Clearing the sender while delivery is on would silently stop email — switch delivery off too, explicitly.
    await saveSettings({ emailFrom, ...(emailFrom ? {} : { emailEnabled: false }) });
    await audit(me.id, "settings.email_from", "settings", "1", { emailFrom, disabled: !emailFrom && s.emailEnabled });
    return { ok: true, message: emailFrom ? "Sender address saved." : "Sender address cleared. Email delivery is off." };
  });
}

export async function setEmailEnabledAction(enabled: boolean): Promise<ActionResult> {
  return safe(async () => {
    const me = await actionAdmin();
    const s = await getSettings();
    if (enabled) {
      if (!process.env.RESEND_API_KEY) throw new UserError("Email can't be turned on until RESEND_API_KEY is configured on the server.");
      if (!s.emailFrom) throw new UserError("Add a sender address first.");
    }
    await saveSettings({ emailEnabled: enabled });
    await audit(me.id, enabled ? "settings.email_enable" : "settings.email_disable", "settings", "1", {});
    return { ok: true, message: enabled ? "Email delivery is on. New messages will be sent." : "Email delivery is off. Messages will be held in the outbox." };
  });
}

/* ───────── Recurring tasks ───────── */

export async function setSeriesActiveAction(id: string, active: boolean): Promise<ActionResult> {
  return safe(async () => {
    const me = await actionAdmin();
    const s = (await db.select().from(taskSeries).where(eq(taskSeries.id, uuid.parse(id))).limit(1))[0];
    if (!s) throw new UserError("That recurring task no longer exists.");
    let nextDueAt = s.nextDueAt;
    let skipped = 0;
    if (active) {
      // Don't backfill occurrences that came due while paused.
      while (nextDueAt.getTime() < Date.now() && skipped < 1000) { nextDueAt = nextOccurrence(nextDueAt, s.recurrence, s.intervalDays); skipped++; }
    }
    await db.update(taskSeries).set({ active, nextDueAt }).where(eq(taskSeries.id, s.id));
    await audit(me.id, active ? "series.resume" : "series.pause", "series", s.id, { title: s.template.title, skipped });
    return { ok: true, message: active ? (skipped ? `Resumed. Skipped ${skipped} missed occurrence${skipped === 1 ? "" : "s"} while paused.` : "Resumed.") : "Paused. No new tasks will be created until you resume it." };
  });
}

export async function saveSeriesAction(_: unknown, fd: FormData): Promise<ActionResult> {
  return safe(async () => {
    const me = await actionAdmin();
    const s = (await db.select().from(taskSeries).where(eq(taskSeries.id, uuid.parse(str(fd, "id")))).limit(1))[0];
    if (!s) throw new UserError("That recurring task no longer exists.");
    const nextDueAt = parseLocalInput(str(fd, "nextDueAt"), s.template.timezone);
    if (!nextDueAt) throw new UserError("Choose the next due date.");
    const endsOn = str(fd, "endsOn") || null;
    if (endsOn && !/^\d{4}-\d{2}-\d{2}$/.test(endsOn)) throw new UserError("Use a valid end date.");
    const assigneeIds = [...new Set(all(fd, "assigneeIds"))];
    if (!assigneeIds.length) throw new UserError("Choose at least one assignee.");
    const active = await db.select({ id: users.id }).from(users).where(and(inArray(users.id, assigneeIds.map((a) => uuid.parse(a))), eq(users.status, "active")));
    if (active.length !== assigneeIds.length) throw new UserError("One of the selected members is no longer active.");
    await db.update(taskSeries).set({ nextDueAt, endsOn, assigneeIds }).where(eq(taskSeries.id, s.id));
    await audit(me.id, "series.update", "series", s.id, { title: s.template.title, nextDueAt, endsOn, assigneeIds });
    return { ok: true, message: "Recurring task updated. Changes apply to future occurrences." };
  });
}

export async function deleteSeriesAction(id: string): Promise<ActionResult> {
  return safe(async () => {
    const me = await actionAdmin();
    const [s] = await db.delete(taskSeries).where(eq(taskSeries.id, uuid.parse(id))).returning({ template: taskSeries.template });
    if (!s) throw new UserError("That recurring task was already deleted.");
    await audit(me.id, "series.delete", "series", id, { title: s.template.title });
    return { ok: true, message: "Recurring task deleted. Tasks it already created are kept." };
  });
}
