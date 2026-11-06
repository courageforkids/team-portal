import Link from "next/link";
import { addDays, endOfMonth, endOfWeek, format, isSameMonth, startOfMonth, startOfWeek } from "date-fns";
import { formatInTimeZone } from "date-fns-tz";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/cn";
import { isOverdue } from "@/lib/task-meta";
import { DEFAULT_TZ } from "@/lib/dates";
import type { TaskListItem } from "@/server/queries";
import { buttonClass } from "@/components/ui/button";

/** Month grid of task deadlines. `month` is yyyy-MM. */
export function TaskMonth({ tasks, month, hrefFor }: { tasks: TaskListItem[]; month: string; hrefFor: (month: string) => string }) {
  const first = new Date(`${month}-01T12:00:00`);
  const start = startOfWeek(startOfMonth(first));
  const end = endOfWeek(endOfMonth(first));
  const days: Date[] = [];
  for (let d = start; d <= end; d = addDays(d, 1)) days.push(d);
  const byDay = new Map<string, TaskListItem[]>();
  for (const t of tasks) if (t.dueAt) {
    const k = formatInTimeZone(t.dueAt, t.timezone || DEFAULT_TZ, "yyyy-MM-dd");
    byDay.set(k, [...(byDay.get(k) ?? []), t]);
  }
  const prev = format(addDays(startOfMonth(first), -1), "yyyy-MM");
  const next = format(addDays(endOfMonth(first), 1), "yyyy-MM");
  const today = formatInTimeZone(new Date(), DEFAULT_TZ, "yyyy-MM-dd");
  const agenda = [...byDay.entries()].filter(([k]) => k.startsWith(month)).sort(([a], [b]) => a.localeCompare(b));
  return (
    <div className="card overflow-hidden">
      <div className="flex items-center justify-between border-b border-line px-4 py-3">
        <h2 className="font-semibold">{format(first, "MMMM yyyy")}</h2>
        <div className="flex gap-1">
          <Link href={hrefFor(prev)} className={buttonClass("ghost", "icon")} aria-label="Previous month"><ChevronLeft className="h-4 w-4" /></Link>
          <Link href={hrefFor(formatInTimeZone(new Date(), DEFAULT_TZ, "yyyy-MM"))} className={buttonClass("ghost", "sm")}>Today</Link>
          <Link href={hrefFor(next)} className={buttonClass("ghost", "icon")} aria-label="Next month"><ChevronRight className="h-4 w-4" /></Link>
        </div>
      </div>
      <div className="hidden md:block">
        <div className="grid grid-cols-7 border-b border-line text-center text-xs font-semibold text-muted">
          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => <div key={d} className="py-2">{d}</div>)}
        </div>
        <div className="grid grid-cols-7">
          {days.map((d) => {
            const k = format(d, "yyyy-MM-dd");
            const items = byDay.get(k) ?? [];
            return (
              <div key={k} className={cn("min-h-[104px] border-b border-r border-line p-1.5 [&:nth-child(7n)]:border-r-0", !isSameMonth(d, first) && "bg-surface-2/60")}>
                <div className={cn("mb-1 grid h-6 w-6 place-items-center rounded-full text-xs font-semibold", k === today ? "bg-brand text-brand-fg" : isSameMonth(d, first) ? "text-fg-2" : "text-faint")}>{format(d, "d")}</div>
                <div className="space-y-1">
                  {items.slice(0, 3).map((t) => (
                    <Link key={t.id} href={`/tasks/${t.id}`} title={t.title}
                      className={cn("block truncate rounded-md px-1.5 py-0.5 text-[11px] font-medium",
                        t.status === "approved" ? "bg-ok-soft text-ok line-through decoration-ok/40" : isOverdue(t) ? "bg-warn-soft text-warn" : "bg-brand-soft text-brand-ink")}>{t.title}</Link>
                  ))}
                  {items.length > 3 && <div className="px-1.5 text-[11px] text-muted">+{items.length - 3} more</div>}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <div className="divide-y divide-line md:hidden">
        {agenda.length === 0 && <p className="px-4 py-10 text-center text-sm text-muted">No deadlines this month.</p>}
        {agenda.map(([k, items]) => (
          <div key={k} className="px-4 py-3">
            <div className="eyebrow mb-1.5">{format(new Date(k + "T12:00:00"), "EEEE, MMM d")}</div>
            {items.map((t) => <Link key={t.id} href={`/tasks/${t.id}`} className={cn("block py-1.5 text-sm font-medium", isOverdue(t) ? "text-warn" : "text-fg")}>{t.title}</Link>)}
          </div>
        ))}
      </div>
    </div>
  );
}
