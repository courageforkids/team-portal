"use server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { extensionRequests, taskComments, taskSeries, tasks, type ChecklistItem, type LinkItem, type SubmissionType, type ChecklistState } from "@/db/schema";
import { actionAdmin, actionUser, AuthError } from "./auth";
import { all, bool, filesOf, optStr, safe, str, UserError } from "./safe-action";
import {
  createTasks, decideExtension, logTaskEvent, requestExtension, reviewSubmission, setStatus, startReview, submitWork, updateTask, type TaskInput,
} from "./tasks";
import { taskAccess } from "./policy";
import { adminIds, notify } from "./notify";
import { audit } from "./audit";
import { saveUploads, deleteStored } from "./storage";
import { files } from "@/db/schema";
import { parseLocalInput, DEFAULT_TZ } from "@/lib/dates";
import { TASK_STATUSES, type TaskStatus } from "@/lib/task-meta";
import type { ActionResult } from "@/lib/action";
import { randomUUID } from "node:crypto";

const uuid = z.string().uuid();
const optUuid = (v: string | null) => (v && uuid.safeParse(v).success ? v : null);

function parseLinks(raw: string): LinkItem[] {
  return raw.split("\n").map((l) => l.trim()).filter(Boolean).slice(0, 20).map((line) => {
    const m = line.match(/^(.*?)\s*[|–-]\s*(https?:\/\/\S+)$/) ?? line.match(/^()(https?:\/\/\S+)$/);
    if (!m) throw new UserError(`"${line.slice(0, 60)}" isn't a valid link. Use a full address starting with https://`);
    const url = new URL(m[2]);
    if (!["http:", "https:"].includes(url.protocol)) throw new UserError("Links must start with http:// or https://");
    return { label: (m[1] || url.hostname).slice(0, 120), url: url.toString() };
  });
}

function readTaskForm(fd: FormData): { input: TaskInput; assignees: string[] } {
  const title = str(fd, "title");
  if (title.length < 3) throw new UserError("Give the task a title (at least 3 characters).");
  if (title.length > 160) throw new UserError("Keep the title under 160 characters.");
  const tz = str(fd, "timezone") || DEFAULT_TZ;
  const dueRaw = str(fd, "dueAt");
  const dueAt = dueRaw ? parseLocalInput(dueRaw, tz) : null;
  if (dueRaw && !dueAt) throw new UserError("That due date isn't valid.");
  const types = all(fd, "submissionTypes").filter((t): t is SubmissionType => ["file", "text", "link", "checklist"].includes(t));
  const checklist: ChecklistItem[] = str(fd, "checklist").split("\n").map((s) => s.trim()).filter(Boolean).slice(0, 30)
    .map((label) => ({ id: randomUUID().slice(0, 8), label: label.slice(0, 200) }));
  if (types.includes("checklist") && !checklist.length) throw new UserError("Add at least one checklist item, or turn off the checklist requirement.");
  const priority = str(fd, "priority");
  const requiresReview = bool(fd, "requiresReview");
  return {
    input: {
      title, instructions: str(fd, "instructions").slice(0, 10000), departmentId: optUuid(optStr(fd, "departmentId")), categoryId: optUuid(optStr(fd, "categoryId")),
      projectId: optUuid(optStr(fd, "projectId")), priority: (["low", "medium", "high", "urgent"].includes(priority) ? priority : "medium") as TaskInput["priority"],
      dueAt, timezone: tz, deliverables: str(fd, "deliverables").slice(0, 4000), completionCriteria: str(fd, "completionCriteria").slice(0, 4000),
      submissionTypes: types, checklist, links: parseLinks(str(fd, "links")), requiresReview, reviewerId: requiresReview ? optUuid(optStr(fd, "reviewerId")) : null,
      internalNotes: str(fd, "internalNotes").slice(0, 4000),
      workGroupId: optUuid(optStr(fd, "workGroupId")),
    },
    assignees: all(fd, "assignees").filter((x) => uuid.safeParse(x).success),
  };
}

