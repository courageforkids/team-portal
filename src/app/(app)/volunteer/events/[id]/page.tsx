import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, MapPin, Plus, Pencil } from "lucide-react";
import { formatInTimeZone } from "date-fns-tz";
import { requireUser } from "@/server/auth";
import { eventWithShifts } from "@/server/volunteer";
import { getPeople } from "@/server/queries";
import { Card } from "@/components/ui/card";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { buttonClass } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { AddPersonToShift, AttendanceToggle, DeleteShiftButton, ShiftFormDialog, SignupButton } from "@/components/volunteer/volunteer-bits";
import { fmtFull, toLocalInput } from "@/lib/dates";

export const metadata = { title: "Event sign-ups" };
const t = (d: Date) => formatInTimeZone(d, "America/New_York", "h:mm a");

export default async function EventSignupsPage({ params }: { params: Promise<{ id: string }> }) {
  const me = await requireUser();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const e = await eventWithShifts(me, id);
  if (!e) notFound();
  const isAdmin = me.role === "admin";
  const people = isAdmin ? await getPeople() : [];
  const now = new Date();
  const defStart = toLocalInput(e.startsAt), defEnd = toLocalInput(e.endsAt ?? new Date(e.startsAt.getTime() + 2 * 3600_000));
  return (
    <div className="animate-in">
      <Link href="/volunteer" className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-muted hover:text-fg"><ArrowLeft className="h-4 w-4" />Sign-ups</Link>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{e.title}</h1>
          <p className="mt-1 text-sm text-muted">{fmtFull(e.startsAt)}{e.location && <> · <MapPin className="inline h-3.5 w-3.5" /> {e.location}</>}</p>
          {e.description && <p className="prose-body mt-2 max-w-2xl text-sm text-fg-2">{e.description}</p>}
        </div>
        {isAdmin && <ShiftFormDialog eventId={e.id} defaults={{ start: defStart, end: defEnd }} trigger={<span className={buttonClass("primary")}><Plus className="h-4 w-4" />Add shift</span>} />}
      </div>
      {e.shifts.length === 0 ? (
        <Card><EmptyState title="No sign-up shifts yet">{isAdmin ? "Add a shift, like “Setup 5:30–6:30, 3 spots.” Then the team can sign up from the Volunteer page." : "Check back soon."}</EmptyState></Card>
      ) : (
        <div className="space-y-4">
          {e.shifts.map((s) => {
            const full = s.capacity !== null && s.taken >= s.capacity;
            const notIn = people.filter((p) => !s.people.some((x) => x.id === p.id)).map((p) => ({ id: p.id, name: p.name }));
            return (
              <Card key={s.id} className="p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 className="font-semibold">{s.label} <span className="font-normal text-muted">· {t(s.startsAt)}–{t(s.endsAt)}</span></h2>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted">
                      <Badge tone={full ? "muted" : "green"}>{s.capacity !== null ? `${s.taken} of ${s.capacity} filled` : `${s.taken} signed up`}</Badge>
                      {s.notes && <span>{s.notes}</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <SignupButton shiftId={s.id} mine={s.mine} full={full} started={s.startsAt <= now} />
                    {isAdmin && <>
                      <ShiftFormDialog eventId={e.id} defaults={{ start: defStart, end: defEnd }} shift={{ id: s.id, label: s.label, start: toLocalInput(s.startsAt), end: toLocalInput(s.endsAt), capacity: s.capacity, notes: s.notes }}
                        trigger={<span className="inline-grid h-8 w-8 cursor-pointer place-items-center rounded-lg text-faint hover:bg-surface-2 hover:text-fg" aria-label="Edit shift"><Pencil className="h-4 w-4" /></span>} />
                      <DeleteShiftButton shiftId={s.id} signups={s.taken} />
                    </>}
                  </div>
                </div>
                <ul className="mt-4 divide-y divide-line rounded-xl border border-line">
                  {s.people.length === 0 && <li className="px-4 py-3 text-sm text-muted">No one yet. Be the first!</li>}
                  {s.people.map((p) => (
                    <li key={p.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5">
                      <Avatar name={p.name} fileId={p.avatarFileId} size={28} />
                      <span className="min-w-0 flex-1 text-sm font-medium">{p.name}{p.id === me.id ? " (you)" : ""}</span>
                      {isAdmin && <AttendanceToggle shiftId={s.id} userId={p.id} attended={p.attended} />}
                    </li>
                  ))}
                </ul>
                {isAdmin && (
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                    <p className="text-xs text-muted">Mark <b>Came</b> after the event and their hours are logged and approved automatically.</p>
                    <AddPersonToShift shiftId={s.id} people={notIn} />
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
