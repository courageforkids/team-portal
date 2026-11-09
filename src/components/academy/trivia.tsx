"use client";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Swords } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { Select } from "@/components/ui/form";
import { buttonClass } from "@/components/ui/button";
import { useToast } from "@/components/ui/toaster";
import { cn } from "@/lib/cn";
import { sfx, unlockAudio } from "@/lib/music";
import { CAPES, isCape } from "@/lib/academy";
import { TRIVIA_CATEGORIES } from "@/lib/trivia-bank";
import { fireEffect } from "./effects";
import { answerDailyAction, answerDuelAction, answerNightAction, challengeAction, declineDuelAction, hostNightAction, nextDuelQuestionAction } from "@/server/trivia-actions";

const catOf = (id: string) => TRIVIA_CATEGORIES.find((c) => c.id === id);
const LETTERS = ["A", "B", "C", "D"];

function Choices({ choices, picked, answer, disabled, onPick }: { choices: string[]; picked: number | null; answer: number | null; disabled: boolean; onPick: (i: number) => void }) {
  return (
    <div className="grid gap-2.5 sm:grid-cols-2">
      {choices.map((c, i) => {
        const right = answer !== null && i === answer, wrong = answer !== null && picked === i && i !== answer;
        return (
          <button key={i} type="button" disabled={disabled} onClick={() => onPick(i)}
            className={cn("flex min-h-14 items-center gap-3 rounded-2xl border-2 px-4 py-3 text-left text-[15px] font-semibold transition active:scale-[.98]",
              right ? "border-ok bg-ok-soft text-ok" : wrong ? "border-bad bg-bad-soft text-bad" : picked === i ? "border-brand bg-brand-soft" : "border-line bg-surface hover:border-brand/50",
              disabled && answer === null && picked !== i && "opacity-60")}>
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-surface-2 text-sm font-extrabold">{LETTERS[i]}</span>{c}
          </button>
        );
      })}
    </div>
  );
}

function TimerBar({ ms, total }: { ms: number; total: number }) {
  const pct = Math.max(0, Math.min(100, (ms / total) * 100));
  return (
    <div className="h-2.5 overflow-hidden rounded-full bg-surface-2" role="timer" aria-label={`${Math.ceil(ms / 1000)} seconds left`}>
      <div className={cn("h-full rounded-full transition-[width] duration-200 ease-linear", pct < 30 ? "bg-bad" : pct < 60 ? "bg-warn" : "bg-ok")} style={{ width: `${pct}%` }} />
    </div>
  );
}

/* ───── Daily question ───── */

export function DailyQuestion({ question, choices, category, done }: { question: string; choices: string[]; category: string; done: { choice: number; correct: boolean; answer: number } | null }) {
  const [state, setState] = useState(done);
  const [busy, start] = useTransition();
  const toast = useToast();
  const router = useRouter();
  const pick = (i: number) => start(async () => {
    const r = await answerDailyAction(i);
    if (!r.ok) { toast.push("error", r.error); return; }
    setState({ choice: i, correct: r.data!.correct, answer: r.data!.answer });
    if (r.data!.correct) { sfx.correct(); fireEffect("confetti", { sound: false }); } else sfx.wrong();
    router.refresh();
  });
  const c = catOf(category);
  return (
    <div>
      <div className="mb-1 text-xs font-bold uppercase tracking-wider text-muted">{c?.emoji} {c?.label}</div>
      <p className="mb-4 text-lg font-bold leading-snug">{question}</p>
      <Choices choices={choices} picked={state?.choice ?? null} answer={state?.answer ?? null} disabled={busy || !!state} onPick={pick} />
      {state && <p className={cn("mt-3 text-sm font-semibold", state.correct ? "text-ok" : "text-muted")}>{state.correct ? "Correct! +2 for your Cape. 🎉" : "Not this time. New question tomorrow!"}</p>}
    </div>
  );
}

/* ───── Duels ───── */

