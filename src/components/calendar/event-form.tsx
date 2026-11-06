"use client";
import { useState } from "react";
import { Plus } from "lucide-react";
import { ActionForm, Checkbox, Field, Input, Select, SubmitButton, Textarea } from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { EVENT_TYPE_LABEL, VISIBILITY_LABEL } from "@/lib/task-meta";
import { toLocalInput } from "@/lib/dates";
import { saveEventAction } from "@/server/calendar";
import { EVENT_TYPES, type CalItem } from "./meta";
import { dayKey } from "./date-utils";

export type ProjectOption = { id: string; name: string };

/** Create/edit form. Fields are controlled so a server-side validation error never wipes what was typed. */
export function EventForm({ initial, defaultDate, projects, tz, tzName, onDone, onCancel }: {
  initial?: CalItem; defaultDate: string; projects: ProjectOption[]; tz: string; tzName: string; onDone: () => void; onCancel: () => void;
}) {
  const [title, setTitle] = useState(initial?.title ?? "");
  const [type, setType] = useState<string>(initial?.type ?? "meeting");
  const [allDay, setAllDay] = useState(initial?.allDay ?? false);
  const [start, setStart] = useState(initial ? toLocalInput(initial.start, tz) : `${defaultDate}T16:00`);
  const [end, setEnd] = useState(() => {
    if (!initial) return `${defaultDate}T17:00`;
    if (!initial.end) return "";
    return initial.allDay ? `${dayKey(initial.end, tz)}T00:00` : toLocalInput(initial.end, tz);
  });
  const [location, setLocation] = useState(initial?.location ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [visibility, setVisibility] = useState<string>(initial?.visibility ?? "everyone");
  const [projectId, setProjectId] = useState(initial?.projectId ?? "");

  const setDatePart = (cur: string, d: string, fallbackTime: string) => (d ? `${d}T${cur.slice(11, 16) || fallbackTime}` : "");

  return (
    <ActionForm action={saveEventAction} onSuccess={onDone} className="space-y-4">
      {initial && <input type="hidden" name="id" value={initial.id} />}
      <Field label="Title" htmlFor="ev-title" required>
        <Input id="ev-title" name="title" required maxLength={160} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Courage Box packing day" />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Type" htmlFor="ev-type">
          <Select id="ev-type" name="type" value={type} onChange={(e) => setType(e.target.value)}>
            {EVENT_TYPES.map((t) => <option key={t} value={t}>{EVENT_TYPE_LABEL[t]}</option>)}
          </Select>
        </Field>
        <Field label="Who can see it" htmlFor="ev-vis">
          <Select id="ev-vis" name="visibility" value={visibility} onChange={(e) => setVisibility(e.target.value)}>
            {(["everyone", "leadership", "admin"] as const).map((v) => <option key={v} value={v}>{VISIBILITY_LABEL[v]}</option>)}
          </Select>
        </Field>
      </div>

      <Checkbox name="allDay" label="All-day event" checked={allDay} onChange={(e) => setAllDay(e.target.checked)} />
      {allDay ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Starts" htmlFor="ev-sd" required>
            <Input id="ev-sd" name="startDate" type="date" required value={start.slice(0, 10)} onChange={(e) => setStart(setDatePart(start, e.target.value, "16:00"))} />
          </Field>
          <Field label="Ends" htmlFor="ev-ed" hint="Optional, for multi-day events.">
            <Input id="ev-ed" name="endDate" type="date" min={start.slice(0, 10)} value={end.slice(0, 10)} onChange={(e) => setEnd(setDatePart(end, e.target.value, "17:00"))} />
          </Field>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Starts" htmlFor="ev-s" required>
            <Input id="ev-s" name="startsAt" type="datetime-local" required value={start} onChange={(e) => setStart(e.target.value)} />
          </Field>
          <Field label="Ends" htmlFor="ev-e" hint="Optional.">
            <Input id="ev-e" name="endsAt" type="datetime-local" min={start} value={end} onChange={(e) => setEnd(e.target.value)} />
          </Field>
        </div>
      )}
      <p className="-mt-2 text-xs text-muted">Times are in {tzName}.</p>

      <Field label="Location" htmlFor="ev-loc" hint="An address, a room, or a video-call link.">
        <Input id="ev-loc" name="location" maxLength={300} value={location} onChange={(e) => setLocation(e.target.value)} />
      </Field>
      <Field label="Description" htmlFor="ev-desc">
        <Textarea id="ev-desc" name="description" rows={4} maxLength={5000} value={description} onChange={(e) => setDescription(e.target.value)} />
      </Field>
      {projects.length > 0 && (
        <Field label="Project" htmlFor="ev-proj" hint="Optional. Leaders and admins see a link to it.">
          <Select id="ev-proj" name="projectId" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
            <option value="">No project</option>
            {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </Select>
        </Field>
      )}
      <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:justify-end">
        <Button type="button" variant="secondary" onClick={onCancel}>Cancel</Button>
        <SubmitButton pendingText="Saving…">{initial ? "Save changes" : "Add event"}</SubmitButton>
      </div>
    </ActionForm>
  );
}

export function EventFormDialog({ open, onClose, ...p }: {
  open: boolean; onClose: () => void; initial?: CalItem; defaultDate: string; projects: ProjectOption[]; tz: string; tzName: string;
}) {
  return (
    <Dialog open={open} onClose={onClose} title={p.initial ? "Edit event" : "New event"} size="lg">
      {open && <EventForm {...p} onDone={onClose} onCancel={onClose} />}
    </Dialog>
  );
}

export function NewEventButton({ defaultDate, projects, tz, tzName, label = "New event", variant = "primary" }: {
  defaultDate: string; projects: ProjectOption[]; tz: string; tzName: string; label?: string; variant?: "primary" | "secondary" | "subtle";
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button type="button" variant={variant} onClick={() => setOpen(true)}><Plus className="h-4 w-4" aria-hidden />{label}</Button>
      <EventFormDialog open={open} onClose={() => setOpen(false)} defaultDate={defaultDate} projects={projects} tz={tz} tzName={tzName} />
    </>
  );
}
