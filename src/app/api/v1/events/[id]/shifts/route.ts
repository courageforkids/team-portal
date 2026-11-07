import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { eventShifts, events } from "@/db/schema";
import { apiRoute, ApiError, jsonBody } from "@/server/api-auth";
import { parseWhen, text } from "@/server/api-helpers";
import { audit } from "@/server/audit";

export const POST = apiRoute<{ params: Promise<{ id: string }> }>(async (req, actor, { params }) => {
  const eventId = z.string().uuid().parse((await params).id);
  const ev = (await db.select().from(events).where(eq(events.id, eventId)).limit(1))[0];
  if (!ev) throw new ApiError(404, "Event not found.");
  const b = await jsonBody(req);
  const startsAt = parseWhen(b.startsAt, undefined, "startsAt"), endsAt = parseWhen(b.endsAt, undefined, "endsAt");
  if (!startsAt || !endsAt || endsAt <= startsAt) throw new ApiError(400, "“startsAt” and a later “endsAt” are required.");
  const capacity = b.capacity === undefined || b.capacity === null ? null : z.number().int().min(1).max(500).parse(b.capacity);
  const [s] = await db.insert(eventShifts).values({ eventId, label: text(b.label, 80) || "Volunteer", startsAt, endsAt, capacity, notes: text(b.notes, 300) }).returning();
  await audit(actor.id, "shift.create", "event", eventId, { label: s.label, via: "api" });
  return { ok: true, id: s.id };
});
