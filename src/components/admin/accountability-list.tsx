import Link from "next/link";
import { CalendarClock, CheckCircle2, Pencil } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/cn";
import { fmtDate } from "@/lib/dates";
import { AccountabilityDialog } from "./accountability-dialog";
import { ACC_STATUS_LABEL, ACC_STATUS_TONE, ACC_TYPE_LABEL, ACC_TYPE_TONE } from "./labels";
import type { AccountabilityRow } from "@/server/admin";

function fmtDay(d: string) {
  // calendar date (yyyy-MM-dd) — format without timezone shifting
  const [y, m, day] = d.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, day, 12)).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

export function AccountabilityList({ rows, today, tz, showMember }: { rows: AccountabilityRow[]; today: string; tz: string; showMember?: boolean }) {
  return (
    <ul className="divide-y divide-line">
      {rows.map((r) => {
        const followDue = r.status !== "resolved" && !!r.followUpDate && r.followUpDate <= today;
        const rec = { id: r.id, memberId: r.memberId, type: r.type, title: r.title, details: r.details, followUpDate: r.followUpDate, status: r.status, resolution: r.resolution };
        return (
          <li key={r.id} className={cn("px-4 py-4 sm:px-5", followDue && "bg-warn-soft/50")}>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0 flex-1">
                {showMember && (
                  <Link href={`/admin/members/${r.memberId}`} className="focus-ring mb-2 inline-flex items-center gap-2 rounded-md text-sm font-semibold text-fg hover:text-brand-ink">
                    <Avatar name={r.memberName} fileId={r.memberAvatar} size={24} />{r.memberName}
                  </Link>
                )}
                <div className="flex flex-wrap items-center gap-1.5">
                  <Badge tone={ACC_TYPE_TONE[r.type]}>{ACC_TYPE_LABEL[r.type]}</Badge>
                  <Badge tone={ACC_STATUS_TONE[r.status]} dot>{ACC_STATUS_LABEL[r.status]}</Badge>
                </div>
                <h3 className="mt-1.5 font-semibold leading-snug text-fg">{r.title}</h3>
                {r.details && <p className="prose-body mt-1 text-sm text-fg-2">{r.details}</p>}
                {r.status === "resolved" && r.resolution && (
                  <p className="mt-2 flex items-start gap-1.5 rounded-lg bg-ok-soft px-3 py-2 text-sm text-fg-2">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-ok" aria-hidden /><span className="prose-body">{r.resolution}</span>
                  </p>
                )}
                <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
                  {r.followUpDate && (
                    <span className={cn("inline-flex items-center gap-1", followDue && "font-semibold text-warn")}>
                      <CalendarClock className="h-3.5 w-3.5" aria-hidden />
                      {!followDue ? `Follow up ${fmtDay(r.followUpDate)}` : r.followUpDate === today ? "Follow-up planned for today" : `Follow-up was planned for ${fmtDay(r.followUpDate)}`}
                    </span>
                  )}
                  <span>Added {fmtDate(r.createdAt, tz, "MMM d, yyyy")}{r.authorName ? ` by ${r.authorName}` : ""}</span>
                  {r.updatedAt.getTime() - r.createdAt.getTime() > 60_000 && <span>· Updated {fmtDate(r.updatedAt, tz, "MMM d")}</span>}
                </div>
              </div>
              <div className="flex shrink-0 gap-2">
                <AccountabilityDialog record={rec} trigger={<><Pencil className="h-3.5 w-3.5" aria-hidden />Edit</>} triggerVariant="secondary" />
                {r.status !== "resolved" && (
                  <AccountabilityDialog record={rec} presetStatus="resolved" title="Resolve record" trigger={<><CheckCircle2 className="h-3.5 w-3.5" aria-hidden />Resolve</>} triggerVariant="subtle" />
                )}
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