export function ChallengeButton({ people, defaultTo, label = "Challenge someone", className }: { people: { id: string; name: string }[]; defaultTo?: string; label?: string; className?: string }) {
  const [open, setOpen] = useState(false);
  const [to, setTo] = useState(defaultTo ?? "");
  const [cat, setCat] = useState("");
  const [busy, start] = useTransition();
  const toast = useToast();
  const router = useRouter();
  const go = () => start(async () => {
    const r = await challengeAction(to, cat || null);
    if (!r.ok) { toast.push("error", r.error); return; }
    if (r.message) toast.push("success", r.message);
    router.push(`/academy/trivia/duel/${r.data!.id}`);
  });
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={className ?? buttonClass("primary")}><Swords className="h-4 w-4" aria-hidden />{label}</button>
      <Dialog open={open} onClose={() => setOpen(false)} title="Trivia duel" description="5 questions, 10 seconds each. You play now; they play when they can." size="sm">
        <div className="space-y-4">
          <div><label className="label" htmlFor="du-to">Challenge</label>
            <Select id="du-to" value={to} onChange={(e) => setTo(e.target.value)}><option value="" disabled>Choose a teammate</option>{people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select></div>
          <fieldset><legend className="label">Category</legend>
            <div className="flex flex-wrap gap-1.5">
              {[{ id: "", label: "Mix", emoji: "🎲" }, ...TRIVIA_CATEGORIES].map((c) => (
                <button key={c.id} type="button" aria-pressed={cat === c.id} onClick={() => setCat(c.id)} className={cn("rounded-full border px-3 py-1.5 text-sm font-semibold", cat === c.id ? "border-brand bg-brand-soft text-brand-ink" : "border-line")}>{c.emoji} {c.label}</button>
              ))}
            </div></fieldset>
          <div className="flex justify-end"><button type="button" disabled={!to || busy} onClick={go} className={buttonClass("primary")}><Swords className="h-4 w-4" />{busy ? "Starting…" : "Start duel"}</button></div>
        </div>
      </Dialog>
    </>
  );
}

export function DeclineDuelButton({ id }: { id: string }) {
  const [busy, start] = useTransition();
  const router = useRouter();
  return <button type="button" disabled={busy} onClick={() => start(async () => { await declineDuelAction(id); router.refresh(); })} className="text-xs font-semibold text-muted underline">Decline</button>;
}

type Q = { index: number; total: number; question: string; choices: string[]; category: string; remainingMs: number };
export function DuelPlay({ duelId, otherName, alreadyDone, startScore }: { duelId: string; otherName: string; alreadyDone: boolean; startScore: number }) {
  const [phase, setPhase] = useState<"intro" | "q" | "end">(alreadyDone ? "end" : "intro");
  const [q, setQ] = useState<Q | null>(null);
  const [left, setLeft] = useState(10000);
  const [picked, setPicked] = useState<number | null>(null);
  const [answer, setAnswer] = useState<number | null>(null);
  const [score, setScore] = useState(startScore);
  const [result, setResult] = useState<string | null>(null);
  const clock = useRef<{ stop(): void } | null>(null);
  const deadline = useRef(0);
  const sent = useRef(false);
  const toast = useToast();
  const router = useRouter();

  const load = useCallback(async () => {
    setPicked(null); setAnswer(null); sent.current = false;
    const r = await nextDuelQuestionAction(duelId);
    if (!r.ok) { toast.push("error", r.error); return; }
    if ("done" in r.data!) { setPhase("end"); return; }
    const d = r.data as Q;
    setQ(d); setPhase("q");
    deadline.current = Date.now() + d.remainingMs; setLeft(d.remainingMs);
    clock.current?.stop(); clock.current = sfx.clockStart(Math.ceil(d.remainingMs / 1000));
  }, [duelId, toast]);

  const submit = useCallback(async (i: number) => {
    if (sent.current) return;
    sent.current = true; setPicked(i); clock.current?.stop();
    const r = await answerDuelAction(duelId, i);
    if (!r.ok) { toast.push("error", r.error); return; }
    setAnswer(r.data!.answer); setScore(r.data!.score);
    if (r.data!.correct) sfx.correct(); else sfx.wrong();
    setTimeout(() => {
      if (r.data!.finished) {
        setResult(r.data!.result ?? "waiting"); setPhase("end");
        if (r.data!.result === "won") { sfx.victory(); fireEffect("confetti", { sound: false }); }
        router.refresh();
      } else void load();
    }, 1300);
  }, [duelId, load, router, toast]);

  // Countdown; when time runs out the answer goes in as "no answer".
  useEffect(() => {
    if (phase !== "q") return;
    const t = setInterval(() => {
      const ms = Math.max(0, deadline.current - Date.now());
      setLeft(ms);
      if (ms === 0) void submit(-1);
    }, 100);
    return () => clearInterval(t);
  }, [phase, submit, q]);
  useEffect(() => () => clock.current?.stop(), []);

  if (phase === "intro") return (
    <div className="mx-auto max-w-md py-10 text-center">
      <div className="text-6xl">⚔️</div>
      <h2 className="mt-3 text-2xl font-extrabold">You vs {otherName}</h2>
      <p className="mt-2 text-muted">5 questions · 10 seconds each. The timer starts as soon as each question appears.</p>
      <button type="button" onClick={() => { unlockAudio(); sfx.sparkle(); void load(); }} className={buttonClass("primary", "md", "mt-6 px-8")}>I&apos;m ready</button>
    </div>
  );
  if (phase === "end") return (
    <div className="mx-auto max-w-md py-10 text-center">
      <div className="text-6xl">{result === "won" ? "🏆" : result === "lost" ? "💪" : result === "tie" ? "🤝" : "✅"}</div>
      <h2 className="mt-3 text-2xl font-extrabold">{result === "won" ? "You won!" : result === "lost" ? `${otherName} won this one` : result === "tie" ? "It's a tie!" : `You got ${score} of 5`}</h2>
      <p className="mt-2 text-muted">{result === "waiting" || !result ? `Waiting for ${otherName} to play. You'll get a notification with the result.` : `Final score: you ${score}.`}</p>
      <Link href="/academy/trivia" className={buttonClass("secondary", "md", "mt-6")}>Back to trivia</Link>
    </div>
  );
  const c = q ? catOf(q.category) : null;
  return q && (
    <div className="mx-auto max-w-xl py-4">
      <div className="mb-2 flex items-center justify-between text-sm font-semibold text-muted"><span>Question {q.index + 1} of {q.total}</span><span>{c?.emoji} {c?.label}</span><span className="tabular-nums text-fg">⭐ {score}</span></div>
      <TimerBar ms={left} total={10000} />
      <h2 className="my-6 text-xl font-extrabold leading-snug sm:text-2xl">{q.question}</h2>
      <Choices choices={q.choices} picked={picked} answer={answer} disabled={picked !== null} onPick={(i) => void submit(i)} />
      {picked === -1 && answer !== null && <p className="mt-3 text-center text-sm font-semibold text-muted">⏰ Time&apos;s up!</p>}
    </div>
  );
}

