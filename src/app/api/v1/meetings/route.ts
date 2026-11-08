import { desc } from "drizzle-orm";
import { db } from "@/db";
import { meetings } from "@/db/schema";
import { apiRoute, jsonBody } from "@/server/api-auth";
import { saveApiDraft } from "@/server/drafts";
import { createMeetingFromApi } from "@/server/v1-creators";
import { bool } from "@/server/api-helpers";

export const GET = apiRoute(async () => ({
  meetings: await db.select({ id: meetings.id, title: meetings.title, startsAt: meetings.startsAt, eventId: meetings.eventId, hasNotes: meetings.notes }).from(meetings).orderBy(desc(meetings.startsAt)).limit(40)
    .then((r) => r.map((m) => ({ ...m, hasNotes: !!m.hasNotes.trim() }))),
}));

/** Create a meeting page, optionally for a calendar event ({ event: id }), with an agenda. */
export const POST = apiRoute(async (req, actor) => {
  const b = await jsonBody(req);
  if (bool(b.draft, false)) return saveApiDraft(actor, "meeting", b);
  return createMeetingFromApi(b, actor);
});
