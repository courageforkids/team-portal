import { addSystemMessage, ensureDm } from "./chat";
import "server-only";
import { and, desc, eq, inArray, max } from "drizzle-orm";
import { db } from "@/db";
import {
  extensionRequests, files, reviews, submissions, taskAssignees, taskEvents, tasks, users,
  type ChecklistItem, type ChecklistState, type LinkItem, type SubmissionType,
} from "@/db/schema";
import type { CurrentUser } from "./auth";
import { AuthError } from "./auth";
import { taskAccess } from "./policy";
import { adminIds, notify } from "./notify";
import { audit } from "./audit";
import { UserError } from "./safe-action";
import { prepareUploads, storePrepared } from "./storage";
import { fmtDateTime } from "@/lib/dates";
import { CLOSED, type TaskStatus } from "@/lib/task-meta";

export type TaskInput = {
  title: string; instructions: string; departmentId: string | null; categoryId: string | null; projectId: string | null;
  priority: "low" | "medium" | "high" | "urgent"; dueAt: Date | null; timezone: string; deliverables: string; completionCriteria: string;
  submissionTypes: SubmissionType[]; checklist: ChecklistItem[]; links: LinkItem[]; requiresReview: boolean; reviewerId: string | null;
  internalNotes: string;
  workGroupId?: string | null;
  meetingId?: string | null;
};

export async function logTaskEvent(taskId: string, actorId: string | null, kind: string, detail: Record<string, unknown> = {}) {
  await db.insert(taskEvents).values({ taskId, actorId, kind, detail });
}

async function assigneesOf(taskId: string) {
  return (await db.select({ id: taskAssignees.userId }).from(taskAssignees).where(eq(taskAssignees.taskId, taskId))).map((r) => r.id);
}

/** Creates one shared task, or a separate copy per assignee. Returns created task ids. */
export async function createTasks(actor: CurrentUser | null, input: TaskInput, assigneeIds: string[], opts: { separate: boolean; seriesId?: string | null }) {
  const ids = [...new Set(assigneeIds)];
  if (ids.length) {
    const active = await db.select({ id: users.id }).from(users).where(and(inArray(users.id, ids), eq(users.status, "active")));
    if (active.length !== ids.length) throw new UserError("One of the selected members is no longer active.");
  }
  const groups = opts.separate && ids.length > 1 ? ids.map((i) => [i]) : [ids];
  const created: string[] = [];
  for (const group of groups) {
    const [t] = await db.insert(tasks).values({
      ...input, originalDueAt: input.dueAt, createdById: actor?.id ?? null, seriesId: opts.seriesId ?? null,
    }).returning({ id: tasks.id });
    if (group.length) await db.insert(taskAssignees).values(group.map((userId) => ({ taskId: t.id, userId })));
    await logTaskEvent(t.id, actor?.id ?? null, "created", { assignees: group, recurring: !!opts.seriesId });
    await notify(group, {
      type: "task_assigned", title: `New assignment: ${input.title}`,
      body: input.dueAt ? `Due ${fmtDateTime(input.dueAt, input.timezone)}` : "No due date", href: `/tasks/${t.id}`, dedupeKey: `assigned:${t.id}`,
      excludeUserId: actor?.id,
    });
    created.push(t.id);
  }
  if (actor) await audit(actor.id, "task.create", "task", created.join(","), { title: input.title, assignees: ids, separate: opts.separate });
  // The first time someone gets a task from this person, open a direct chat between them (only once, ever).
  if (actor) {
    for (const uid of ids.filter((i) => i !== actor.id)) {
      try {
        const { conv, created: isNew } = await ensureDm(actor.id, uid);
        if (isNew) await addSystemMessage(conv.id, `${actor.name.split(" ")[0]} started this chat when assigning your first task. Questions about an assignment? Ask here.`);
      } catch (e) { console.error("couldn't open task chat", e); }
    }
  }
  return created;
}

