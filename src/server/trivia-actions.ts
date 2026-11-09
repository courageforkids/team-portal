"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { and, eq, gte, ne, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { capeBonuses, triviaDailyAnswers, triviaDuels, triviaNightAnswers, triviaNights, triviaQuestions, users, type DuelAnswer } from "@/db/schema";
import { actionAdmin, actionUser } from "./auth";
import { academySettings, canSeeAcademy } from "./academy";
import { notify } from "./notify";
import { audit } from "./audit";
import { safe, str, UserError } from "./safe-action";
import {
  activeNight, dailyQuestion, DUEL_QUESTIONS, DUEL_SECONDS, ensureTriviaSeeded, GRACE_MS, myDailyAnswer, NIGHT_SECONDS, nightScores, pickQuestions, questionById,
} from "./trivia";
import { capeLabel, isCape } from "@/lib/academy";
import { TRIVIA_CATEGORIES } from "@/lib/trivia-bank";
import type { ActionResult } from "@/lib/action";

const uuid = z.string().uuid();
const isCategory = (c: string) => TRIVIA_CATEGORIES.some((x) => x.id === c);

async function player() {
  const me = await actionUser();
  const a = await academySettings();
  if (!canSeeAcademy(me, a)) throw new UserError("Courage Academy isn't open yet.");
  return { me, a };
}

/* ───── Duels ───── */

export async function challengeAction(opponentId: string, category: string | null): Promise<ActionResult<{ id: string }>> {
  return safe(async () => {
    const { me, a } = await player();
    const oid = uuid.parse(opponentId);
    if (oid === me.id) throw new UserError("Pick someone else to duel.");
    const [opp] = await db.select({ id: users.id, name: users.name, role: users.role }).from(users).where(and(eq(users.id, oid), eq(users.status, "active")));
    if (!opp || !canSeeAcademy({ id: opp.id, role: opp.role }, a)) throw new UserError("That teammate can't play yet.");
    const cat = category && isCategory(category) ? category : null;
    const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(triviaDuels).where(and(eq(triviaDuels.challengerId, me.id), gte(triviaDuels.createdAt, new Date(Date.now() - 86400000))));
    if (Number(n) >= 10) throw new UserError("That's 10 duels today. Come back tomorrow for more!");
    const open = await db.select({ id: triviaDuels.id }).from(triviaDuels).where(and(eq(triviaDuels.status, "waiting"),
      or(and(eq(triviaDuels.challengerId, me.id), eq(triviaDuels.opponentId, oid)), and(eq(triviaDuels.challengerId, oid), eq(triviaDuels.opponentId, me.id))))).limit(1);
    if (open.length) return { ok: true, data: { id: open[0].id }, message: `You already have a duel going with ${opp.name.split(" ")[0]}.` };
    const questionIds = await pickQuestions(DUEL_QUESTIONS, cat);
    if (questionIds.length < DUEL_QUESTIONS) throw new UserError("There aren't enough questions in that category yet.");
    const [d] = await db.insert(triviaDuels).values({ challengerId: me.id, opponentId: oid, category: cat, questionIds }).returning({ id: triviaDuels.id });
    await notify([oid], { type: "academy", title: `⚔️ ${me.name.split(" ")[0]} challenged you to a trivia duel!`, body: "5 questions, 10 seconds each. Play when you're ready.", href: `/academy/trivia/duel/${d.id}` });
    revalidatePath("/academy/trivia");
    return { ok: true, data: { id: d.id } };
  });
}

type Served = { index: number; total: number; question: string; choices: string[]; category: string; remainingMs: number } | { done: true };

async function loadDuelFor(meId: string, duelId: string) {
  const [d] = await db.select().from(triviaDuels).where(eq(triviaDuels.id, uuid.parse(duelId)));
  if (!d || (d.challengerId !== meId && d.opponentId !== meId)) throw new UserError("That duel wasn't found.");
  const role = d.challengerId === meId ? "challenger" : "opponent";
  return { d, role: role as "challenger" | "opponent", answers: role === "challenger" ? d.challengerAnswers : d.opponentAnswers, servedAt: role === "challenger" ? d.challengerServedAt : d.opponentServedAt };
}

