"use server";
import { revalidatePath } from "next/cache";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { fridayActions as actions, fridayJobs as jobs, fridayMemories as memories, fridaySettings as settings, users } from "@/db/schema";
import { actionFridayOwner, confirmOwnerPassword } from "@/server/friday/access";
import { executeAction, logEvent } from "@/server/friday/agent";
import { STANDING_PERMISSIONS } from "@/server/friday/policy";

export type Result = { ok: boolean; message: string };
const done = (message: string): Result => { revalidatePath("/friday"); return { ok: true, message }; };
const fail = (message: string): Result => ({ ok: false, message });


/** Executive authorization: needs the password again, then runs exactly the proposed action. */
export async function approveAction(id: string, password: string): Promise<Result> {
  const me = await actionFridayOwner();
  if (!(await confirmOwnerPassword(me, password))) {
    await logEvent(null, "security", "approve", false, { actionId: id, reason: "wrong password" });
    return fail("That password isn't right. Nothing was run.");
  }
  try {
    await logEvent(null, "approval_decided", null, true, { actionId: id, decision: "approved" });
    await executeAction(id);
    return done("Approved and done.");
  } catch (e) {
    revalidatePath("/friday");
    return fail(`Approved, but it didn't go through: ${(e as Error).message}`);
  }
}
export async function rejectAction(id: string): Promise<Result> {
  await actionFridayOwner();
  const r = await db.update(actions).set({ status: "rejected", decidedAt: new Date() }).where(and(eq(actions.id, id), eq(actions.status, "pending"))).returning({ tool: actions.tool, jobId: actions.jobId });
  if (!r.length) return fail("That request was already handled.");
  await logEvent(r[0].jobId, "approval_decided", r[0].tool, true, { actionId: id, decision: "rejected" });
  return done("Rejected. Nothing was done.");
}

/** Emergency stop: halts all chat tools, background jobs and approvals immediately. */
export async function setPausedAction(paused: boolean): Promise<Result> {
  await actionFridayOwner();
  await db.update(settings).set({ paused, updatedAt: new Date() }).where(eq(settings.id, 1));
  if (paused) await db.update(jobs).set({ status: "queued", lockedUntil: null }).where(eq(jobs.status, "running"));
  await logEvent(null, "security", "emergency_stop", true, { paused });
  return done(paused ? "Friday is stopped. Nothing will run until you resume her." : "Friday is back online.");
}

const SettingsBody = z.object({
  nightlyHour: z.coerce.number().int().min(0).max(23), briefingHour: z.coerce.number().int().min(0).max(23),
  quietStart: z.coerce.number().int().min(0).max(23), quietEnd: z.coerce.number().int().min(0).max(23),
  monthlyBudgetDollars: z.coerce.number().min(1).max(500), timezone: z.string().min(3).max(60),
});
/** Schedule, budget and standing permissions. Changing permissions requires the password. */
export async function saveSettingsAction(_: unknown, fd: FormData): Promise<Result> {
  const me = await actionFridayOwner();
  const v = SettingsBody.safeParse(Object.fromEntries(fd));
  if (!v.success) return fail("Check the numbers and try again.");
  try { new Intl.DateTimeFormat("en-US", { timeZone: v.data.timezone }); } catch { return fail("That time zone isn't recognized."); }
  const [cur] = await db.select().from(settings).where(eq(settings.id, 1));
  const permissions = Object.fromEntries(Object.keys(STANDING_PERMISSIONS).map((k) => [k, fd.get(`perm_${k}`) === "on"]));
  const changedPerms = Object.keys(permissions).some((k) => !!cur?.permissions?.[k] !== permissions[k]);
  if (changedPerms && !(await confirmOwnerPassword(me, String(fd.get("password") ?? "")))) return fail("Enter your password to change permissions. Nothing was saved.");
  await db.update(settings).set({
    nightlyHour: v.data.nightlyHour, briefingHour: v.data.briefingHour, quietStart: v.data.quietStart, quietEnd: v.data.quietEnd,
    monthlyBudgetCents: Math.round(v.data.monthlyBudgetDollars * 100), permissions, updatedAt: new Date(),
  }).where(eq(settings.id, 1));
  await db.update(users).set({ timezone: v.data.timezone }).where(eq(users.id, me.id));
  if (changedPerms) await logEvent(null, "security", "permissions", true, { permissions });
  return done("Settings saved.");
}

export async function queueObjectiveAction(_: unknown, fd: FormData): Promise<Result> {
  await actionFridayOwner();
  const text = String(fd.get("objective") ?? "").trim();
  if (text.length < 5) return fail("Describe the objective first.");
  await db.insert(jobs).values({ kind: "objective", title: text.slice(0, 120), instructions: text });
  return done("Queued. Friday will pick it up on her next run.");
}
export async function cancelJobAction(id: string): Promise<Result> {
  await actionFridayOwner();
  const r = await db.update(jobs).set({ status: "cancelled", lockedUntil: null, finishedAt: new Date() }).where(and(eq(jobs.id, id), inArray(jobs.status, ["queued", "running"]))).returning({ title: jobs.title });
  if (!r.length) return fail("That job already finished.");
  await logEvent(id, "job", null, true, { title: r[0].title, outcome: "cancelled by Jacob" });
  return done("Cancelled.");
}
export async function deleteMemoryAction(id: string): Promise<Result> {
  await actionFridayOwner();
  await db.delete(memories).where(eq(memories.id, id));
  return done("Deleted.");
}
export async function verifyMemoryAction(id: string): Promise<Result> {
  await actionFridayOwner();
  await db.update(memories).set({ verified: true, source: "Confirmed by Jacob", updatedAt: new Date() }).where(eq(memories.id, id));
  return done("Marked as verified.");
}