export async function updateTask(actor: CurrentUser, taskId: string, input: TaskInput, assigneeIds: string[]) {
  const before = (await db.select().from(tasks).where(eq(tasks.id, taskId)).limit(1))[0];
  if (!before) throw new UserError("That task no longer exists.");
  await db.update(tasks).set({ ...input, updatedAt: new Date() }).where(eq(tasks.id, taskId));
  const prev = await assigneesOf(taskId);
  const next = [...new Set(assigneeIds)];
  const added = next.filter((x) => !prev.includes(x));
  const removed = prev.filter((x) => !next.includes(x));
  if (removed.length) await db.delete(taskAssignees).where(and(eq(taskAssignees.taskId, taskId), inArray(taskAssignees.userId, removed)));
  if (added.length) await db.insert(taskAssignees).values(added.map((userId) => ({ taskId, userId }))).onConflictDoNothing();
  if (added.length || removed.length) {
    await logTaskEvent(taskId, actor.id, "reassigned", { added, removed });
    await notify(added, { type: "task_assigned", title: `New assignment: ${input.title}`, href: `/tasks/${taskId}`, dedupeKey: `assigned:${taskId}`, excludeUserId: actor.id });
  }
  const dueChanged = (before.dueAt?.getTime() ?? null) !== (input.dueAt?.getTime() ?? null);
  if (dueChanged) {
    await logTaskEvent(taskId, actor.id, "due_changed", { from: before.dueAt, to: input.dueAt });
    await notify(next.filter((x) => !added.includes(x)), {
      type: "deadline_changed", title: `Deadline updated: ${input.title}`,
      body: input.dueAt ? `Now due ${fmtDateTime(input.dueAt, input.timezone)}` : "The due date was removed.", href: `/tasks/${taskId}`, excludeUserId: actor.id,
    });
  } else {
    await logTaskEvent(taskId, actor.id, "edited", {});
  }
  await audit(actor.id, "task.update", "task", taskId, { dueChanged, added, removed });
}

/** Admin-only status overrides (cancel, excuse, reopen, mark complete…) and assignee progress updates. */
export async function setStatus(actor: CurrentUser, taskId: string, status: TaskStatus, reason = "") {
  const access = await taskAccess(actor, taskId);
  if (!access?.view) throw new AuthError();
  const t = (await db.select().from(tasks).where(eq(tasks.id, taskId)).limit(1))[0];
  const assigneeAllowed: Partial<Record<TaskStatus, TaskStatus[]>> = {
    not_started: ["in_progress", "blocked"],
    in_progress: ["not_started", "blocked"],
    revision_requested: ["in_progress", "blocked"],
    blocked: ["in_progress", "not_started"],
  };
  const isManager = access.manage;
  if (!isManager) {
    const okMove = access.isAssignee && (assigneeAllowed[t.status]?.includes(status) ?? false);
    if (!okMove) throw new AuthError("Only an administrator can make that change.");
  }
  if (status === "blocked" && !reason.trim()) throw new UserError("Say briefly what's blocking this task.");
  const patch: Partial<typeof tasks.$inferInsert> = { status, updatedAt: new Date() };
  if (status === "blocked") { patch.statusBeforeBlock = t.status === "blocked" ? t.statusBeforeBlock : t.status; patch.blockedReason = reason.trim(); }
  if (t.status === "blocked" && status !== "blocked") { patch.blockedReason = null; patch.statusBeforeBlock = null; }
  if (status === "approved") patch.completedAt = new Date();
  if (status === "excused") patch.excusedReason = reason.trim() || null;
  if (!CLOSED.includes(status)) patch.completedAt = null;
  await db.update(tasks).set(patch).where(eq(tasks.id, taskId));
  await logTaskEvent(taskId, actor.id, "status", { from: t.status, to: status, reason: reason || undefined });
  if (status === "blocked") {
    await notify(await adminIds(), { type: "task_blocked", title: `${actor.name} is blocked: ${t.title}`, body: reason, href: `/tasks/${taskId}`, excludeUserId: actor.id });
  }
  if (isManager && ["canceled", "excused", "approved"].includes(status)) {
    await notify(await assigneesOf(taskId), {
      type: status === "approved" ? "submission_approved" : "task_updated",
      title: status === "approved" ? `Completed: ${t.title}` : `${t.title} was ${status === "canceled" ? "canceled" : "excused"}`,
      body: reason, href: `/tasks/${taskId}`, excludeUserId: actor.id,
    });
    await audit(actor.id, `task.${status}`, "task", taskId, { reason });
  }
}

export type SubmissionInput = { text: string; links: LinkItem[]; checklist: ChecklistState[]; note: string; files: File[] };

