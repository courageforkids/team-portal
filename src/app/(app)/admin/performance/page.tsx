import Link from "next/link";
import { ChevronLeft, ChevronRight, Info, BarChart3 } from "lucide-react";
import { requireAdmin } from "@/server/auth";
import { getSettings } from "@/server/settings";
import { activeMembers, loadMetricInputs } from "@/server/admin";
import {
  computeMemberMetrics, fmtRate, lastWeeks, monthPeriod, periodLabel, sumMetrics, teamOnTime, weekPeriod, type PeriodKind,
} from "@/server/metrics";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardHeader } from "@/components/ui/card";
import { Tabs } from "@/components/ui/tabs";
import { Avatar } from "@/components/ui/avatar";
import { EmptyState } from "@/components/ui/empty-state";
import { buttonClass } from "@/components/ui/button";
import { Bar, RateColumns } from "@/components/admin/charts";
import { cn } from "@/lib/cn";
import { fmtDate } from "@/lib/dates";
import { ROLE_LABEL } from "@/lib/task-meta";

export const metadata = { title: "Performance" };

const HOW: { term: string; def: string }[] = [
  { term: "Assigned", def: "Tasks assigned to the member whose due date falls inside the period. Canceled tasks are left out." },
  { term: "Approved", def: "Tasks with status Approved whose completion (approval) time falls inside the period." },
  { term: "On-time rate", def: "Of the tasks due in the period that have been submitted, the share whose first submission arrived at or before the deadline in effect. Approved extensions move the deadline, so extended work counts as on time if it meets the new date. We measure when the member submitted — never how long review took. Excused, canceled and currently blocked tasks are left out, and tasks not yet submitted aren't counted until they are. Shows “—” when nothing can be measured yet." },
  { term: "Overdue now", def: "Right now: tasks still owed by the member (not started, in progress, revision requested or blocked) whose deadline has passed. Work waiting on a reviewer is never overdue." },
  { term: "Revisions", def: "Reviews in the period where a reviewer asked for changes on one of the member's tasks. Revisions are a normal part of good work." },
  { term: "In review", def: "Right now: tasks the member submitted that are waiting for a reviewer." },
  { term: "Excused", def: "Tasks in the period that an administrator excused. They never count toward or against the on-time rate." },
  { term: "Open workload", def: "Right now: tasks the member is still working on (not started, in progress, revision requested or blocked)." },
  { term: "Totals", def: "The totals row adds up each member's numbers, so a task shared by two people counts once for each of them. The team trend uses the same basis." },
];

