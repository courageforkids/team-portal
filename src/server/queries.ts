import "server-only";
import { and, asc, desc, eq, gte, ilike, inArray, isNotNull, lt, lte, or, sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { departments, projects, taskAssignees, taskCategories, tasks, users } from "@/db/schema";
import type { CurrentUser } from "./auth";
import { taskVisibilityWhere } from "./policy";
import { ACTIVE, OPEN_FOR_ASSIGNEE, PRIORITY_RANK, type Priority, type TaskStatus } from "@/lib/task-meta";

export type Person = { id: string; name: string; title: string; avatarFileId: string | null; role: "admin" | "leader" | "volunteer"; departmentId: string | null; status: "active" | "deactivated" };

export async function getPeople(opts: { includeInactive?: boolean } = {}): Promise<Person[]> {
  return db.select({ id: users.id, name: users.name, title: users.title, avatarFileId: users.avatarFileId, role: users.role, departmentId: users.departmentId, status: users.status })
    .from(users).where(opts.includeInactive ? undefined : eq(users.status, "active")).orderBy(asc(users.name));
}
export async function getDepartments(includeArchived = false) {
  return db.select().from(departments).where(includeArchived ? undefined : eq(departments.archived, false)).orderBy(asc(departments.name));
}
export async function getCategories() {
  return db.select().from(taskCategories).orderBy(asc(taskCategories.name));
}
export async function getProjectsLite() {
  return db.select({ id: projects.id, name: projects.name, status: projects.status }).from(projects).orderBy(asc(projects.name));
}

export type TaskFilters = {
  scope?: "mine" | "visible" | "all";       // mine = assigned to me; visible = everything I may see
  view?: "active" | "completed" | "overdue" | "review" | "everything";
  q?: string; memberId?: string; departmentId?: string; projectId?: string; status?: TaskStatus; priority?: Priority;
  dueFrom?: Date; dueTo?: Date; sort?: "due" | "priority" | "updated" | "created"; limit?: number;
};

export type TaskListItem = Awaited<ReturnType<typeof loadTasks>>[number];

/** The one query every task list uses. Always applies the viewer's visibility rules. */
export async function loadTasks(viewer: CurrentUser, f: TaskFilters = {}) {
  const conds: (SQL | undefined)[] = [taskVisibilityWhere(viewer)];
  const now = new Date();
  if (f.scope === "mine" || (!f.scope && viewer.role !== "admin"))
    conds.push(inArray(tasks.id, db.select({ id: taskAssignees.taskId }).from(taskAssignees).where(eq(taskAssignees.userId, viewer.id))));
  if (f.memberId) conds.push(inArray(tasks.id, db.select({ id: taskAssignees.taskId }).from(taskAssignees).where(eq(taskAssignees.userId, f.memberId))));
  switch (f.view ?? "active") {
    case "active": conds.push(inArray(tasks.status, ACTIVE)); break;
    case "completed": conds.push(eq(tasks.status, "approved")); break;
    case "overdue": conds.push(inArray(tasks.status, OPEN_FOR_ASSIGNEE), isNotNull(tasks.dueAt), lt(tasks.dueAt, now)); break;
    case "review": conds.push(inArray(tasks.status, ["submitted", "under_review"])); break;
  }
  if (f.q) conds.push(or(ilike(tasks.title, `%${f.q}%`), ilike(tasks.instructions, `%${f.q}%`)));
  if (f.departmentId) conds.push(eq(tasks.departmentId, f.departmentId));
  if (f.projectId) conds.push(eq(tasks.projectId, f.projectId));
  if (f.status) conds.push(eq(tasks.status, f.status));
  if (f.priority) conds.push(eq(tasks.priority, f.priority));
  if (f.dueFrom) conds.push(gte(tasks.dueAt, f.dueFrom));
  if (f.dueTo) conds.push(lte(tasks.dueAt, f.dueTo));

  const order = f.sort === "updated" ? [desc(tasks.updatedAt)] : f.sort === "created" ? [desc(tasks.createdAt)]
    : f.view === "completed" ? [desc(tasks.completedAt)] : [sql`${tasks.dueAt} asc nulls last`, desc(tasks.createdAt)];
  const rows = await db.select({
    id: tasks.id, title: tasks.title, instructions: tasks.instructions, status: tasks.status, priority: tasks.priority, dueAt: tasks.dueAt,
    timezone: tasks.timezone, submissionTypes: tasks.submissionTypes, requiresReview: tasks.requiresReview, updatedAt: tasks.updatedAt,
    completedAt: tasks.completedAt, createdAt: tasks.createdAt, deliverables: tasks.deliverables, blockedReason: tasks.blockedReason,
    departmentId: tasks.departmentId, departmentName: departments.name, departmentColor: departments.color,
    projectId: tasks.projectId, projectName: projects.name, seriesId: tasks.seriesId, reviewerId: tasks.reviewerId,
  }).from(tasks)
    .leftJoin(departments, eq(departments.id, tasks.departmentId))
    .leftJoin(projects, eq(projects.id, tasks.projectId))
    .where(and(...conds)).orderBy(...order).limit(f.limit ?? 300);

  const ids = rows.map((r) => r.id);
  const asg = ids.length ? await db.select({ taskId: taskAssignees.taskId, id: users.id, name: users.name, avatarFileId: users.avatarFileId })
    .from(taskAssignees).innerJoin(users, eq(users.id, taskAssignees.userId)).where(inArray(taskAssignees.taskId, ids)) : [];
  const byTask = new Map<string, { id: string; name: string; avatarFileId: string | null }[]>();
  for (const a of asg) byTask.set(a.taskId, [...(byTask.get(a.taskId) ?? []), { id: a.id, name: a.name, avatarFileId: a.avatarFileId }]);
  const out = rows.map((r) => ({ ...r, assignees: byTask.get(r.id) ?? [] }));
  if (f.sort === "priority") out.sort((a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] || (a.dueAt?.getTime() ?? Infinity) - (b.dueAt?.getTime() ?? Infinity));
  return out;
}
