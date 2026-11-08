"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Send, Trash2 } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { ActionForm, Checkbox, Field, Input, SubmitButton, Textarea } from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toaster";
import { deleteDraftAction, publishDraftsAction, updateDraftAction } from "@/server/task-draft-actions";

function useRun() {
  const [pending, start] = useTransition();
  const toast = useToast();
  const router = useRouter();
  const run = (fn: () => Promise<{ ok: boolean; message?: string; error?: string }>) => start(async () => {
    const r = await fn();
    toast.push(r.ok ? "success" : "error", r.ok ? r.message ?? "Done." : r.error ?? "");
    router.refresh();
  });
  return { pending, run };
}

export function PublishDraftsButton({ ids, label, confirmText, size = "sm", variant = "primary" }: { ids: string[]; label: string; confirmText: string; size?: "sm" | "md"; variant?: "primary" | "secondary" }) {
  const { pending, run } = useRun();
  return (
    <Button size={size} variant={variant} disabled={pending || !ids.length} onClick={() => { if (window.confirm(confirmText)) run(() => publishDraftsAction(ids)); }}>
      <Send className="h-3.5 w-3.5" />{pending ? "Publishing…" : label}
    </Button>
  );
}

export function DeleteDraftButton({ id, title }: { id: string; title: string }) {
  const { pending, run } = useRun();
  return (
    <Button size="sm" variant="ghost" disabled={pending} aria-label={`Delete draft ${title}`} onClick={() => { if (window.confirm(`Delete the draft “${title}”?`)) run(() => deleteDraftAction(id)); }}>
      <Trash2 className="h-3.5 w-3.5" />
    </Button>
  );
}

export type DraftEditView = {
  id: string; kind: string; batch: string; title: string; text: string; when: string; whenKey: string | null;
  assignees: string[] | null; checklist: string | null; options: string | null;
};

const WHEN_LABEL: Record<string, string> = { dueAt: "Due", startsAt: "Starts", publishAt: "Publish at", closesAt: "Poll closes" };
const TEXT_LABEL: Record<string, string> = { task: "Instructions", announcement: "Message", poll: "Description", event: "Description", meeting: "Agenda", resource: "Description" };

export function EditDraftButton({ v, people }: { v: DraftEditView; people: { id: string; name: string }[] }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button size="sm" variant="ghost" aria-label={`Edit draft ${v.title}`} onClick={() => setOpen(true)}><Pencil className="h-3.5 w-3.5" /></Button>
      <Dialog open={open} onClose={() => setOpen(false)} title="Edit draft" description="Changes stay private until you publish.">
        <ActionForm action={updateDraftAction} onSuccess={() => setOpen(false)} className="space-y-4">
          <input type="hidden" name="id" value={v.id} />
          <Field label={v.kind === "poll" ? "Question" : "Title"} htmlFor={`dt-${v.id}`}><Input id={`dt-${v.id}`} name="title" required maxLength={200} defaultValue={v.title} /></Field>
          <Field label={TEXT_LABEL[v.kind] ?? "Details"} htmlFor={`dx-${v.id}`}><Textarea id={`dx-${v.id}`} name="text" rows={7} defaultValue={v.text} /></Field>
          {v.options !== null && <Field label="Options" hint="One per line, at least 2." htmlFor={`do-${v.id}`}><Textarea id={`do-${v.id}`} name="options" rows={4} defaultValue={v.options} /></Field>}
          {v.checklist !== null && <Field label="Checklist" hint="One item per line." htmlFor={`dc-${v.id}`}><Textarea id={`dc-${v.id}`} name="checklist" rows={5} defaultValue={v.checklist} /></Field>}
          {v.assignees !== null && (
            <fieldset>
              <legend className="label">Assigned to</legend>
              <div className="grid grid-cols-2 gap-x-4">{people.map((p) => <Checkbox key={p.id} name="assignees" value={p.id} defaultChecked={v.assignees!.includes(p.id)} label={p.name} />)}</div>
            </fieldset>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            {v.whenKey && <Field label={WHEN_LABEL[v.whenKey] ?? "Date"} hint="Eastern time" htmlFor={`dw-${v.id}`}><Input id={`dw-${v.id}`} name="when" type="datetime-local" defaultValue={v.when} /></Field>}
            <Field label="Group" hint="Drafts in the same group can be published together." htmlFor={`db-${v.id}`}><Input id={`db-${v.id}`} name="batch" maxLength={80} defaultValue={v.batch} placeholder="e.g. Week of Nov 9" /></Field>
          </div>
          <div className="flex justify-end"><SubmitButton>Save draft</SubmitButton></div>
        </ActionForm>
      </Dialog>
    </>
  );
}