export default async function PerformancePage({ searchParams }: { searchParams: Promise<{ period?: string; offset?: string }> }) {
  await requireAdmin();
  const sp = await searchParams;
  const s = await getSettings();
  const tz = s.timezone;
  const now = new Date();
  const kind: PeriodKind = sp.period === "month" ? "month" : "week";
  const offset = Math.min(0, Math.max(-104, Math.trunc(Number(sp.offset) || 0)));
  const period = kind === "week" ? weekPeriod(now, tz, offset) : monthPeriod(now, tz, offset);
  const weeks = lastWeeks(now, tz, 8);
  const since = new Date(Math.min(period.start.getTime(), weeks[0].start.getTime()));

  const [members, inputs] = await Promise.all([activeMembers(), loadMetricInputs(since)]);
  const rows = members.map((m) => ({ m, x: computeMemberMetrics(m.id, inputs.tasks, inputs.reviews, period, now) }));
  const total = sumMetrics(rows.map((r) => r.x));
  const memberIds = new Set(members.map((m) => m.id));
  const trend = weeks.map((w) => {
    const t = teamOnTime(inputs.tasks, w, memberIds);
    return { label: fmtDate(w.start, tz, "MMM d"), value: t.rate, detail: t.eligible ? `${t.onTime} of ${t.eligible}` : "None" };
  });
  const maxLoad = Math.max(1, ...rows.map((r) => r.x.openWorkload));
  const href = (p: Partial<{ period: string; offset: number }>) => `?${new URLSearchParams({ period: kind, offset: String(offset), ...Object.fromEntries(Object.entries(p).map(([k, v]) => [k, String(v)])) })}`;
  const current = offset === 0;
  const label = periodLabel(kind, period, tz);

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Executive" title="Performance" description="Clear, fair numbers to help you support the team. Members are listed alphabetically — this is not a ranking." />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Tabs active={kind} items={[{ key: "week", label: "Weekly", href: "?period=week" }, { key: "month", label: "Monthly", href: "?period=month" }]} />
        <nav aria-label="Period" className="flex items-center gap-2">
          <Link href={href({ offset: offset - 1 })} className={buttonClass("secondary", "icon", "h-10 w-10")} aria-label={`Previous ${kind}`}><ChevronLeft className="h-4 w-4" aria-hidden /></Link>
          <div className="min-w-[11rem] text-center">
            <p className="text-sm font-semibold text-fg">{label}</p>
            <p className="text-xs text-muted">{current ? (kind === "week" ? "This week" : "This month") : <Link href={href({ offset: 0 })} className="focus-ring rounded font-semibold text-brand-ink hover:underline">Jump to {kind === "week" ? "this week" : "this month"}</Link>}</p>
          </div>
          {current ? (
            <span className={buttonClass("secondary", "icon", "h-10 w-10 opacity-40")} aria-disabled="true" title="You're on the current period"><ChevronRight className="h-4 w-4" aria-hidden /></span>
          ) : (
            <Link href={href({ offset: offset + 1 })} className={buttonClass("secondary", "icon", "h-10 w-10")} aria-label={`Next ${kind}`}><ChevronRight className="h-4 w-4" aria-hidden /></Link>
          )}
        </nav>
      </div>

      <Card>
        <CardHeader title="Team summary" description={`${label}. Snapshot columns (overdue now, in review, open workload) show today's numbers.`} />
        {rows.length > 0 && <p className="-mt-1 px-4 pb-2 text-xs text-muted md:hidden">Swipe the table sideways to see every column.</p>}
        {rows.length === 0 ? (
          <EmptyState compact icon={BarChart3} title="No active members yet" />
        ) : (
          <div className="overflow-x-auto border-t border-line scrollbar-thin" tabIndex={0} role="region" aria-label="Team summary table (scrolls sideways on small screens)">
            <table className="w-full min-w-[860px] text-sm">
              <caption className="sr-only">Performance by member for {label}, listed alphabetically</caption>
              <thead className="bg-surface-2">
                <tr className="text-[11px] font-semibold tracking-wide text-muted uppercase">
                  <th scope="col" className="sticky left-0 z-10 bg-surface-2 px-4 py-2.5 text-left font-semibold sm:px-5">Member</th>
                  {["Assigned", "Approved", "On-time", "Overdue now", "Revisions", "In review", "Excused", "Open workload"].map((h) => (
                    <th key={h} scope="col" className="px-3 py-2.5 text-right font-semibold">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {rows.map(({ m, x }) => (
                  <tr key={m.id} className="group hover:bg-surface-2">
                    <th scope="row" className="sticky left-0 z-10 bg-surface px-4 py-2.5 text-left font-normal group-hover:bg-surface-2 sm:px-5">
                      <Link href={`/admin/members/${m.id}`} className="focus-ring flex items-center gap-2.5 rounded-md">
                        <Avatar name={m.name} fileId={m.avatarFileId} size={28} />
                        <span className="min-w-0"><span className="block truncate font-semibold text-fg hover:text-brand-ink">{m.name}</span>
                          <span className="block max-w-[12rem] truncate text-xs text-muted">{m.title || ROLE_LABEL[m.role]}</span></span>
                      </Link>
                    </th>
                    <Num v={x.assigned} />
                    <Num v={x.approved} />
                    <td className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums text-fg-2" title={x.onTimeEligible ? `${x.onTime} of ${x.onTimeEligible} on time` : "Nothing to measure yet"}>
                      {fmtRate(x.onTimeRate)}{x.onTimeEligible > 0 && <span className="ml-1 text-xs text-muted">({x.onTime}/{x.onTimeEligible})</span>}
                    </td>
                    <Num v={x.overdueNow} warn />
                    <Num v={x.revisions} />
                    <Num v={x.awaitingReview} />
                    <Num v={x.excused} />
                    <Num v={x.openWorkload} />
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t-2 border-line-strong bg-surface-2 font-semibold">
                <tr>
                  <th scope="row" className="sticky left-0 z-10 bg-surface-2 px-4 py-3 text-left sm:px-5">Team total</th>
                  <Num v={total.assigned} strong />
                  <Num v={total.approved} strong />
                  <td className="whitespace-nowrap px-3 py-3 text-right tabular-nums text-fg">{fmtRate(total.onTimeRate)}{total.onTimeEligible > 0 && <span className="ml-1 text-xs font-normal text-muted">({total.onTime}/{total.onTimeEligible})</span>}</td>
                  <Num v={total.overdueNow} strong />
                  <Num v={total.revisions} strong />
                  <Num v={total.awaitingReview} strong />
                  <Num v={total.excused} strong />
                  <Num v={total.openWorkload} strong />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Workload distribution" description="Open tasks per member right now — useful for spreading new work evenly." />
          {rows.length === 0 ? <EmptyState compact title="No members" /> : (
            <div className="border-t border-line px-4 py-3 sm:px-5">
              <table className="w-full text-sm">
                <caption className="sr-only">Open tasks per member</caption>
                <thead className="sr-only"><tr><th scope="col">Member</th><th scope="col">Open tasks</th></tr></thead>
                <tbody>
                  {rows.map(({ m, x }) => (
                    <tr key={m.id}>
                      <th scope="row" className="w-[38%] max-w-0 py-1.5 pr-3 text-left font-medium text-fg-2"><span className="block truncate">{m.name}</span></th>
                      <td className="py-1.5">
                        <span className="flex items-center gap-2.5">
                          <Bar value={x.openWorkload} max={maxLoad} />
                          <span className="w-6 shrink-0 text-right font-semibold tabular-nums text-fg">{x.openWorkload}</span>
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card>
          <CardHeader title="Team on-time trend" description="On-time rate for the last 8 weeks (week of Monday). Current week highlighted." />
          <div className="border-t border-line px-3 pt-3 pb-2 sm:px-4">
            <RateColumns points={trend} caption="Team on-time rate by week, last 8 weeks" />
            <p className="px-1 pb-1 text-xs text-muted">“—” means no submissions were due that week.</p>
          </div>
        </Card>
      </div>

      <Card id="how" className="scroll-mt-24">
        <CardHeader title={<span className="inline-flex items-center gap-2"><Info className="h-4 w-4 text-muted" aria-hidden />How these numbers work</span>}
          description={`Periods use the organization's time zone (${tz}); weeks start Monday. Due dates reflect any approved extensions.`} />
        <dl className="grid gap-x-8 gap-y-4 border-t border-line px-4 py-4 sm:px-5 md:grid-cols-2">
          {HOW.map((h) => (
            <div key={h.term}>
              <dt className="text-sm font-semibold text-fg">{h.term}</dt>
              <dd className="mt-0.5 text-sm text-muted">{h.def}</dd>
            </div>
          ))}
        </dl>
      </Card>
    </div>
  );
}

function Num({ v, warn, strong }: { v: number; warn?: boolean; strong?: boolean }) {
  return <td className={cn("px-3 py-2.5 text-right tabular-nums", strong ? "py-3 text-fg" : warn && v > 0 ? "font-semibold text-warn" : v === 0 ? "text-muted" : "text-fg-2")}>{v}</td>;
}
