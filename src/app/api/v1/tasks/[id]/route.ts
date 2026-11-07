import { z } from "zod";
import { asc, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { reviews, submissions, taskAssignees, tasks, users } from "@/db/schema";
import { apiRoute, ApiError, jsonBody } from "@/server/api-auth";
import { parseWhen, resolveCategory, resolveDepartment, resolvePeople, resolveProject } from "@/server/api-helpers";
import { setStatus, updateTask, type TaskInput } from "@/server/tasks";
import { TASK_STATUSES } from "@/lib/task-meta";

type Ctx = { params: Promise<{ id: string }> };
const uuid = z.string().uuid();

async function load(id: string) {
  const t = (await db.select().from(tasks).where(eq(tasks.id, uuid.parse(id))).limit(1))[0];
  if (!t) throw new ApiError(404, "Task not found.");
  return t;
}

export const GET = apiRoute<Ctx>(async (_req, _actor, { params }) => {
  const t = await load((await params).id);
  const [asg, subs, revs] = await Promise.all([
    db.select({ id: users.id, name: users.name }).from(taskAssignees).innerJoin(users, eq(users.id, taskAssignees.userId)).where(eq(taskAssignees.taskId, t.id)),
    db.select({ version: submissions.version, text: submissions.text, links: submissions.links, note: submissions.note, submittedAt: submissions.submittedAt }).from(submissions).where(eq(submissions.taskId, t.id)).orderBy(desc(submissions.version)),
    db.select({ decision: reviews.decision, feedback: reviews.feedback, createdAt: reviews.createdAt }).from(reviews).where(eq(reviews.taskId, t.id)).orderBy(asc(reviews.createdAt)),
  ]);
  return { task: { ...t, internalNotes: undefined }, assignees: asg, submissions: subs, reviews: revs, url: `/tasks/${t.id}` };
});

/** Edit fields (only the ones sent change), or change status with { status, reason }. */
export const PATCH = apiRoute<Ctx>(async (req, actor, { params }) => {
  const t = await load((await params).id);
  const b = await jsonBody(req);
  if (b.status !== undefined) {
    const status = z.enum(TASK_STATUSES).parse(b.status);
    await setStatus(actor, t.id, status, typeof b.reason === "string" ? b.reason : "");
  }
  const editable = ["title", "instructions", "dueAt", "priority", "department", "project", "category", "deliverables", "completionCriteria", "assignees", "requiresReview", "reviewer"];
  if (editable.some((k) => b[k] !== undefined)) {
    const current = (await db.select({ id: taskAssignees.userId }).from(taskAssignees).where(eq(taskAssignees.taskId, t.id))).map((a) => a.id);
    const input: TaskInput = {
      title: typeof b.title === "string" ? b.title.slice(0, 160) : t.title,
      instructions: typeof b.instructions === "string" ? b.instructions : t.instructions,
      departmentId: b.department !== undefined ? await resolveDepartment(b.department) : t.departmentId,
      categoryId: b.category !== undefined ? await resolveCategory(b.category) : t.categoryId,
      projectId: b.project !== undefined ? await resolveProject(b.project) : t.projectId,
      priority: b.priority !== undefined ? z.enum(["low", "medium", "high", "urgent"]).parse(b.priority) : t.priority,
      dueAt: b.dueAt !== undefined ? parseWhen(b.dueAt, t.timezone, "dueAt") : t.dueAt,
      timezone: t.timezone,
      deliverables: typeof b.deliverables === "string" ? b.deliverables : t.deliverables,
      completionCriteria: typeof b.completionCriteria === "string" ? b.completionCriteria : t.completionCriteria,
      submissionTypes: t.submissionTypes, checklist: t.checklist, links: t.links,
      requiresReview: typeof b.requiresReview === "boolean" ? b.requiresReview : t.requiresReview,
      reviewerId: b.reviewer !== undefined ? (b.reviewer ? (await resolvePeople([b.reviewer]))[0] : null) : t.reviewerId,
      internalNotes: t.internalNotes, workGroupId: t.workGroupId,
    };
    const assignees = b.assignees !== undefined ? await resolvePeople(b.assignees) : current;
    if (!assignees.length) throw new ApiError(400, "A task needs at least one assignee.");
    await updateTask(actor, t.id, input, assignees);
  }
  return { ok: true, url: `/tasks/${t.id}` };
});
