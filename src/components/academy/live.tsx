"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { CAPES, isCape, PLANE_STYLES, RANKS, type PlaneStyle } from "@/lib/academy";
import { markPlanesSeenAction } from "@/server/academy-actions";
import { sfx } from "@/lib/sfx";
import { fireEffect } from "./effects";
import { PlaneIcon } from "./plane-icon";

type Plane = { id: string; from: string; style: string; message: string; createdAt: string };
type Live = { enabled: boolean; cape: string | null; season: { id: string; name: string } | null; seasonPoints: number | null; lifetimePoints: number; rank: number; planes: Plane[] };

const get = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };
const set = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* ignore */ } };

/** Catches paper planes, shows "+points" pops and rank level-ups. Mounted in the app shell. */
export function AcademyLive({ userId }: { userId: string }) {
  const [queue, setQueue] = useState<Plane[]>([]);
  const [open, setOpen] = useState(false);
  const [pop, setPop] = useState<{ n: number; cape: string | null } | null>(null);
  const [levelUp, setLevelUp] = useState<number | null>(null);
  const shown = useRef(new Set<string>());

  const check = useCallback(async () => {
    try {
      const r = await fetch("/api/academy/live", { cache: "no-store" });
      if (!r.ok) return;
      const d: Live = await r.json();
      if (!d.enabled) return;
      const fresh = d.planes.filter((p) => !shown.current.has(p.id));
      if (fresh.length) { fresh.forEach((p) => shown.current.add(p.id)); setQueue((q) => [...q, ...fresh]); }
      if (d.season && d.seasonPoints !== null) {
        const k = `cfk-pts-${userId}-${d.season.id}`, prev = get(k);
        if (prev !== null && d.seasonPoints > Number(prev)) { setPop({ n: d.seasonPoints - Number(prev), cape: d.cape }); sfx.points(); setTimeout(() => setPop(null), 3200); }
        set(k, String(d.seasonPoints));
      }
      const rk = `cfk-rank-${userId}`, prevRank = get(rk);
      // Automated browsers (tests) skip the full-screen level-up so it can't block them.
      if (prevRank !== null && d.rank > Number(prevRank) && !navigator.webdriver) { setLevelUp(d.rank); sfx.levelUp(); fireEffect("confetti", { sound: false }); }
      set(rk, String(d.rank));
    } catch { /* offline */ }
  }, [userId]);

  useEffect(() => {
    void check();
    const t = setInterval(() => { if (document.visibilityState === "visible") void check(); }, 30000);
    const onVis = () => { if (document.visibilityState === "visible") void check(); };
    const onNudge = () => void check();
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("cfk-academy-check", onNudge);
    return () => { clearInterval(t); document.removeEventListener("visibilitychange", onVis); window.removeEventListener("cfk-academy-check", onNudge); };
  }, [check]);

  // When a new plane arrives, it flies in with a whoosh.
  const current = queue[0];
  useEffect(() => { if (current && !open) sfx.whoosh(); }, [current, open]);

  const catchIt = () => { setOpen(true); sfx.unfold(); };
  const next = () => {
    if (current) void markPlanesSeenAction([current.id]);
    setOpen(false); setQueue((q) => q.slice(1));
  };
  const st = current ? PLANE_STYLES[(current.style in PLANE_STYLES ? current.style : "thanks") as PlaneStyle] : null;

  return (
    <>
      {current && st && !open && (
        <button onClick={catchIt} aria-label={`Paper plane from ${current.from}. Tap to open.`}
          className="fixed bottom-24 right-4 z-[120] flex items-center gap-3 rounded-2xl bg-surface px-4 py-3 text-left shadow-pop ring-1 ring-line md:bottom-6"
          style={{ animation: "cfk-plane-in 1.1s cubic-bezier(.3,.7,.3,1) both" }}>
          <span className="grid h-11 w-11 place-items-center rounded-xl" style={{ background: st.color }}><PlaneIcon className="h-6 w-6" color={st.ink} /></span>
          <span><span className="block text-sm font-bold">{current.from} threw you a paper plane!</span><span className="text-xs text-muted">Tap to catch it</span></span>
        </button>
      )}
      {current && st && open && (
        <div role="dialog" aria-modal="true" aria-label={`Paper plane from ${current.from}`} className="fixed inset-0 z-[130] grid place-items-center bg-black/40 p-5" onClick={next}>
          <div onClick={(e) => e.stopPropagation()} className="w-full max-w-sm rounded-2xl p-6 shadow-pop" style={{ background: st.color, color: st.ink, animation: "cfk-unfold .6s cubic-bezier(.3,1.4,.5,1) both" }}>
            <div className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-wider opacity-80"><PlaneIcon className="h-4 w-4" color={st.ink} />{st.label}</div>
            <p className="whitespace-pre-wrap text-xl font-semibold leading-snug">{current.message}</p>
            <p className="mt-4 text-sm font-semibold opacity-80">— {current.from}</p>
            <div className="mt-5 flex items-center justify-between gap-2">
              <a href="/academy/planes" className="text-xs font-semibold underline opacity-80">Plane collection</a>
              <button onClick={next} className="rounded-lg bg-black/15 px-4 py-2 text-sm font-bold">{queue.length > 1 ? "Next plane" : "Keep it ✨"}</button>
            </div>
          </div>
        </div>
      )}
      {pop && (
        <div role="status" className="pointer-events-none fixed bottom-24 left-1/2 z-[125] -translate-x-1/2 rounded-full px-5 py-2.5 text-sm font-extrabold shadow-pop md:bottom-8"
          style={{ background: pop.cape && isCape(pop.cape) ? CAPES[pop.cape].color : "#FED438", color: pop.cape && isCape(pop.cape) ? CAPES[pop.cape].text : "#3b2f00", animation: "cfk-pop 3.2s ease both" }}>
          +{pop.n} points{pop.cape && isCape(pop.cape) ? ` for ${CAPES[pop.cape].name}` : ""} ✨
        </div>
      )}
      {levelUp !== null && (
        <div role="dialog" aria-modal="true" aria-label="Level up" className="fixed inset-0 z-[140] grid place-items-center bg-[radial-gradient(circle_at_50%_40%,#0b5d96,#02243d_75%)] p-6 text-center text-white" onClick={() => setLevelUp(null)}>
          <div style={{ animation: "cfk-unfold .7s cubic-bezier(.3,1.4,.5,1) both" }}>
            <div className="text-7xl">{RANKS[levelUp].icon}</div>
            <p className="mt-4 text-sm font-semibold uppercase tracking-[.2em] text-[#FED438]">Level up!</p>
            <h2 className="mt-1 text-4xl font-extrabold">You&apos;re now a {RANKS[levelUp].name}!</h2>
            <p className="mt-3 text-white/80">Every task, shift and kind word got you here.</p>
            <button className="mt-7 rounded-xl bg-[#FED438] px-7 py-3 font-bold text-[#02243d]">Awesome</button>
          </div>
        </div>
      )}
    </>
  );
}