/** Serves your next question and starts its timer (reloading doesn't reset the timer). */
export async function nextDuelQuestionAction(duelId: string): Promise<ActionResult<Served>> {
  return safe<Served>(async () => {
    const { me } = await player();
    const { d, role, answers, servedAt } = await loadDuelFor(me.id, duelId);
    if (d.status === "declined" || d.status === "expired") throw new UserError(d.status === "declined" ? "This duel was declined." : "This duel expired.");
    if (answers.length >= DUEL_QUESTIONS) return { ok: true, data: { done: true } };
    let started = servedAt;
    if (!started) {
      started = new Date();
      await db.update(triviaDuels).set(role === "challenger" ? { challengerServedAt: started } : { opponentServedAt: started }).where(eq(triviaDuels.id, d.id));
    }
    const q = await questionById(d.questionIds[answers.length]);
    if (!q) throw new UserError("That question is missing.");
    return { ok: true, data: { index: answers.length, total: DUEL_QUESTIONS, question: q.question, choices: q.choices, category: q.category, remainingMs: Math.max(0, DUEL_SECONDS * 1000 - (Date.now() - started.getTime())) } };
  });
}

export async function answerDuelAction(duelId: string, choice: number): Promise<ActionResult<{ correct: boolean; answer: number; score: number; finished: boolean; result?: "won" | "lost" | "tie" | "waiting" }>> {
  return safe(async () => {
    const { me } = await player();
    const { d, role, answers, servedAt } = await loadDuelFor(me.id, duelId);
    if (!servedAt) throw new UserError("Load the question first.");
    if (answers.length >= DUEL_QUESTIONS) throw new UserError("You've already finished this duel.");
    const q = await questionById(d.questionIds[answers.length]);
    if (!q) throw new UserError("That question is missing.");
    const ms = Date.now() - servedAt.getTime();
    const inTime = ms <= DUEL_SECONDS * 1000 + GRACE_MS;
    const pick = Number.isInteger(choice) && choice >= 0 && choice < q.choices.length && inTime ? choice : -1;
    const entry: DuelAnswer = { choice: pick, correct: pick === q.answer, ms: Math.min(ms, DUEL_SECONDS * 1000) };
    const next = [...answers, entry];
    const col = role === "challenger" ? triviaDuels.challengerAnswers : triviaDuels.opponentAnswers;
    // Only one answer per question, even if two taps race.
    const updated = await db.update(triviaDuels).set(role === "challenger" ? { challengerAnswers: next, challengerServedAt: null } : { opponentAnswers: next, opponentServedAt: null })
      .where(and(eq(triviaDuels.id, d.id), sql`jsonb_array_length(${col}) = ${answers.length}`)).returning();
    if (!updated.length) throw new UserError("That answer was already counted.");
    const score = next.filter((a) => a.correct).length;
    const finished = next.length >= DUEL_QUESTIONS;
    let result: "won" | "lost" | "tie" | "waiting" | undefined;
    if (finished) {
      const other = role === "challenger" ? updated[0].opponentAnswers : updated[0].challengerAnswers;
      const otherId = role === "challenger" ? d.opponentId : d.challengerId;
      if (other.length >= DUEL_QUESTIONS && d.status === "waiting") {
        const os = other.filter((a) => a.correct).length;
        const myMs = next.filter((a) => a.correct).reduce((s, a) => s + a.ms, 0), oMs = other.filter((a) => a.correct).reduce((s, a) => s + a.ms, 0);
        const winnerId = score > os ? me.id : os > score ? otherId : score === 0 ? null : myMs < oMs ? me.id : oMs < myMs ? otherId : null;
        await db.update(triviaDuels).set({ status: "done", winnerId, finishedAt: new Date() }).where(and(eq(triviaDuels.id, d.id), eq(triviaDuels.status, "waiting")));
        result = winnerId === me.id ? "won" : winnerId ? "lost" : "tie";
        const verdict = winnerId === otherId ? "You won! 🏆" : winnerId === me.id ? `${me.name.split(" ")[0]} won this one.` : "It's a tie!";
        await notify([otherId], { type: "academy", title: `⚔️ Trivia duel finished: ${os}–${score}`, body: verdict, href: `/academy/trivia/duel/${d.id}` });
      } else {
        result = "waiting";
      }
      revalidatePath("/academy/trivia");
    }
    return { ok: true, data: { correct: entry.correct, answer: q.answer, score, finished, result } };
  });
}

