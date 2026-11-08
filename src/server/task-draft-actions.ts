"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { taskDrafts } from "@/db/schema";
import { actionAdmin } from "./auth";
import { publishDrafts, updateDraft } from "./drafts";
import { audit } from "./audit";
import { safe, UserError } from "./safe-action";
import type { ActionResult } from "@/lib/action";

export async function publishDraftsAction(ids: string[]): Promise<ActionResult> {
  return safe(async () => {
    const me = await actionAdmin();
    const list = z.array(z.string().uuid()).min(1).max(200).parse(ids);
    const r = await publishDrafts(me, list);
    revalidatePath("/drafts");
    if (r.failed) throw new UserError(`${r.published ? `Published ${r.published}, then stopped. ` : ""}“${r.failed.title}” couldn't be published: ${r.failed.error}`);
    if (!r.published) throw new UserError("Those drafts were already published or deleted.");
    return { ok: true, message: `Published ${r.published} draft${r.published === 1 ? "" : "s"}. Everyone involved has been notified.` };
  });
}

export async function deleteDraftAction(id: string): Promise<ActionResult> {
  return safe(async () => {
    const me = await actionAdmin();
    const [d] = await db.delete(taskDrafts).where(eq(taskDrafts.id, z.string().uuid().parse(id))).returning({ id: taskDrafts.id });
    if (!d) throw new UserError("That draft no longer exists.");
    await audit(me.id, "task_draft.delete", "task_draft", id);
    revalidatePath("/drafts");
    return { ok: true, message: "Draft deleted." };
  });
}

export async function updateDraftAction(_: unknown, fd: FormData): Promise<ActionResult> {
  return safe(async () => {
    const me = await actionAdmin();
    const id = z.string().uuid().parse(String(fd.get("id") ?? ""));
    const [d] = await db.select().from(taskDrafts).where(eq(taskDrafts.id, id));
    if (!d) throw new UserError("That draft no longer exists.");
    const title = String(fd.get("title") ?? "").trim();
    if (title.length < 2) throw new UserError("Give it a title.");
    const assignees = d.kind === "task" ? fd.getAll("assignees").map(String).filter(Boolean) : null;
    if (assignees && !assignees.length) throw new UserError("Pick at least one person.");
    const opt = (k: string) => (fd.has(k) ? String(fd.get(k) ?? "") : null);
    const options = d.kind === "poll" ? opt("options") : null;
    if (options !== null && options.split("\n").filter((x) => x.trim()).length < 2) throw new UserError("A poll needs at least 2 options.");
    await updateDraft(d, { title: title.slice(0, 200), text: String(fd.get("text") ?? "").slice(0, 20000), when: String(fd.get("when") ?? ""), batch: String(fd.get("batch") ?? ""), assignees, checklist: d.kind === "task" ? opt("checklist") : null, options });
    await audit(me.id, "draft.update", "draft", id);
    revalidatePath("/drafts");
    return { ok: true, message: "Draft updated." };
  });
}
