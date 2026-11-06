"use client";
import { useState } from "react";
import { Pencil } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { buttonClass } from "@/components/ui/button";
import { ActionForm, Checkbox, Field, Input, SubmitButton } from "@/components/ui/form";
import { saveSeriesAction } from "@/app/(app)/settings/actions";

export function SeriesDialog({ series, people }: {
  series: { id: string; title: string; nextDueLocal: string; endsOn: string | null; assigneeIds: string[]; timezone: string };
  people: { id: string; name: string }[];
}) {
  const [open, setOpen] = useState(false);
  const p = `s-${series.id}`;
  return (
    <>
      <button type="button" className={buttonClass("secondary", "sm", "max-md:h-10")} onClick={() => setOpen(true)}>
        <Pencil className="h-3.5 w-3.5" aria-hidden />Edit
      </button>
      <Dialog open={open} onClose={() => setOpen(false)} title={`Edit “${series.title}”`} description="Changes apply to future occurrences. Tasks already created stay as they are.">
        <ActionForm action={saveSeriesAction} onSuccess={() => setOpen(false)} className="space-y-4">
          <input type="hidden" name="id" value={series.id} />
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Next due" htmlFor={`${p}-next`} required hint={`Time zone: ${series.timezone}`}>
              <Input id={`${p}-next`} type="datetime-local" name="nextDueAt" required defaultValue={series.nextDueLocal} />
            </Field>
            <Field label="Ends on" htmlFor={`${p}-ends`} hint="Optional. Leave empty to repeat until paused.">
              <Input id={`${p}-ends`} type="date" name="endsOn" defaultValue={series.endsOn ?? ""} />
            </Field>
          </div>
          <fieldset>
            <legend className="label">Assignees</legend>
            <p className="hint mt-0 mb-2">Each person gets their own copy of every occurrence.</p>
            <div className="grid max-h-64 gap-0.5 overflow-y-auto rounded-lg border border-line p-2 sm:grid-cols-2">
              {people.map((m) => <Checkbox key={m.id} name="assigneeIds" value={m.id} defaultChecked={series.assigneeIds.includes(m.id)} label={m.name} />)}
            </div>
          </fieldset>
          <div className="flex justify-end gap-2">
            <button type="button" className={buttonClass("secondary")} onClick={() => setOpen(false)}>Cancel</button>
            <SubmitButton pendingText="Saving…">Save changes</SubmitButton>
          </div>
        </ActionForm>
      </Dialog>
    </>
  );
}
