import Link from "next/link";
import { ChevronLeft, ChevronRight, Download, FileBarChart } from "lucide-react";
import { requireAdmin } from "@/server/auth";
import { currentMonth, monthRange, monthlyReport } from "@/server/reports";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardHeader } from "@/components/ui/card";
import { buttonClass } from "@/components/ui/button";
import { ReportForm } from "@/components/admin/report-form";
import { fmtDate } from "@/lib/dates";
import { EVENT_TYPE_LABEL } from "@/lib/task-meta";
import { fmtMoney } from "@/lib/money";

export const metadata = { title: "Monthly report" };

function Stat({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return <div className="rounded-xl border border-line bg-surface p-4"><div className="text-xs font-medium text-muted">{label}</div><div className="mt-1 text-2xl font-bold tabular-nums">{value}</div>{hint && <div className="mt-0.5 text-xs text-muted">{hint}</div>}</div>;
}

export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  await requireAdmin();
  const sp = await searchParams;
  const month = /^\d{4}-\d{2}$/.test(sp.month ?? "") ? sp.month! : currentMonth();
  const { prev, next } = monthRange(month);
  const r = await monthlyReport(month);
  const isFuture = next > currentMonth() && month > currentMonth();
  return (
    <>
      <PageHeader eyebrow="Executive" title="Monthly report" description="A one-page summary to share with your advisor, partners, or in grant applications. Team numbers are counted automatically."
        actions={<a href={`/api/reports/monthly?month=${month}`} target="_blank" rel="noopener" className={buttonClass("primary")}><Download className="h-4 w-4" />Download PDF</a>} />
      <div className="mb-5 flex items-center gap-2">
        <Link href={`/admin/reports?month=${prev}`} className={buttonClass("secondary", "icon")} aria-label="Previous month"><ChevronLeft className="h-4 w-4" /></Link>
        <h2 className="min-w-40 text-center text-lg font-semibold">{r.label}</h2>
        {!isFuture && <Link href={`/admin/reports?month=${next}`} className={buttonClass("secondary", "icon")} aria-label="Next month"><ChevronRight className="h-4 w-4" /></Link>}
      </div>
      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        <div className="space-y-6">
          <Card className="p-5">
            <h3 className="eyebrow mb-3">Impact (you enter these)</h3>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <Stat label="Boxes delivered" value={r.manual?.boxesDelivered ?? "—"} />
              <Stat label="Hospitals served" value={r.manual?.hospitalsServed ?? "—"} />
              <Stat label="Money raised" value={r.manual?.moneyRaised || (r.donations.cents ? fmtMoney(r.donations.cents) : "—")} hint={r.donations.count ? `${fmtMoney(r.donations.cents)} logged in Donations (${r.donations.count})` : undefined} />
            </div>
          </Card>
          <Card className="p-5">
            <h3 className="eyebrow mb-3">Team (counted automatically)</h3>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <Stat label="Volunteer hours" value={r.volunteer.hours} hint={`${r.volunteer.volunteers} ${r.volunteer.volunteers === 1 ? "person" : "people"}`} />
              <Stat label="Tasks completed" value={r.tasks.approved} hint={`${r.tasks.created} assigned`} />
              <Stat label="On-time rate" value={r.tasks.onTimeRate === null ? "—" : `${r.tasks.onTimeRate}%`} hint={r.tasks.onTimeBase ? `of ${r.tasks.onTimeBase} due` : undefined} />
              <Stat label="Event shifts filled" value={r.volunteer.signups} hint={`${r.volunteer.attended} attended · ${r.volunteer.shifts} shifts`} />
              <Stat label="Meetings" value={r.meetings.count} hint={r.meetings.avgAttendance ? `avg ${r.meetings.avgAttendance} attended` : undefined} />
              <Stat label="Team members" value={r.team.activeMembers} hint={r.team.newMembers ? `+${r.team.newMembers} new` : undefined} />
            </div>
            <div className="mt-3 text-xs text-muted">Engagement: {r.engagement.announcements} announcements · {r.engagement.messages} chat messages · {r.engagement.polls} polls · {r.engagement.shoutouts} shout-outs</div>
          </Card>
          <Card>
            <CardHeader title="Events this month" />
            {r.events.length ? <ul className="divide-y divide-line border-t border-line">{r.events.map((e, i) => <li key={i} className="flex justify-between gap-3 px-5 py-2.5 text-sm"><span className="font-medium">{e.title}</span><span className="text-muted">{fmtDate(e.startsAt, undefined, "MMM d")} · {EVENT_TYPE_LABEL[e.type]}</span></li>)}</ul>
              : <p className="px-5 pb-5 text-sm text-muted">No events on the calendar this month.</p>}
          </Card>
        </div>
        <aside><Card><CardHeader title={<span className="inline-flex items-center gap-2"><FileBarChart className="h-4 w-4 text-muted" />Your part</span>} description="Add the numbers the portal can't count and a few sentences." /><div className="px-5 pb-5"><ReportForm key={month} month={month} v={r.manual} /></div></Card></aside>
      </div>
    </>
  );
}
