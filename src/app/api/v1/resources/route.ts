import { z } from "zod";
import { desc } from "drizzle-orm";
import { db } from "@/db";
import { resources } from "@/db/schema";
import { apiRoute, ApiError, jsonBody } from "@/server/api-auth";
import { bool, text } from "@/server/api-helpers";
import { audit } from "@/server/audit";

export const GET = apiRoute(async () => ({
  resources: await db.select({ id: resources.id, title: resources.title, category: resources.category, kind: resources.kind, visibility: resources.visibility, pinned: resources.pinned })
    .from(resources).orderBy(desc(resources.updatedAt)),
}));

export const POST = apiRoute(async (req, actor) => {
  const b = await jsonBody(req);
  const title = text(b.title, 160);
  if (!title) throw new ApiError(400, "“title” is required.");
  const kind = z.enum(["note", "link"]).parse(b.kind ?? (b.url ? "link" : "note"));
  const url = kind === "link" ? z.string().url().refine((u) => /^https?:/.test(u), "Links must start with http(s)://").parse(b.url) : null;
  const body = kind === "note" ? text(b.body, 50000) : null;
  if (kind === "note" && !body) throw new ApiError(400, "A note needs a “body”.");
  const [r] = await db.insert(resources).values({
    title, description: text(b.description, 1000), category: text(b.category, 60) || "General", kind, url, body,
    visibility: z.enum(["everyone", "leadership", "admin"]).parse(b.visibility ?? "everyone"), pinned: bool(b.pinned, false), createdById: actor.id,
  }).returning();
  await audit(actor.id, "resource.create", "resource", r.id, { title, via: "api" });
  return { ok: true, id: r.id, url: `/resources/${r.id}` };
});
