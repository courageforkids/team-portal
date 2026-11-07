import Link from "next/link";
import { count, eq } from "drizzle-orm";
import { CalendarHeart, MapPin, Settings2 } from "lucide-react";
import { db } from "@/db";
import { volunteerHours } from "@/db/schema";
import { requireUser } from "@/server/auth";
import { upcomingSignups } from "@/server/volunteer";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { AvatarStack } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { buttonClass } from "@/components/ui/button";
import { SignupButton } from "@/components/volunteer/volunteer-bits";
import { fmtDate } from "@/lib/dates";
import { formatInTimeZone } from "date-fns-tz";
import { VolunteerTabs } from "./tabs";

export const metadata = { title: "Volunteer" };
const t = (d: Date) => formatInTimeZone(d, "America/New_York", "h:mm a");

export default async function VolunteerPage() {
  const me = await requireUser();
  const evs = await upcomingSignups(me);
  const [{ n: pending }] = me.role === "admin" ? await db.select({ n: count() }).from(volunteerHours).where(eq(volunteerHours.status, "pending")) : [{ n: 0 }];
  const now = new Date();
  const withShifts = evs.filter((e) => e.shifts.length), without = evs.filter((e) => !e.shifts.length);
  return (
    <>
      <PageHeader title="Volunteer" description="Sign up for shifts at upcoming events, log your service hours, and download an hours certificate." />
      <VolunteerTabs active="signups" isAdmin={me.role === "admin"} pending={pending} />
      {withShifts.length === 0 && (
        <div className="card"><EmptyState icon={CalendarHeart} title="No open sign-ups right now">
          {me.role === "admin" ? "Add shifts to an event below and the team can sign up here." : "When an event needs volunteers, it'll show up here."}
        </EmptyState></div>
      )}
      <div className="space-y-4">
        {withShifts.map((e) => (
          <section key={e.id} className="card overflow-hidden">
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-5 py-4">
              <div className="flex gap-4">
                <div className="w-12 shrink-0 rounded-lg bg-brand-soft py-1 text-center text-brand-ink">
                  <div className="text-[10px] font-bold uppercase">{fmtDate(e.startsAt, undefined, "MMM")}</div>
                  <div className="text-lg font-bold leading-tight">{fmtDate(e.startsAt, undefined, "d")}</div>
                </div>
                <div>
                  <h2 className="font-semibold">{e.title}</h2>
                  <p className="text-sm text-muted">{fmtDate(e.startsAt, undefined, "EEEE")}{e.location && <> · <MapPin className="inline h-3.5 w-3.5" /> {e.location}</>}</p>
                </div>
              </div>
              <Link href={`/volunteer/events/${e.id}`} className={buttonClass("ghost", "sm")}>{me.role === "admin" ? <><Settings2 className="h-4 w-4" />Manage</> : "Details"}</Link>
            </div>
            <ul className="divide-y divide-line">
              {e.shifts.map((s) => {
                const full = s.capacity !== null && s.taken >= s.capacity;
                return (
                  <li key={s.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                    <div className="min-w-0 flex-1">
                      <div className="font-medium">{s.label} <span className="font-normal text-muted">· {t(s.startsAt)}–{t(s.endsAt)}</span></div>
                      <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-muted">
                        {s.capacity !== null ? <Badge tone={full ? "muted" : s.capacity - s.taken <= 2 ? "accent" : "green"}>{full ? "Full" : `${s.capacity - s.taken} of ${s.capacity} spots left`}</Badge> : <Badge tone="green">Open</Badge>}
                        {s.notes && <span>{s.notes}</span>}
                      </div>
                    </div>
                    {s.people.length > 0 && <AvatarStack people={s.people} max={4} size={26} />}
                    <SignupButton shiftId={s.id} mine={s.mine} full={full} started={s.startsAt <= now} />
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>
      {me.role === "admin" && without.length > 0 && (
        <div className="mt-8">
          <h2 className="eyebrow mb-2">Upcoming events without sign-ups</h2>
          <ul className="card divide-y divide-line">
            {without.map((e) => (
              <li key={e.id} className="flex items-center justify-between gap-3 px-5 py-3 text-sm">
                <span><span className="font-medium">{e.title}</span> <span className="text-muted">· {fmtDate(e.startsAt, undefined, "EEE, MMM d")}</span></span>
                <Link href={`/volunteer/events/${e.id}`} className={buttonClass("secondary", "sm")}>Add shifts</Link>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-muted">Create events on the <Link href="/calendar" className="font-semibold text-brand-ink hover:underline">Calendar</Link>, then add sign-up shifts here.</p>
        </div>
      )}
    </>
  );
}
