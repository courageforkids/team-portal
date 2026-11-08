"use client";
import { useState } from "react";
import { Plus, X, Vote } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { ActionForm, Checkbox, Field, Input, Select, SubmitButton } from "@/components/ui/form";
import { createPollAction } from "@/server/community-actions";

export function NewPollButton({ canDraft = false }: { canDraft?: boolean }) {
  const [open, setOpen] = useState(false);
  const [opts, setOpts] = useState(["", ""]);
  return (
    <>
      <Button onClick={() => setOpen(true)}><Vote className="h-4 w-4" />New poll</Button>
      <Dialog open={open} onClose={() => setOpen(false)} title="New poll" description="Everyone it's for gets a notification.">
        <ActionForm action={createPollAction} onSuccess={() => { setOpen(false); setOpts(["", ""]); }} className="space-y-4">
          <Field label="Question" htmlFor="pq"><Input id="pq" name="question" placeholder="e.g. Which day works for packing?" required maxLength={200} /></Field>
          <Field label="Details" htmlFor="pd" hint="Optional"><Input id="pd" name="description" maxLength={1000} /></Field>
          <fieldset className="space-y-2">
            <legend className="label">Choices</legend>
            {opts.map((o, i) => (
              <div key={i} className="flex gap-2">
                <input className="input h-10" name="option" value={o} onChange={(e) => setOpts(opts.map((x, j) => (j === i ? e.target.value : x)))} placeholder={`Choice ${i + 1}`} aria-label={`Choice ${i + 1}`} maxLength={100} />
                {opts.length > 2 && <button type="button" aria-label="Remove choice" onClick={() => setOpts(opts.filter((_, j) => j !== i))} className="rounded-lg px-2 text-faint hover:bg-surface-2 hover:text-fg"><X className="h-4 w-4" /></button>}
              </div>
            ))}
            {opts.length < 12 && <button type="button" onClick={() => setOpts([...opts, ""])} className="inline-flex items-center gap-1 text-sm font-semibold text-brand-ink hover:underline"><Plus className="h-4 w-4" />Add a choice</button>}
          </fieldset>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Show results" htmlFor="psr"><Select id="psr" name="showResults" defaultValue="after_vote"><option value="after_vote">After someone votes</option><option value="always">Always</option><option value="after_close">Only when it closes</option></Select></Field>
            <Field label="Closes" htmlFor="pca" hint="Optional"><Input id="pca" name="closesAt" type="datetime-local" /></Field>
          </div>
          <fieldset>
            <legend className="label">Who can vote</legend>
            <div className="flex flex-wrap gap-x-4"><Checkbox name="roles" value="leader" label="Leadership" /><Checkbox name="roles" value="volunteer" label="Volunteers" /><Checkbox name="roles" value="admin" label="Admins" /></div>
            <p className="hint">Leave all unchecked for everyone.</p>
          </fieldset>
          <div className="space-y-1"><Checkbox name="multiple" label="Let people pick more than one" /><Checkbox name="anonymous" label="Anonymous" description="Nobody sees who voted for what, including admins." /></div>
          <div className="flex justify-end gap-2">{canDraft && <SubmitButton name="intent" value="draft" variant="secondary" pendingText="Saving…">Save as draft</SubmitButton>}<SubmitButton>Post poll</SubmitButton></div>
        </ActionForm>
      </Dialog>
    </>
  );
}
