import "server-only";
import { and, asc, desc, eq, gte, isNotNull, lte, sql } from "drizzle-orm";
import { fromZonedTime } from "date-fns-tz";
import { db } from "@/db";
import { capeSeasons, events, eventShifts, shiftSignups, users } from "@/db/schema";
import { getSettings } from "./settings";
import { activeCapes, CAPE_ORDER, isCape, POINTS, rankFor, type Cape } from "@/lib/academy";

const TZ = "America/New_York";
export const todayNY = () => new Date().toLocaleDateString("en-CA", { timeZone: TZ });

export async function academySettings() {
  const a = (await getSettings()).academy;
  return { enabled: a?.enabled ?? true, capeCount: (a?.capeCount ?? 2) as 2 | 4, goals: a?.goals ?? [] };
}

export type Season = typeof capeSeasons.$inferSelect;
export async function currentSeason(): Promise<Season | null> {
  const t = todayNY();
  return (await db.select().from(capeSeasons).where(and(lte(capeSeasons.startsOn, t), gte(capeSeasons.endsOn, t))).orderBy(desc(capeSeasons.startsOn)).limit(1))[0] ?? null;
}
export async function recentlyEndedSeason(days = 14): Promise<Season | null> {
  const t = todayNY();
  const since = new Date(Date.now() - days * 86400000).toLocaleDateString("en-CA", { timeZone: TZ });
  return (await db.select().from(capeSeasons).where(and(sql`${capeSeasons.endsOn} < ${t}`, gte(capeSeasons.endsOn, since))).orderBy(desc(capeSeasons.endsOn)).limit(1))[0] ?? null;
}
export const allSeasons = () => db.select().from(capeSeasons).orderBy(desc(capeSeasons.startsOn));

const rangeOf = (s: { startsOn: string; endsOn: string } | null) => s
  ? { start: fromZonedTime(`${s.startsOn}T00:00`, TZ), end: new Date(fromZonedTime(`${s.endsOn}T00:00`, TZ).getTime() + 86400000) }
  : { start: new Date("2000-01-01T00:00:00Z"), end: new Date("2100-01-01T00:00:00Z") };

export type Breakdown = { tasks: number; meetings: number; shifts: number; shoutGiven: number; shoutGot: number; planesSent: number; planesGot: number; bonus: number; total: number };
const empty = (): Breakdown => ({ tasks: 0, meetings: 0, shifts: 0, shoutGiven: 0, shoutGot: 0, planesSent: 0, planesGot: 0, bonus: 0, total: 0 });

/** Points per person for a season (or all time when season is null). Counts, not points, except bonus. */
export async function pointsByUser(season: { startsOn: string; endsOn: string } | null): Promise<Map<string, Breakdown>> {
  const { start, end } = rangeOf(season);
  const s = start.toISOString(), e = end.toISOString();
  const rows = (await db.execute(sql`
    select user_id, kind, sum(n)::int as n from (
      select ta.user_id, 'tasks' as kind, count(*) as n from tasks t join task_assignees ta on ta.task_id = t.id
        where t.status = 'approved' and t.completed_at >= ${s} and t.completed_at < ${e}
          and (t.due_at is null or (t.first_submitted_at is not null and t.first_submitted_at <= t.due_at))
        group by ta.user_id
      union all
      select ma.user_id, 'meetings', count(*) from meeting_attendance ma join meetings m on m.id = ma.meeting_id
        where ma.status in ('present', 'late') and m.starts_at >= ${s} and m.starts_at < ${e} group by ma.user_id
      union all
      select ss.user_id, 'shifts', count(*) from shift_signups ss join event_shifts es on es.id = ss.shift_id
        where ss.attended = true and es.starts_at >= ${s} and es.starts_at < ${e} group by ss.user_id
      union all
      select from_id, 'shoutGiven', count(*) from shoutouts where from_id is not null and created_at >= ${s} and created_at < ${e} group by from_id
      union all
      select sr.user_id, 'shoutGot', count(*) from shoutout_recipients sr join shoutouts so on so.id = sr.shoutout_id
        where so.created_at >= ${s} and so.created_at < ${e} group by sr.user_id
      union all
      select from_id, 'planesSent', count(*) from paper_planes where from_id is not null and reported_at is null and created_at >= ${s} and created_at < ${e} group by from_id
      union all
      select to_id, 'planesGot', count(*) from paper_planes where reported_at is null and created_at >= ${s} and created_at < ${e} group by to_id
      union all
      select user_id, 'bonus', sum(points) from cape_bonuses where user_id is not null and created_at >= ${s} and created_at < ${e} group by user_id
    ) x group by user_id, kind`)) as unknown as { user_id: string; kind: keyof Breakdown; n: number }[];
  const map = new Map<string, Breakdown>();
  for (const r of rows) {
    const b = map.get(r.user_id) ?? empty();
    b[r.kind] = Number(r.n);
    map.set(r.user_id, b);
  }
  for (const b of map.values()) {
    b.total = b.tasks * POINTS.taskOnTime + b.meetings * POINTS.meeting + b.shifts * POINTS.shift + b.shoutGiven * POINTS.shoutGiven + b.shoutGot * POINTS.shoutGot
      + b.planesSent * POINTS.planeSent + b.planesGot * POINTS.planeGot + b.bonus;
  }
  return map;
}
export const pointsOf = (m: Map<string, Breakdown>, id: string) => m.get(id) ?? empty();

