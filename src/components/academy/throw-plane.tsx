"use client";
import { useState } from "react";
import { Dialog } from "@/components/ui/dialog";
import { Select } from "@/components/ui/form";
import { buttonClass } from "@/components/ui/button";
import { useToast } from "@/components/ui/toaster";
import { PLANE_STICKERS, PLANE_STYLES, type PlaneStyle } from "@/lib/academy";
import { throwPlaneAction } from "@/server/academy-actions";
import { sfx } from "@/lib/music";
import { cn } from "@/lib/cn";
import { PlaneIcon } from "./plane-icon";

export function ThrowPlaneButton({ people, defaultTo, label = "Throw a paper plane", className }: { people: { id: string; name: string }[]; defaultTo?: string; label?: string; className?: string }) {
  const [open, setOpen] = useState(false);
  const [to, setTo] = useState(defaultTo ?? "");
  const [style, setStyle] = useState<PlaneStyle>("thanks");
  const [msg, setMsg] = useState("");
  const [sticker, setSticker] = useState<string | null>(null);
  const [onBoard, setOnBoard] = useState(false);
  const [busy, setBusy] = useState(false);
  const [flying, setFlying] = useState(false);
  const toast = useToast();
  const st = PLANE_STYLES[style];

  const throwIt = async () => {
    if (busy) return;
    setBusy(true);
    const r = await throwPlaneAction({ toId: to, style, message: msg, sticker, public: onBoard });
    if (!r.ok) { setBusy(false); toast.push("error", r.error); return; }
    setFlying(true); sfx.whoosh();
    setTimeout(() => {
      setOpen(false); setFlying(false); setBusy(false); setMsg(""); setSticker(null); setOnBoard(false); setTo(defaultTo ?? "");
      toast.push("success", r.message ?? "Plane thrown!");
      window.dispatchEvent(new Event("cfk-academy-check"));
    }, 900);
  };

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={className ?? buttonClass("secondary")}><PlaneIcon className="h-4 w-4" />{label}</button>
      <Dialog open={open} onClose={() => !busy && setOpen(false)} title="Throw a paper plane" description="A quick note that flies onto a teammate's screen." size="sm">
        <div className="space-y-4">
          <div>
            <label className="label" htmlFor="pl-to">To</label>
            <Select id="pl-to" value={to} onChange={(e) => setTo(e.target.value)}><option value="" disabled>Choose a teammate</option>{people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select>
          </div>
          <fieldset>
            <legend className="label">Kind of plane</legend>
            <div className="grid grid-cols-2 gap-2">
              {(Object.keys(PLANE_STYLES) as PlaneStyle[]).map((k) => (
                <label key={k} className={`cursor-pointer rounded-xl border-2 px-3 py-2 text-sm font-semibold ${style === k ? "border-fg" : "border-transparent"}`} style={{ background: PLANE_STYLES[k].color, color: PLANE_STYLES[k].ink }}>
                  <input type="radio" name="pl-style" value={k} checked={style === k} onChange={() => setStyle(k)} className="sr-only" />{PLANE_STYLES[k].label}
                </label>
              ))}
            </div>
          </fieldset>
          <div className="rounded-2xl p-4 shadow-soft" style={{ background: st.color, color: st.ink, animation: flying ? "cfk-fly-off .9s cubic-bezier(.5,0,.7,.4) both" : undefined }}>
            <label htmlFor="pl-msg" className="mb-1 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider opacity-80"><PlaneIcon className="h-3.5 w-3.5" color={st.ink} />Your note</label>
            <textarea id="pl-msg" value={msg} onChange={(e) => setMsg(e.target.value.slice(0, 200))} rows={3} placeholder="You were amazing at packing day!" className="w-full resize-none bg-transparent text-lg font-semibold placeholder:opacity-50 focus:outline-none" />
            <div className="flex items-center justify-between text-[11px] opacity-60"><span className="text-2xl">{sticker}</span><span>{msg.length}/200</span></div>
          </div>
          <fieldset>
            <legend className="label">Add a sticker</legend>
            <div className="flex flex-wrap gap-1.5">
              {PLANE_STICKERS.map((s) => (
                <button key={s} type="button" aria-pressed={sticker === s} aria-label={`Sticker ${s}`} onClick={() => setSticker(sticker === s ? null : s)}
                  className={cn("grid h-10 w-10 place-items-center rounded-xl border text-xl transition", sticker === s ? "scale-110 border-brand bg-brand-soft" : "border-line hover:bg-surface-2")}>{s}</button>
              ))}
            </div>
          </fieldset>
          <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={onBoard} onChange={(e) => setOnBoard(e.target.checked)} className="mt-0.5 h-5 w-5" /><span><b>Post it on the Plane Board</b><span className="block text-xs text-muted">Everyone in the Academy can see it and ❤️ it. The most-loved plane each week is Plane of the Week.</span></span></label>
          <div className="flex justify-end"><button onClick={throwIt} disabled={busy || !to || !msg.trim()} className={buttonClass("primary")}><PlaneIcon className="h-4 w-4" />Throw it</button></div>
        </div>
      </Dialog>
    </>
  );
}
