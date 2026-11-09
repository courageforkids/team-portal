import "server-only";
import { and, desc, eq, gte, inArray, ne, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { triviaDaily, triviaDailyAnswers, triviaDuels, triviaNightAnswers, triviaNights, triviaQuestions, users } from "@/db/schema";
import { TRIVIA_BANK } from "@/lib/trivia-bank";
import { todayNY } from "./academy";

export const DUEL_QUESTIONS = 5;
export const DUEL_SECONDS = 10;
export const NIGHT_SECONDS = 15;
/** Network grace on top of the visible timer. */
export const GRACE_MS = 1500;
export const DUEL_EXPIRE_DAYS = 3;

/** Loads the starter questions the first time trivia is used. */
export async function ensureTriviaSeeded() {
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(triviaQuestions);
  if (Number(n) > 0) return;
  await db.insert(triviaQuestions).values(TRIVIA_BANK.map((q) => ({ category: q.category, question: q.question, choices: [...q.choices], answer: q.answer })));
}

export async function pickQuestions(count: number, category: string | null, avoid: string[] = []) {
  await ensureTriviaSeeded();
  const where = and(eq(triviaQuestions.active, true), category ? eq(triviaQuestions.category, category) : undefined,
    avoid.length ? sql`${triviaQuestions.id} not in (${sql.join(avoid.map((a) => sql`${a}`), sql`, `)})` : undefined);
  let rows = await db.select({ id: triviaQuestions.id }).from(triviaQuestions).where(where).orderBy(sql`random()`).limit(count);
  if (rows.length < count) rows = await db.select({ id: triviaQuestions.id }).from(triviaQuestions).where(and(eq(triviaQuestions.active, true), category ? eq(triviaQuestions.category, category) : undefined)).orderBy(sql`random()`).limit(count);
  return rows.map((r) => r.id);
}

export async function questionById(id: string) {
  return (await db.select().from(triviaQuestions).where(eq(triviaQuestions.id, id)))[0] ?? null;
}

/** Waiting duels older than a few days expire (no points). */
export async function expireOldDuels() {
  await db.update(triviaDuels).set({ status: "expired", finishedAt: new Date() })
    .where(and(eq(triviaDuels.status, "waiting"), sql`${triviaDuels.createdAt} < now() - (${DUEL_EXPIRE_DAYS} || ' days')::interval`));
}

export type DuelView = {
  id: string; role: "challenger" | "opponent"; otherId: string; otherName: string; status: string; category: string | null;
  myScore: number; otherScore: number | null; myDone: boolean; otherDone: boolean; winnerId: string | null; createdAt: string;
};

export async function myDuels(userId: string): Promise<DuelView[]> {
  await expireOldDuels();
  const rows = await db.select().from(triviaDuels)
    .where(and(or(eq(triviaDuels.challengerId, userId), eq(triviaDuels.opponentId, userId)), gte(triviaDuels.createdAt, new Date(Date.now() - 30 * 86400000))))
    .orderBy(desc(triviaDuels.createdAt)).limit(40);
  const ids = [...new Set(rows.flatMap((r) => [r.challengerId, r.opponentId]))];
  const names = ids.length ? await db.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, ids)) : [];
  return rows.map((d) => {
    const mine = d.challengerId === userId;
    const myA = mine ? d.challengerAnswers : d.opponentAnswers, otherA = mine ? d.opponentAnswers : d.challengerAnswers;
    const otherId = mine ? d.opponentId : d.challengerId;
    const myDone = myA.length >= DUEL_QUESTIONS, otherDone = otherA.length >= DUEL_QUESTIONS;
    return {
      id: d.id, role: mine ? "challenger" : "opponent", otherId, otherName: names.find((n) => n.id === otherId)?.name ?? "Former member",
      status: d.status, category: d.category, myScore: myA.filter((a) => a.correct).length,
      // Don't reveal the other score until you've played your turn.
      otherScore: myDone || d.status !== "waiting" ? otherA.filter((a) => a.correct).length : null,
      myDone, otherDone, winnerId: d.winnerId, createdAt: d.createdAt.toISOString(),
    };
  });
}

