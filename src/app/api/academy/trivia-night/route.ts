import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { triviaNightAnswers, users } from "@/db/schema";
import { getCurrentUser } from "@/server/auth";
import { academySettings, canSeeAcademy } from "@/server/academy";
import { activeNight, lastNight, NIGHT_SECONDS, nightScores, questionById } from "@/server/trivia";

export const dynamic = "force-dynamic";

/** Live state of trivia night for players and the host (polled every ~1.5s). The right answer is only sent after time is up. */
export async function GET() {
  const me = await getCurrentUser();
  if (!me) return Response.json({ error: "signed_out" }, { status: 401 });
  if (!canSeeAcademy(me, await academySettings())) return Response.json({ night: null });
  const n = (await activeNight()) ?? null;
  if (!n) {
    const last = await lastNight();
    return Response.json({ night: null, last: last ? { id: last.id, title: last.title, winnerCape: last.winnerCape, scores: await nightScores(last.id) } : null }, { headers: { "Cache-Control": "no-store" } });
  }
  const [u] = await db.select({ cape: users.cape }).from(users).where(eq(users.id, me.id));
  let question = null;
  if (n.status === "live" && n.current >= 0 && n.questionStartedAt) {
    const q = await questionById(n.questionIds[n.current]);
    const remainingMs = Math.max(0, NIGHT_SECONDS * 1000 - (Date.now() - n.questionStartedAt.getTime()));
    const mine = (await db.select().from(triviaNightAnswers).where(and(eq(triviaNightAnswers.nightId, n.id), eq(triviaNightAnswers.qIndex, n.current), eq(triviaNightAnswers.userId, me.id))))[0];
    const answers = remainingMs === 0 ? await db.select({ cape: triviaNightAnswers.cape, correct: triviaNightAnswers.correct }).from(triviaNightAnswers).where(and(eq(triviaNightAnswers.nightId, n.id), eq(triviaNightAnswers.qIndex, n.current))) : [];
    question = q ? {
      index: n.current, total: n.questionIds.length, text: q.question, choices: q.choices, category: q.category, remainingMs,
      myChoice: mine?.choice ?? null, answer: remainingMs === 0 ? q.answer : null,
      answeredCount: answers.length, correctCount: answers.filter((a) => a.correct).length,
    } : null;
  }
  return Response.json({
    night: { id: n.id, title: n.title, status: n.status, total: n.questionIds.length, current: n.current },
    question, myCape: u?.cape ?? null, scores: await nightScores(n.id), host: me.role === "admin",
  }, { headers: { "Cache-Control": "no-store" } });
}
