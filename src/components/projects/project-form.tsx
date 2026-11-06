"use client";
import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { ActionForm, Field, Input, SubmitButton, Textarea } from "@/components/ui/form";
import { ButtonLink, Button } from "@/components/ui/button";
import type { ActionResult } from "@/lib/action";
import { useFields } from "./use-fields";
import { KeepSelect } from "@/components/projects/keep-select";
import { PROJECT_STATUSES, PROJECT_STATUS_LABEL, type ProjectStatus } from "./meta";

type Option = { id: string; name: string; title?: string };
export type ProjectFormValues = {
  name: string; description: string; directorId: string | null; departmentId: string | null; status: ProjectStatus;
  startDate: string | null; targetDate: string | null; links: { label: string; url: string }[];
};

export function ProjectForm({ action, values, directors, departments, cancelHref, submitLabel }: {
  action: (prev: ActionResult<unknown> | null, fd: FormData) => Promise<ActionResult<unknown>>;
  values?: ProjectFormValues; directors: Option[]; departments: Option[]; cancelHref: string; submitLabel: string;
}) {
  const v = values;
  const { bind } = useFields({
    name: v?.name ?? "", description: v?.description ?? "", directorId: v?.directorId ?? "", departmentId: v?.departmentId ?? "",
    status: v?.status ?? "planning", startDate: v?.startDate ?? "", targetDate: v?.targetDate ?? "",
  });
  return (
    <ActionForm action={action} className="space-y-5">
      <Field label="Project name" htmlFor="name" required>
        <Input id="name" {...bind("name")} required maxLength={120} placeholder="e.g. Spring Courage Box drive" />
      </Field>
      <Field label="Description" htmlFor="description" hint="What is this project, and what does done look like?">
        <Textarea id="description" {...bind("description")} rows={4} maxLength={5000} />
      </Field>
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Responsible director" htmlFor="directorId" hint="Directors can update milestones and documents.">
          <KeepSelect id="directorId" {...bind("directorId")}>
            <option value="">No director yet</option>
            {directors.map((d) => <option key={d.id} value={d.id}>{d.name}{d.title ? ` — ${d.title}` : ""}</option>)}
          </KeepSelect>
        </Field>
        <Field label="Department" htmlFor="departmentId">
          <KeepSelect id="departmentId" {...bind("departmentId")}>
            <option value="">No department</option>
            {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </KeepSelect>
        </Field>
        <Field label="Status" htmlFor="status" required>
          <KeepSelect id="status" {...bind("status")} required>
            {PROJECT_STATUSES.map((s) => <option key={s} value={s}>{PROJECT_STATUS_LABEL[s]}</option>)}
          </KeepSelect>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Start date" htmlFor="startDate">
            <Input id="startDate" {...bind("startDate")} type="date" />
          </Field>
          <Field label="Target date" htmlFor="targetDate">
            <Input id="targetDate" {...bind("targetDate")} type="date" />
          </Field>
        </div>
      </div>
      <LinksEditor initial={v?.links ?? []} />
      <div className="flex flex-col-reverse gap-2 border-t border-line pt-5 sm:flex-row sm:justify-end">
        <ButtonLink href={cancelHref} variant="secondary">Cancel</ButtonLink>
        <SubmitButton pendingText="Saving…">{submitLabel}</SubmitButton>
      </div>
    </ActionForm>
  );
}

let seq = 0;
function LinksEditor({ initial }: { initial: { label: string; url: string }[] }) {
  const [rows, setRows] = useState(() => initial.map((l) => ({ key: ++seq, ...l })));
  const set = (key: number, field: "label" | "url", value: string) => setRows((x) => x.map((r) => (r.key === key ? { ...r, [field]: value } : r)));
  return (
    <fieldset>
      <legend className="label">Links</legend>
      <p className="-mt-1 mb-2 text-xs text-muted">Shared docs, sheets or folders. Must start with http:// or https://</p>
      <div className="space-y-2">
        {rows.map((r, i) => (
          <div key={r.key} className="flex flex-col gap-2 rounded-xl border border-line p-2 sm:flex-row sm:items-center sm:border-0 sm:p-0">
            <label className="sr-only" htmlFor={`ll-${r.key}`}>Link {i + 1} label</label>
            <Input id={`ll-${r.key}`} name="linkLabel" placeholder="Label (e.g. Packing checklist)" value={r.label} onChange={(e) => set(r.key, "label", e.target.value)} maxLength={120} className="sm:w-56" />
            <label className="sr-only" htmlFor={`lu-${r.key}`}>Link {i + 1} address</label>
            <Input id={`lu-${r.key}`} name="linkUrl" type="url" inputMode="url" placeholder="https://…" value={r.url} onChange={(e) => set(r.key, "url", e.target.value)} className="sm:flex-1" />
            <Button type="button" variant="ghost" size="icon" aria-label={`Remove link ${i + 1}`} className="h-10 w-10 self-end sm:self-auto"
              onClick={() => setRows((x) => x.filter((y) => y.key !== r.key))}>
              <Trash2 className="h-4 w-4" aria-hidden />
            </Button>
          </div>
        ))}
      </div>
      <Button type="button" variant="subtle" size="sm" className="mt-2" onClick={() => setRows((x) => [...x, { key: ++seq, label: "", url: "" }])}>
        <Plus className="h-4 w-4" aria-hidden />Add link
      </Button>
    </fieldset>
  );
}
