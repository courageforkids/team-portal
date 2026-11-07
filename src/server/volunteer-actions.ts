"use server";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { eventShifts, events, shiftSignups, users, volunteerHours } from "@/db/schema";
import { actionAdmin, actionUser, AuthError } from "./auth";
import { safe, str, UserError } from "./safe-action";
import { adminIds, notify } from "./notify";
import { audit } from "./audit";
import { visibilityAllowed } from "./policy";
import { parseLocalInput, DEFAULT_TZ } from "@/lib/dates";
import { formatInTimeZone } from "date-fns-tz";
import type { ActionResult } from "@/lib/action";

const uuid = z.string().uuid();
const todayISO = () => formatInTimeZone(new Date(), DEFAULT_TZ, "yyyy-MM-dd");

function parseHours(raw: string) {
  const h = Number(raw);
  if (!Number.isFinite(h) || h <= 0) throw new UserError("Enter how many hours, like 1.5.");
  if (h > 24) throw new UserError("One entry can't be more than 24 hours. Log each day separately.");
  return Math.round(h * 4) * 15; // nearest 15 minutes
}

/* ───────── Hours ───────── */

export async function logHoursAction(_: unknown, fd: FormData): Promise<ActionResult> {
  return safe(async () => {
    const me = await actionUser();
    const date = str(fd, "date");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new UserError("Pick the date you volunteered.");
    if (date > todayISO()) throw new UserError("You can't log hours for a future date.");
    const minutes = parseHours(str(fd, "hours"));
    const activity = str(fd, "activity").slice(0, 120);
    if (activity.length < 3) throw new UserError("Say what you did, like “Packing day”.");
    const forUser = str(fd, "userId");
    const adminEntry = me.role === "admin" && forUser && forUser !== me.id;
    const userId = adminEntry ? uuid.parse(forUser) : me.id;
    await db.insert(volunteerHours).values({
      userId, date, minutes, activity, description: str(fd, "description").slice(0, 1000),
      source: adminEntry ? "admin" : "manual",
      status: adminEntry ? "approved" : "pending",
      reviewedById: adminEntry ? me.id : null, reviewedAt: adminEntry ? new Date() : null,
    });
    if (adminEntry) {
      await audit(me.id, "hours.add_for_member", "user", userId, { date, minutes, activity });
      await notify([userId], { type: "task_updated", title: `${(minutes / 60).toFixed(2).replace(/\.?0+$/, "")} volunteer hours added`, body: activity, href: "/volunteer/hours", excludeUserId: me.id });
      return { ok: true, message: "Hours added and approved." };
    }
    await notify(await adminIds(), { type: "task_updated", title: `${me.name} logged volunteer hours`, body: `${activity} · ${(minutes / 60).toFixed(2).replace(/\.?0+$/, "")} h`, href: "/volunteer/review", dedupeKey: `hours:${me.id}:${date}:${activity}`.slice(0, 200), excludeUserId: me.id });
    return { ok: true, message: "Hours logged. An administrator will approve them." };
  });
}

export async function deleteHoursAction(id: string): Promise<ActionResult> {
  return safe(async () => {
    const me = await actionUser();
    const h = (await db.select().from(volunteerHours).where(eq(volunteerHours.id, uuid.parse(id))).limit(1))[0];
    if (!h) throw new UserError("That entry was already removed.");
    const own = h.userId === me.id && h.status !== "approved";
    if (!own && me.role !== "admin") throw new AuthError("Only an administrator can remove approved hours.");
    await db.delete(volunteerHours).where(eq(volunteerHours.id, h.id));
    if (h.shiftId) await db.update(shiftSignups).set({ hoursEntryId: null, attended: null }).where(and(eq(shiftSignups.shiftId, h.shiftId), eq(shiftSignups.userId, h.userId)));
    if (!own) await audit(me.id, "hours.delete", "user", h.userId, { date: h.date, minutes: h.minutes, activity: h.activity });
    return { ok: true, message: "Entry removed." };
  });
}