export async function declineDuelAction(duelId: string): Promise<ActionResult> {
  return safe(async () => {
    const { me } = await player();
    const [d] = await db.update(triviaDuels).set({ status: "declined", finishedAt: new Date() })
      .where(and(eq(triviaDuels.id, uuid.parse(duelId)), eq(triviaDuels.opponentId, me.id), eq(triviaDuels.status, "waiting"))).returning();
    if (!d) throw new UserError("That duel can't be declined.");
    revalidatePath("/academy/trivia");
    return { ok: true, message: "Duel declined." };
  });
}

/* ───── Daily question ───── */

export async function answerDailyAction(choice: number): Promise<ActionResult<{ correct: boolean; answer: number }>> {
  return safe(async () => {
    const { me } = await player();
    const dq = await dailyQuestion();
    if (!dq) throw new UserError("No question today.");
    if (await myDailyAnswer(me.id, dq.day)) throw new UserError("You already answered today's question. Come back tomorrow!");
    const pick = Number.isInteger(choice) && choice >= 0 && choice < dq.q.choices.length ? choice : -1;
    const correct = pick === dq.q.answer;
    await db.insert(triviaDailyAnswers).values({ day: dq.day, userId: me.id, choice: pick, correct }).onConflictDoNothing();
    revalidatePath("/academy", "layout");
    return { ok: true, data: { correct, answer: dq.q.answer } };
  });
}

/* ───── Trivia night (live, hosted by an admin) ───── */

export async function createNightAction(_: unknown, fd: FormData): Promise<ActionResult> {
  return safe(async () => {
    const me = await actionAdmin();
    if (await activeNight()) throw new UserError("A trivia night is already set up. End it first.");
    const title = str(fd, "title").slice(0, 60) || "Trivia Night";
    const cat = str(fd, "category");
    const count = Math.min(20, Math.max(5, Math.floor(Number(str(fd, "count") || "10"))));
    const questionIds = await pickQuestions(count, cat && isCategory(cat) ? cat : null);
    await db.insert(triviaNights).values({ title, questionIds, createdById: me.id });
    await audit(me.id, "trivia.night_created", "trivia_night", title);
    revalidatePath("/academy/trivia", "layout");
    return { ok: true, message: "Trivia night is set up. Open the host screen when everyone's ready." };
  });
}