export async function createTaskAction(_: unknown, fd: FormData): Promise<ActionResult> {
  return safe(async () => {
    const me = await actionAdmin();
    const { input, assignees } = readTaskForm(fd);
    if (!assignees.length) throw new UserError("Assign the task to at least one person.");
    const repeat = str(fd, "repeat");
    if (repeat && repeat !== "none") {
      if (!input.dueAt) throw new UserError("Recurring tasks need a first due date.");
      const intervalDays = repeat === "custom" ? Math.max(1, Math.min(365, Number(str(fd, "intervalDays")) || 0)) : null;
      if (repeat === "custom" && !intervalDays) throw new UserError("Enter how many days between each repeat.");
      const endsOn = str(fd, "endsOn") || null;
      const { nextOccurrence } = await import("./maintenance");
      const leadDays = Math.max(0, Math.min(30, Number(str(fd, "leadDays")) || 7));
      const rule = repeat as "weekly" | "biweekly" | "monthly" | "custom";
      // The first occurrence is created right away; the schedule then starts from the following one.
      const [series] = await db.insert(taskSeries).values({
        recurrence: rule, intervalDays, nextDueAt: nextOccurrence(input.dueAt, rule, intervalDays), leadDays, endsOn, assigneeIds: assignees, createdById: me.id,
        template: { ...input },
      }).returning();
      await createTasks(me, input, assignees, { separate: true, seriesId: series.id });
      await audit(me.id, "series.create", "task_series", series.id, { title: input.title, repeat });
      return { ok: true, message: `Recurring task created and assigned to ${assignees.length} ${assignees.length === 1 ? "person" : "people"}.`, redirectTo: "/tasks/all" };
    }
    let separate = bool(fd, "separate");
    if (input.workGroupId) {
      // A work-group task is one shared task for everyone in the group, announced in the group's chat.
      const { conversationMembers, conversations } = await import("@/db/schema");
      const g = (await db.select().from(conversations).where(eq(conversations.id, input.workGroupId)).limit(1))[0];
      if (!g || g.kind !== "workgroup") throw new UserError("That work group no longer exists.");
      const groupIds = (await db.select({ id: conversationMembers.userId }).from(conversationMembers).where(eq(conversationMembers.conversationId, g.id))).map((r) => r.id).filter((x) => x !== me.id || assignees.includes(me.id));
      assignees.splice(0, assignees.length, ...new Set([...assignees, ...groupIds]));
      separate = false;
    }
    const ids = await createTasks(me, input, assignees, { separate });
    if (input.workGroupId) {
      const { addSystemMessage } = await import("./chat");
      await addSystemMessage(input.workGroupId, `New task for this group: “${input.title}”`);
    }
    const uploads = filesOf(fd, "attachments");
    if (uploads.length) for (const id of ids) await saveUploads(uploads, { type: "task", id }, me.id);
    return { ok: true, message: ids.length > 1 ? `Created ${ids.length} tasks — one for each person.` : "Task created and assigned.", redirectTo: ids.length === 1 ? `/tasks/${ids[0]}` : "/tasks/all" };
  });
}

export async function updateTaskAction(_: unknown, fd: FormData): Promise<ActionResult> {
  return safe(async () => {
    const me = await actionAdmin();
    const id = uuid.parse(str(fd, "id"));
    const { input, assignees } = readTaskForm(fd);
    if (!assignees.length) throw new UserError("A task needs at least one assignee.");
    await updateTask(me, id, input, assignees);
    const uploads = filesOf(fd, "attachments");
    if (uploads.length) await saveUploads(uploads, { type: "task", id }, me.id);
    return { ok: true, message: "Task updated.", redirectTo: `/tasks/${id}` };
  });
}

export async function deleteTaskAction(taskId: string): Promise<ActionResult> {
  return safe(async () => {
    const me = await actionAdmin();
    const t = (await db.select({ title: tasks.title }).from(tasks).where(eq(tasks.id, uuid.parse(taskId))).limit(1))[0];
    if (!t) throw new UserError("That task was already deleted.");
    await db.delete(tasks).where(eq(tasks.id, taskId));
    await audit(me.id, "task.delete", "task", taskId, { title: t.title });
    return { ok: true, message: "Task deleted.", redirectTo: "/tasks/all" };
  });
}

export async function setStatusAction(_: unknown, fd: FormData): Promise<ActionResult> {
  return safe(async () => {
    const me = await actionUser();
    const status = str(fd, "status") as TaskStatus;
    if (!TASK_STATUSES.includes(status)) throw new UserError("Unknown status.");
    await setStatus(me, uuid.parse(str(fd, "taskId")), status, str(fd, "reason"));
    return { ok: true, message: status === "in_progress" ? "Marked as in progress." : status === "blocked" ? "Flagged as blocked — an administrator has been notified." : "Status updated." };
  });
}

export async function submitAction(_: unknown, fd: FormData): Promise<ActionResult> {
  return safe(async () => {
    const me = await actionUser();
    const taskId = uuid.parse(str(fd, "taskId"));
    const t = (await db.select({ checklist: tasks.checklist }).from(tasks).where(eq(tasks.id, taskId)).limit(1))[0];
    if (!t) throw new UserError("That task no longer exists.");
    const done = new Set(all(fd, "checklist"));
    const checklist: ChecklistState[] = t.checklist.map((c) => ({ ...c, done: done.has(c.id) }));
    const r = await submitWork(me, taskId, {
      text: str(fd, "text").slice(0, 20000), note: str(fd, "note").slice(0, 2000), links: parseLinks(str(fd, "links")), checklist, files: filesOf(fd, "files"),
    });
    return { ok: true, message: r.status === "approved" ? "Submitted and marked complete. Nice work!" : "Submitted for review. You'll get a notification when it's reviewed." };
  });
}

