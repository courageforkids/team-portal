import Link from "next/link";
import { and, asc, desc, eq, gte, inArray, isNull, lt, sql } from "drizzle-orm";
import { addDays } from "date-fns";
import { NotebookPen, FileText } from "lucide-react";
import { db } from "@/db";
import { events, meetingAttendance, meetings } from "@/db/schema";
import { requireUser } from "@/server/auth";
import { allowedVisibilities } from "@/server/policy";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { NewMeetingButton } from "@/components/meetings/meeting-bits";
import { StartNotesButton } from "@/components/meetings/start-notes";
import { fmtDate, toLocalInput } from "@/lib/dates";

export const metadata = { title: "Meetings" };

export default async function MeetingsPage() {
  const me = await requireUser();
  const vis = allowedVisibilities(me.role);
  const now = new Date();
  const [upcoming, past, counts, unstarted] = await Promise.all([
    db.select().from(meetings).where(and(inArray(meetings.visibility, vis), gte(meetings.startsAt, addDays(now, -0.5)))).orderBy(asc(meetings.startsAt)).limit(20),
    db.select().from(meetings).where(and(inArray(meetings.visibility, vis), lt(meetings.startsAt, addDays(now, -0.5)))).orderBy(desc(meetings.startsAt)).limit(40),
    db.select({ id: meetingAttendance.meetingId, n: sql<number>`count(*) filter (where ${meetingAttendance.status} in ('present','late'))::int` }).from(meetingAttendance).groupBy(meetingAttendance.meetingId),
    me.role === "volunteer" ? Promise.resolve([]) : db.select({ id: events.id, title: events.title, startsAt: events.startsAt }).from(events)
      .leftJoin(meetings, eq(meetings.eventId, events.id))
      .where(and(eq(events.type, "meeting"), isNull(meetings.id), inArray(events.visibility, vis), gte(events.startsAt, addDays(now, -14)))).orderBy(asc(events.startsAt)).limit(10),
  ]);
  const present = new Map(counts.map((c) => [c.id, c.n]));
  const canCreate = me.role !== "volunteer";
  const Row = ({ m }: { m: typeof meetings.$inferSelect }) => (
    <li><Link href={`/meetings/${m.id}`} className="focus-ring flex items-center gap-4 px-5 py-3 hover:bg-surface-2">
      <div className="w-12 shrink-0 rounded-lg bg-surface-2 py-1 text-center"><div className="text-[10px] font-bold uppercase text-muted">{fmtDate(m.startsAt, undefined, "MMM")}</div><div className="text-lg font-bold leading-tight">{fmtDate(m.startsAt, undefined, "d")}</div></div>
      <div className="min-w-0 flex-1"><div className="truncate font-medium">{m.title}</div><div className="text-xs text-muted">{fmtDate(m.startsAt, undefined, "EEE h:mm a")}{present.get(m.id) ? ` · ${present.get(m.id)} attended` : ""}</div></div>
      <div className="flex shrink-0 gap-1.5">{m.agenda.trim() && <Badge tone="neutral">Agenda</Badge>}{m.notes.trim() && <Badge tone="green"><FileText className="h-3 w-3" />Notes</Badge>}</div>
    </Link></li>
  );
  return (
    <>
      <PageHeader title="Meetings" description="Agendas, attendance, notes and action items for team meetings." actions={canCreate && <NewMeetingButton defaultStart={toLocalInput(addDays(now, 1))} isAdmin={me.role === "admin"} />} />
      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <div className="space-y-6">
          <Card><CardHeader title="Upcoming" />{upcoming.length ? <ul className="divide-y divide-line border-t border-line">{upcoming.map((m) => <Row key={m.id} m={m} />)}</ul> : <EmptyState compact icon={NotebookPen} title="No upcoming meeting pages">{canCreate ? "Create one, or start notes from a calendar meeting." : "When a meeting has an agenda, it'll show up here."}</EmptyState>}</Card>
          <Card><CardHeader title="Past meetings" />{past.length ? <ul className="divide-y divide-line border-t border-line">{past.map((m) => <Row key={m.id} m={m} />)}</ul> : <EmptyState compact title="No past meetings yet" />}</Card>
        </div>
        {canCreate && unstarted.length > 0 && (
          <aside><Card><CardHeader title="Calendar meetings without notes" />
            <ul className="space-y-2 px-5 pb-5">{unstarted.map((e) => (
              <li key={e.id} className="flex items-center justify-between gap-2 text-sm"><span><span className="font-medium">{e.title}</span> <span className="text-muted">· {fmtDate(e.startsAt, undefined, "MMM d")}</span></span><StartNotesButton eventId={e.id} /></li>
            ))}</ul>
          </Card></aside>
        )}
      </div>
    </>
  );
}
