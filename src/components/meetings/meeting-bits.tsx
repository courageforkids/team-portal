"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, Plus, Share2, CalendarPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { ActionForm, Field, Input, Select, SubmitButton, Textarea } from "@/components/ui/form";
import { useToast } from "@/components/ui/toaster";
import { cn } from "@/lib/cn";
import {
  addActionItemAction, createMeetingAction, markMeetingAttendanceAction, saveMeetingTextAction, shareMeetingNotesAction,
} from "@/server/meeting-actions";

/** Agenda or notes: read view for everyone, editable for leaders/admins with an explicit Save. */
export function MeetingTextBlock({ meetingId, field, initial, updatedAt, canEdit, placeholder }: {
  meetingId: string; field: "agenda" | "notes"; initial: string; updatedAt: string; canEdit: boolean; placeholder: string;
}) {
  const [value, setValue] = useState(initial);
  const [saved, setSaved] = useState(initial);
  const [seen, setSeen] = useState(updatedAt);
  const [editing, setEditing] = useState(false);
  const [pending, start] = useTransition();
  const toast = useToast();
  const router = useRouter();
  const dirty = value !== saved;
  const save = () => start(async () => {
    const r = await saveMeetingTextAction(meetingId, field, value, seen);
    if (r.ok) { setSaved(value); if (r.data) setSeen(r.data.updatedAt); setEditing(false); toast.push("success", "Saved."); router.refresh(); }
    else toast.push("error", r.error);
  });
  if (!canEdit || !editing) return (
    <div>
      {saved.trim() ? <p className="prose-body text-[15px] text-fg-2">{saved}</p> : <p className="text-sm text-muted">{canEdit ? placeholder : "Nothing written yet."}</p>}
      {canEdit && <Button size="sm" variant="secondary" className="mt-3" onClick={() => setEditing(true)}>{saved.trim() ? "Edit" : field === "agenda" ? "Write agenda" : "Take notes"}</Button>}
    </div>
  );
  return (
    <div className="space-y-2">
      <label htmlFor={`${field}-${meetingId}`} className="sr-only">{field}</label>
      <Textarea id={`${field}-${meetingId}`} value={value} onChange={(e) => setValue(e.target.value)} rows={field === "notes" ? 12 : 7} placeholder={placeholder} autoFocus />
      <div className="flex items-center gap-2">
        <Button size="sm" disabled={pending || !dirty} onClick={save}>{pending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}Save</Button>
        <Button size="sm" variant="ghost" onClick={() => { setValue(saved); setEditing(false); }}>Cancel</Button>
        {dirty && <span className="text-xs text-warn">Unsaved changes</span>}
      </div>
    </div>
  );
}

const STATUSES = [
  { key: "present", label: "Here" }, { key: "late", label: "Late" }, { key: "excused", label: "Excused" }, { key: "absent", label: "Absent" },
] as const;

export function AttendanceRow({ meetingId, userId, status, canEdit }: { meetingId: string; userId: string; status: string | null; canEdit: boolean }) {
  const [pending, start] = useTransition();
  const [s, setS] = useState(status);
  const toast = useToast();
  if (!canEdit) return <span className={cn("text-xs font-semibold", s === "present" ? "text-ok" : s === "late" ? "text-warn" : "text-muted")}>{STATUSES.find((x) => x.key === s)?.label ?? "—"}</span>;
  return (
    <div className="flex flex-wrap gap-1" role="radiogroup" aria-label="Attendance">
      {STATUSES.map((x) => (
        <button key={x.key} role="radio" aria-checked={s === x.key} disabled={pending}
          onClick={() => { const next = s === x.key ? null : x.key; setS(next); start(async () => { const r = await markMeetingAttendanceAction(meetingId, userId, next); if (!r.ok) { setS(status); toast.push("error", r.error); } }); }}
          className={cn("h-7 rounded-lg px-2 text-xs font-semibold transition",
            s === x.key ? (x.key === "present" ? "bg-ok-soft text-ok ring-1 ring-ok/30" : x.key === "late" ? "bg-warn-soft text-warn ring-1 ring-warn/30" : "bg-surface-3 text-fg-2") : "text-muted hover:bg-surface-2")}>
          {s === x.key && x.key === "present" && <Check className="mr-0.5 inline h-3 w-3" />}{x.label}
        </button>
      ))}
    </div>
  );
}

export function ActionItemForm({ meetingId, people }: { meetingId: string; people: { id: string; name: string }[] }) {
  return (
    <ActionForm action={addActionItemAction} resetOnSuccess className="grid gap-2 sm:grid-cols-[1fr_160px_170px_auto] sm:items-end">
      <input type="hidden" name="meetingId" value={meetingId} />
      <Field label="Action item" htmlFor="ai-title"><Input id="ai-title" name="title" placeholder="e.g. Email the hospital about dates" required /></Field>
      <Field label="Who" htmlFor="ai-who"><Select id="ai-who" name="assignee" required defaultValue=""><option value="" disabled>Choose</option>{people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select></Field>
      <Field label="Due" htmlFor="ai-due"><Input id="ai-due" name="dueAt" type="datetime-local" /></Field>
      <SubmitButton><Plus className="h-4 w-4" />Add</SubmitButton>
    </ActionForm>
  );
}

export function ShareNotesButton({ meetingId, sharedAt }: { meetingId: string; sharedAt: string | null }) {
  const [pending, start] = useTransition();
  const toast = useToast();
  const router = useRouter();
  return (
    <Button variant="secondary" size="sm" disabled={pending} onClick={() => start(async () => { const r = await shareMeetingNotesAction(meetingId); toast.push(r.ok ? "success" : "error", r.ok ? r.message ?? "Shared." : r.error); router.refresh(); })}>
      <Share2 className="h-4 w-4" />{sharedAt ? "Share again" : "Share notes with the team"}
    </Button>
  );
}

export function NewMeetingButton({ defaultStart, isAdmin }: { defaultStart: string; isAdmin: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button onClick={() => setOpen(true)}><CalendarPlus className="h-4 w-4" />New meeting page</Button>
      <Dialog open={open} onClose={() => setOpen(false)} title="New meeting page" description="For an agenda, attendance and notes. Meetings on the calendar get a page from their event too." size="sm">
        <ActionForm action={createMeetingAction} onSuccess={() => setOpen(false)} className="space-y-4">
          <Field label="Name" htmlFor="mt-title"><Input id="mt-title" name="title" placeholder="e.g. Weekly check-in" required maxLength={120} /></Field>
          <Field label="When" htmlFor="mt-start"><Input id="mt-start" name="startsAt" type="datetime-local" defaultValue={defaultStart} required /></Field>
          <Field label="Who can see it" htmlFor="mt-vis">
            <Select id="mt-vis" name="visibility" defaultValue="everyone"><option value="everyone">Everyone</option><option value="leadership">Leadership & admins</option>{isAdmin && <option value="admin">Administrators only</option>}</Select>
          </Field>
          <Field label="Agenda" htmlFor="mt-agenda" hint="Optional. You can write it later."><Textarea id="mt-agenda" name="agenda" rows={4} placeholder={"1. Wins from this week\n2. Dickens of a Christmas plan\n3. Next box drive"} /></Field>
          <div className="flex justify-end"><SubmitButton>Create</SubmitButton></div>
        </ActionForm>
      </Dialog>
    </>
  );
}
