import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { taskDrafts } from "@/db/schema";
import { apiRoute, ApiError, jsonBody } from "@/server/api-auth";
import { publishDrafts } from "@/server/task-drafts";

/** { ids: [...] } or { batch: "Week of Nov 9" }. Notifies assignees. */
export const POST = apiRoute(async (req, actor) => {
  const b = await jsonBody(req);
  let ids: string[] = [];
  if (Array.isArray(b.ids)) ids = z.array(z.string().uuid()).parse(b.ids);
  else if (typeof b.batch === "string") ids = (await db.select({ id: taskDrafts.id }).from(taskDrafts).where(eq(taskDrafts.batch, b.batch))).map((r) => r.id);
  if (!ids.length) throw new ApiError(400, "Pass “ids” or a “batch” that has drafts.");
  return { ok: true, ...(await publishDrafts(actor, ids)) };
});
