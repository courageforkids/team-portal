import { desc } from "drizzle-orm";
import { db } from "@/db";
import { announcements } from "@/db/schema";
import { apiRoute, jsonBody } from "@/server/api-auth";
import { saveApiDraft } from "@/server/drafts";
import { createAnnouncementFromApi } from "@/server/v1-creators";
import { bool } from "@/server/api-helpers";

export const GET = apiRoute(async () => ({
  announcements: await db.select({ id: announcements.id, title: announcements.title, category: announcements.category, pinned: announcements.pinned, publishAt: announcements.publishAt })
    .from(announcements).orderBy(desc(announcements.publishAt)).limit(30),
}));

export const POST = apiRoute(async (req, actor) => {
  const b = await jsonBody(req);
  if (bool(b.draft, false)) return saveApiDraft(actor, "announcement", b);
  return createAnnouncementFromApi(b, actor);
});
