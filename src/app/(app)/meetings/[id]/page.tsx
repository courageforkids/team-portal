import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { ArrowLeft, Trash2 } from "lucide-react";
import { db } from "@/db";
import { meetingAttendance, meetings, tasks, users } from "@/db/schema";
import { requireUser } from "@/server/auth";
import { visibilityAllowed } from "@/server/policy";
import { getPeople, loadTasks } from "@/server/queries";
import { Card, CardHeader } from "@/components/ui/card";
import { Avatar } from "@/components/ui/avatar";
import { ConfirmAction } from "@/components/ui/confirm";
import { TaskRow } from "@/components/tasks/task-bits";
import { ActionItemForm, AttendanceRow, MeetingTextBlock, ShareNotesButton } from "@/components/meetings/meeting-bits";
import { deleteMeetingAction } from "@/server/meeting-actions";
import { ago, fmtFull } from "@/lib/dates";

export const metadata = { title: "Meeting" };

export default async function MeetingPage({ params }: { params: Promise<{ id: string }> }) {
  const me = await requireUser();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const m = (await db.select().from(meetings).where(eq(meetings.id, id)).limit(1))[0];
  if (!m || !visibilityAllowed(me.role, m.visibility)) notFound();
  const canEdit = me.role === "admin" || me.role === "leader";
  const [people, att, editor, taskIds] = await Promise.all([
    getPeople(), db.select().from(meetingAttendance).where(eq(meetingAttendance.meetingId, id)),
    m.updatedById ? db.select({ name: users.name }).from(users).where(eq(users.id, m.updatedById)).limit(1) : Promise.resolve([]),
    db.select({ id: tasks.id }).from(tasks).where(eq(tasks.meetingId, id)),
  ]);
  const visiblePeople = people.filter((p) => visibilityAllowed(p.role, m.visibility));
  const status = new Map(att.map((a) => [a.userId, a.status]));
  const items = taskIds.length ? (await loadTasks(me, { scope: "visible", view: "everything", limit: 100 })).filter((t) => taskIds.some((x) => x.id === t.id)) : [];
  const here = att.filter((a) => a.status === "present" || a.status === "late").length;
  return (
    <div className="animate-in">
      <Link href="/meetings" className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-muted hover:text-fg"><ArrowLeft className="h-4 w-4" />Meetings</Link>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{m.title}</h1>
          <p className="mt-1 text-sm text-muted">{fmtFull(m.startsAt)}{editor[0] ? ` · last edited by ${editor[0].name} ${ago(m.updatedAt)}` : ""}</p>
        </div>
        <div className="flex gap-2">
          {canEdit && <ShareNotesButton meetingId={m.id} sharedAt={m.notesSharedAt?.toISOString() ?? null} />}
          {me.role === "admin" && <ConfirmAction trigger={<Trash2 className="h-4 w-4" />} triggerVariant="ghost" title="Delete this meeting page?" description="The agenda, notes and attendance will be deleted. Action-item tasks stay." confirmLabel="Delete" action={deleteMeetingAction.bind(null, m.id)} />}
        </div>
      </div>
      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <div className="space-y-6">
          <Card><CardHeader title="Agenda" /><div className="px-5 pb-5"><MeetingTextBlock meetingId={m.id} field="agenda" initial={m.agenda} updatedAt={m.updatedAt.toISOString()} canEdit={canEdit} placeholder={"1. Wins from this week\n2. What's coming up\n3. Questions"} /></div></Card>
          <Card><CardHeader title="Notes" description={m.notesSharedAt ? `Shared with the team ${ago(m.notesSharedAt)}` : undefined} /><div className="px-5 pb-5"><MeetingTextBlock meetingId={m.id} field="notes" initial={m.notes} updatedAt={m.updatedAt.toISOString()} canEdit={canEdit} placeholder="What was decided? Who's doing what?" /></div></Card>
          <Card>
            <CardHeader title="Action items" description="Each one is a real task with an owner and a due date." />
            {items.length > 0 && <div className="divide-y divide-line border-t border-line">{items.map((t) => <TaskRow key={t.id} t={t} />)}</div>}
            {items.length === 0 && <p className="px-5 pb-3 text-sm text-muted">No action items yet.</p>}
            {me.role === "admin" && <div className="border-t border-line px-5 py-4"><ActionItemForm meetingId={m.id} people={people.map((p) => ({ id: p.id, name: p.name }))} /></div>}
          </Card>
        </div>
        <aside>
          <Card>
            <CardHeader title="Attendance" description={`${here} of ${visiblePeople.length} here`} />
            <ul className="divide-y divide-line border-t border-line">
              {visiblePeople.map((p) => (
                <li key={p.id} className="flex flex-wrap items-center gap-2 px-4 py-2.5">
                  <Avatar name={p.name} fileId={p.avatarFileId} size={26} />
                  <span className="min-w-[7.5rem] flex-1 truncate text-sm font-medium">{p.name}</span>
                  <AttendanceRow meetingId={m.id} userId={p.id} status={status.get(p.id) ?? null} canEdit={canEdit} />
                </li>
              ))}
            </ul>
          </Card>
        </aside>
      </div>
    </div>
  );
}
