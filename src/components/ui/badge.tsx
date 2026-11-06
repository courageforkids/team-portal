import { cn } from "@/lib/cn";
import type { ReactNode } from "react";

export type Tone = "neutral" | "blue" | "violet" | "amber" | "green" | "muted" | "red" | "brand" | "accent";
const TONES: Record<Tone, string> = {
  neutral: "bg-surface-2 text-fg-2 ring-line",
  blue: "bg-info-soft text-info ring-info/15",
  violet: "bg-violet-soft text-violet ring-violet/15",
  amber: "bg-warn-soft text-warn ring-warn/15",
  green: "bg-ok-soft text-ok ring-ok/15",
  muted: "bg-surface-2 text-muted ring-line",
  red: "bg-bad-soft text-bad ring-bad/15",
  brand: "bg-brand-soft text-brand-ink ring-brand/15",
  accent: "bg-accent-soft text-accent-ink ring-accent/40",
};

export function Badge({ tone = "neutral", children, className, dot }: { tone?: Tone; children: ReactNode; className?: string; dot?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ring-inset whitespace-nowrap", TONES[tone], className)}>
      {dot && <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden />}
      {children}
    </span>
  );
}
