import { CircleCheck } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Card } from "@/components/ui/card";
import { ago } from "@/lib/dates";

type P = { id: string; name: string; avatarFileId: string | null; readAt: Date | null; acknowledgedAt: Date | null };

export function ProgressPanel({ requireAck, total, read, acknowledged, people }: {
  requireAck: boolean; total: number; read: number; acknowledged: number; people: P[];
}) {
  const done = requireAck ? acknowledged : read;
  const pct = total ? Math.round((done / total) * 100) : 0;
  const waiting = people.filter((p) => (requireAck ? !p.acknowledgedAt : !p.readAt));
  const finished = people.filter((p) => (requireAck ? p.acknowledgedAt : p.readAt));
  return (
    <Card className="p-5">
      <h2 className="text-[15px] font-semibold text-fg">{requireAck ? "Acknowledgments" : "Reads"}</h2>
      <p className="mt-0.5 text-[13px] text-muted">Visible to admins only.</p>
      <div className="mt-4 flex items-baseline gap-1.5">
        <span className="text-[28px] leading-none font-bold tracking-tight text-fg tabular-nums">{done}</span>
        <span className="text-sm text-muted">of {total} {requireAck ? "acknowledged" : "have read it"}</span>
      </div>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-surface-3" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={done}
        aria-label={requireAck ? "Acknowledged" : "Read"}>
        <div className="h-full rounded-full bg-ok transition-[width]" style={{ width: `${pct}%` }} />
      </div>
      {requireAck && <p className="mt-2 text-xs text-muted">{read} of {total} opened it</p>}

      {total === 0 ? (
        <p className="mt-4 text-sm text-muted">No active members match this audience yet.</p>
      ) : waiting.length === 0 ? (
        <p className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-ok"><CircleCheck className="h-4 w-4" aria-hidden />Everyone&apos;s caught up.</p>
      ) : (
        <div className="mt-5">
          <h3 className="eyebrow mb-2">Waiting on {waiting.length}</h3>
          <ul className="space-y-2">
            {waiting.map((p) => (
              <li key={p.id} className="flex items-center gap-2.5 text-sm">
                <Avatar name={p.name} fileId={p.avatarFileId} size={26} className="ring-0" />
                <span className="min-w-0 flex-1 truncate text-fg-2">{p.name}</span>
                {requireAck && p.readAt && <span className="shrink-0 text-xs text-muted">Opened</span>}
              </li>
            ))}
          </ul>
        </div>
      )}
      {finished.length > 0 && waiting.length > 0 && (
        <details className="group mt-5">
          <summary className="focus-ring cursor-pointer list-none rounded text-[13px] font-semibold text-brand-ink">
            <span className="group-open:hidden">Show who&apos;s done ({finished.length})</span>
            <span className="hidden group-open:inline">Hide who&apos;s done</span>
          </summary>
          <ul className="mt-2 space-y-2">
            {finished.map((p) => (
              <li key={p.id} className="flex items-center gap-2.5 text-sm">
                <Avatar name={p.name} fileId={p.avatarFileId} size={26} className="ring-0" />
                <span className="min-w-0 flex-1 truncate text-fg-2">{p.name}</span>
                <span className="shrink-0 text-xs text-muted">{ago((requireAck ? p.acknowledgedAt : p.readAt)!)}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </Card>
  );
}
