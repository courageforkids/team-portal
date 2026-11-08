import "server-only";
import { asc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { taskDrafts } from "@/db/schema";
import { createTasks, type TaskInput } from "./tasks";
import { addSystemMessage } from "./chat";
import { audit } from "./audit";
import type { CurrentUser } from "./auth";

export type TaskDraft = typeof taskDrafts.$inferSelect;

export async function saveDraft(actor: CurrentUser, input: TaskInput, assigneeIds: string[], separate: boolean, batch: string) {
  const [d] = await db.insert(taskDrafts).values({
    batch: batch.trim().slice(0, 80), input: { ...input, dueAt: input.dueAt ? input.dueAt.toISOString() : null }, assigneeIds, separate, createdById: actor.id,
  }).returning({ id: taskDrafts.id });
  await audit(actor.id, "task_draft.create", "task_draft", d.id, { title: input.title });
  return d.id;
}

export const listDrafts = () => db.select().from(taskDrafts).orderBy(asc(taskDrafts.batch), asc(taskDrafts.createdAt));

/** Creates the real tasks (which notifies assignees) and removes the drafts. */
export async function publishDrafts(actor: CurrentUser, ids: string[]) {
  if (!ids.length) return { published: 0, taskIds: [] as string[] };
  const drafts = await db.select().from(taskDrafts).where(inArray(taskDrafts.id, ids));
  const taskIds: string[] = [];
  for (const d of drafts) {
    const raw = d.input as TaskInput & { dueAt: string | null };
    const input: TaskInput = { ...raw, dueAt: raw.dueAt ? new Date(raw.dueAt) : null };
    taskIds.push(...await createTasks(actor, input, d.assigneeIds, { separate: d.separate }));
    if (input.workGroupId) await addSystemMessage(input.workGroupId, `New task for this group: “${input.title}”`);
    await db.delete(taskDrafts).where(eq(taskDrafts.id, d.id));
    await audit(actor.id, "task_draft.publish", "task_draft", d.id, { title: input.title });
  }
  return { published: drafts.length, taskIds };
}
