"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { taskDrafts } from "@/db/schema";
import { actionAdmin } from "./auth";
import { publishDrafts } from "./drafts";
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