export type Standing = { cape: Cape; members: number; total: number; capeBonus: number; average: number };
/** Cape scores: average points per member, plus any bonus given to the whole Cape. */
export async function standings(season: Season | null, capeCount: 2 | 4, pts?: Map<string, Breakdown>) {
  const map = pts ?? await pointsByUser(season);
  const people = await db.select({ id: users.id, cape: users.cape }).from(users).where(and(eq(users.status, "active"), isNotNull(users.cape)));
  const { start, end } = rangeOf(season);
  const capeBonusRows = (await db.execute(sql`select cape, coalesce(sum(points),0)::int as n from cape_bonuses where user_id is null and cape is not null and created_at >= ${start.toISOString()} and created_at < ${end.toISOString()} group by cape`)) as unknown as { cape: string; n: number }[];
  const list: Standing[] = activeCapes(capeCount).map((cape) => {
    const members = people.filter((p) => p.cape === cape);
    const total = members.reduce((sum, p) => sum + pointsOf(map, p.id).total, 0);
    const capeBonus = Number(capeBonusRows.find((r) => r.cape === cape)?.n ?? 0);
    return { cape, members: members.length, total, capeBonus, average: Math.round(((members.length ? total / members.length : 0) + capeBonus) * 10) / 10 };
  });
  return list.sort((a, b) => b.average - a.average);
}

/** Pick a Cape from quiz answers, keeping teams balanced. */
export async function chooseCape(answers: Cape[], capeCount: 2 | 4): Promise<Cape> {
  const caps = activeCapes(capeCount);
  const fold = (c: Cape) => (caps.includes(c) ? c : c === "ember" ? "gold" : "navy");
  const score = new Map<Cape, number>(caps.map((c) => [c, 0]));
  answers.forEach((a, i) => score.set(fold(a), (score.get(fold(a)) ?? 0) + 1 + (i === answers.length - 1 ? 0.1 : 0)));
  const counts = new Map<Cape, number>(caps.map((c) => [c, 0]));
  for (const r of await db.select({ cape: users.cape }).from(users).where(and(eq(users.status, "active"), isNotNull(users.cape)))) if (isCape(r.cape) && counts.has(r.cape)) counts.set(r.cape, counts.get(r.cape)! + 1);
  const ranked = [...caps].sort((a, b) => score.get(b)! - score.get(a)!);
  const min = Math.min(...counts.values());
  // If their best match is already 2+ people bigger than the smallest Cape, send them to the smallest (best-scoring among those).
  if (counts.get(ranked[0])! - min >= 2) return ranked.find((c) => counts.get(c) === min)!;
  return ranked[0];
}

export async function questProgress(goals: Awaited<ReturnType<typeof academySettings>>["goals"]) {
  return Promise.all(goals.map(async (g) => {
    let current = g.current ?? 0;
    if (g.metric === "boxes") current = Number(((await db.execute(sql`select coalesce(sum(boxes_delivered),0)::int as n from monthly_reports where month like ${g.year + "-%"}`)) as unknown as { n: number }[])[0]?.n ?? 0);
    if (g.metric === "money") current = Number(((await db.execute(sql`select coalesce(sum(amount_cents),0)::int as n from donations where type = 'cash' and received_on >= ${g.year + "-01-01"} and received_on < ${g.year + 1 + "-01-01"}`)) as unknown as { n: number }[])[0]?.n ?? 0) / 100;
    return { ...g, current, pct: g.target > 0 ? Math.min(1, current / g.target) : 0 };
  }));
}

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

export { rankFor, CAPE_ORDER };
