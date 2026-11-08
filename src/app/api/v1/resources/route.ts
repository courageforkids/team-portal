import { desc } from "drizzle-orm";
import { db } from "@/db";
import { resources } from "@/db/schema";
import { apiRoute, jsonBody } from "@/server/api-auth";
import { saveApiDraft } from "@/server/drafts";
import { createResourceFromApi } from "@/server/v1-creators";
import { bool } from "@/server/api-helpers";

export const GET = apiRoute(async () => ({
  resources: await db.select({ id: resources.id, title: resources.title, category: resources.category, kind: resources.kind, visibility: resources.visibility, pinned: resources.pinned })
    .from(resources).orderBy(desc(resources.updatedAt)),
}));

export const POST = apiRoute(async (req, actor) => {
  const b = await jsonBody(req);
  if (bool(b.draft, false)) return saveApiDraft(actor, "resource", b);
  return createResourceFromApi(b, actor);
});
