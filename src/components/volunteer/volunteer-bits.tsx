"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, X, Loader2, Trash2, Plus, UserPlus, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { ActionForm, Field, Input, Select, SubmitButton, Textarea } from "@/components/ui/form";
import { useToast } from "@/components/ui/toaster";
import { cn } from "@/lib/cn";
import {
  adminAddSignupAction, cancelSignUpAction, deleteHoursAction, deleteShiftAction, logHoursAction, markAttendanceAction,
  reviewHoursAction, saveShiftAction, signUpAction,
} from "@/server/volunteer-actions";
import type { ActionResult } from "@/lib/action";

function useRun() {
  const [pending, start] = useTransition();
  const toast = useToast();
  const router = useRouter();
  const run = (fn: () => Promise<ActionResult<unknown>>, after?: () => void) => start(async () => {
    const r = await fn();
    if (r.ok) { if (r.message) toast.push("success", r.message); after?.(); router.refresh(); }
    else toast.push("error", r.error);
  });
  return { pending, run };
}

export function SignupButton({ shiftId, mine, full, started }: { shiftId: string; mine: boolean; full: boolean; started: boolean }) {
  const { pending, run } = useRun();
  if (started) return <span className="text-xs font-medium text-muted">{mine ? "You signed up" : "Started"}</span>;
  if (mine) return (
    <Button size="sm" variant="secondary" disabled={pending} onClick={() => run(() => cancelSignUpAction(shiftId))}>
      {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5 text-ok" />}Signed up · Cancel
    </Button>
  );
  return <Button size="sm" disabled={pending || full} onClick={() => run(() => signUpAction(shiftId))}>{pending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}{full ? "Full" : "Sign up"}</Button>;
}

export function ShiftFormDialog({ eventId, defaults, shift, trigger }: {
  eventId: string; defaults: { start: string; end: string };
  shift?: { id: string; label: string; start: string; end: string; capacity: number | null; notes: string }; trigger: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <span onClick={() => setOpen(true)}>{trigger}</span>
      <Dialog open={open} onClose={() => setOpen(false)} title={shift ? "Edit shift" : "Add a sign-up shift"} description="People sign up for a time slot. Leave spots blank for unlimited." size="sm">
        <ActionForm action={saveShiftAction} onSuccess={() => setOpen(false)} className="space-y-4">
          <input type="hidden" name="eventId" value={eventId} />
          {shift && <input type="hidden" name="id" value={shift.id} />}
          <Field label="Shift name" htmlFor="sh-label"><Input id="sh-label" name="label" defaultValue={shift?.label ?? "Volunteer"} placeholder="e.g. Setup, Run the stand, Cleanup" maxLength={80} /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Starts" htmlFor="sh-start"><Input id="sh-start" name="startsAt" type="datetime-local" defaultValue={shift?.start ?? defaults.start} required /></Field>
            <Field label="Ends" htmlFor="sh-end"><Input id="sh-end" name="endsAt" type="datetime-local" defaultValue={shift?.end ?? defaults.end} required /></Field>
          </div>
          <Field label="Spots" htmlFor="sh-cap" hint="Blank = unlimited"><Input id="sh-cap" name="capacity" type="number" min={1} max={500} defaultValue={shift?.capacity ?? ""} /></Field>
          <Field label="Notes" htmlFor="sh-notes" hint="Optional, e.g. what to wear or bring"><Input id="sh-notes" name="notes" defaultValue={shift?.notes} maxLength={300} /></Field>
          <div className="flex justify-end"><SubmitButton>{shift ? "Save" : "Add shift"}</SubmitButton></div>
        </ActionForm>
      </Dialog>
    </>
  );
}

export function DeleteShiftButton({ shiftId, signups }: { shiftId: string; signups: number }) {
  const { pending, run } = useRun();
  return (
    <button disabled={pending} aria-label="Delete shift" className="rounded-lg p-1.5 text-faint hover:bg-surface-2 hover:text-bad"
      onClick={() => { if (signups === 0 || window.confirm(`${signups} ${signups === 1 ? "person is" : "people are"} signed up. They'll be notified it was canceled. Delete it?`)) run(() => deleteShiftAction(shiftId)); }}>
      <Trash2 className="h-4 w-4" />
    </button>
  );
}

/** Admin: mark attendance. Attended creates approved hours automatically. */
export function AttendanceToggle({ shiftId, userId, attended }: { shiftId: string; userId: string; attended: boolean | null }) {
  const { pending, run } = useRun();
  const btn = "inline-flex h-8 items-center gap-1 rounded-lg px-2.5 text-xs font-semibold transition disabled:opacity-50";
  return (
    <div className="flex items-center gap-1">
      <button disabled={pending} onClick={() => run(() => markAttendanceAction(shiftId, userId, attended === true ? null : true))}
        className={cn(btn, attended === true ? "bg-ok-soft text-ok ring-1 ring-ok/30" : "text-muted hover:bg-surface-2")}><Check className="h-3.5 w-3.5" />Came</button>
      <button disabled={pending} onClick={() => run(() => markAttendanceAction(shiftId, userId, attended === false ? null : false))}
        className={cn(btn, attended === false ? "bg-surface-3 text-fg-2" : "text-muted hover:bg-surface-2")}><X className="h-3.5 w-3.5" />Didn't</button>
      <button disabled={pending} aria-label="Remove from shift" onClick={() => run(() => cancelSignUpAction(shiftId, userId))} className="rounded-lg p-1.5 text-faint hover:bg-surface-2 hover:text-bad"><Trash2 className="h-3.5 w-3.5" /></button>
    </div>
  );
}

export function AddPersonToShift({ shiftId, people }: { shiftId: string; people: { id: string; name: string }[] }) {
  const { pending, run } = useRun();
  const [pick, setPick] = useState("");
  if (!people.length) return null;
  return (
    <div className="flex items-center gap-2">
      <Select aria-label="Add someone" className="h-8 py-0 text-xs" value={pick} onChange={(e) => setPick(e.target.value)}>
        <option value="">Add someone…</option>{people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
      </Select>
      <Button size="sm" variant="secondary" disabled={!pick || pending} onClick={() => run(() => adminAddSignupAction(shiftId, pick), () => setPick(""))}><UserPlus className="h-3.5 w-3.5" />Add</Button>
    </div>
  );
}

export function LogHoursForm({ today, members }: { today: string; members?: { id: string; name: string }[] }) {
  return (
    <ActionForm action={logHoursAction} resetOnSuccess className="space-y-4">
      {members && (
        <Field label="Member" htmlFor="h-user"><Select id="h-user" name="userId" required defaultValue=""><option value="" disabled>Choose a member</option>{members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</Select></Field>
      )}
      <div className="grid grid-cols-2 gap-3">
        <Field label="Date" htmlFor="h-date"><Input id="h-date" name="date" type="date" max={today} defaultValue={today} required /></Field>
        <Field label="Hours" htmlFor="h-hours" hint="e.g. 1.5"><Input id="h-hours" name="hours" type="number" step="0.25" min="0.25" max="24" inputMode="decimal" required /></Field>
      </div>
      <Field label="What did you do?" htmlFor="h-act"><Input id="h-act" name="activity" placeholder="e.g. Packed Courage Boxes" maxLength={120} required /></Field>
      <Field label="Details" htmlFor="h-desc" hint="Optional"><Textarea id="h-desc" name="description" rows={2} maxLength={1000} /></Field>
      <SubmitButton className="w-full sm:w-auto"><Plus className="h-4 w-4" />{members ? "Add approved hours" : "Log hours"}</SubmitButton>
    </ActionForm>
  );
}

export function DeleteHoursButton({ id }: { id: string }) {
  const { pending, run } = useRun();
  return <button disabled={pending} aria-label="Delete entry" onClick={() => run(() => deleteHoursAction(id))} className="rounded-lg p-1.5 text-faint hover:bg-surface-2 hover:text-bad"><Trash2 className="h-4 w-4" /></button>;
}

export function ReviewHoursButtons({ id }: { id: string }) {
  const { pending, run } = useRun();
  const [rejecting, setRejecting] = useState(false);
  const [note, setNote] = useState("");
  if (rejecting) return (
    <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
      <input className="input h-8 flex-1 py-0 text-sm sm:w-56" placeholder="Why? (they'll see this)" value={note} onChange={(e) => setNote(e.target.value)} aria-label="Reason" autoFocus />
      <Button size="sm" disabled={pending} onClick={() => run(() => reviewHoursAction(id, "rejected", note))}>Send</Button>
      <Button size="sm" variant="ghost" onClick={() => setRejecting(false)}><Undo2 className="h-3.5 w-3.5" /></Button>
    </div>
  );
  return (
    <div className="flex gap-2">
      <Button size="sm" disabled={pending} onClick={() => run(() => reviewHoursAction(id, "approved"))}><Check className="h-3.5 w-3.5" />Approve</Button>
      <Button size="sm" variant="secondary" disabled={pending} onClick={() => setRejecting(true)}>Not approved</Button>
    </div>
  );
}
