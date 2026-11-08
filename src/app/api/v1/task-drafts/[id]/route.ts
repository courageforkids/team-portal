import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { taskDrafts } from "@/db/schema";
import { apiRoute, ApiError, jsonBody } from "@/server/api-auth";
import { draftView, updateDraft } from "@/server/drafts";
import { resolvePeople } from "@/server/api-helpers";

async function load(id: string) {
  const [d] = await db.select().from(taskDrafts).where(eq(taskDrafts.id, z.string().uuid().parse(id)));
  if (!d) throw new ApiError(404, "Draft not found.");
  return d;
}

/** { title?, text?, when? ("2026-11-13T18:00", Eastern), batch?, assignees?: names, checklist?: [..], options?: [..] }. Anything left out stays the same. */
export const PATCH = apiRoute<{ params: Promise<{ id: string }> }>(async (req, _actor, ctx) => {
  const d = await load((await ctx.params).id);
  const b = await jsonBody(req);
  const v = await draftView(d);
  await updateDraft(d, {
    title: typeof b.title === "string" ? b.title.slice(0, 200) : v.title,
    text: typeof b.text === "string" ? b.text : v.text,
    when: typeof b.when === "string" ? b.when : v.when,
    batch: typeof b.batch === "string" ? b.batch : v.batch,
    assignees: b.assignees !== undefined && v.assignees !== null ? await resolvePeople(b.assignees) : v.assignees,
    checklist: Array.isArray(b.checklist) ? (b.checklist as string[]).join("\n") : v.checklist,
    options: Array.isArray(b.options) ? (b.options as string[]).join("\n") : v.options,
  });
  return { ok: true, draft: await draftView(await load(d.id)) };
});

export const DELETE = apiRoute<{ params: Promise<{ id: string }> }>(async (_req, _actor, ctx) => {
  const d = await load((await ctx.params).id);
  await db.delete(taskDrafts).where(eq(taskDrafts.id, d.id));
  return { ok: true };
});
