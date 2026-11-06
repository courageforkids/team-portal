import Link from "next/link";
import { AlertTriangle, CheckCircle2, CalendarClock, Clock3, FileUp, Link2, ListChecks, PenLine, Repeat, ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { AvatarStack } from "@/components/ui/avatar";
import { cn } from "@/lib/cn";
import { dueLabel } from "@/lib/dates";
import { isDueSoon, isOverdue, PRIORITY_LABEL, STATUS_LABEL, STATUS_TONE, type Priority, type TaskStatus } from "@/lib/task-meta";
import type { SubmissionType } from "@/db/schema";

export function StatusBadge({ status }: { status: TaskStatus }) {
  return <Badge tone={STATUS_TONE[status]} dot>{STATUS_LABEL[status]}</Badge>;
}

export function PriorityBadge({ priority, quiet }: { priority: Priority; quiet?: boolean }) {
  if (quiet && (priority === "medium" || priority === "low")) return null;
  const tone = priority === "urgent" ? "red" : priority === "high" ? "accent" : "muted";
  return <Badge tone={tone}>{PRIORITY_LABEL[priority]}</Badge>;
}

/** Overdue is shown calmly (amber text + icon), never as a loud red banner. */
export function DueChip({ status, dueAt, tz, className }: { status: TaskStatus; dueAt: Date | string | null; tz?: string; className?: string }) {
  if (status === "approved") return <span className={cn("inline-flex items-center gap-1 text-xs font-medium text-ok", className)}><CheckCircle2 className="h-3.5 w-3.5" aria-hidden />Completed</span>;
  if (status === "canceled" || status === "excused") return <span className={cn("text-xs font-medium text-muted", className)}>{status === "canceled" ? "Canceled" : "Excused"}</span>;
  const overdue = isOverdue({ status, dueAt });
  const soon = isDueSoon({ status, dueAt }, 48);
  const Icon = overdue ? AlertTriangle : soon ? Clock3 : CalendarClock;
  return (
    <span className={cn("inline-flex items-center gap-1 text-xs font-medium", overdue ? "text-warn" : soon ? "text-fg-2" : "text-muted", className)}>
      <Icon className="h-3.5 w-3.5" aria-hidden />
      {dueLabel(dueAt, tz)}
    </span>
  );
}

const TYPE_ICON = { file: FileUp, text: PenLine, link: Link2, checklist: ListChecks } as const;
const TYPE_SHORT = { file: "Upload", text: "Written", link: "Link", checklist: "Checklist" } as const;
export function SubmissionTypes({ types }: { types: SubmissionType[] }) {
  if (!types.length) return null;
  return (
    <span className="inline-flex flex-wrap items-center gap-2 text-xs text-muted">
      {types.map((t) => { const I = TYPE_ICON[t]; return <span key={t} className="inline-flex items-center gap-1"><I className="h-3.5 w-3.5" aria-hidden />{TYPE_SHORT[t]}</span>; })}
    </span>
  );
}

export type TaskCardData = {
  id: string; title: string; instructions?: string; status: TaskStatus; priority: Priority; dueAt: Date | null; timezone?: string;
  departmentName?: string | null; departmentColor?: string | null; projectName?: string | null; submissionTypes?: SubmissionType[];
  assignees?: { name: string; avatarFileId: string | null }[]; seriesId?: string | null;
};

/** Rich card for dashboards ("My priorities"). */
export function TaskCard({ t, showAssignees }: { t: TaskCardData; showAssignees?: boolean }) {
  const overdue = isOverdue(t);
  return (
    <Link href={`/tasks/${t.id}`}
      className={cn("focus-ring group block rounded-xl border bg-surface p-4 transition hover:border-line-strong hover:shadow-card",
        overdue ? "border-warn/35" : "border-line")}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
            <StatusBadge status={t.status} />
            <PriorityBadge priority={t.priority} quiet />
            {t.seriesId && <Badge tone="muted"><Repeat className="h-3 w-3" />Recurring</Badge>}
          </div>
          <h3 className="font-semibold leading-snug text-fg group-hover:text-brand-ink">{t.title}</h3>
          {t.instructions && <p className="mt-1 line-clamp-2 text-sm text-muted">{t.instructions}</p>}
        </div>
        <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-faint transition group-hover:translate-x-0.5 group-hover:text-fg-2" aria-hidden />
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
        <DueChip status={t.status} dueAt={t.dueAt} tz={t.timezone} />
        {t.departmentName && (
          <span className="inline-flex items-center gap-1.5 text-xs text-muted">
            <span className="h-2 w-2 rounded-full" style={{ background: t.departmentColor ?? "#94a3b8" }} aria-hidden />{t.departmentName}
          </span>
        )}
        {t.submissionTypes && <SubmissionTypes types={t.submissionTypes} />}
        {showAssignees && t.assignees && t.assignees.length > 0 && <span className="ml-auto"><AvatarStack people={t.assignees} size={24} /></span>}
      </div>
    </Link>
  );
}

/** Compact row for lists and tables. */
export function TaskRow({ t, showAssignees = true }: { t: TaskCardData; showAssignees?: boolean }) {
  const overdue = isOverdue(t);
  return (
    <Link href={`/tasks/${t.id}`} className="focus-ring group flex items-center gap-3 px-4 py-3 transition hover:bg-surface-2 sm:px-5">
      <span className={cn("h-2 w-2 shrink-0 rounded-full", overdue ? "bg-warn" : "bg-transparent")} aria-hidden />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="truncate font-medium text-fg group-hover:text-brand-ink">{t.title}</span>
          {t.seriesId && <Repeat className="h-3.5 w-3.5 text-faint" aria-label="Recurring" />}
        </div>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1">
          <DueChip status={t.status} dueAt={t.dueAt} tz={t.timezone} />
          {t.departmentName && <span className="text-xs text-muted">{t.departmentName}</span>}
          {t.projectName && <span className="hidden text-xs text-muted sm:inline">· {t.projectName}</span>}
        </div>
      </div>
      <div className="hidden shrink-0 items-center gap-2 sm:flex"><PriorityBadge priority={t.priority} quiet /><StatusBadge status={t.status} /></div>
      <div className="shrink-0 sm:hidden"><StatusBadge status={t.status} /></div>
      {showAssignees && t.assignees && <span className="hidden shrink-0 md:block"><AvatarStack people={t.assignees} size={24} /></span>}
    </Link>
  );
}