export async function startReviewAction(taskId: string): Promise<ActionResult> {
  return safe(async () => { await startReview(await actionUser(), uuid.parse(taskId)); return { ok: true }; });
}

export async function reviewAction(_: unknown, fd: FormData): Promise<ActionResult> {
  return safe(async () => {
    const me = await actionUser();
    const decision = str(fd, "decision");
    if (decision !== "approved" && decision !== "revision_requested") throw new UserError("Choose approve or request revision.");
    await reviewSubmission(me, uuid.parse(str(fd, "taskId")), decision, str(fd, "feedback").slice(0, 5000));
    return { ok: true, message: decision === "approved" ? "Approved — they've been notified." : "Revision requested — they've been notified." };
  });
}

export async function requestExtensionAction(_: unknown, fd: FormData): Promise<ActionResult> {
  return safe(async () => {
    const me = await actionUser();
    const taskId = uuid.parse(str(fd, "taskId"));
    const t = (await db.select({ timezone: tasks.timezone }).from(tasks).where(eq(tasks.id, taskId)).limit(1))[0];
    const when = parseLocalInput(str(fd, "requestedDueAt"), t?.timezone ?? DEFAULT_TZ);
    if (!when) throw new UserError("Pick the new deadline you're asking for.");
    await requestExtension(me, taskId, when, str(fd, "reason"), str(fd, "note"));
    return { ok: true, message: "Extension requested. You'll be notified when it's decided." };
  });
}

export async function withdrawExtensionAction(requestId: string): Promise<ActionResult> {
  return safe(async () => {
    const me = await actionUser();
    const r = (await db.select().from(extensionRequests).where(eq(extensionRequests.id, uuid.parse(requestId))).limit(1))[0];
    if (!r || r.requestedById !== me.id || r.status !== "pending") throw new AuthError();
    await db.update(extensionRequests).set({ status: "withdrawn", decidedAt: new Date() }).where(eq(extensionRequests.id, r.id));
    await logTaskEvent(r.taskId, me.id, "extension", { action: "withdrawn" });
    return { ok: true, message: "Request withdrawn." };
  });
}

export async function decideExtensionAction(_: unknown, fd: FormData): Promise<ActionResult> {
  return safe(async () => {
    const me = await actionAdmin();
    const approve = str(fd, "decision") === "approve";
    const tz = str(fd, "timezone") || DEFAULT_TZ;
    const override = str(fd, "newDueAt") ? parseLocalInput(str(fd, "newDueAt"), tz) : null;
    await decideExtension(me, uuid.parse(str(fd, "requestId")), approve, str(fd, "decisionNote"), override);
    return { ok: true, message: approve ? "Extension approved and deadline updated." : "Extension declined." };
  });
}

export async function commentAction(_: unknown, fd: FormData): Promise<ActionResult> {
  return safe(async () => {
    const me = await actionUser();
    const taskId = uuid.parse(str(fd, "taskId"));
    const body = str(fd, "body");
    if (!body) throw new UserError("Write a comment first.");
    const access = await taskAccess(me, taskId);
    if (!access?.view) throw new AuthError();
    await db.insert(taskComments).values({ taskId, authorId: me.id, body: body.slice(0, 4000) });
    const t = (await db.select({ title: tasks.title, reviewerId: tasks.reviewerId }).from(tasks).where(eq(tasks.id, taskId)).limit(1))[0];
    const { taskAssignees } = await import("@/db/schema");
    const asg = (await db.select({ id: taskAssignees.userId }).from(taskAssignees).where(eq(taskAssignees.taskId, taskId))).map((a) => a.id);
    const recipients = access.isAssignee ? [...(t.reviewerId ? [t.reviewerId] : []), ...(await adminIds())] : asg;
    await notify(recipients, { type: "task_comment", title: `${me.name} commented on "${t.title}"`, body: body.slice(0, 140), href: `/tasks/${taskId}#comments`, excludeUserId: me.id });
    return { ok: true, message: "Comment posted." };
  });
}

export async function removeTaskFileAction(fileId: string): Promise<ActionResult> {
  return safe(async () => {
    const me = await actionAdmin();
    const f = (await db.select().from(files).where(and(eq(files.id, uuid.parse(fileId)), eq(files.ownerType, "task"))).limit(1))[0];
    if (!f) throw new UserError("File not found.");
    await db.delete(files).where(eq(files.id, f.id));
    await deleteStored(f.storageKey);
    await audit(me.id, "task.file_removed", "task", f.ownerId ?? undefined, { filename: f.filename });
    return { ok: true, message: "Attachment removed." };
  });
}
