import Link from "next/link";
import { count, eq } from "drizzle-orm";
import { Clock, Award, Hourglass, Download, CalendarCheck } from "lucide-react";
import { formatInTimeZone } from "date-fns-tz";
import { db } from "@/db";
import { volunteerHours } from "@/db/schema";
import { requireUser } from "@/server/auth";
import { fmtHours, hoursFor, myUpcomingShifts, schoolYearStart } from "@/server/volunteer";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat";
import { Card, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { buttonClass } from "@/components/ui/button";
import { DeleteHoursButton, LogHoursForm } from "@/components/volunteer/volunteer-bits";
import { fmtDate } from "@/lib/dates";
import { VolunteerTabs } from "../tabs";

export const metadata = { title: "My hours" };

export default async function MyHoursPage() {
  const me = await requireUser();
  const [h, shifts] = await Promise.all([hoursFor(me.id), myUpcomingShifts(me.id)]);
  const [{ n: pending }] = me.role === "admin" ? await db.select({ n: count() }).from(volunteerHours).where(eq(volunteerHours.status, "pending")) : [{ n: 0 }];
  const today = formatInTimeZone(new Date(), "America/New_York", "yyyy-MM-dd");
  const sy = Number(schoolYearStart().slice(0, 4));
  return (
    <>
      <PageHeader title="Volunteer" description="Sign up for shifts at upcoming events, log your service hours, and download an hours certificate." />
      <VolunteerTabs active="hours" isAdmin={me.role === "admin"} pending={pending} />
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-3">
        <StatCard label={`School year ${sy}–${String(sy + 1).slice(2)}`} value={fmtHours(h.yearMinutes)} icon={Award} tone="ok" hint="Approved" />
        <StatCard label="All time" value={fmtHours(h.approvedMinutes)} icon={Clock} hint="Approved" />
        <div className="col-span-2 lg:col-span-1"><StatCard label="Waiting for approval" value={fmtHours(h.pendingMinutes)} icon={Hourglass} tone="violet" /></div>
      </div>
      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="space-y-6">
          <Card>
            <CardHeader title="Your hours" description="Hours from events you attended are added automatically."
              action={<div className="flex flex-wrap gap-2">
                <a href="/api/hours/certificate?period=year" target="_blank" rel="noopener" className={buttonClass("secondary", "sm")}><Download className="h-4 w-4" />Certificate (this year)</a>
                <a href="/api/hours/certificate?period=all" target="_blank" rel="noopener" className={buttonClass("ghost", "sm")}>All time</a>
              </div>} />
            {h.rows.length === 0 ? <EmptyState compact icon={Clock} title="No hours yet">Sign up for an event shift, or log hours you've already done.</EmptyState> : (
              <ul className="divide-y divide-line border-t border-line">
                {h.rows.map(({ h: r, reviewer }) => (
                  <li key={r.id} className="flex items-start gap-3 px-5 py-3">
                    <div className="w-14 shrink-0 text-xs text-muted">{fmtDate(r.date + "T12:00:00Z", "UTC", "MMM d")}</div>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium">{r.activity}</div>
                      {r.description && <p className="text-xs text-muted">{r.description}</p>}
                      {r.status === "rejected" && r.reviewNote && <p className="mt-0.5 text-xs text-warn">Not approved: {r.reviewNote}</p>}
                      {r.status === "approved" && reviewer && <p className="text-[11px] text-faint">{r.source === "shift" ? "Event attendance" : "Approved"} by {reviewer}</p>}
                    </div>
                    <div className="shrink-0 text-right">
                      <div className="text-sm font-semibold tabular-nums">{(r.minutes / 60).toFixed(2).replace(/\.?0+$/, "")} h</div>
                      <Badge tone={r.status === "approved" ? "green" : r.status === "pending" ? "violet" : "muted"}>{r.status === "approved" ? "Approved" : r.status === "pending" ? "Pending" : "Not approved"}</Badge>
                    </div>
                    {r.status !== "approved" && <DeleteHoursButton id={r.id} />}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
        <aside className="space-y-6">
          <Card><CardHeader title="Log hours" description="For volunteering you did outside a portal sign-up." /><div className="px-5 pb-5"><LogHoursForm today={today} /></div></Card>
          <Card>
            <CardHeader title="Your upcoming shifts" action={<Link href="/volunteer" className="text-sm font-semibold text-brand-ink hover:underline">Sign-ups</Link>} />
            {shifts.length === 0 ? <EmptyState compact icon={CalendarCheck} title="No shifts yet" /> : (
              <ul className="space-y-3 px-5 pb-5">
                {shifts.map((s) => (
                  <li key={s.shiftId}><Link href={`/volunteer/events/${s.eventId}`} className="block rounded-lg p-2 hover:bg-surface-2">
                    <div className="text-sm font-medium">{s.title} · {s.label}</div>
                    <div className="text-xs text-muted">{fmtDate(s.startsAt, undefined, "EEE, MMM d · h:mm a")}{s.location ? ` · ${s.location}` : ""}</div>
                  </Link></li>
                ))}
              </ul>
            )}
          </Card>
        </aside>
      </div>
    </>
  );
}