export async function submitWork(actor: CurrentUser, taskId: string, input: SubmissionInput) {
  const access = await taskAccess(actor, taskId);
  if (!access?.isAssignee) throw new AuthError("Only people assigned to this task can submit it.");
  const t = (await db.select().from(tasks).where(eq(tasks.id, taskId)).limit(1))[0];
  if (["approved", "canceled", "excused", "submitted", "under_review"].includes(t.status))
    throw new UserError(t.status === "approved" ? "This task is already approved." : t.status === "submitted" || t.status === "under_review" ? "This task is already waiting for review." : "This task is closed.");
  const types = t.submissionTypes;
  if (types.includes("file") && !input.files.length && !(await hasEarlierFiles(taskId)))
    throw new UserError("This task needs at least one file.");
  if (types.includes("text") && !input.text.trim()) throw new UserError("Add your written response.");
  if (types.includes("link") && !input.links.length) throw new UserError("Add at least one link.");
  if (types.includes("checklist") && t.checklist.length && input.checklist.filter((c) => c.done).length < t.checklist.length)
    throw new UserError("Check off every item on the checklist before submitting.");
  if (!types.length && !input.text.trim() && !input.files.length && !input.links.length) throw new UserError("Add something to submit.");

  const prepared = await prepareUploads(input.files); // reject bad files before anything is saved
  const [{ v }] = await db.select({ v: max(submissions.version) }).from(submissions).where(eq(submissions.taskId, taskId));
  const version = (v ?? 0) + 1;
  const [sub] = await db.insert(submissions).values({
    taskId, version, submittedById: actor.id, text: input.text.trim(), links: input.links, checklist: input.checklist, note: input.note.trim(), dueAtSubmission: t.dueAt,
  }).returning();
  if (prepared.length) {
    try { await storePrepared(prepared, { type: "submission", id: sub.id }, actor.id); }
    catch (e) { await db.delete(submissions).where(eq(submissions.id, sub.id)); throw e; }
  }

  const now = new Date();
  const nextStatus: TaskStatus = t.requiresReview ? "submitted" : "approved";
  await db.update(tasks).set({
    status: nextStatus, firstSubmittedAt: t.firstSubmittedAt ?? now, completedAt: nextStatus === "approved" ? now : null, updatedAt: now,
    blockedReason: null, statusBeforeBlock: null,
  }).where(eq(tasks.id, taskId));
  await logTaskEvent(taskId, actor.id, "submitted", { version, late: !!t.dueAt && now > t.dueAt });
  const reviewers = t.reviewerId ? [t.reviewerId, ...(await adminIds())] : await adminIds();
  await notify(reviewers, {
    type: "task_submitted", title: `${actor.name} submitted ${version > 1 ? `a revision of ` : ""}"${t.title}"`,
    body: input.note ? input.note.slice(0, 140) : t.requiresReview ? "Ready for your review." : "Marked complete (no review required).",
    href: t.requiresReview ? `/review?task=${taskId}` : `/tasks/${taskId}`, excludeUserId: actor.id,
  });
  return { version, status: nextStatus };
}

async function hasEarlierFiles(taskId: string) {
  const subs = await db.select({ id: submissions.id }).from(submissions).where(eq(submissions.taskId, taskId));
  if (!subs.length) return false;
  return !!(await db.select({ id: files.id }).from(files).where(and(eq(files.ownerType, "submission"), inArray(files.ownerId, subs.map((s) => s.id)))).limit(1))[0];
}

export async function startReview(actor: CurrentUser, taskId: string) {
  const access = await taskAccess(actor, taskId);
  if (!access?.review) throw new AuthError();
  const t = (await db.select({ status: tasks.status }).from(tasks).where(eq(tasks.id, taskId)).limit(1))[0];
  if (t?.status === "submitted") {
    await db.update(tasks).set({ status: "under_review", updatedAt: new Date() }).where(eq(tasks.id, taskId));
    await logTaskEvent(taskId, actor.id, "status", { from: "submitted", to: "under_review" });
  }
}

