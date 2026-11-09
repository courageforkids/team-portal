"use client";
import { useState, useTransition } from "react";
import { ChevronLeft, ChevronRight, Heart } from "lucide-react";
import { ActionForm, Field, Select, SubmitButton, Textarea } from "@/components/ui/form";
import { useToast } from "@/components/ui/toaster";
import { cn } from "@/lib/cn";
import { MISSION_KINDS, PLANE_STYLES, type PlaneStyle } from "@/lib/academy";
import { sfx } from "@/lib/music";
import { claimMissionAction, heartPlaneAction } from "@/server/academy-actions";
import { PlaneIcon } from "./plane-icon";
import { ReportPlaneButton } from "./admin";

export function MissionClaimForm() {
  return (
    <ActionForm action={claimMissionAction} resetOnSuccess className="space-y-3">
      <Field label="What did you do?" htmlFor="mc-kind">
        <Select id="mc-kind" name="kind" defaultValue="business">
          {Object.entries(MISSION_KINDS).map(([k, v]) => <option key={k} value={k}>{v.emoji} {v.label} (+{v.points})</option>)}
        </Select>
      </Field>
      <Field label="Tell us about it" htmlFor="mc-det" hint="An admin approves it, then the points go to you and your Cape.">
        <Textarea id="mc-det" name="details" rows={2} maxLength={400} placeholder="Joe's Coffee is donating 20 bags for the parent boxes!" />
      </Field>
      <SubmitButton>Claim points</SubmitButton>
    </ActionForm>
  );
}

export function HeartButton({ id, count, hearted }: { id: string; count: number; hearted: boolean }) {
  const [on, setOn] = useState(hearted);
  const [n, setN] = useState(count);
  const [busy, start] = useTransition();
  const toast = useToast();
  return (
    <button type="button" disabled={busy} aria-pressed={on} aria-label={on ? "Remove heart" : "Heart this plane"}
      onClick={() => { const next = !on; setOn(next); setN((x) => x + (next ? 1 : -1)); if (next) sfx.pop(); start(async () => { const r = await heartPlaneAction(id); if (!r.ok) { toast.push("error", r.error); setOn(!next); setN((x) => x + (next ? -1 : 1)); } }); }}
      className={cn("inline-flex items-center gap-1 rounded-full bg-black/10 px-2.5 py-1 text-xs font-bold transition active:scale-90", on && "bg-black/20")}>
      <Heart className={cn("h-3.5 w-3.5", on && "fill-current")} />{n}
    </button>
  );
}

type Plane = { id: string; style: string; sticker: string | null; message: string; from: string; date: string };

/** A two-page scrapbook of every plane you've caught. Swipe or tap the arrows to turn pages. */
export function Scrapbook({ planes }: { planes: Plane[] }) {
  const perSpread = 4;
  const spreads = Math.max(1, Math.ceil(planes.length / perSpread));
  const [page, setPage] = useState(0);
  const [turn, setTurn] = useState<"l" | "r" | null>(null);
  const [touch, setTouch] = useState<number | null>(null);
  const go = (d: number) => {
    const next = page + d;
    if (next < 0 || next >= spreads) return;
    setTurn(d > 0 ? "r" : "l"); sfx.pageTurn();
    setTimeout(() => { setPage(next); setTurn(null); }, 260);
  };
  const shown = planes.slice(page * perSpread, page * perSpread + perSpread);
  const tilt = [-2.5, 1.8, 2.2, -1.6];
  return (
    <div className="mx-auto max-w-4xl" onTouchStart={(e) => setTouch(e.touches[0].clientX)} onTouchEnd={(e) => { if (touch === null) return; const dx = e.changedTouches[0].clientX - touch; if (Math.abs(dx) > 50) go(dx < 0 ? 1 : -1); setTouch(null); }}>
      <div className={cn("relative rounded-[28px] bg-[#8a5a3b] p-3 shadow-pop transition-transform duration-300 sm:p-4", turn === "r" && "[transform:perspective(1200px)_rotateY(-8deg)]", turn === "l" && "[transform:perspective(1200px)_rotateY(8deg)]")}>
        <div className="grid min-h-[420px] gap-4 rounded-[20px] bg-[#fbf6ea] p-4 text-[#3b2f20] sm:grid-cols-2 sm:p-6" style={{ backgroundImage: "repeating-linear-gradient(0deg, transparent 0 31px, rgba(0,79,129,.08) 31px 32px)" }}>
          {shown.length === 0 && <p className="col-span-full grid place-items-center text-center font-semibold opacity-70">Your scrapbook is empty for now.<br />Planes your teammates throw you get pasted in here.</p>}
          {shown.map((p, i) => {
            const st = PLANE_STYLES[(p.style in PLANE_STYLES ? p.style : "thanks") as PlaneStyle];
            return (
              <article key={p.id} className="relative flex flex-col rounded-md p-4 shadow-[0_6px_14px_rgba(0,0,0,.18)]" style={{ background: st.color, color: st.ink, transform: `rotate(${tilt[i % 4]}deg)` }}>
                <span className="absolute -top-2.5 left-1/2 h-5 w-16 -translate-x-1/2 rotate-[-3deg] bg-white/60 shadow-sm" aria-hidden />
                <div className="mb-1 flex items-center justify-between text-[11px] font-bold uppercase tracking-wider opacity-80"><span className="flex items-center gap-1"><PlaneIcon className="h-3.5 w-3.5" color={st.ink} />{st.label}</span><span>{p.date}</span></div>
                {p.sticker && <span className="absolute -right-2 -top-3 rotate-12 text-4xl drop-shadow" aria-hidden>{p.sticker}</span>}
                <p className="flex-1 whitespace-pre-wrap font-semibold leading-snug" style={{ fontFamily: "'Comic Sans MS','Chalkboard SE','Marker Felt',cursive" }}>{p.message}</p>
                <div className="mt-3 flex items-center justify-between text-sm"><span className="font-bold opacity-80">— {p.from}</span><ReportPlaneButton id={p.id} /></div>
              </article>
            );
          })}
        </div>
      </div>
      <div className="mt-4 flex items-center justify-center gap-4">
        <button type="button" onClick={() => go(-1)} disabled={page === 0} aria-label="Previous page" className="grid h-11 w-11 place-items-center rounded-full border border-line bg-surface shadow-soft disabled:opacity-40"><ChevronLeft className="h-5 w-5" /></button>
        <span className="text-sm font-semibold text-muted">Page {page + 1} of {spreads}</span>
        <button type="button" onClick={() => go(1)} disabled={page >= spreads - 1} aria-label="Next page" className="grid h-11 w-11 place-items-center rounded-full border border-line bg-surface shadow-soft disabled:opacity-40"><ChevronRight className="h-5 w-5" /></button>
      </div>
    </div>
  );
}
