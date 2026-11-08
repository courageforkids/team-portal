import { and, asc, gte, lte } from "drizzle-orm";
import { addDays } from "date-fns";
import { db } from "@/db";
import { events } from "@/db/schema";
import { apiRoute, jsonBody } from "@/server/api-auth";
import { saveApiDraft } from "@/server/drafts";
import { createEventFromApi } from "@/server/v1-creators";
import { bool, parseWhen } from "@/server/api-helpers";

export const GET = apiRoute(async (req) => {
  const sp = new URL(req.url).searchParams;
  const from = parseWhen(sp.get("from"), undefined, "from") ?? new Date();
  const to = parseWhen(sp.get("to"), undefined, "to") ?? addDays(from, 90);
  return { events: await db.select().from(events).where(and(gte(events.startsAt, from), lte(events.startsAt, to))).orderBy(asc(events.startsAt)) };
});

export const POST = apiRoute(async (req, actor) => {
  const b = await jsonBody(req);
  if (bool(b.draft, false)) return saveApiDraft(actor, "event", b);
  return createEventFromApi(b, actor);
});
