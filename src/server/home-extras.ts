import "server-only";
import { and, asc, eq, gte, lte, sql } from "drizzle-orm";
import { db } from "@/db";
import { events, eventShifts, shiftSignups, users } from "@/db/schema";

const TZ = "America/New_York";
export const todayNY = () => new Date().toLocaleDateString("en-CA", { timeZone: TZ });

/** The next big (non-meeting) events in the coming 60 days, with volunteer spots filled. */
export async function upcomingCountdowns(limit = 2) {
  const now = new Date();
  const evs = await db.select({ id: events.id, title: events.title, type: events.type, startsAt: events.startsAt }).from(events)
    .where(and(gte(events.startsAt, now), lte(events.startsAt, new Date(now.getTime() + 60 * 86400000)), sql`${events.type} <> 'meeting'`)).orderBy(asc(events.startsAt)).limit(limit);
  return Promise.all(evs.map(async (e) => {
    const [r] = await db.select({ capacity: sql<number>`coalesce(sum(${eventShifts.capacity}),0)::int`, filled: sql<number>`(select count(*)::int from ${shiftSignups} where ${shiftSignups.shiftId} in (select id from ${eventShifts} where ${eventShifts.eventId} = ${e.id}))` })
      .from(eventShifts).where(eq(eventShifts.eventId, e.id));
    const days = Math.max(0, Math.ceil((new Date(e.startsAt.toLocaleDateString("en-CA", { timeZone: TZ }) + "T00:00:00Z").getTime() - new Date(todayNY() + "T00:00:00Z").getTime()) / 86400000));
    return { ...e, days, capacity: Number(r?.capacity ?? 0), filled: Number(r?.filled ?? 0) };
  }));
}

export async function birthdaysToday() {
  const md = todayNY().slice(5);
  return db.select({ id: users.id, name: users.name }).from(users).where(and(eq(users.status, "active"), eq(users.birthday, md)));
}
