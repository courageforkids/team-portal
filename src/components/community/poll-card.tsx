"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Lock, Trash2, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toaster";
import { cn } from "@/lib/cn";
import { closePollAction, deletePollAction, votePollAction } from "@/server/community-actions";

export type PollView = {
  id: string; question: string; description: string; options: { id: string; label: string; count: number; voters: string[] }[];
  multiple: boolean; anonymous: boolean; open: boolean; closesLabel: string | null; myVote: string[]; total: number; showResults: boolean;
  canManage: boolean; author: string;
};

export function PollCard({ p }: { p: PollView }) {
  const [pick, setPick] = useState<string[]>(p.myVote);
  const [changing, setChanging] = useState(false);
  const [pending, start] = useTransition();
  const toast = useToast();
  const router = useRouter();
  const voted = p.myVote.length > 0;
  const voting = p.open && (!voted || changing);
  const run = (fn: () => Promise<{ ok: boolean; message?: string; error?: string }>) => start(async () => {
    const r = await fn(); toast.push(r.ok ? "success" : "error", r.ok ? r.message ?? "Done" : r.error ?? "Error"); if (r.ok) { setChanging(false); router.refresh(); }
  });
  const max = Math.max(1, ...p.options.map((o) => o.count));
  return (
    <article id={`poll-${p.id}`} className="card scroll-mt-20 p-5">
      <div className="mb-1 flex flex-wrap items-center gap-2 text-xs text-muted">
        {p.open ? <Badge tone="green" dot>Open</Badge> : <Badge tone="muted"><Lock className="h-3 w-3" />Closed</Badge>}
        {p.anonymous && <Badge tone="neutral"><EyeOff className="h-3 w-3" />Anonymous</Badge>}
        {p.multiple && <span>Pick any</span>}
        <span>· by {p.author}{p.closesLabel ? ` · ${p.closesLabel}` : ""}</span>
      </div>
      <h2 className="text-lg font-semibold">{p.question}</h2>
      {p.description && <p className="mt-1 text-sm text-muted">{p.description}</p>}
      <div className="mt-4 space-y-2">
        {p.options.map((o) => {
          const on = pick.includes(o.id);
          if (voting) return (
            <label key={o.id} className={cn("flex min-h-11 cursor-pointer items-center gap-3 rounded-xl border px-3 py-2 transition", on ? "border-brand/50 bg-brand-soft" : "border-line hover:bg-surface-2")}>
              <input type={p.multiple ? "checkbox" : "radio"} name={`poll-${p.id}`} checked={on} className="h-[18px] w-[18px] accent-[var(--brand)]"
                onChange={() => setPick(p.multiple ? (on ? pick.filter((x) => x !== o.id) : [...pick, o.id]) : [o.id])} />
              <span className="text-sm font-medium">{o.label}</span>
            </label>
          );
          const pct = p.total ? Math.round((o.count / p.total) * 100) : 0;
          return (
            <div key={o.id} className="relative overflow-hidden rounded-xl border border-line px-3 py-2.5">
              {p.showResults && <div className="absolute inset-y-0 left-0 bg-brand-soft" style={{ width: `${(o.count / max) * 100}%` }} aria-hidden />}
              <div className="relative flex items-center justify-between gap-3 text-sm">
                <span className="flex items-center gap-1.5 font-medium">{p.myVote.includes(o.id) && <Check className="h-4 w-4 text-brand-ink" aria-label="Your vote" />}{o.label}</span>
                {p.showResults && <span className="tabular-nums text-muted">{o.count} · {pct}%</span>}
              </div>
              {p.showResults && !p.anonymous && o.voters.length > 0 && <div className="relative mt-0.5 text-xs text-muted">{o.voters.join(", ")}</div>}
            </div>
          );
        })}
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        {voting && <Button size="sm" disabled={pending || !pick.length} onClick={() => run(() => votePollAction(p.id, pick))}>{voted ? "Update vote" : "Vote"}</Button>}
        {voting && voted && <Button size="sm" variant="ghost" onClick={() => { setPick(p.myVote); setChanging(false); }}>Cancel</Button>}
        {!voting && p.open && voted && <Button size="sm" variant="ghost" onClick={() => setChanging(true)}>Change my vote</Button>}
        {!p.showResults && <span className="text-xs text-muted">{voted ? "Results show when the poll closes." : "Vote to see results."}</span>}
        <span className="ml-auto text-xs text-muted">{p.total} {p.total === 1 ? "vote" : "votes"}</span>
        {p.canManage && p.open && <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(() => closePollAction(p.id))}>Close poll</Button>}
        {p.canManage && <button aria-label="Delete poll" disabled={pending} onClick={() => { if (window.confirm("Delete this poll and all its votes?")) run(() => deletePollAction(p.id)); }} className="rounded-lg p-1.5 text-faint hover:bg-surface-2 hover:text-bad"><Trash2 className="h-4 w-4" /></button>}
      </div>
    </article>
  );
}
