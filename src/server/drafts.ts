import "server-only";
import { asc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { taskDrafts } from "@/db/schema";
import { createTasks, type TaskInput } from "./tasks";
import { addSystemMessage } from "./chat";
import { audit } from "./audit";
import { actionAdmin, type CurrentUser } from "./auth";
import type { ActionResult } from "@/lib/action";

/**
 * Drafts: anything an admin saves privately. Nobody sees it or gets notified until it's published.
 * Publishing runs the normal create path (API creator or the portal form's own action), so every rule
 * and notification behaves exactly as if it had been created directly.
 */
export type Draft = typeof taskDrafts.$inferSelect;
export const DRAFT_KINDS = ["task", "announcement", "poll", "event", "meeting", "resource"] as const;
export type DraftKind = (typeof DRAFT_KINDS)[number];
export const KIND_LABEL: Record<string, string> = { task: "Task", announcement: "Announcement", poll: "Poll", event: "Event", meeting: "Meeting", resource: "Resource" };

const batchOf = (v: unknown) => (typeof v === "string" ? v.trim().slice(0, 80) : "");

export async function saveDraft(actor: CurrentUser, input: TaskInput, assigneeIds: string[], separate: boolean, batch: string) {
  const [d] = await db.insert(taskDrafts).values({
    kind: "task", format: "task-input", title: input.title, batch: batchOf(batch),
    input: { ...input, dueAt: input.dueAt ? input.dueAt.toISOString() : null }, assigneeIds, separate, createdById: actor.id,
  }).returning({ id: taskDrafts.id });
  await audit(actor.id, "draft.create", "draft", d.id, { kind: "task", title: input.title });
  return d.id;
}

/** API: { ...normal body, draft: true, batch? }. */
export async function saveApiDraft(actor: CurrentUser, kind: DraftKind, body: Record<string, unknown>) {
  const { draft: _d, batch, ...rest } = body;
  void _d;
  const title = String(rest.title ?? rest.question ?? "Untitled").slice(0, 200);
  const [d] = await db.insert(taskDrafts).values({ kind, format: "api", title, batch: batchOf(batch), input: rest, createdById: actor.id }).returning({ id: taskDrafts.id });
  await audit(actor.id, "draft.create", "draft", d.id, { kind, title, via: "api" });
  return { ok: true, draft: true, draftId: d.id, url: "/drafts" };
}

/** Portal forms: called from a create action when its "Save as draft" button was used. Files aren't kept. */
export async function saveFormDraft(kind: DraftKind, fd: FormData, title: string): Promise<ActionResult> {
  const me = await actionAdmin();
  const entries: [string, string][] = [];
  let droppedFiles = false;
  for (const [k, v] of fd.entries()) {
    if (k === "intent" || k.startsWith("$ACTION")) continue;
    if (typeof v === "string") entries.push([k, v]); else if (v.size > 0) droppedFiles = true;
  }
  const [d] = await db.insert(taskDrafts).values({ kind, format: "form", title: title.trim().slice(0, 200) || "Untitled", input: { entries }, createdById: me.id }).returning({ id: taskDrafts.id });
  await audit(me.id, "draft.create", "draft", d.id, { kind, title });
  return { ok: true, message: droppedFiles ? "Saved as a draft. Attachments aren't saved in drafts, so add them after publishing." : "Saved as a draft. Nobody has been notified.", redirectTo: "/drafts" };
}

export const isDraftIntent = (fd: FormData) => fd.get("intent") === "draft";

export const listDrafts = () => db.select().from(taskDrafts).orderBy(asc(taskDrafts.batch), asc(taskDrafts.createdAt));

async function publishOne(actor: CurrentUser, d: Draft): Promise<void> {
  if (d.format === "task-input") {
    const raw = d.input as TaskInput & { dueAt: string | null };
    const input: TaskInput = { ...raw, dueAt: raw.dueAt ? new Date(raw.dueAt) : null };
    await createTasks(actor, input, d.assigneeIds, { separate: d.separate });
    if (input.workGroupId) await addSystemMessage(input.workGroupId, `New task for this group: “${input.title}”`);
    return;
  }
  if (d.format === "api") {
    const c = await import("./v1-creators");
    const b = d.input as Record<string, unknown>;
    const fn = { announcement: c.createAnnouncementFromApi, poll: c.createPollFromApi, event: c.createEventFromApi, meeting: c.createMeetingFromApi, resource: c.createResourceFromApi }[d.kind as Exclude<DraftKind, "task">];
    if (!fn) throw new Error(`Can't publish a ${d.kind} draft.`);
    await fn(b, actor);
    return;
  }
  // Portal form: rebuild the fields and run that form's own action.
  const fd = new FormData();
  for (const [k, v] of (d.input as { entries: [string, string][] }).entries) fd.append(k, v);
  const action = await formAction(d.kind as DraftKind);
  const r = await action(null, fd);
  if (!r.ok) throw new Error(r.error);
}

async function formAction(kind: DraftKind): Promise<(prev: null, fd: FormData) => Promise<ActionResult<unknown>>> {
  switch (kind) {
    case "task": return (await import("./task-actions")).createTaskAction;
    case "announcement": return (await import("@/app/(app)/announcements/actions")).saveAnnouncementAction;
    case "poll": return (await import("./community-actions")).createPollAction;
    case "event": return (await import("./calendar")).saveEventAction;
    case "meeting": return (await import("./meeting-actions")).createMeetingAction;
    case "resource": return (await import("@/app/(app)/resources/actions")).createResource;
  }
}

/** Publishes in order; stops at the first one that fails so nothing is half-done silently. */
export async function publishDrafts(actor: CurrentUser, ids: string[]) {
  const drafts = ids.length ? await db.select().from(taskDrafts).where(inArray(taskDrafts.id, ids)).orderBy(asc(taskDrafts.createdAt)) : [];
  let published = 0;
  for (const d of drafts) {
    try { await publishOne(actor, d); } catch (e) {
      return { published, failed: { id: d.id, title: d.title, error: (e as Error).message || "Something went wrong." } };
    }
    await db.delete(taskDrafts).where(eq(taskDrafts.id, d.id));
    await audit(actor.id, "draft.publish", "draft", d.id, { kind: d.kind, title: d.title });
    published++;
  }
  return { published, failed: null as null | { id: string; title: string; error: string } };
}

/* ───── Editing ───── */

const TZ = "America/New_York";
const TEXT_KEYS = ["instructions", "body", "description", "agenda"];
const DEFAULT_TEXT: Record<string, string> = { task: "instructions", announcement: "body", poll: "description", event: "description", meeting: "agenda", resource: "description" };
const WHEN_KEY: Record<string, string> = { task: "dueAt", event: "startsAt", meeting: "startsAt", announcement: "publishAt", poll: "closesAt" };

export type DraftView = {
  id: string; kind: string; batch: string; title: string; titleKey: string;
  text: string; textKey: string; when: string; whenKey: string | null;
  assignees: string[] | null; checklist: string | null; options: string | null;
};

type Entries = [string, string][];
const entriesOf = (d: Draft) => (d.input as { entries: Entries }).entries;
const getE = (e: Entries, k: string) => e.filter(([n]) => n === k).map(([, v]) => v);
const setE = (e: Entries, k: string, vals: string[]): Entries => [...e.filter(([n]) => n !== k), ...vals.map((v) => [k, v] as [string, string])];

/** The editable parts of a draft, in one shape for every kind and format. */
export async function draftView(d: Draft): Promise<DraftView> {
  const { toLocalInput } = await import("@/lib/dates");
  const titleKey = d.kind === "poll" ? "question" : "title";
  const whenKey = WHEN_KEY[d.kind] ?? null;
  if (d.format === "form") {
    const e = entriesOf(d);
    const textKey = TEXT_KEYS.find((k) => getE(e, k).length) ?? DEFAULT_TEXT[d.kind] ?? "description";
    return {
      id: d.id, kind: d.kind, batch: d.batch, title: getE(e, titleKey)[0] ?? d.title, titleKey, text: getE(e, textKey)[0] ?? "", textKey,
      when: whenKey ? getE(e, whenKey)[0] ?? "" : "", whenKey: whenKey && (getE(e, whenKey).length || d.kind !== "announcement") ? whenKey : null,
      assignees: d.kind === "task" ? getE(e, "assignees") : null, checklist: d.kind === "task" ? getE(e, "checklist")[0] ?? "" : null,
      options: d.kind === "poll" ? getE(e, "option").join("\n") : null,
    };
  }
  const b = d.input as Record<string, unknown>;
  const textKey = TEXT_KEYS.find((k) => typeof b[k] === "string" && b[k]) ?? DEFAULT_TEXT[d.kind] ?? "description";
  const rawWhen = whenKey ? (b[whenKey] as string | null | undefined) ?? "" : "";
  return {
    id: d.id, kind: d.kind, batch: d.batch, title: String(b[titleKey] ?? d.title), titleKey, text: String(b[textKey] ?? ""), textKey,
    when: d.format === "task-input" ? (rawWhen ? toLocalInput(rawWhen, TZ) : "") : rawWhen, whenKey,
    assignees: d.format === "task-input" ? d.assigneeIds : null,
    checklist: d.format === "task-input" ? ((b.checklist as { label: string }[] | undefined) ?? []).map((c) => c.label).join("\n") : null,
    options: d.kind === "poll" ? ((b.options as string[] | undefined) ?? []).join("\n") : null,
  };
}

export async function updateDraft(d: Draft, v: { title: string; text: string; when: string; batch: string; assignees: string[] | null; checklist: string | null; options: string | null }) {
  const { parseLocalInput } = await import("@/lib/dates");
  const cur = await draftView(d);
  const lines = (s: string | null) => (s ?? "").split("\n").map((x) => x.trim()).filter(Boolean);
  let input = d.input as Record<string, unknown>;
  let assigneeIds = d.assigneeIds;
  if (d.format === "form") {
    let e = entriesOf(d);
    e = setE(e, cur.titleKey, [v.title]);
    e = setE(e, cur.textKey, [v.text]);
    if (cur.whenKey && v.when) e = setE(e, cur.whenKey, [v.when]);
    if (d.kind === "task" && v.assignees) e = setE(e, "assignees", v.assignees);
    if (d.kind === "task" && v.checklist !== null) e = setE(e, "checklist", [v.checklist]);
    if (d.kind === "poll" && v.options !== null) e = setE(e, "option", lines(v.options));
    input = { entries: e };
  } else {
    input = { ...input, [cur.titleKey]: v.title, [cur.textKey]: v.text };
    if (cur.whenKey) input[cur.whenKey] = v.when ? (d.format === "task-input" ? parseLocalInput(v.when, TZ)?.toISOString() ?? null : v.when) : (d.format === "task-input" ? null : input[cur.whenKey]);
    if (d.format === "task-input") {
      if (v.assignees) assigneeIds = v.assignees;
      if (v.checklist !== null) {
        const old = (input.checklist as { id: string; label: string }[] | undefined) ?? [];
        input.checklist = lines(v.checklist).slice(0, 30).map((label) => old.find((c) => c.label === label) ?? { id: crypto.randomUUID().slice(0, 8), label: label.slice(0, 200) });
      }
    }
    if (d.kind === "poll" && v.options !== null) input.options = lines(v.options);
  }
  await db.update(taskDrafts).set({ title: v.title.slice(0, 200), batch: batchOf(v.batch), input, assigneeIds }).where(eq(taskDrafts.id, d.id));
}
