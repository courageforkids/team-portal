"use client";
import { useState } from "react";
import { Avatar } from "@/components/ui/avatar";
import { CAPES, isCape, rankFor } from "@/lib/academy";
import { HeroArt } from "./hero-art";

export type HeroCardData = {
  id: string; name: string; title: string; avatarFileId: string | null; cape: string | null; capeName?: string; hero: unknown; lifetime: number; streak: number; captain?: boolean;
  stats: { tasks: number; meetings: number; shifts: number; planesGot: number; shoutGot: number; duelWins: number; missions: number };
};

/** Collectible trading card. Tap to flip. Turns holographic from Hero rank up. */
export function HeroCard({ d, size = "md" }: { d: HeroCardData; size?: "sm" | "md" }) {
  const [flip, setFlip] = useState(false);
  const c = d.cape && isCape(d.cape) ? CAPES[d.cape] : null;
  const r = rankFor(d.lifetime);
  const holo = r.index >= 2;
  const w = size === "sm" ? "w-[168px] h-[252px]" : "w-[240px] h-[356px]";
  return (
    <button type="button" onClick={() => setFlip(!flip)} aria-label={`${d.name}'s hero card. Tap to flip.`} className={`${w} shrink-0 [perspective:900px]`}>
      <div className="relative h-full w-full transition-transform duration-500 [transform-style:preserve-3d]" style={{ transform: flip ? "rotateY(180deg)" : undefined }}>
        <div className="absolute inset-0 flex flex-col overflow-hidden rounded-2xl p-[5px] shadow-pop [backface-visibility:hidden]" style={{ background: holo ? `linear-gradient(115deg, ${c?.color ?? "#004F81"}, #FED438, #8cc4ec, #f0a0ff, ${c?.color ?? "#004F81"})` : c?.color ?? "#004F81", backgroundSize: holo ? "200% 100%" : undefined, animation: holo ? "cfk-holo 4s linear infinite" : undefined }}>
          <div className="flex flex-1 flex-col items-center rounded-[12px] bg-surface p-2.5 text-center">
            <div className="flex w-full items-center justify-between text-[10px] font-bold uppercase tracking-wider text-muted"><span className="truncate">{d.captain ? "👑 " : ""}{d.capeName ?? c?.name ?? "Unsorted"}</span><span className="shrink-0">{r.icon} {r.name}</span></div>
            <div className="relative mt-1 grid flex-1 place-items-center">
              {d.hero ? <HeroArt hero={d.hero} cape={d.cape} size={size === "sm" ? 140 : 210} idPrefix={`card-${d.id}-${size}`} />
                : <div className="rounded-full p-1" style={{ background: c?.color ?? "#004F81" }}><Avatar name={d.name} fileId={d.avatarFileId} size={size === "sm" ? 72 : 104} /></div>}
              {d.streak >= 2 && <span className="absolute right-0 top-1 rounded-full bg-surface px-1.5 py-0.5 text-[11px] font-bold shadow-soft" title={`${d.streak}-week on-time streak`}>🔥{d.streak}</span>}
            </div>
            <div className={`font-extrabold leading-tight ${size === "sm" ? "text-sm" : "text-lg"}`}>{d.name}</div>
            <div className="line-clamp-1 text-[11px] text-muted">{d.title}</div>
            <div className="mt-1.5 w-full rounded-lg bg-surface-2 py-1 text-xs font-bold tabular-nums">{d.lifetime} pts{holo && " · ✨ holo"}</div>
          </div>
        </div>
        <div className="absolute inset-0 rounded-2xl p-[5px] shadow-pop [backface-visibility:hidden] [transform:rotateY(180deg)]" style={{ background: c?.color ?? "#004F81" }}>
          <div className="flex h-full flex-col rounded-[12px] bg-surface p-4 text-left">
            <div className="text-xs font-bold uppercase tracking-wider text-muted">Hero stats</div>
            <dl className={`mt-2 space-y-1.5 ${size === "sm" ? "text-[11px]" : "text-sm"}`}>
              {[["On-time tasks", d.stats.tasks], ["Shifts", d.stats.shifts], ["Meetings", d.stats.meetings], ["Missions", d.stats.missions ? `+${d.stats.missions}` : 0], ["Trivia wins", d.stats.duelWins], ["Planes caught", d.stats.planesGot], ["Shout-outs", d.stats.shoutGot], ["Streak", d.streak ? `🔥 ${d.streak} wk` : "—"]].map(([k, v]) => (
                <div key={String(k)} className="flex justify-between border-b border-line pb-1"><dt className="text-muted">{k}</dt><dd className="font-bold tabular-nums">{v}</dd></div>
              ))}
            </dl>
            <div className="mt-auto pt-2 text-[11px] text-muted">{r.next ? `${r.toNext} pts to ${r.next.name}` : "Max rank reached 👑"}</div>
          </div>
        </div>
      </div>
    </button>
  );
}
