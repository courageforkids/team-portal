import { cn } from "@/lib/cn";
import { progressPct, type ProjectProgressData } from "./meta";

export function progressExplanation(p: ProjectProgressData) {
  const tasks = p.counted
    ? `${p.approved} of ${p.counted} task${p.counted === 1 ? "" : "s"} approved`
    : "No tasks yet";
  const ms = p.msTotal ? `${p.msDone} of ${p.msTotal} milestone${p.msTotal === 1 ? "" : "s"} done` : "no milestones yet";
  return `${tasks} (canceled and excused tasks don't count); ${ms}.`;
}

/** Progress = approved tasks ÷ tasks that still count (excludes canceled/excused). */
export function ProgressBar({ p, size = "sm", showLabel = true, compact, className }: {
  p: ProjectProgressData; size?: "sm" | "md"; showLabel?: boolean; compact?: boolean; className?: string;
}) {
  const pct = progressPct(p);
  const explain = progressExplanation(p);
  return (
    <div className={className} title={explain}>
      {showLabel && (
        <div className="mb-1.5 flex items-baseline justify-between gap-2 text-xs">
          <span className="font-medium text-fg-2">Progress</span>
          <span className="tabular-nums text-muted">
            {p.counted ? <><span className="font-semibold text-fg">{pct}%</span>{!compact && <> · {p.approved}/{p.counted} tasks</>}</> : "No tasks yet"}
            {!compact && p.msTotal > 0 && <> · {p.msDone}/{p.msTotal} milestones</>}
          </span>
        </div>
      )}
      <div role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label="Project progress" aria-valuetext={`${pct}%. ${explain}`}
        className={cn("overflow-hidden rounded-full bg-surface-3", size === "md" ? "h-2.5" : "h-1.5")}>
        <div className={cn("h-full rounded-full transition-[width] duration-500", pct === 100 ? "bg-ok" : "bg-brand")} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
