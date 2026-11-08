"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { taskDrafts } from "@/db/schema";
import { actionAdmin } from "./auth";
import { publishDrafts } from "./task-drafts";
import { audit } from "./audit";
import { safe, UserError } from "./safe-action";
import type { ActionResult } from "@/lib/action";

export async function publishDraftsAction(ids: string[]): Promise<ActionResult> {
  return safe(async () => {
    const me = await actionAdmin();
    const list = z.array(z.string().uuid()).min(1).max(200).parse(ids);
    const r = await publishDrafts(me, list);
    if (!r.published) throw new UserError("Those drafts were already published or deleted.");
    revalidatePath("/tasks/drafts");
    return { ok: true, message: `Published ${r.published} draft${r.published === 1 ? "" : "s"}. Assignees have been notified.` };
  });
}

export async function deleteDraftAction(id: string): Promise<ActionResult> {
  return safe(async () => {
    const me = await actionAdmin();
    const [d] = await db.delete(taskDrafts).where(eq(taskDrafts.id, z.string().uuid().parse(id))).returning({ id: taskDrafts.id });
    if (!d) throw new UserError("That draft no longer exists.");
    await audit(me.id, "task_draft.delete", "task_draft", id);
    revalidatePath("/tasks/drafts");
    return { ok: true, message: "Draft deleted." };
  });
}