/* ───── Trivia night ───── */

type NightState = {
  night: { id: string; title: string; status: string; total: number; current: number } | null;
  question: { index: number; total: number; text: string; choices: string[]; category: string; remainingMs: number; myChoice: number | null; answer: number | null; answeredCount: number; correctCount: number } | null;
  myCape: string | null; scores: { cape: string; players: number; correct: number; average: number }[]; host: boolean;
  last?: { title: string; winnerCape: string | null; scores: { cape: string; average: number }[] } | null;
};

export function TriviaNight({ capeNames }: { capeNames: Record<string, string> }) {
  const [s, setS] = useState<NightState | null>(null);
  const [mine, setMine] = useState<Record<number, number>>({});
  const [busy, start] = useTransition();
  const toast = useToast();
  const lastQ = useRef(-1);
  const clock = useRef<{ stop(): void } | null>(null);
  const deadline = useRef(0);
  const [left, setLeft] = useState(0);

  const poll = useCallback(async () => {
    try {
      const r = await fetch("/api/academy/trivia-night", { cache: "no-store" });
      if (!r.ok) return;
      const d: NightState = await r.json();
      setS(d);
      if (d.question) {
        deadline.current = Date.now() + d.question.remainingMs;
        if (d.question.index !== lastQ.current) {
          lastQ.current = d.question.index;
          clock.current?.stop();
          if (d.question.remainingMs > 0) clock.current = sfx.clockStart(Math.ceil(d.question.remainingMs / 1000));
        }
        if (d.question.myChoice !== null) setMine((m) => ({ ...m, [d.question!.index]: d.question!.myChoice! }));
      }
    } catch { /* offline */ }
  }, []);
  useEffect(() => { unlockAudio(); void poll(); const t = setInterval(poll, 1500); return () => { clearInterval(t); clock.current?.stop(); }; }, [poll]);
  useEffect(() => { const t = setInterval(() => setLeft(Math.max(0, deadline.current - Date.now())), 100); return () => clearInterval(t); }, []);

  const answer = (i: number) => {
    if (!s?.night || !s.question || mine[s.question.index] !== undefined) return;
    const idx = s.question.index;
    setMine((m) => ({ ...m, [idx]: i })); clock.current?.stop();
    start(async () => { const r = await answerNightAction(s.night!.id, idx, i); if (!r.ok) toast.push("error", r.error); });
  };
  const host = (step: "start" | "next" | "end") => start(async () => { const r = await hostNightAction(s!.night!.id, step); if (!r.ok) toast.push("error", r.error); else void poll(); });

  if (!s) return <p className="py-10 text-center text-muted">Loading…</p>;
  const name = (c: string) => capeNames[c] ?? (isCape(c) ? CAPES[c].name : c);
  const board = (list: { cape: string; average: number; players?: number }[]) => (
    <ul className="space-y-2">
      {list.map((x, i) => (
        <li key={x.cape} className="flex items-center gap-3 rounded-xl border border-line px-3 py-2">
          <span className="w-6 text-center font-extrabold">{i === 0 && x.average > 0 ? "🏆" : i + 1}</span>
          <span className="h-3 w-3 rounded-full" style={{ background: isCape(x.cape) ? CAPES[x.cape].color : "#999" }} />
          <span className="flex-1 font-semibold">{name(x.cape)}</span>
          <span className="tabular-nums text-sm text-muted">{x.average} avg{x.players !== undefined ? ` · ${x.players} playing` : ""}</span>
        </li>
      ))}
    </ul>
  );

  if (!s.night) return (
    <div className="mx-auto max-w-md py-10 text-center">
      <div className="text-6xl">🧠</div>
      <h2 className="mt-3 text-2xl font-extrabold">No trivia night right now</h2>
      <p className="mt-2 text-muted">When an admin starts one, you&apos;ll see a banner at the top of the app.</p>
      {s.last && <div className="mt-6 text-left"><p className="mb-2 text-sm font-semibold">Last time: {s.last.title}{s.last.winnerCape ? ` · ${name(s.last.winnerCape)} won` : ""}</p>{board(s.last.scores)}</div>}
    </div>
  );
  const q = s.question;
  return (
    <div className="mx-auto max-w-xl py-4">
      <div className="mb-4 text-center"><p className="text-xs font-bold uppercase tracking-[.2em] text-accent-ink">Cape vs Cape</p><h2 className="text-2xl font-extrabold">{s.night.title}</h2></div>
      {s.night.status === "lobby" && <p className="mb-6 rounded-xl bg-surface-2 p-4 text-center text-sm">Get ready! {s.host ? "Press Start when everyone's here." : "The host will start in a moment."}</p>}
      {q && (
        <div className="mb-6">
          <div className="mb-2 flex justify-between text-sm font-semibold text-muted"><span>Question {q.index + 1} of {q.total}</span><span>{catOf(q.category)?.emoji} {catOf(q.category)?.label}</span></div>
          <TimerBar ms={left} total={15000} />
          <h3 className="my-5 text-xl font-extrabold leading-snug">{q.text}</h3>
          <Choices choices={q.choices} picked={mine[q.index] ?? null} answer={q.answer} disabled={mine[q.index] !== undefined || q.answer !== null || !s.myCape} onPick={answer} />
          {!s.myCape && <p className="mt-2 text-xs text-muted">Get sorted into a Cape to play.</p>}
          {q.answer !== null && <p className="mt-3 text-center text-sm font-semibold">{q.correctCount} of {q.answeredCount} got it right{mine[q.index] === q.answer ? " — including you! 🎉" : ""}</p>}
        </div>
      )}
      <h3 className="mb-2 text-sm font-semibold">Scoreboard</h3>
      {s.scores.length ? board(s.scores) : <p className="text-sm text-muted">Scores show up after the first answers.</p>}
      {s.host && (
        <div className="mt-6 flex flex-wrap justify-center gap-2 rounded-2xl border border-dashed border-line p-3">
          <span className="w-full text-center text-xs font-bold uppercase tracking-wider text-muted">Host controls</span>
          {s.night.status === "lobby" && <button type="button" disabled={busy} onClick={() => host("start")} className={buttonClass("primary")}>Start</button>}
          {s.night.status === "live" && <button type="button" disabled={busy} onClick={() => host("next")} className={buttonClass("primary")}>{s.night.current + 1 >= s.night.total ? "Finish & crown the winner" : "Next question"}</button>}
          <button type="button" disabled={busy} onClick={() => { if (window.confirm("End trivia night now?")) host("end"); }} className={buttonClass("secondary")}>End</button>
        </div>
      )}
    </div>
  );
}
