import Link from "next/link";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { requireUser } from "@/server/auth";
import { canSeeAcademy, requireAcademy } from "@/server/academy";
import { activeNight, dailyQuestion, dailyStats, myDailyAnswer, myDuels, triviaStats } from "@/server/trivia";
import { Card, CardHeader } from "@/components/ui/card";
import { AcademyTabs } from "@/components/academy/tabs";
import { AcademyMusic, SoundControls } from "@/components/academy/music";
import { ChallengeButton, DailyQuestion, DeclineDuelButton } from "@/components/academy/trivia";
import { buttonClass } from "@/components/ui/button";
import { isCape } from "@/lib/academy";
import { TRIVIA_CATEGORIES } from "@/lib/trivia-bank";
import { cn } from "@/lib/cn";

export const metadata = { title: "Trivia" };

export default async function TriviaPage() {
  const me = await requireUser();
  const a = await requireAcademy(me);
  const [dq, duels, stats, night, people, [u]] = await Promise.all([
    dailyQuestion(), myDuels(me.id), triviaStats(me.id), activeNight(),
    db.select({ id: users.id, name: users.name, role: users.role }).from(users).where(eq(users.status, "active")).orderBy(users.name),
    db.select({ cape: users.cape }).from(users).where(eq(users.id, me.id)),
  ]);
  const [myAnswer, dStats] = dq ? await Promise.all([myDailyAnswer(me.id, dq.day), dailyStats(dq.day)]) : [null, null];
  const players = people.filter((p) => p.id !== me.id && canSeeAcademy({ id: p.id, role: p.role }, a)).map((p) => ({ id: p.id, name: p.name }));
  const yourTurn = duels.filter((d) => d.status === "waiting" && !d.myDone);
  const waiting = duels.filter((d) => d.status === "waiting" && d.myDone);
  const finished = duels.filter((d) => d.status !== "waiting").slice(0, 12);
  const fav = stats.favorite ? TRIVIA_CATEGORIES.find((c) => c.id === stats.favorite) : null;
  return (
    <>
      <AcademyMusic track="trivia" />
      <AcademyTabs myCape={u?.cape && isCape(u.cape) ? u.cape : null} admin={me.role === "admin"} />
      <header className="mb-6 flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1"><h1 className="text-2xl font-extrabold">🧠 Trivia</h1><p className="text-muted">Duel a teammate, answer the question of the day, and win points for your Cape.</p></div>
        <SoundControls track="trivia" />
      </header>
      {night && (
        <Link href="/academy/trivia/night" className="mb-6 flex items-center gap-3 rounded-2xl bg-[#02243d] px-5 py-4 text-white shadow-pop ring-2 ring-[#FED438]">
          <span className="text-3xl">🎤</span><span className="flex-1"><b className="block text-lg">{night.title}</b><span className="text-sm text-white/80">{night.status === "live" ? "Happening now. Jump in!" : "Starting soon. Get in the lobby!"}</span></span><span className="font-bold text-[#FED438]">Join →</span>
        </Link>
      )}
      <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
        <div className="space-y-6">
          <Card>
            <CardHeader title="⚔️ Duels" action={<ChallengeButton people={players} />} />
            <div className="space-y-5 px-5 pb-5">
              {yourTurn.length > 0 && (
                <section><h3 className="mb-2 text-sm font-semibold">Your turn</h3>
                  <ul className="space-y-2">{yourTurn.map((d) => (
                    <li key={d.id} className="flex items-center gap-3 rounded-xl border-2 border-accent bg-accent-soft px-3 py-2.5">
                      <span className="flex-1 text-sm"><b>{d.otherName}</b> {d.role === "opponent" ? "challenged you" : "is waiting on you"}{d.category ? ` · ${TRIVIA_CATEGORIES.find((c) => c.id === d.category)?.label}` : ""}</span>
                      {d.role === "opponent" && <DeclineDuelButton id={d.id} />}
                      <Link href={`/academy/trivia/duel/${d.id}`} className={buttonClass("primary", "sm")}>Play</Link>
                    </li>))}</ul></section>
              )}
              {waiting.length > 0 && (
                <section><h3 className="mb-2 text-sm font-semibold">Waiting for them</h3>
                  <ul className="space-y-1.5">{waiting.map((d) => <li key={d.id} className="flex items-center justify-between rounded-xl border border-line px-3 py-2 text-sm"><span>vs <b>{d.otherName}</b></span><span className="text-muted">You got {d.myScore}/5 · their turn</span></li>)}</ul></section>
              )}
              <section><h3 className="mb-2 text-sm font-semibold">Results</h3>
                {finished.length ? <ul className="space-y-1.5">{finished.map((d) => {
                  const res = d.status === "declined" ? "Declined" : d.status === "expired" ? "Expired" : d.winnerId === me.id ? "Won 🏆" : d.winnerId ? "Lost" : "Tie";
                  return <li key={d.id} className="flex items-center justify-between rounded-xl border border-line px-3 py-2 text-sm"><span>vs <b>{d.otherName}</b></span><span className={cn("font-semibold", d.winnerId === me.id ? "text-ok" : "text-muted")}>{d.status === "done" ? `${d.myScore}–${d.otherScore} · ` : ""}{res}</span></li>;
                })}</ul> : <p className="text-sm text-muted">No duels yet. Challenge someone!</p>}
              </section>
            </div>
          </Card>
          {dq && (
            <Card>
              <CardHeader title="📅 Question of the day" description={dStats ? `${dStats.answered} answered today · ${dStats.correct} got it right` : undefined} />
              <div className="px-5 pb-5"><DailyQuestion question={dq.q.question} choices={dq.q.choices} category={dq.q.category} done={myAnswer ? { choice: myAnswer.choice, correct: myAnswer.correct, answer: dq.q.answer } : null} /></div>
            </Card>
          )}
        </div>
        <aside className="space-y-6">
          <Card className="p-5">
            <h3 className="mb-3 font-semibold">Your trivia record</h3>
            <dl className="grid grid-cols-3 gap-2 text-center">
              <div className="rounded-xl bg-surface-2 p-2"><dt className="text-[11px] text-muted">Wins</dt><dd className="text-xl font-extrabold">{stats.wins}</dd></div>
              <div className="rounded-xl bg-surface-2 p-2"><dt className="text-[11px] text-muted">Losses</dt><dd className="text-xl font-extrabold">{stats.losses}</dd></div>
              <div className="rounded-xl bg-surface-2 p-2"><dt className="text-[11px] text-muted">Best run</dt><dd className="text-xl font-extrabold">{stats.bestStreak}</dd></div>
            </dl>
            {fav && <p className="mt-3 text-sm text-muted">Best category: <b className="text-fg">{fav.emoji} {fav.label}</b></p>}
          </Card>
          <Card className="p-5 text-sm text-fg-2">
            <h3 className="mb-2 font-semibold text-fg">How it works</h3>
            <ul className="space-y-1.5">
              <li>⚔️ Duels: 5 questions, 10 seconds each. Most right wins; ties go to the faster player. A win is +3 for you and your Cape (3 wins a day count).</li>
              <li>📅 Question of the day: one try, +2 if you&apos;re right.</li>
              <li>🎤 Trivia night: Capes face off live. The winning Cape gets +15.</li>
            </ul>
          </Card>
        </aside>
      </div>
    </>
  );
}
