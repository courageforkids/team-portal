"use server";
/**
 * Calendar server actions. This is a "use server" module, so every export is a client-callable
 * endpoint: each one authenticates itself. Read-side helpers live in src/app/api/calendar/_lib.
 */
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { events, projects, users } from "@/db/schema";
import { actionAdmin, actionUser } from "./auth";
import { safe, bool, optStr, str, UserError } from "./safe-action";
import { audit } from "./audit";
import { randomToken } from "./crypto";
import { getSettings } from "./settings";
import { parseLocalInput } from "@/lib/dates";
import type { ActionResult } from "@/lib/action";
import { EVENT_TYPES } from "@/components/calendar/meta";
import { isValidKey, keyStartUtc } from "@/components/calendar/date-utils";
import { feedUrl } from "@/app/api/calendar/_lib/data";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Creates (or replaces) the signed-in member's private calendar subscription link. */
export async function regenerateCalendarFeedAction(): Promise<ActionResult<{ url: string }>> {
  return safe(async () => {
    const me = await actionUser();
    const hadOne = !!(await db.select({ t: users.calendarToken }).from(users).where(eq(users.id, me.id)).limit(1))[0]?.t;
    const token = randomToken();
    await db.update(users).set({ calendarToken: token, updatedAt: new Date() }).where(eq(users.id, me.id));
    return { ok: true, message: hadOne ? "New link created. The old one no longer works." : "Your calendar link is ready.", data: { url: feedUrl(token) } };
  });
}

const eventSchema = z.object({
  title: z.string().trim().min(1, "Give the event a title.").max(160, "Keep the title under 160 characters."),
  type: z.enum(EVENT_TYPES, { message: "Pick an event type." }),
  visibility: z.enum(["everyone", "leadership", "admin"], { message: "Pick who can see this event." }),
  location: z.string().trim().max(300, "Keep the location under 300 characters."),
  description: z.string().trim().max(5000, "Keep the description under 5,000 characters."),
});

export async function saveEventAction(_prev: ActionResult<unknown> | null, fd: FormData): Promise<ActionResult> {
  return safe(async () => {
    const me = await actionAdmin();
    const id = str(fd, "id");
    const input = eventSchema.parse({
      title: str(fd, "title"), type: str(fd, "type"), visibility: str(fd, "visibility"), location: str(fd, "location"), description: str(fd, "description"),
    });
    const { timezone: tz } = await getSettings();
    const allDay = bool(fd, "allDay");
    let startsAt: Date;
    let endsAt: Date | null = null;
    if (allDay) {
      const sd = str(fd, "startDate");
      const ed = str(fd, "endDate");
      if (!isValidKey(sd)) throw new UserError("Pick a start date.");
      if (ed && !isValidKey(ed)) throw new UserError("That end date doesn't look right.");
      if (ed && ed < sd) throw new UserError("The end date can't be before the start date.");
      startsAt = keyStartUtc(sd, tz);
      if (ed && ed !== sd) endsAt = keyStartUtc(ed, tz);
    } else {
      const s = parseLocalInput(str(fd, "startsAt"), tz);
      if (!s || str(fd, "startsAt").length < 16) throw new UserError("Pick a start date and time.");
      startsAt = s;
      const rawEnd = str(fd, "endsAt");
      if (rawEnd) {
        const e = parseLocalInput(rawEnd, tz);
        if (!e || rawEnd.length < 16) throw new UserError("That end time doesn't look right.");
        if (e <= s) throw new UserError("The event has to end after it starts.");
        endsAt = e;
      }
    }
    if (endsAt && endsAt.getTime() - startsAt.getTime() > 62 * 86400_000) throw new UserError("Events can last up to 2 months.");

    let projectId = optStr(fd, "projectId");
    if (projectId) {
      if (!UUID_RE.test(projectId) || !(await db.select({ id: projects.id }).from(projects).where(eq(projects.id, projectId)).limit(1))[0])
        throw new UserError("That project no longer exists.");
    } else projectId = null;

    const values = { ...input, allDay, startsAt, endsAt, projectId };
    if (id) {
      if (!UUID_RE.test(id)) throw new UserError("That event no longer exists.");
      const updated = await db.update(events).set(values).where(eq(events.id, id)).returning({ id: events.id });
      if (!updated.length) throw new UserError("That event no longer exists.");
      await audit(me.id, "event.update", "event", id, { title: input.title, startsAt: startsAt.toISOString(), visibility: input.visibility });
      return { ok: true, message: "Event updated." };
    }
    const [row] = await db.insert(events).values({ ...values, createdById: me.id }).returning({ id: events.id });
    await audit(me.id, "event.create", "event", row.id, { title: input.title, startsAt: startsAt.toISOString(), visibility: input.visibility });
    return { ok: true, message: "Event added to the calendar." };
  });
}

export async function deleteEventAction(id: string): Promise<ActionResult> {
  return safe(async () => {
    const me = await actionAdmin();
    if (typeof id !== "string" || !UUID_RE.test(id)) throw new UserError("That event no longer exists.");
    const gone = await db.delete(events).where(eq(events.id, id)).returning({ id: events.id, title: events.title });
    if (!gone.length) throw new UserError("That event no longer exists.");
    await audit(me.id, "event.delete", "event", id, { title: gone[0].title });
    return { ok: true, message: "Event deleted." };
  });
}
