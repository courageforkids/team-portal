"use client";
import Link from "next/link";
import { useTransition, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Circle, ArrowRight, Sparkles } from "lucide-react";
import { cn } from "@/lib/cn";
import { useToast } from "@/components/ui/toaster";
import { toggleOnboardingStepAction } from "@/server/onboarding-actions";
import type { StepStatus } from "@/server/onboarding";

export function OnboardingChecklist({ steps, compact }: { steps: StepStatus[]; compact?: boolean }) {
  const [state, setState] = useState(steps);
  const [, start] = useTransition();
  const toast = useToast();
  const router = useRouter();
  const toggle = (s: StepStatus) => {
    const next = !s.done;
    setState((x) => x.map((y) => (y.id === s.id ? { ...y, done: next } : y)));
    start(async () => { const r = await toggleOnboardingStepAction(s.id, next); if (!r.ok) { toast.push("error", r.error); setState(steps); } else router.refresh(); });
  };
  const list = compact ? state.filter((s) => !s.done).slice(0, 3) : state;
  return (
    <ul className="space-y-2">
      {list.map((s) => (
        <li key={s.id} className={cn("flex items-start gap-3 rounded-xl border p-3", s.done ? "border-ok/25 bg-ok-soft/50" : "border-line")}>
          {s.auto ? (
            s.done ? <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-ok" aria-label="Done" /> : <Circle className="mt-0.5 h-5 w-5 shrink-0 text-faint" aria-label="Not done yet" />
          ) : (
            <button onClick={() => toggle(s)} aria-pressed={s.done} aria-label={s.done ? `Mark “${s.title}” not done` : `Mark “${s.title}” done`} className="mt-0.5 shrink-0 rounded-full">
              {s.done ? <CheckCircle2 className="h-5 w-5 text-ok" /> : <Circle className="h-5 w-5 text-muted hover:text-brand-ink" />}
            </button>
          )}
          <div className="min-w-0 flex-1">
            <div className={cn("text-sm font-semibold", s.done && "text-muted line-through decoration-ok/40")}>{s.title}</div>
            {!compact && s.description && <p className="mt-0.5 text-xs text-muted">{s.description}</p>}
            {s.auto && !s.done && !compact && <p className="mt-0.5 text-[11px] text-faint">Checks itself off when you do it.</p>}
          </div>
          {!s.done && s.href && <Link href={s.href} className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-brand-ink hover:underline">{s.resourceTitle ? "Read" : "Go"}<ArrowRight className="h-3.5 w-3.5" /></Link>}
        </li>
      ))}
    </ul>
  );
}

export function OnboardingHomeCard({ steps }: { steps: StepStatus[] }) {
  const done = steps.filter((s) => s.done).length;
  if (!steps.length || done === steps.length) return null;
  const pct = Math.round((done / steps.length) * 100);
  return (
    <section className="card animate-in p-5" aria-label="Setup checklist">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 font-semibold"><Sparkles className="h-4 w-4 text-accent-ink" />Getting started</h2>
        <Link href="/onboarding" className="text-sm font-semibold text-brand-ink hover:underline">{done} of {steps.length} done</Link>
      </div>
      <div className="mb-4 h-2 overflow-hidden rounded-full bg-surface-2" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Setup progress">
        <div className="h-full rounded-full bg-brand transition-all" style={{ width: `${pct}%` }} />
      </div>
      <OnboardingChecklist steps={steps} compact />
    </section>
  );
}
