import { z } from "zod";
import { apiRoute, ApiError, jsonBody } from "@/server/api-auth";
import { bool, parseWhen, resolveCategory, resolveDepartment, resolvePeople, resolveProject, text } from "@/server/api-helpers";
import { createTasks, type TaskInput } from "@/server/tasks";
import { saveDraft } from "@/server/drafts";
import { loadTasks, type TaskFilters } from "@/server/queries";
import { DEFAULT_TZ } from "@/lib/dates";
import { db } from "@/db";
import { conversationMembers, conversations } from "@/db/schema";
import { eq } from "drizzle-orm";
import { addSystemMessage } from "@/server/chat";
import { randomUUID } from "node:crypto";

export const GET = apiRoute(async (req, actor) => {
  const sp = new URL(req.url).searchParams;
  const view = (["active", "overdue", "review", "completed", "everything"].includes(sp.get("view") ?? "") ? sp.get("view") : "active") as TaskFilters["view"];
  const member = sp.get("member") ? (await resolvePeople([sp.get("member")!]))[0] : undefined;
  const tasks = await loadTasks(actor, { scope: "all", view, memberId: member, q: sp.get("q") ?? undefined, limit: 200 });
  return { tasks: tasks.map((t) => ({ id: t.id, title: t.title, status: t.status, priority: t.priority, dueAt: t.dueAt, department: t.departmentName, project: t.projectName, assignees: t.assignees.map((a) => a.name) })) };
});

const TYPES = ["file", "text", "link", "checklist"] as const;

export const POST = apiRoute(async (req, actor) => {
  const b = await jsonBody(req);
  const title = text(b.title, 160);
  if (title.length < 3) throw new ApiError(400, "“title” is required (3–160 characters).");
  const tz = typeof b.timezone === "string" ? b.timezone : DEFAULT_TZ;
  let assignees = await resolvePeople(b.assignees);
  const workGroupId = b.workGroup ? String(b.workGroup) : null;
  let separate = bool(b.separate, true);
  if (workGroupId) {
    const g = (await db.select().from(conversations).where(eq(conversations.id, workGroupId)).limit(1))[0]
      ?? (await db.select().from(conversations).where(eq(conversations.kind, "workgroup"))).find((c) => (c.title ?? "").toLowerCase() === workGroupId.toLowerCase());
    if (!g || g.kind !== "workgroup") throw new ApiError(400, `No work group matches “${workGroupId}”.`);
    const members = (await db.select({ id: conversationMembers.userId }).from(conversationMembers).where(eq(conversationMembers.conversationId, g.id))).map((m) => m.id);
    assignees = [...new Set([...assignees, ...members])];
    separate = false;
    b.workGroup = g.id;
  }
  if (!assignees.length) throw new ApiError(400, "“assignees” needs at least one person (id or name), or pass “workGroup”.");
  const types = z.array(z.enum(TYPES)).parse(b.submissionTypes ?? ["text"]);
  const checklist = z.array(z.string().min(1).max(200)).max(30).parse(b.checklist ?? []).map((label) => ({ id: randomUUID().slice(0, 8), label }));
  if (types.includes("checklist") && !checklist.length) throw new ApiError(400, "A checklist submission needs “checklist” items.");
  const links = z.array(z.object({ label: z.string().max(120).optional(), url: z.string().url().refine((u) => /^https?:/.test(u)) })).max(20).parse(b.links ?? [])
    .map((l) => ({ label: l.label || new URL(l.url).hostname, url: l.url }));
  const requiresReview = bool(b.requiresReview, true);
  const input: TaskInput = {
    title, instructions: text(b.instructions, 10000), departmentId: await resolveDepartment(b.department), categoryId: await resolveCategory(b.category),
    projectId: await resolveProject(b.project), priority: z.enum(["low", "medium", "high", "urgent"]).parse(b.priority ?? "medium"),
    dueAt: parseWhen(b.dueAt, tz, "dueAt"), timezone: tz, deliverables: text(b.deliverables, 4000), completionCriteria: text(b.completionCriteria, 4000),
    submissionTypes: types, checklist, links, requiresReview, reviewerId: requiresReview && b.reviewer ? (await resolvePeople([b.reviewer]))[0] : null,
    internalNotes: text(b.internalNotes, 4000), workGroupId: (b.workGroup as string) ?? null,
  };
  // Drafts are saved privately: no one is assigned or notified until an admin publishes them.
  if (bool(b.draft, false)) {
    const draftId = await saveDraft(actor, input, assignees, separate, text(b.batch, 80));
    return { ok: true, draft: true, draftId, url: "/tasks/drafts" };
  }
  const ids = await createTasks(actor, input, assignees, { separate });
  if (input.workGroupId) await addSystemMessage(input.workGroupId, `New task for this group: “${title}”`);
  return { ok: true, taskIds: ids, urls: ids.map((id) => `/tasks/${id}`) };
});
