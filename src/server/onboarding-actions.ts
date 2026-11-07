"use server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { onboardingProgress, onboardingSteps, resources } from "@/db/schema";
import { actionAdmin, actionUser, AuthError } from "./auth";
import { all, bool, safe, str, UserError } from "./safe-action";
import { notify } from "./notify";
import { audit } from "./audit";
import type { ActionResult } from "@/lib/action";

const uuid = z.string().uuid();

/** Members tick (or untick) "manual" and "read this resource" steps. Automatic steps can't be ticked by hand. */
export async function toggleOnboardingStepAction(stepId: string, done: boolean): Promise<ActionResult> {
  return safe(async () => {
    const me = await actionUser();
    const s = (await db.select().from(onboardingSteps).where(eq(onboardingSteps.id, uuid.parse(stepId))).limit(1))[0];
    if (!s || !s.active) throw new UserError("That step no longer exists.");
    if (!["manual", "resource"].includes(s.kind)) throw new AuthError("This step checks itself off automatically.");
    if (s.roles.length && !s.roles.includes(me.role)) throw new AuthError();
    if (done) await db.insert(onboardingProgress).values({ stepId: s.id, userId: me.id }).onConflictDoNothing();
    else await db.delete(onboardingProgress).where(and(eq(onboardingProgress.stepId, s.id), eq(onboardingProgress.userId, me.id)));
    return { ok: true };
  });
}

export async function saveOnboardingStepAction(_: unknown, fd: FormData): Promise<ActionResult> {
  return safe(async () => {
    const me = await actionAdmin();
    const title = str(fd, "title").slice(0, 140);
    if (title.length < 3) throw new UserError("Give the step a title.");
    const kind = z.enum(["photo", "notifications", "chat_intro", "resource", "manual"]).parse(str(fd, "kind") || "manual");
    const resourceId = kind === "resource" ? uuid.parse(str(fd, "resourceId")) : null;
    if (resourceId && !(await db.select({ id: resources.id }).from(resources).where(eq(resources.id, resourceId)).limit(1))[0]) throw new UserError("Pick a resource.");
    const urlRaw = str(fd, "url");
    const url = urlRaw ? z.string().url().refine((u) => /^https?:/.test(u), "Links must start with http(s)://").parse(urlRaw) : null;
    const roles = all(fd, "roles").filter((r): r is "admin" | "leader" | "volunteer" => ["admin", "leader", "volunteer"].includes(r));
    const values = { title, description: str(fd, "description").slice(0, 500), kind, resourceId, url, roles, active: !bool(fd, "inactive") };
    const id = str(fd, "id");
    if (id) await db.update(onboardingSteps).set(values).where(eq(onboardingSteps.id, uuid.parse(id)));
    else {
      const last = await db.select({ p: onboardingSteps.position }).from(onboardingSteps);
      await db.insert(onboardingSteps).values({ ...values, position: Math.max(-1, ...last.map((l) => l.p)) + 1 });
    }
    await audit(me.id, id ? "onboarding.step_update" : "onboarding.step_create", "onboarding_step", id || undefined, { title });
    return { ok: true, message: id ? "Step saved." : "Step added." };
  });
}

export async function moveOnboardingStepAction(stepId: string, dir: -1 | 1): Promise<ActionResult> {
  return safe(async () => {
    await actionAdmin();
    const steps = await db.select().from(onboardingSteps).orderBy(onboardingSteps.position, onboardingSteps.createdAt);
    const i = steps.findIndex((s) => s.id === stepId), j = i + dir;
    if (i < 0 || j < 0 || j >= steps.length) return { ok: true };
    [steps[i], steps[j]] = [steps[j], steps[i]];
    for (let k = 0; k < steps.length; k++) await db.update(onboardingSteps).set({ position: k }).where(eq(onboardingSteps.id, steps[k].id));
    return { ok: true };
  });
}

export async function deleteOnboardingStepAction(stepId: string): Promise<ActionResult> {
  return safe(async () => {
    const me = await actionAdmin();
    await db.delete(onboardingSteps).where(eq(onboardingSteps.id, uuid.parse(stepId)));
    await audit(me.id, "onboarding.step_delete", "onboarding_step", stepId);
    return { ok: true, message: "Step removed." };
  });
}

export async function nudgeOnboardingAction(userId: string): Promise<ActionResult> {
  return safe(async () => {
    const me = await actionAdmin();
    await notify([uuid.parse(userId)], { type: "task_updated", title: "A few quick setup steps are waiting for you", body: "Finish your getting-started checklist on Home.", href: "/onboarding", excludeUserId: me.id });
    return { ok: true, message: "Reminder sent." };
  });
}
