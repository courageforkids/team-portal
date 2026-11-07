import { z } from "zod";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { events, meetings } from "@/db/schema";
import { apiRoute, ApiError, jsonBody } from "@/server/api-auth";
import { parseWhen, text } from "@/server/api-helpers";

export const GET = apiRoute(async () => ({
  meetings: await db.select({ id: meetings.id, title: meetings.title, startsAt: meetings.startsAt, eventId: meetings.eventId, hasNotes: meetings.notes }).from(meetings).orderBy(desc(meetings.startsAt)).limit(40)
    .then((r) => r.map((m) => ({ ...m, hasNotes: !!m.hasNotes.trim() }))),
}));

/** Create a meeting page, optionally for a calendar event ({ event: id }), with an agenda. */
export const POST = apiRoute(async (req, actor) => {
  const b = await jsonBody(req);
  let eventId: string | null = null, title = text(b.title, 120), startsAt = parseWhen(b.startsAt, undefined, "startsAt");
  if (b.event) {
    const ev = (await db.select().from(events).where(eq(events.id, z.string().uuid().parse(b.event))).limit(1))[0];
    if (!ev) throw new ApiError(404, "Event not found.");
    const existing = (await db.select().from(meetings).where(eq(meetings.eventId, ev.id)).limit(1))[0];
    if (existing) {
      if (typeof b.agenda === "string") await db.update(meetings).set({ agenda: text(b.agenda, 20000), updatedAt: new Date(), updatedById: actor.id }).where(eq(meetings.id, existing.id));
      return { ok: true, id: existing.id, url: `/meetings/${existing.id}`, existed: true };
    }
    eventId = ev.id; title ||= ev.title; startsAt ??= ev.startsAt;
  }
  if (!title || !startsAt) throw new ApiError(400, "“title” and “startsAt” are required (or pass “event”).");
  const [m] = await db.insert(meetings).values({
    eventId, title, startsAt, agenda: text(b.agenda, 20000), visibility: z.enum(["everyone", "leadership", "admin"]).parse(b.visibility ?? "everyone"), createdById: actor.id, updatedById: actor.id,
  }).returning();
  return { ok: true, id: m.id, url: `/meetings/${m.id}` };
});
