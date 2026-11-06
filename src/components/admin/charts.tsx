import { cn } from "@/lib/cn";

/** A thin horizontal bar (purely visual — the number is always printed next to it). */
export function Bar({ value, max, className, color }: { value: number; max: number; className?: string; color?: string }) {
  const pct = max > 0 ? Math.max(value > 0 ? 4 : 0, Math.round((value / max) * 100)) : 0;
  return (
    <span className="block h-2 w-full overflow-hidden rounded-full bg-surface-2" aria-hidden>
      <span className={cn("block h-full rounded-full", !color && "bg-brand", className)} style={{ width: `${pct}%`, background: color }} />
    </span>
  );
}

/** Stacked bar for department activity: open (brand), overdue (warn), completed (ok). */
export function SegmentBar({ parts, max }: { parts: { value: number; className: string }[]; max: number }) {
  return (
    <span className="flex h-2.5 w-full gap-px overflow-hidden rounded-full bg-surface-2" aria-hidden>
      {parts.map((p, i) => p.value > 0 && (
        <span key={i} className={cn("h-full first:rounded-l-full last:rounded-r-full", p.className)} style={{ width: `${max > 0 ? (p.value / max) * 100 : 0}%` }} />
      ))}
    </span>
  );
}

/**
 * Column chart of a percentage per period (e.g. weekly on-time rate). Null values render as an
 * empty slot labeled "—". Includes a visually hidden table for screen readers.
 */
export function RateColumns({ points, caption }: { points: { label: string; value: number | null; detail: string }[]; caption: string }) {
  const W = 440, H = 220, padL = 46, padR = 4, padT = 22, padB = 30;
  const plotW = W - padL - padR, plotH = H - padT - padB;
  const slot = plotW / points.length;
  const barW = Math.min(34, slot * 0.6);
  const y = (v: number) => padT + plotH - v * plotH;
  return (
    <figure>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={caption}>
        {[0, 0.5, 1].map((g) => (
          <g key={g}>
            <line x1={padL} x2={W - padR} y1={y(g)} y2={y(g)} className="stroke-line" strokeDasharray={g === 0 ? undefined : "3 4"} />
            <text x={padL - 8} y={y(g) + 4} textAnchor="end" className="fill-muted text-[11px]">{g * 100}%</text>
          </g>
        ))}
        {points.map((p, i) => {
          const cx = padL + slot * i + slot / 2;
          const last = i === points.length - 1;
          return (
            <g key={i}>
              {p.value === null ? (
                <text x={cx} y={y(0) - 8} textAnchor="middle" className="fill-faint text-[12px]">—</text>
              ) : (
                <>
                  <rect x={cx - barW / 2} y={y(p.value)} width={barW} height={Math.max(2, plotH * p.value)} rx={5}
                    className={last ? "fill-accent" : "fill-brand"} opacity={last ? 1 : 0.85} />
                  <text x={cx} y={y(p.value) - 6} textAnchor="middle" className="fill-fg text-[11px] font-semibold">{Math.round(p.value * 100)}%</text>
                </>
              )}
              <text x={cx} y={H - 10} textAnchor="middle" className={cn("text-[11px]", last ? "fill-fg font-semibold" : "fill-muted")}>{p.label}</text>
            </g>
          );
        })}
      </svg>
      <table className="sr-only">
        <caption>{caption}</caption>
        <thead><tr><th scope="col">Week of</th><th scope="col">On-time rate</th><th scope="col">Submissions measured</th></tr></thead>
        <tbody>{points.map((p, i) => <tr key={i}><td>{p.label}</td><td>{p.value === null ? "No data" : `${Math.round(p.value * 100)}%`}</td><td>{p.detail}</td></tr>)}</tbody>
      </table>
    </figure>
  );
}