export async function reviewHoursAction(id: string, decision: "approved" | "rejected", note = ""): Promise<ActionResult> {
  return safe(async () => {
    const me = await actionAdmin();
    const h = (await db.select().from(volunteerHours).where(eq(volunteerHours.id, uuid.parse(id))).limit(1))[0];
    if (!h) throw new UserError("That entry no longer exists.");
    if (decision === "rejected" && !note.trim()) throw new UserError("Add a short reason so they know what to fix.");
    await db.update(volunteerHours).set({ status: decision, reviewedById: me.id, reviewedAt: new Date(), reviewNote: note.trim().slice(0, 500) }).where(eq(volunteerHours.id, h.id));
    const hrs = (h.minutes / 60).toFixed(2).replace(/\.?0+$/, "");
    await notify([h.userId], {
      type: "task_updated", title: decision === "approved" ? `${hrs} volunteer hours approved ✅` : `Volunteer hours not approved`,
      body: decision === "approved" ? h.activity : `${h.activity}: ${note.trim()}`, href: "/volunteer/hours", excludeUserId: me.id,
    });
    await audit(me.id, `hours.${decision}`, "user", h.userId, { id: h.id, minutes: h.minutes });
    return { ok: true, message: decision === "approved" ? "Approved." : "Marked not approved." };
  });
}

/* ───────── Shifts & sign-ups ───────── */

export async function saveShiftAction(_: unknown, fd: FormData): Promise<ActionResult> {
  return safe(async () => {
    const me = await actionAdmin();
    const eventId = uuid.parse(str(fd, "eventId"));
    const ev = (await db.select().from(events).where(eq(events.id, eventId)).limit(1))[0];
    if (!ev) throw new UserError("That event no longer exists.");
    const label = str(fd, "label").slice(0, 80) || "Volunteer";
    const startsAt = parseLocalInput(str(fd, "startsAt"), DEFAULT_TZ);
    const endsAt = parseLocalInput(str(fd, "endsAt"), DEFAULT_TZ);
    if (!startsAt || !endsAt) throw new UserError("Pick a start and end time.");
    if (endsAt <= startsAt) throw new UserError("The shift has to end after it starts.");
    if (endsAt.getTime() - startsAt.getTime() > 16 * 3600_000) throw new UserError("A shift can't be longer than 16 hours.");
    const capRaw = str(fd, "capacity");
    const capacity = capRaw ? Math.max(1, Math.min(500, Math.floor(Number(capRaw)) || 0)) : null;
    if (capRaw && !capacity) throw new UserError("Spots must be a number (or leave it blank for unlimited).");
    const id = str(fd, "id");
    const values = { eventId, label, startsAt, endsAt, capacity, notes: str(fd, "notes").slice(0, 300) };
    if (id) await db.update(eventShifts).set(values).where(eq(eventShifts.id, uuid.parse(id)));
    else await db.insert(eventShifts).values(values);
    await audit(me.id, id ? "shift.update" : "shift.create", "event", eventId, { label });
    return { ok: true, message: id ? "Shift updated." : "Shift added." };
  });
}

export async function deleteShiftAction(shiftId: string): Promise<ActionResult> {
  return safe(async () => {
    const me = await actionAdmin();
    const s = (await db.select().from(eventShifts).where(eq(eventShifts.id, uuid.parse(shiftId))).limit(1))[0];
    if (!s) throw new UserError("That shift was already removed.");
    const people = await db.select({ userId: shiftSignups.userId }).from(shiftSignups).where(eq(shiftSignups.shiftId, s.id));
    await db.delete(eventShifts).where(eq(eventShifts.id, s.id));
    if (people.length) await notify(people.map((p) => p.userId), { type: "task_updated", title: `A shift you signed up for was canceled`, body: s.label, href: "/volunteer", excludeUserId: me.id });
    await audit(me.id, "shift.delete", "event", s.eventId, { label: s.label, signups: people.length });
    return { ok: true, message: "Shift removed." };
  });
}

export async function signUpAction(shiftId: string): Promise<ActionResult> {
  return safe(async () => {
    const me = await actionUser();
    const row = (await db.select({ s: eventShifts, e: events }).from(eventShifts).innerJoin(events, eq(events.id, eventShifts.eventId)).where(eq(eventShifts.id, uuid.parse(shiftId))).limit(1))[0];
    if (!row || !visibilityAllowed(me.role, row.e.visibility)) throw new UserError("That shift isn't available.");
    if (row.s.startsAt <= new Date()) throw new UserError("This shift has already started.");
    // Insert only while there's room — checked in the same statement so two people can't take the last spot.
    const inserted = await db.execute(sql`
      insert into shift_signups (shift_id, user_id)
      select ${row.s.id}, ${me.id}
      where ${row.s.capacity}::int is null or (select count(*) from shift_signups where shift_id = ${row.s.id}) < ${row.s.capacity}::int
      on conflict do nothing
      returning shift_id`);
    if (!(inserted as unknown as unknown[]).length) {
      const mine = (await db.select().from(shiftSignups).where(and(eq(shiftSignups.shiftId, row.s.id), eq(shiftSignups.userId, me.id))).limit(1))[0];
      throw new UserError(mine ? "You're already signed up." : "Sorry, that shift just filled up.");
    }
    return { ok: true, message: `You're signed up for ${row.s.label}!` };
  });
}

