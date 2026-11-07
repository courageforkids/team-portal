import "server-only";
import { and, asc, desc, eq, gte, inArray, lte, sql } from "drizzle-orm";
import { addDays } from "date-fns";
import { db } from "@/db";
import { eventShifts, events, shiftSignups, users, volunteerHours } from "@/db/schema";
import type { CurrentUser } from "./auth";
import { allowedVisibilities } from "./policy";

export type ShiftView = {
  id: string; label: string; startsAt: Date; endsAt: Date; capacity: number | null; notes: string;
  taken: number; mine: boolean; people: { id: string; name: string; avatarFileId: string | null; attended: boolean | null }[];
};
export type EventWithShifts = { id: string; title: string; type: string; startsAt: Date; endsAt: Date | null; location: string; description: string; shifts: ShiftView[] };

async function attachShifts(me: CurrentUser, evs: (typeof events.$inferSelect)[]): Promise<EventWithShifts[]> {
  if (!evs.length) return [];
  const shifts = await db.select().from(eventShifts).where(inArray(eventShifts.eventId, evs.map((e) => e.id))).orderBy(asc(eventShifts.startsAt));
  const signups = shifts.length ? await db.select({ su: shiftSignups, name: users.name, avatar: users.avatarFileId })
    .from(shiftSignups).innerJoin(users, eq(users.id, shiftSignups.userId)).where(inArray(shiftSignups.shiftId, shifts.map((s) => s.id))) : [];
  return evs.map((e) => ({
    id: e.id, title: e.title, type: e.type, startsAt: e.startsAt, endsAt: e.endsAt, location: e.location, description: e.description,
    shifts: shifts.filter((s) => s.eventId === e.id).map((s) => {
      const people = signups.filter((x) => x.su.shiftId === s.id).map((x) => ({ id: x.su.userId, name: x.name, avatarFileId: x.avatar, attended: x.su.attended }));
      return { id: s.id, label: s.label, startsAt: s.startsAt, endsAt: s.endsAt, capacity: s.capacity, notes: s.notes, taken: people.length, mine: people.some((p) => p.id === me.id), people };
    }),
  }));
}

/** Upcoming events the viewer may see, with their sign-up shifts (events without shifts included for admins). */
export async function upcomingSignups(me: CurrentUser) {
  const evs = await db.select().from(events).where(and(
    gte(events.startsAt, addDays(new Date(), -1)), lte(events.startsAt, addDays(new Date(), 120)),
    inArray(events.visibility, allowedVisibilities(me.role)),
  )).orderBy(asc(events.startsAt));
  const all = await attachShifts(me, evs);
  return me.role === "admin" ? all : all.filter((e) => e.shifts.length);
}

export async function eventWithShifts(me: CurrentUser, eventId: string) {
  const ev = (await db.select().from(events).where(and(eq(events.id, eventId), inArray(events.visibility, allowedVisibilities(me.role)))).limit(1))[0];
  if (!ev) return null;
  return (await attachShifts(me, [ev]))[0];
}

/** School year runs Aug 1 – Jul 31. */
export function schoolYearStart(now = new Date()) {
  const y = now.getMonth() >= 7 ? now.getFullYear() : now.getFullYear() - 1;
  return `${y}-08-01`;
}

export async function hoursFor(userId: string) {
  const rows = await db.select({ h: volunteerHours, reviewer: users.name }).from(volunteerHours)
    .leftJoin(users, eq(users.id, volunteerHours.reviewedById)).where(eq(volunteerHours.userId, userId))
    .orderBy(desc(volunteerHours.date), desc(volunteerHours.createdAt));
  const sy = schoolYearStart();
  const approved = rows.filter((r) => r.h.status === "approved");
  return {
    rows,
    approvedMinutes: approved.reduce((n, r) => n + r.h.minutes, 0),
    yearMinutes: approved.filter((r) => r.h.date >= sy).reduce((n, r) => n + r.h.minutes, 0),
    pendingMinutes: rows.filter((r) => r.h.status === "pending").reduce((n, r) => n + r.h.minutes, 0),
  };
}

export async function myUpcomingShifts(userId: string) {
  return db.select({ shiftId: eventShifts.id, label: eventShifts.label, startsAt: eventShifts.startsAt, endsAt: eventShifts.endsAt, eventId: events.id, title: events.title, location: events.location })
    .from(shiftSignups).innerJoin(eventShifts, eq(eventShifts.id, shiftSignups.shiftId)).innerJoin(events, eq(events.id, eventShifts.eventId))
    .where(and(eq(shiftSignups.userId, userId), gte(eventShifts.endsAt, new Date()))).orderBy(asc(eventShifts.startsAt)).limit(10);
}

export async function hoursReviewData() {
  const pending = await db.select({ h: volunteerHours, name: users.name, avatar: users.avatarFileId }).from(volunteerHours)
    .innerJoin(users, eq(users.id, volunteerHours.userId)).where(eq(volunteerHours.status, "pending")).orderBy(asc(volunteerHours.createdAt));
  const sy = schoolYearStart();
  const totals = await db.execute<{ id: string; name: string; title: string; avatar_file_id: string | null; total: number; year: number; pending: number }>(sql`
    select u.id, u.name, u.title, u.avatar_file_id,
      coalesce(sum(h.minutes) filter (where h.status = 'approved'), 0)::int as total,
      coalesce(sum(h.minutes) filter (where h.status = 'approved' and h.date >= ${sy}::date), 0)::int as year,
      coalesce(sum(h.minutes) filter (where h.status = 'pending'), 0)::int as pending
    from users u left join volunteer_hours h on h.user_id = u.id
    where u.status = 'active' group by u.id order by u.name`);
  return { pending, totals: totals as unknown as { id: string; name: string; title: string; avatar_file_id: string | null; total: number; year: number; pending: number }[] };
}

export const fmtHours = (minutes: number) => {
  const h = minutes / 60;
  return `${Number.isInteger(h) ? h : h.toFixed(2).replace(/0$/, "")} ${h === 1 ? "hour" : "hours"}`;
};