export async function triviaStats(userId: string) {
  const rows = await db.select({ winnerId: triviaDuels.winnerId, c: triviaDuels.challengerId, o: triviaDuels.opponentId, category: triviaDuels.category, finishedAt: triviaDuels.finishedAt })
    .from(triviaDuels).where(and(eq(triviaDuels.status, "done"), or(eq(triviaDuels.challengerId, userId), eq(triviaDuels.opponentId, userId)))).orderBy(triviaDuels.finishedAt);
  let wins = 0, losses = 0, run = 0, best = 0;
  const catWins = new Map<string, number>();
  for (const r of rows) {
    if (r.winnerId === userId) { wins++; run++; best = Math.max(best, run); if (r.category) catWins.set(r.category, (catWins.get(r.category) ?? 0) + 1); }
    else { if (r.winnerId) losses++; run = 0; }
  }
  const favorite = [...catWins.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  return { wins, losses, bestStreak: best, favorite };
}

/** Today's question for everyone (the same one all day). */
export async function dailyQuestion() {
  await ensureTriviaSeeded();
  const day = todayNY();
  let [row] = await db.select().from(triviaDaily).where(eq(triviaDaily.day, day));
  if (!row) {
    const recent = (await db.select({ q: triviaDaily.questionId }).from(triviaDaily).orderBy(desc(triviaDaily.day)).limit(60)).map((r) => r.q);
    const [qid] = await pickQuestions(1, null, recent);
    if (!qid) return null;
    await db.insert(triviaDaily).values({ day, questionId: qid }).onConflictDoNothing();
    [row] = await db.select().from(triviaDaily).where(eq(triviaDaily.day, day));
  }
  const q = await questionById(row.questionId);
  return q ? { day, q } : null;
}
export async function myDailyAnswer(userId: string, day: string) {
  return (await db.select().from(triviaDailyAnswers).where(and(eq(triviaDailyAnswers.day, day), eq(triviaDailyAnswers.userId, userId))))[0] ?? null;
}
export async function dailyStats(day: string) {
  const [r] = await db.select({ n: sql<number>`count(*)::int`, right: sql<number>`count(*) filter (where correct)::int` }).from(triviaDailyAnswers).where(eq(triviaDailyAnswers.day, day));
  return { answered: Number(r?.n ?? 0), correct: Number(r?.right ?? 0) };
}

export async function activeNight() {
  return (await db.select().from(triviaNights).where(ne(triviaNights.status, "done")).orderBy(desc(triviaNights.createdAt)).limit(1))[0] ?? null;
}
export async function lastNight() {
  return (await db.select().from(triviaNights).where(eq(triviaNights.status, "done")).orderBy(desc(triviaNights.createdAt)).limit(1))[0] ?? null;
}

/** Cape scores for a trivia night: average correct answers per player in that Cape. */
export async function nightScores(nightId: string) {
  const rows = await db.select({ cape: triviaNightAnswers.cape, userId: triviaNightAnswers.userId, correct: triviaNightAnswers.correct }).from(triviaNightAnswers).where(eq(triviaNightAnswers.nightId, nightId));
  const capes = new Map<string, { players: Set<string>; correct: number }>();
  for (const r of rows) {
    if (!r.cape) continue;
    const c = capes.get(r.cape) ?? { players: new Set(), correct: 0 };
    c.players.add(r.userId);
    if (r.correct) c.correct++;
    capes.set(r.cape, c);
  }
  return [...capes.entries()].map(([cape, c]) => ({ cape, players: c.players.size, correct: c.correct, average: Math.round((c.correct / Math.max(1, c.players.size)) * 10) / 10 }))
    .sort((a, b) => b.average - a.average);
}