export async function cancelSignUpAction(shiftId: string, userId?: string): Promise<ActionResult> {
  return safe(async () => {
    const me = await actionUser();
    const target = userId && me.role === "admin" ? uuid.parse(userId) : me.id;
    const s = (await db.select().from(eventShifts).where(eq(eventShifts.id, uuid.parse(shiftId))).limit(1))[0];
    if (!s) throw new UserError("That shift no longer exists.");
    if (target === me.id && s.startsAt <= new Date() && me.role !== "admin") throw new UserError("This shift already started. Message an administrator if you can't make it.");
    const su = (await db.select().from(shiftSignups).where(and(eq(shiftSignups.shiftId, s.id), eq(shiftSignups.userId, target))).limit(1))[0];
    if (su?.hoursEntryId) await db.delete(volunteerHours).where(eq(volunteerHours.id, su.hoursEntryId));
    await db.delete(shiftSignups).where(and(eq(shiftSignups.shiftId, s.id), eq(shiftSignups.userId, target)));
    return { ok: true, message: target === me.id ? "You're no longer signed up." : "Removed from the shift." };
  });
}

/** Admin: mark who showed up. Attended → approved hours for the shift's length; undo removes them. */
export async function markAttendanceAction(shiftId: string, userId: string, attended: boolean | null): Promise<ActionResult> {
  return safe(async () => {
    const me = await actionAdmin();
    const row = (await db.select({ s: eventShifts, e: events }).from(eventShifts).innerJoin(events, eq(events.id, eventShifts.eventId)).where(eq(eventShifts.id, uuid.parse(shiftId))).limit(1))[0];
    if (!row) throw new UserError("That shift no longer exists.");
    const su = (await db.select().from(shiftSignups).where(and(eq(shiftSignups.shiftId, row.s.id), eq(shiftSignups.userId, uuid.parse(userId)))).limit(1))[0];
    if (!su) throw new UserError("They aren't signed up for this shift.");
    if (su.hoursEntryId) { await db.delete(volunteerHours).where(eq(volunteerHours.id, su.hoursEntryId)); }
    let hoursEntryId: string | null = null;
    if (attended) {
      const minutes = Math.max(15, Math.round((row.s.endsAt.getTime() - row.s.startsAt.getTime()) / 900_000) * 15);
      const [h] = await db.insert(volunteerHours).values({
        userId: su.userId, date: formatInTimeZone(row.s.startsAt, DEFAULT_TZ, "yyyy-MM-dd"), minutes,
        activity: `${row.e.title}: ${row.s.label}`, source: "shift", shiftId: row.s.id, status: "approved", reviewedById: me.id, reviewedAt: new Date(),
      }).returning({ id: volunteerHours.id });
      hoursEntryId = h.id;
    }
    await db.update(shiftSignups).set({ attended, hoursEntryId }).where(and(eq(shiftSignups.shiftId, row.s.id), eq(shiftSignups.userId, su.userId)));
    await audit(me.id, "shift.attendance", "user", su.userId, { shiftId: row.s.id, attended });
    return { ok: true };
  });
}

/** Admin: sign someone up (e.g. they texted you instead of using the portal). Ignores capacity. */
export async function adminAddSignupAction(shiftId: string, userId: string): Promise<ActionResult> {
  return safe(async () => {
    await actionAdmin();
    const u = (await db.select({ id: users.id }).from(users).where(and(eq(users.id, uuid.parse(userId)), eq(users.status, "active"))).limit(1))[0];
    if (!u) throw new UserError("That person isn't active.");
    await db.insert(shiftSignups).values({ shiftId: uuid.parse(shiftId), userId: u.id }).onConflictDoNothing();
    return { ok: true, message: "Added to the shift." };
  });
}