/** Host controls: start, next question, or end. */
export async function hostNightAction(nightId: string, step: "start" | "next" | "end"): Promise<ActionResult> {
  return safe(async () => {
    const me = await actionAdmin();
    const a = await academySettings();
    const [n] = await db.select().from(triviaNights).where(and(eq(triviaNights.id, uuid.parse(nightId)), ne(triviaNights.status, "done")));
    if (!n) throw new UserError("That trivia night is over.");
    const finish = async () => {
      const scores = await nightScores(n.id);
      const top = scores[0] && scores[0].average > 0 && (scores.length < 2 || scores[0].average > scores[1].average) ? scores[0].cape : null;
      await db.update(triviaNights).set({ status: "done", winnerCape: top, questionStartedAt: null }).where(eq(triviaNights.id, n.id));
      if (top && isCape(top)) {
        await db.insert(capeBonuses).values({ cape: top, points: 15, reason: `Won ${n.title}`, source: "trivia", createdById: me.id });
        const winners = await db.select({ id: users.id }).from(users).where(and(eq(users.status, "active"), eq(users.cape, top)));
        await notify(winners.map((w) => w.id), { type: "academy", title: `🧠 The ${capeLabel(top, a.capes)} won ${n.title}!`, body: "+15 for your Cape.", href: "/academy/trivia" });
      }
      await audit(me.id, "trivia.night_ended", "trivia_night", n.id, { winner: top });
    };
    if (step === "end") await finish();
    else if (step === "start" && n.status === "lobby") await db.update(triviaNights).set({ status: "live", current: 0, questionStartedAt: new Date() }).where(eq(triviaNights.id, n.id));
    else if (step === "next" && n.status === "live") {
      if (n.current + 1 >= n.questionIds.length) await finish();
      else await db.update(triviaNights).set({ current: n.current + 1, questionStartedAt: new Date() }).where(eq(triviaNights.id, n.id));
    }
    revalidatePath("/academy/trivia", "layout");
    return { ok: true };
  });
}

export async function answerNightAction(nightId: string, qIndex: number, choice: number): Promise<ActionResult<{ correct: boolean }>> {
  return safe(async () => {
    const { me } = await player();
    const [n] = await db.select().from(triviaNights).where(eq(triviaNights.id, uuid.parse(nightId)));
    if (!n || n.status !== "live" || n.current !== qIndex || !n.questionStartedAt) throw new UserError("That question is closed.");
    const ms = Date.now() - n.questionStartedAt.getTime();
    if (ms > NIGHT_SECONDS * 1000 + GRACE_MS) throw new UserError("Time's up for that one!");
    const q = await questionById(n.questionIds[qIndex]);
    if (!q) throw new UserError("That question is missing.");
    const [u] = await db.select({ cape: users.cape }).from(users).where(eq(users.id, me.id));
    if (!u?.cape) throw new UserError("Get sorted into a Cape to play trivia night.");
    const pick = Number.isInteger(choice) && choice >= 0 && choice < q.choices.length ? choice : -1;
    const ins = await db.insert(triviaNightAnswers).values({ nightId: n.id, qIndex, userId: me.id, cape: u.cape, choice: pick, correct: pick === q.answer, ms }).onConflictDoNothing().returning();
    if (!ins.length) throw new UserError("You already answered this one.");
    return { ok: true, data: { correct: pick === q.answer } };
  });
}

/* ───── Questions (admin) ───── */

export async function addQuestionAction(_: unknown, fd: FormData): Promise<ActionResult> {
  return safe(async () => {
    const me = await actionAdmin();
    await ensureTriviaSeeded();
    const category = str(fd, "category");
    if (!isCategory(category)) throw new UserError("Pick a category.");
    const question = str(fd, "question").slice(0, 140);
    const choices = [0, 1, 2, 3].map((i) => str(fd, `choice${i}`).slice(0, 40));
    if (question.length < 5) throw new UserError("Write the question.");
    if (choices.some((c) => !c)) throw new UserError("Fill in all four answers.");
    if (new Set(choices.map((c) => c.toLowerCase())).size < 4) throw new UserError("The four answers need to be different.");
    const answer = Number(str(fd, "answer"));
    if (![0, 1, 2, 3].includes(answer)) throw new UserError("Mark which answer is right.");
    await db.insert(triviaQuestions).values({ category, question, choices, answer, createdById: me.id });
    revalidatePath("/academy/trivia", "layout");
    return { ok: true, message: "Question added." };
  });
}

export async function toggleQuestionAction(id: string, active: boolean): Promise<ActionResult> {
  return safe(async () => {
    await actionAdmin();
    await db.update(triviaQuestions).set({ active }).where(eq(triviaQuestions.id, uuid.parse(id)));
    revalidatePath("/academy/trivia", "layout");
    return { ok: true, message: active ? "Question turned on." : "Question turned off." };
  });
}
