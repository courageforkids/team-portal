"use client";
import { useState } from "react";
import { Avatar } from "@/components/ui/avatar";
import { CAPES, isCape, rankFor } from "@/lib/academy";

export type HeroCardData = { name: string; title: string; avatarFileId: string | null; cape: string | null; lifetime: number; stats: { tasks: number; meetings: number; shifts: number; planesGot: number; shoutGot: number } };

/** Collectible trading card. Tap to flip. Turns holographic from Hero rank up. */
export function HeroCard({ d, size = "md" }: { d: HeroCardData; size?: "sm" | "md" }) {
  const [flip, setFlip] = useState(false);
  const c = d.cape && isCape(d.cape) ? CAPES[d.cape] : null;
  const r = rankFor(d.lifetime);
  const holo = r.index >= 2;
  const w = size === "sm" ? "w-[168px] h-[236px]" : "w-[240px] h-[336px]";
  return (
    <button type="button" onClick={() => setFlip(!flip)} aria-label={`${d.name}'s hero card. Tap to flip.`} className={`${w} shrink-0 [perspective:900px]`}>
      <div className="relative h-full w-full transition-transform duration-500 [transform-style:preserve-3d]" style={{ transform: flip ? "rotateY(180deg)" : undefined }}>
        <div className="absolute inset-0 flex flex-col overflow-hidden rounded-2xl p-[5px] shadow-pop [backface-visibility:hidden]" style={{ background: holo ? `linear-gradient(115deg, ${c?.color ?? "#004F81"}, #FED438, #8cc4ec, #f0a0ff, ${c?.color ?? "#004F81"})` : c?.color ?? "#004F81", backgroundSize: holo ? "200% 100%" : undefined, animation: holo ? "cfk-holo 4s linear infinite" : undefined }}>
          <div className="flex flex-1 flex-col items-center rounded-[12px] bg-surface p-3 text-center">
            <div className="flex w-full items-center justify-between text-[10px] font-bold uppercase tracking-wider text-muted"><span>{c?.name ?? "Unsorted"}</span><span>{r.icon} {r.name}</span></div>
            <div className="mt-3 rounded-full p-1" style={{ background: c?.color ?? "#004F81" }}><Avatar name={d.name} fileId={d.avatarFileId} size={size === "sm" ? 72 : 104} /></div>
            <div className={`mt-3 font-extrabold leading-tight ${size === "sm" ? "text-sm" : "text-lg"}`}>{d.name}</div>
            <div className="line-clamp-2 text-[11px] text-muted">{d.title}</div>
            <div className="mt-auto w-full rounded-lg bg-surface-2 py-1.5 text-xs font-bold tabular-nums">{d.lifetime} pts{holo && " · ✨ holo"}</div>
          </div>
        </div>
        <div className="absolute inset-0 rounded-2xl p-[5px] shadow-pop [backface-visibility:hidden] [transform:rotateY(180deg)]" style={{ background: c?.color ?? "#004F81" }}>
          <div className="flex h-full flex-col rounded-[12px] bg-surface p-4 text-left">
            <div className="text-xs font-bold uppercase tracking-wider text-muted">Hero stats</div>
            <dl className={`mt-3 space-y-2 ${size === "sm" ? "text-xs" : "text-sm"}`}>
              {[["On-time tasks", d.stats.tasks], ["Meetings", d.stats.meetings], ["Shifts", d.stats.shifts], ["Planes caught", d.stats.planesGot], ["Shout-outs", d.stats.shoutGot]].map(([k, v]) => (
                <div key={k} className="flex justify-between border-b border-line pb-1.5"><dt className="text-muted">{k}</dt><dd className="font-bold tabular-nums">{v}</dd></div>
              ))}
            </dl>
            <div className="mt-auto text-[11px] text-muted">{r.next ? `${r.toNext} pts to ${r.next.name}` : "Max rank reached 👑"}</div>
          </div>
        </div>
      </div>
    </button>
  );
}
