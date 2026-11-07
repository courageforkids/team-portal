"use client";
import { useEffect, useState } from "react";
import { CAPES, type Cape } from "@/lib/academy";
import { sfx } from "@/lib/sfx";
import { fireEffect } from "./effects";
import { CapeIcon } from "./sorting";

type S = { cape: Cape; members: number; average: number };

export function CupBars({ list, myCape }: { list: S[]; myCape?: string | null }) {
  const max = Math.max(1, ...list.map((s) => s.average));
  return (
    <ul className="space-y-2.5">
      {list.map((s, i) => (
        <li key={s.cape}>
          <div className="mb-1 flex items-center justify-between text-sm">
            <span className="flex items-center gap-1.5 font-semibold">{i === 0 && s.average > 0 && "🏆 "}{CAPES[s.cape].name}{myCape === s.cape && <span className="rounded-full bg-surface-2 px-1.5 text-[10px] font-bold text-muted">YOU</span>}</span>
            <span className="tabular-nums text-muted"><b className="text-fg">{s.average}</b> avg · {s.members}</span>
          </div>
          <div className="h-3 overflow-hidden rounded-full bg-surface-2"><div className="h-full rounded-full transition-[width] duration-700" style={{ width: `${(s.average / max) * 100}%`, background: CAPES[s.cape].color }} /></div>
        </li>
      ))}
    </ul>
  );
}

/** End-of-season ceremony, shown once per person after a season ends. */
export function Ceremony({ seasonId, seasonName, list }: { seasonId: string; seasonName: string; list: S[] }) {
  const key = `cfk-ceremony-${seasonId}`;
  const [show, setShow] = useState(false);
  const [phase, setPhase] = useState<"tap" | "fill" | "win">("tap");
  const [filled, setFilled] = useState(0);
  useEffect(() => { try { if (!localStorage.getItem(key) && list.some((s) => s.average > 0)) setShow(true); } catch { /* ignore */ } }, [key, list]);
  const start = () => {
    setPhase("fill"); sfx.drumroll();
    const order = [...list].reverse();
    order.forEach((_, i) => setTimeout(() => { setFilled(i + 1); sfx.tick(); }, 400 + i * 550));
    setTimeout(() => { setPhase("win"); fireEffect("fanfare"); }, 600 + order.length * 550);
  };
  const close = () => { try { localStorage.setItem(key, "1"); } catch { /* ignore */ } setShow(false); };
  if (!show) return null;
  const winner = list[0];
  const max = Math.max(1, ...list.map((s) => s.average));
  const revealOrder = [...list].reverse();
  return (
    <div role="dialog" aria-modal="true" aria-label="Cape Cup ceremony" className="fixed inset-0 z-[140] grid place-items-center overflow-y-auto bg-[radial-gradient(circle_at_50%_30%,#0b5d96,#02243d_75%)] p-5 text-white">
      <div className="w-full max-w-md text-center">
        <p className="text-sm font-semibold uppercase tracking-[.2em] text-[#FED438]">The Cape Cup · {seasonName}</p>
        {phase === "tap" && <>
          <h2 className="mt-2 text-3xl font-extrabold">The season is over!</h2>
          <p className="mt-2 text-white/75">Which Cape takes home the Cup?</p>
          <button onClick={start} className="mt-8 rounded-xl bg-[#FED438] px-8 py-3 font-bold text-[#02243d] transition hover:scale-105">Reveal the winner</button>
        </>}
        {phase !== "tap" && (
          <ul className="mt-6 space-y-3 text-left">
            {list.map((s) => {
              const on = revealOrder.indexOf(s) < filled;
              return (
                <li key={s.cape}>
                  <div className="mb-1 flex justify-between text-sm font-semibold"><span>{CAPES[s.cape].name}</span><span className="tabular-nums">{on ? s.average : "?"}</span></div>
                  <div className="h-4 overflow-hidden rounded-full bg-white/15"><div className="h-full rounded-full transition-[width] duration-500" style={{ width: on ? `${(s.average / max) * 100}%` : "0%", background: CAPES[s.cape].color }} /></div>
                </li>
              );
            })}
          </ul>
        )}
        {phase === "win" && winner && (
          <div className="mt-8" style={{ animation: "cfk-unfold .7s cubic-bezier(.3,1.4,.5,1) both" }}>
            <div className="flex justify-center"><CapeIcon color={CAPES[winner.cape].color} size={130} /></div>
            <h2 className="mt-3 text-4xl font-extrabold">🏆 {CAPES[winner.cape].name} wins!</h2>
            <button onClick={close} className="mt-6 rounded-xl bg-[#FED438] px-7 py-3 font-bold text-[#02243d]">Celebrate</button>
          </div>
        )}
      </div>
    </div>
  );
}
