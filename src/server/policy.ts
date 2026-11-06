import "server-only";
import { and, eq, exists, inArray, or, sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import {
  announcements, departments, files, projects, resources, submissions, taskAssignees, tasks, type Audience,
} from "@/db/schema";
import type { CurrentUser, Role } from "./auth";

/**
 * Central authorization rules. Every page, server action and route handler goes through these —
 * hiding a button in the UI is never the only protection.
 */

export function visibilityAllowed(role: Role, vis: "everyone" | "leadership" | "admin") {
  if (vis === "everyone") return true;
  if (vis === "leadership") return role === "admin" || role === "leader";
  return role === "admin";
}
export function allowedVisibilities(role: Role): ("everyone" | "leadership" | "admin")[] {
  return role === "admin" ? ["everyone", "leadership", "admin"] : role === "leader" ? ["everyone", "leadership"] : ["everyone"];
}

/** SQL condition: tasks this user may see. */
export function taskVisibilityWhere(u: CurrentUser): SQL | undefined {
  if (u.role === "admin") return undefined;
  const assigned = exists(
    db.select({ x: sql`1` }).from(taskAssignees).where(and(eq(taskAssignees.taskId, tasks.id), eq(taskAssignees.userId, u.id))),
  );
  const conds: SQL[] = [assigned, eq(tasks.reviewerId, u.id)];
  if (u.role === "leader") {
    conds.push(exists(db.select({ x: sql`1` }).from(projects).where(and(eq(projects.id, tasks.projectId), eq(projects.directorId, u.id)))));
    conds.push(exists(db.select({ x: sql`1` }).from(departments).where(and(eq(departments.id, tasks.departmentId), eq(departments.leadId, u.id)))));
  }
  return or(...conds);
}

export type TaskAccess = { view: boolean; isAssignee: boolean; isReviewer: boolean; manage: boolean; review: boolean; seeInternal: boolean };

export async function taskAccess(u: CurrentUser, taskId: string): Promise<TaskAccess | null> {
  const t = (await db.select({ id: tasks.id, reviewerId: tasks.reviewerId }).from(tasks).where(eq(tasks.id, taskId)).limit(1))[0];
  if (!t) return null;
  const isAssignee = !!(await db.select({ x: taskAssignees.userId }).from(taskAssignees)
    .where(and(eq(taskAssignees.taskId, taskId), eq(taskAssignees.userId, u.id))).limit(1))[0];
  const isReviewer = t.reviewerId === u.id;
  let view = u.role === "admin" || isAssignee || isReviewer;
  if (!view && u.role === "leader") {
    const where = taskVisibilityWhere(u);
    view = !!(await db.select({ id: tasks.id }).from(tasks).where(and(eq(tasks.id, taskId), where)).limit(1))[0];
  }
  if (!view) return { view: false, isAssignee, isReviewer, manage: false, review: false, seeInternal: false };
  const manage = u.role === "admin";
  const review = manage || (isReviewer && u.role !== "volunteer");
  return { view, isAssignee, isReviewer, manage, review, seeInternal: review };
}

export function audienceMatches(a: Audience | null | undefined, u: { role: Role; departmentId: string | null }) {
  if (u.role === "admin") return true;
  if (!a) return true;
  const roleOk = !a.roles?.length || a.roles.includes(u.role);
  const deptOk = !a.departmentIds?.length || (!!u.departmentId && a.departmentIds.includes(u.departmentId));
  return roleOk && deptOk;
}

export async function canViewAnnouncement(u: CurrentUser, id: string) {
  const a = (await db.select().from(announcements).where(eq(announcements.id, id)).limit(1))[0];
  if (!a) return false;
  if (u.role === "admin") return true;
  return a.publishAt <= new Date() && audienceMatches(a.audience, u);
}

/** Files inherit access from whatever record owns them. */
export async function canViewFile(u: CurrentUser | null, fileId: string) {
  const f = (await db.select().from(files).where(eq(files.id, fileId)).limit(1))[0];
  if (!f) return { ok: false as const };
  if (f.ownerType === "branding") return { ok: true as const, file: f };
  if (!u) return { ok: false as const };
  if (u.role === "admin") return { ok: true as const, file: f };
  let ok = false;
  switch (f.ownerType) {
    case "avatar": ok = true; break;
    case "task": ok = !!f.ownerId && !!(await taskAccess(u, f.ownerId))?.view; break;
    case "submission": {
      const s = f.ownerId ? (await db.select({ taskId: submissions.taskId }).from(submissions).where(eq(submissions.id, f.ownerId)).limit(1))[0] : null;
      ok = !!s && !!(await taskAccess(u, s.taskId))?.view; break;
    }
    case "announcement": ok = !!f.ownerId && (await canViewAnnouncement(u, f.ownerId)); break;
    case "resource": {
      const r = (await db.select({ visibility: resources.visibility }).from(resources).where(eq(resources.fileId, f.id)).limit(1))[0];
      ok = !!r && visibilityAllowed(u.role, r.visibility); break;
    }
    case "project": ok = u.role === "leader"; break;
    case "message": {
      const { messages, conversationMembers } = await import("@/db/schema");
      const m = f.ownerId ? (await db.select({ c: messages.conversationId }).from(messages).where(eq(messages.id, f.ownerId)).limit(1))[0] : null;
      ok = !!m && !!(await db.select({ x: conversationMembers.userId }).from(conversationMembers)
        .where(and(eq(conversationMembers.conversationId, m.c), eq(conversationMembers.userId, u.id))).limit(1))[0];
      break;
    }
  }
  return ok ? { ok: true as const, file: f } : { ok: false as const };
}

export async function assigneeIdsFor(taskIds: string[]) {
  if (!taskIds.length) return new Map<string, string[]>();
  const rows = await db.select().from(taskAssignees).where(inArray(taskAssignees.taskId, taskIds));
  const m = new Map<string, string[]>();
  for (const r of rows) m.set(r.taskId, [...(m.get(r.taskId) ?? []), r.userId]);
  return m;
}
