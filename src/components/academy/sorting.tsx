"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CAPES, SORTING_QUESTIONS, type Cape } from "@/lib/academy";
import { sortMeAction } from "@/server/academy-actions";
import { sfx, unlockAudio } from "@/lib/music";
import { fireEffect } from "./effects";

function CapeIcon({ color, size = 120, spin }: { color: string; size?: number; spin?: boolean }) {
  return (
    <svg width={size} height={size * 0.83} viewBox="0 0 180 150" className={spin ? "animate-[spin_1.2s_linear_infinite]" : ""} aria-hidden="true">
      <path d="M20 20 Q90 0 160 20 L175 120 Q130 100 110 140 Q90 105 70 140 Q50 100 5 120 Z" fill={color} stroke="#FED438" strokeWidth="6" />
      <path d="M60 30 Q90 20 120 30" stroke="#FED438" strokeWidth="4" fill="none" />
    </svg>
  );
}

/** Full-screen Sorting shown once to anyone without a Cape. */
export function SortingGate({ firstName }: { firstName: string }) {
  const router = useRouter();
  const [step, setStep] = useState<"intro" | "quiz" | "sorting" | "reveal">("intro");
  const [i, setI] = useState(0);
  const [answers, setAnswers] = useState<Cape[]>([]);
  const [cape, setCape] = useState<Cape | null>(null);
  const [error, setError] = useState("");
  const [swirl, setSwirl] = useState(0);
  const [closed, setClosed] = useState(false);
  const cinematic = useRef<{ stop(): void } | null>(null);
  useEffect(() => { unlockAudio(); }, []);

  useEffect(() => {
    if (step !== "sorting") return;
    const t = setInterval(() => setSwirl((s) => s + 1), 140);
    return () => clearInterval(t);
  }, [step]);

  const pick = async (c: Cape) => {
    sfx.tick();
    const next = [...answers, c];
    setAnswers(next);
    if (i < SORTING_QUESTIONS.length - 1) { setI(i + 1); return; }
    setStep("sorting"); setError("");
    cinematic.current = sfx.sortingCinematic();
    const [r] = await Promise.all([sortMeAction(next), new Promise((res) => setTimeout(res, navigator.webdriver ? 300 : 4000))]);
    if (!r.ok) { cinematic.current?.stop(); setError(r.error); setStep("quiz"); setI(0); setAnswers([]); return; }
    setCape(r.data!.cape); setStep("reveal");
    sfx.capeReveal(r.data!.cape); fireEffect("confetti", { sound: false });
  };

  if (closed) return null;
  const swirlColors = Object.values(CAPES).map((c) => c.color);
  const q = SORTING_QUESTIONS[i];
  return (
    <div role="dialog" aria-modal="true" aria-label="The Sorting" className="fixed inset-0 z-[150] flex items-center justify-center overflow-y-auto bg-[radial-gradient(circle_at_50%_30%,#0b5d96,#02243d_70%)] p-5 text-white">
      <div className="w-full max-w-md text-center">
        {step === "intro" && (
          <div className="animate-in">
            <div className="mx-auto mb-6 flex justify-center drop-shadow-[0_0_30px_rgba(254,212,56,.45)]"><CapeIcon color="#004F81" /></div>
            <p className="text-sm font-semibold uppercase tracking-[.2em] text-[#FED438]">Courage Academy</p>
            <h1 className="mt-2 text-3xl font-extrabold leading-tight">Every hero has a cape, {firstName}.</h1>
            <p className="mt-3 text-white/80">Answer six quick questions and we&apos;ll find yours. Your Cape is your team for the Cape Cup.</p>
            <button onClick={() => { setStep("quiz"); sfx.sparkle(); }} className="mt-8 rounded-xl bg-[#FED438] px-8 py-3 text-base font-bold text-[#02243d] shadow-lg transition hover:scale-105">Find my cape</button>
          </div>
        )}
        {step === "quiz" && (
          <div key={i} className="animate-in">
            <div className="mb-6 flex justify-center gap-1.5" aria-label={`Question ${i + 1} of ${SORTING_QUESTIONS.length}`}>
              {SORTING_QUESTIONS.map((_, j) => <span key={j} className={`h-1.5 w-8 rounded-full ${j <= i ? "bg-[#FED438]" : "bg-white/20"}`} />)}
            </div>
            <h2 className="text-2xl font-bold leading-snug">{q.q}</h2>
            <div className="mt-6 grid gap-2.5">
              {q.a.map(([label, c]) => (
                <button key={label} onClick={() => pick(c)} className="rounded-xl border border-white/20 bg-white/10 px-4 py-3.5 text-left text-[15px] font-medium transition hover:border-[#FED438] hover:bg-white/15 active:scale-[.98]">{label}</button>
              ))}
            </div>
            {error && <p role="alert" className="mt-4 text-sm text-red-200">{error}</p>}
          </div>
        )}
        {step === "sorting" && (
          <div className="animate-in" aria-live="polite">
            <div className="mx-auto flex justify-center"><CapeIcon color={swirlColors[swirl % swirlColors.length]} size={150} spin /></div>
            <h2 className="mt-8 text-2xl font-bold">Hmm… let&apos;s see…</h2>
            <p className="mt-2 text-white/70">The capes are deciding.</p>
          </div>
        )}
        {step === "reveal" && cape && (
          <div className="animate-in" aria-live="polite">
            <div className="mx-auto flex justify-center drop-shadow-[0_0_40px_rgba(254,212,56,.6)]"><CapeIcon color={CAPES[cape].color} size={170} /></div>
            <p className="mt-6 text-sm font-semibold uppercase tracking-[.2em] text-[#FED438]">Welcome to the</p>
            <h1 className="mt-1 text-4xl font-extrabold">{CAPES[cape].name}!</h1>
            <p className="mt-2 text-lg font-semibold text-white/90">{CAPES[cape].motto}</p>
            <p className="mt-3 text-white/75">{CAPES[cape].blurb}</p>
            <div className="mt-8 flex flex-col items-center gap-3">
              <Link href="/academy/hero" onClick={() => setClosed(true)} className="rounded-xl bg-[#FED438] px-8 py-3 text-base font-bold text-[#02243d] shadow-lg transition hover:scale-105">Create my hero 🦸</Link>
              <button onClick={() => { setClosed(true); router.refresh(); }} className="text-sm font-semibold text-white/80 underline">Later</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export { CapeIcon };
