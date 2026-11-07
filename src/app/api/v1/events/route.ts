import { z } from "zod";
import { and, asc, gte, lte } from "drizzle-orm";
import { addDays } from "date-fns";
import { db } from "@/db";
import { events } from "@/db/schema";
import { apiRoute, ApiError, jsonBody } from "@/server/api-auth";
import { bool, parseWhen, resolveProject, text } from "@/server/api-helpers";
import { audit } from "@/server/audit";

export const GET = apiRoute(async (req) => {
  const sp = new URL(req.url).searchParams;
  const from = parseWhen(sp.get("from"), undefined, "from") ?? new Date();
  const to = parseWhen(sp.get("to"), undefined, "to") ?? addDays(from, 90);
  return { events: await db.select().from(events).where(and(gte(events.startsAt, from), lte(events.startsAt, to))).orderBy(asc(events.startsAt)) };
});

export const POST = apiRoute(async (req, actor) => {
  const b = await jsonBody(req);
  const title = text(b.title, 160);
  if (!title) throw new ApiError(400, "“title” is required.");
  const startsAt = parseWhen(b.startsAt, undefined, "startsAt");
  if (!startsAt) throw new ApiError(400, "“startsAt” is required.");
  const endsAt = parseWhen(b.endsAt, undefined, "endsAt");
  if (endsAt && endsAt < startsAt) throw new ApiError(400, "“endsAt” must be after “startsAt”.");
  const [e] = await db.insert(events).values({
    title, startsAt, endsAt, allDay: bool(b.allDay, false), location: text(b.location, 200), description: text(b.description, 4000),
    type: z.enum(["meeting", "community", "fundraising", "volunteer", "milestone", "other"]).parse(b.type ?? "other"),
    visibility: z.enum(["everyone", "leadership", "admin"]).parse(b.visibility ?? "everyone"), projectId: await resolveProject(b.project), createdById: actor.id,
  }).returning();
  await audit(actor.id, "event.create", "event", e.id, { title, via: "api" });
  return { ok: true, id: e.id, url: `/volunteer/events/${e.id}` };
});