export async function reviewSubmission(actor: CurrentUser, taskId: string, decision: "approved" | "revision_requested", feedback: string) {
  const access = await taskAccess(actor, taskId);
  if (!access?.review) throw new AuthError("You aren't a reviewer for this task.");
  const t = (await db.select().from(tasks).where(eq(tasks.id, taskId)).limit(1))[0];
  if (!["submitted", "under_review"].includes(t.status)) throw new UserError("There's no submission waiting for review on this task.");
  if (decision === "revision_requested" && !feedback.trim()) throw new UserError("Tell them what to change so they can revise it.");
  const latest = (await db.select().from(submissions).where(eq(submissions.taskId, taskId)).orderBy(desc(submissions.version)).limit(1))[0];
  const now = new Date();
  await db.insert(reviews).values({ taskId, submissionId: latest?.id ?? null, reviewerId: actor.id, decision, feedback: feedback.trim() });
  await db.update(tasks).set({ status: decision, completedAt: decision === "approved" ? now : null, updatedAt: now }).where(eq(tasks.id, taskId));
  await logTaskEvent(taskId, actor.id, "reviewed", { decision, version: latest?.version });
  await notify(await assigneesOf(taskId), decision === "approved"
    ? { type: "submission_approved", title: `Approved: ${t.title}`, body: feedback.trim() || "Nice work!", href: `/tasks/${taskId}` }
    : { type: "revision_requested", title: `Revision requested: ${t.title}`, body: feedback.trim(), href: `/tasks/${taskId}` });
  await audit(actor.id, `review.${decision}`, "task", taskId, { version: latest?.version });
}

export async function requestExtension(actor: CurrentUser, taskId: string, requestedDueAt: Date, reason: string, note: string) {
  const access = await taskAccess(actor, taskId);
  if (!access?.isAssignee) throw new AuthError("Only assignees can request an extension.");
  const t = (await db.select().from(tasks).where(eq(tasks.id, taskId)).limit(1))[0];
  if (CLOSED.includes(t.status)) throw new UserError("This task is already closed.");
  if (!reason.trim()) throw new UserError("Add a brief explanation.");
  if (requestedDueAt.getTime() <= Date.now()) throw new UserError("Pick a new deadline in the future.");
  if (t.dueAt && requestedDueAt <= t.dueAt) throw new UserError("The new deadline should be after the current one.");
  const pending = (await db.select({ id: extensionRequests.id }).from(extensionRequests).where(and(eq(extensionRequests.taskId, taskId), eq(extensionRequests.status, "pending"))).limit(1))[0];
  if (pending) throw new UserError("There's already a pending extension request for this task.");
  await db.insert(extensionRequests).values({ taskId, requestedById: actor.id, currentDueAt: t.dueAt, requestedDueAt, reason: reason.trim().slice(0, 500), note: note.trim().slice(0, 1000) });
  await logTaskEvent(taskId, actor.id, "extension", { action: "requested", to: requestedDueAt });
  await notify(await adminIds(), {
    type: "extension_requested", title: `${actor.name} requested an extension`, body: `${t.title} → ${fmtDateTime(requestedDueAt, t.timezone)}`, href: `/review?tab=extensions`, excludeUserId: actor.id,
  });
}

export async function decideExtension(actor: CurrentUser, requestId: string, approve: boolean, decisionNote: string, overrideDue?: Date | null) {
  if (actor.role !== "admin") throw new AuthError();
  const r = (await db.select().from(extensionRequests).where(eq(extensionRequests.id, requestId)).limit(1))[0];
  if (!r || r.status !== "pending") throw new UserError("That request was already handled.");
  const t = (await db.select().from(tasks).where(eq(tasks.id, r.taskId)).limit(1))[0];
  const newDue = overrideDue ?? r.requestedDueAt;
  await db.update(extensionRequests).set({ status: approve ? "approved" : "declined", decidedById: actor.id, decidedAt: new Date(), decisionNote: decisionNote.trim() }).where(eq(extensionRequests.id, requestId));
  if (approve) {
    await db.update(tasks).set({ dueAt: newDue, originalDueAt: t.originalDueAt ?? t.dueAt, updatedAt: new Date() }).where(eq(tasks.id, r.taskId));
  }
  await logTaskEvent(r.taskId, actor.id, "extension", { action: approve ? "approved" : "declined", to: approve ? newDue : undefined });
  await notify(r.requestedById ? [r.requestedById] : [], {
    type: "extension_decided", title: approve ? `Extension approved: ${t.title}` : `Extension declined: ${t.title}`,
    body: approve ? `New deadline: ${fmtDateTime(newDue, t.timezone)}${decisionNote ? ` — ${decisionNote}` : ""}` : decisionNote || "Keep the original deadline.", href: `/tasks/${r.taskId}`,
  });
  await audit(actor.id, approve ? "extension.approve" : "extension.decline", "task", r.taskId, { requestId });
}
