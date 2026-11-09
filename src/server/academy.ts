import "server-only";
import { and, desc, eq, gte, inArray, isNotNull, isNull, lte, sql } from "drizzle-orm";
import { fromZonedTime } from "date-fns-tz";
import { notFound } from "next/navigation";
import { db } from "@/db";
import { academyChallenges, capeMottos, capeMottoVotes, capeSeasons, users, type AcademySettings } from "@/db/schema";
import { getSettings, saveSettings } from "./settings";
import type { CurrentUser } from "./auth";
import { activeCapes, CAPE_ORDER, DUEL_WINS_PER_DAY, isCape, POINTS, rankFor, STREAK_BONUS_FROM, type Cape } from "@/lib/academy";

const TZ = "America/New_York";
export const todayNY = () => new Date().toLocaleDateString("en-CA", { timeZone: TZ });
const ymdNY = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: TZ });

export async function academySettings() {
  const a: AcademySettings = (await getSettings()).academy ?? {};
  return {
    audience: a.audience ?? "preview", previewIds: a.previewIds ?? [], capeCount: (a.capeCount ?? 2) as 2 | 4,
    capes: a.capes ?? {}, captains: a.captains ?? {}, capeChats: a.capeChats ?? {}, borders: a.borders ?? "academy",
  };
}
export type AcademyConfig = Awaited<ReturnType<typeof academySettings>>;

/** Courage Academy is open to the whole team. */
export function canSeeAcademy(u: Pick<CurrentUser, "id" | "role">, a: AcademyConfig) {
  void u; void a;
  return true;
}
export async function requireAcademy(u: Pick<CurrentUser, "id" | "role">) {
  const a = await academySettings();
  if (!canSeeAcademy(u, a)) notFound();
  return a;
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

type Range = { startsOn: string; endsOn: string } | null;
const rangeOf = (s: Range) => s
  ? { start: fromZonedTime(`${s.startsOn}T00:00`, TZ), end: new Date(fromZonedTime(`${s.endsOn}T00:00`, TZ).getTime() + 86400000) }
  : { start: new Date("2000-01-01T00:00:00Z"), end: new Date("2100-01-01T00:00:00Z") };

export type Breakdown = {
  tasks: number; meetings: number; shifts: number; shoutGiven: number; shoutGot: number; planesSent: number; planesGot: number;
  duelWins: number; dailyCorrect: number; streakWeeks: number; missions: number; bonus: number; total: number;
};
const empty = (): Breakdown => ({ tasks: 0, meetings: 0, shifts: 0, shoutGiven: 0, shoutGot: 0, planesSent: 0, planesGot: 0, duelWins: 0, dailyCorrect: 0, streakWeeks: 0, missions: 0, bonus: 0, total: 0 });

/** Monday (NY) of the week containing a date, as YYYY-MM-DD. */
function weekOf(d: Date) {
  const day = new Date(ymdNY(d) + "T12:00:00Z");
  const dow = (day.getUTCDay() + 6) % 7;
  day.setUTCDate(day.getUTCDate() - dow);
  return day.toISOString().slice(0, 10);
}

/**
 * On-time streaks, by week (Mon–Sun, Eastern). A week counts when you had at least one task due and finished on time and none late;
 * weeks with nothing due don't break a streak. Returns each person's current streak and the bonus weeks (3rd in a row onward).
 */
export async function streaks(): Promise<Map<string, { current: number; best: number; bonusWeeks: string[] }>> {
  const since = new Date(Date.now() - 400 * 86400000).toISOString();
  const rows = (await db.execute(sql`
    select ta.user_id, t.due_at,
      (t.first_submitted_at is not null and t.first_submitted_at <= t.due_at and t.status in ('submitted','under_review','approved')) as on_time,
      (t.due_at < now() and (t.first_submitted_at is null or t.first_submitted_at > t.due_at) and t.status not in ('canceled','excused')) as late
    from tasks t join task_assignees ta on ta.task_id = t.id
    where t.due_at is not null and t.due_at >= ${since} and t.due_at < now() + interval '7 days'`)) as unknown as { user_id: string; due_at: string | Date; on_time: boolean; late: boolean }[];
  const byUser = new Map<string, Map<string, { ok: number; late: number }>>();
  for (const r of rows) {
    const wk = weekOf(new Date(r.due_at));
    const m = byUser.get(r.user_id) ?? new Map();
    const w = m.get(wk) ?? { ok: 0, late: 0 };
    if (r.on_time) w.ok++;
    if (r.late) w.late++;
    m.set(wk, w); byUser.set(r.user_id, m);
  }
  const thisWeek = weekOf(new Date());
  const out = new Map<string, { current: number; best: number; bonusWeeks: string[] }>();
  for (const [uid, weeks] of byUser) {
    let run = 0, best = 0;
    const bonusWeeks: string[] = [];
    for (const wk of [...weeks.keys()].sort()) {
      const w = weeks.get(wk)!;
      if (w.late > 0) { if (wk !== thisWeek || w.ok === 0) run = 0; continue; }
      if (w.ok > 0) { run++; best = Math.max(best, run); if (run >= STREAK_BONUS_FROM) bonusWeeks.push(wk); }
    }
    out.set(uid, { current: run, best, bonusWeeks });
  }
  return out;
}

/** Points per person for a season (or all time when season is null). */
export async function pointsByUser(season: Range): Promise<Map<string, Breakdown>> {
  const { start, end } = rangeOf(season);
  const s = start.toISOString(), e = end.toISOString();
  const [rows, st] = await Promise.all([db.execute(sql`
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
      select winner_id, 'duelWins', sum(least(n, ${DUEL_WINS_PER_DAY})) from (
        select winner_id, (finished_at at time zone 'America/New_York')::date as d, count(*) as n from trivia_duels
        where status = 'done' and winner_id is not null and finished_at >= ${s} and finished_at < ${e} group by 1, 2) w group by winner_id
      union all
      select user_id, 'dailyCorrect', count(*) from trivia_daily_answers where correct and created_at >= ${s} and created_at < ${e} group by user_id
      union all
      select user_id, case when source = 'mission' then 'missions' else 'bonus' end, sum(points) from cape_bonuses
        where user_id is not null and created_at >= ${s} and created_at < ${e} group by user_id, source
    ) x group by user_id, kind`), streaks()]);
  const map = new Map<string, Breakdown>();
  for (const r of rows as unknown as { user_id: string; kind: keyof Breakdown; n: number }[]) {
    if (!r.user_id) continue;
    const b = map.get(r.user_id) ?? empty();
    b[r.kind] = (b[r.kind] ?? 0) + Number(r.n);
    map.set(r.user_id, b);
  }
  const sWeek = season ? weekOf(start) : "0000", eDay = season ? season.endsOn : "9999";
  for (const [uid, info] of st) {
    const n = info.bonusWeeks.filter((w) => w >= sWeek && w <= eDay).length;
    if (!n) continue;
    const b = map.get(uid) ?? empty();
    b.streakWeeks = n;
    map.set(uid, b);
  }
  for (const b of map.values()) {
    b.total = b.tasks * POINTS.taskOnTime + b.meetings * POINTS.meeting + b.shifts * POINTS.shift + b.shoutGiven * POINTS.shoutGiven + b.shoutGot * POINTS.shoutGot
      + b.planesSent * POINTS.planeSent + b.planesGot * POINTS.planeGot + b.duelWins * POINTS.duelWin + b.dailyCorrect * POINTS.dailyCorrect
      + b.streakWeeks * POINTS.streakWeek + b.missions + b.bonus;
  }
  return map;
}
export const pointsOf = (m: Map<string, Breakdown>, id: string) => m.get(id) ?? empty();

export type Standing = { cape: Cape; members: number; total: number; capeBonus: number; average: number };
/** Cape scores: average points per member, plus any bonus given to the whole Cape. */
export async function standings(season: Range, capeCount: 2 | 4, pts?: Map<string, Breakdown>) {
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

const monthNY = (d = new Date()) => ymdNY(d).slice(0, 7);
function prevMonthRange(month: string): { startsOn: string; endsOn: string } {
  const [y, m] = month.split("-").map(Number);
  const first = new Date(Date.UTC(y, m - 2, 1)), last = new Date(Date.UTC(y, m - 1, 0));
  return { startsOn: first.toISOString().slice(0, 10), endsOn: last.toISOString().slice(0, 10) };
}

/**
 * This month's captain for each Cape. Captains rotate monthly: the member with the most points last month
 * (not last month's captain, when someone else is around). An admin can pick one instead.
 */
export async function captains(a: AcademyConfig): Promise<Partial<Record<Cape, string>>> {
  const month = monthNY();
  const members = await db.select({ id: users.id, name: users.name, cape: users.cape }).from(users).where(and(eq(users.status, "active"), isNotNull(users.cape)));
  const out: Partial<Record<Cape, string>> = {};
  const updates: AcademySettings["captains"] = { ...a.captains };
  let changed = false, pts: Map<string, Breakdown> | null = null;
  for (const cape of activeCapes(a.capeCount)) {
    const mine = members.filter((m) => m.cape === cape);
    const cur = a.captains[cape];
    if (cur && cur.month === month && mine.some((m) => m.id === cur.userId)) { out[cape] = cur.userId; continue; }
    if (!mine.length) continue;
    pts ??= await pointsByUser(prevMonthRange(month));
    const ranked = [...mine].sort((x, y) => pointsOf(pts!, y.id).total - pointsOf(pts!, x.id).total || x.name.localeCompare(y.name));
    const pick = ranked.find((m) => m.id !== cur?.userId) ?? ranked[0];
    out[cape] = pick.id;
    updates[cape] = { userId: pick.id, month };
    changed = true;
  }
  if (changed) await saveSettings({ academy: { ...(await getSettings()).academy, captains: updates } });
  return out;
}

/** The top-voted motto per Cape (falls back to the default). */
export async function mottos(): Promise<{ list: { id: string; cape: string; text: string; votes: number; createdById: string | null }[] }> {
  const rows = await db.select({ id: capeMottos.id, cape: capeMottos.cape, text: capeMottos.text, createdById: capeMottos.createdById, votes: sql<number>`(select count(*)::int from ${capeMottoVotes} v where v.motto_id = ${capeMottos.id})` })
    .from(capeMottos).orderBy(desc(capeMottos.createdAt));
  return { list: rows.map((r) => ({ ...r, votes: Number(r.votes) })) };
}
export function topMotto(list: { cape: string; text: string; votes: number }[], cape: Cape) {
  const best = list.filter((m) => m.cape === cape && m.votes > 0).sort((a, b) => b.votes - a.votes)[0];
  return best?.text ?? null;
}

export async function currentChallenge() {
  const t = todayNY();
  return (await db.select().from(academyChallenges).where(and(lte(academyChallenges.startsOn, t), gte(academyChallenges.endsOn, t), isNull(academyChallenges.winnerCape))).orderBy(desc(academyChallenges.startsOn)).limit(1))[0] ?? null;
}

/** Trophies a Cape has won: seasons and decided weekly challenges. */
export async function trophies(capeCount: 2 | 4) {
  const [seasons, challenges] = await Promise.all([
    db.select().from(capeSeasons).where(sql`${capeSeasons.endsOn} < ${todayNY()}`).orderBy(desc(capeSeasons.endsOn)).limit(12),
    db.select().from(academyChallenges).where(isNotNull(academyChallenges.winnerCape)).orderBy(desc(academyChallenges.decidedAt)).limit(40),
  ]);
  const seasonWins = await Promise.all(seasons.map(async (s) => ({ season: s, winner: (await standings(s, capeCount))[0] })));
  return {
    seasons: seasonWins.filter((x) => x.winner && x.winner.average > 0).map((x) => ({ id: x.season.id, name: x.season.name, cape: x.winner.cape })),
    challenges: challenges.map((c) => ({ id: c.id, title: c.title, cape: c.winnerCape as Cape })),
  };
}

export async function capeMembers(cape: Cape) {
  return db.select({ id: users.id, name: users.name, title: users.title, avatarFileId: users.avatarFileId, hero: users.hero, sortedAt: users.sortedAt })
    .from(users).where(and(eq(users.status, "active"), eq(users.cape, cape))).orderBy(users.name);
}

export async function usersByIds(ids: string[]) {
  if (!ids.length) return [];
  return db.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, ids));
}

export { rankFor, CAPE_ORDER };
