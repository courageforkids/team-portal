"use client";
import { useMemo, useState } from "react";
import { Search, Repeat, Paperclip } from "lucide-react";
import { ActionForm, Checkbox, Field, Input, Select, SubmitButton, Textarea } from "@/components/ui/form";
import { Avatar } from "@/components/ui/avatar";
import { buttonClass } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { createTaskAction, updateTaskAction } from "@/server/task-actions";
import { TIMEZONES } from "@/lib/dates";
import type { SubmissionType } from "@/db/schema";

type Opt = { id: string; name: string };
type Person = { id: string; name: string; title: string; avatarFileId: string | null; departmentId: string | null; role: string };

export type TaskFormValues = {
  id?: string; title: string; instructions: string; assignees: string[]; departmentId: string; categoryId: string; projectId: string;
  priority: string; dueAt: string; timezone: string; deliverables: string; completionCriteria: string; submissionTypes: SubmissionType[];
  checklist: string; links: string; requiresReview: boolean; reviewerId: string; internalNotes: string;
};

const TYPES: { key: SubmissionType; label: string; desc: string }[] = [
  { key: "file", label: "File upload", desc: "Images, PDFs, documents, videos" },
  { key: "text", label: "Written response", desc: "A short answer or summary" },
  { key: "link", label: "Link", desc: "Google Doc, Canva, website…" },
  { key: "checklist", label: "Checklist", desc: "Check off each step" },
];

export function TaskForm({ mode, values, people, departments, categories, projects, reviewers }: {
  mode: "create" | "edit"; values: TaskFormValues; people: Person[]; departments: Opt[]; categories: Opt[]; projects: Opt[]; reviewers: Opt[];
}) {
  const [assignees, setAssignees] = useState<string[]>(values.assignees);
  const [filter, setFilter] = useState("");
  const [types, setTypes] = useState<SubmissionType[]>(values.submissionTypes);
  const [review, setReview] = useState(values.requiresReview);
  const [repeat, setRepeat] = useState("none");
  const shown = useMemo(() => people.filter((p) => (p.name + " " + p.title).toLowerCase().includes(filter.toLowerCase())), [people, filter]);
  const toggle = (id: string) => setAssignees((a) => (a.includes(id) ? a.filter((x) => x !== id) : [...a, id]));

  return (
    <ActionForm action={mode === "create" ? createTaskAction : updateTaskAction} className="grid gap-6 lg:grid-cols-[1fr_340px]">
      {values.id && <input type="hidden" name="id" value={values.id} />}
      <div className="space-y-6">
        <section className="card space-y-4 p-5">
          <Field label="Title" htmlFor="title" required><Input id="title" name="title" defaultValue={values.title} required maxLength={160} placeholder="e.g. Design three Instagram graphics" /></Field>
          <Field label="Instructions" htmlFor="instructions" hint="What needs to be done and any helpful context.">
            <Textarea id="instructions" name="instructions" rows={6} defaultValue={values.instructions} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Required deliverables" htmlFor="deliverables"><Textarea id="deliverables" name="deliverables" rows={3} defaultValue={values.deliverables} placeholder="What they should hand in" /></Field>
            <Field label="Completion criteria" htmlFor="completionCriteria"><Textarea id="completionCriteria" name="completionCriteria" rows={3} defaultValue={values.completionCriteria} placeholder="How you'll know it's done well" /></Field>
          </div>
        </section>

        <section className="card p-5">
          <h2 className="mb-1 font-semibold">How should they submit?</h2>
          <p className="mb-3 text-sm text-muted">Choose one or more. Each chosen method is required when they submit.</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {TYPES.map((t) => (
              <label key={t.key} className={cn("flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition", types.includes(t.key) ? "border-brand/50 bg-brand-soft" : "border-line hover:bg-surface-2")}>
                <input type="checkbox" name="submissionTypes" value={t.key} checked={types.includes(t.key)} className="mt-0.5 h-[18px] w-[18px] accent-[var(--brand)]"
                  onChange={() => setTypes((x) => (x.includes(t.key) ? x.filter((y) => y !== t.key) : [...x, t.key]))} />
                <span><span className="block text-sm font-semibold">{t.label}</span><span className="block text-xs text-muted">{t.desc}</span></span>
              </label>
            ))}
          </div>
          {types.includes("checklist") && (
            <Field className="mt-4" label="Checklist items" htmlFor="checklist" hint="One item per line.">
              <Textarea id="checklist" name="checklist" rows={4} defaultValue={values.checklist} placeholder={"Messaged every volunteer\nUpdated the sign-up sheet"} />
            </Field>
          )}
        </section>

        <section className="card space-y-4 p-5">
          <Field label="Helpful links" htmlFor="links" hint="One per line. Optional label: Brand kit | https://…">
            <Textarea id="links" name="links" rows={3} defaultValue={values.links} placeholder="Brand kit | https://…" />
          </Field>
          <Field label={<span className="inline-flex items-center gap-1.5"><Paperclip className="h-3.5 w-3.5" />Attachments</span>} htmlFor="attachments" hint="Up to 10 files, 25 MB each.">
            <input id="attachments" name="attachments" type="file" multiple className="block w-full text-sm text-muted file:mr-3 file:rounded-lg file:border-0 file:bg-surface-2 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-fg-2 hover:file:bg-surface-3" />
          </Field>
          <Field label="Internal notes" htmlFor="internalNotes" hint="Only administrators and the reviewer can see these.">
            <Textarea id="internalNotes" name="internalNotes" rows={2} defaultValue={values.internalNotes} />
          </Field>
        </section>
      </div>

      <aside className="space-y-6">
        <section className="card p-5">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="font-semibold">Assign to <span className="text-bad">*</span></h2>
            <span className="text-xs text-muted">{assignees.length} selected</span>
          </div>
          <div className="relative mb-2">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" aria-hidden />
            <input className="input h-9 pl-9 text-sm" placeholder="Find a person" aria-label="Find a person" value={filter} onChange={(e) => setFilter(e.target.value)} />
          </div>
          <div className="max-h-72 space-y-0.5 overflow-y-auto pr-1" role="group" aria-label="Assignees">
            {shown.map((p) => (
              <label key={p.id} className={cn("flex cursor-pointer items-center gap-3 rounded-lg px-2 py-2", assignees.includes(p.id) ? "bg-brand-soft" : "hover:bg-surface-2")}>
                <input type="checkbox" name="assignees" value={p.id} checked={assignees.includes(p.id)} onChange={() => toggle(p.id)} className="h-[18px] w-[18px] accent-[var(--brand)]" />
                <Avatar name={p.name} fileId={p.avatarFileId} size={28} />
                <span className="min-w-0"><span className="block truncate text-sm font-medium">{p.name}</span><span className="block truncate text-xs text-muted">{p.title}</span></span>
              </label>
            ))}
          </div>
          {mode === "create" && assignees.length > 1 && repeat === "none" && (
            <div className="mt-3 rounded-lg bg-surface-2 p-3">
              <Checkbox name="separate" defaultChecked label="Give each person their own copy" description="Each person submits separately. Turn off for one shared task." />
            </div>
          )}
        </section>

        <section className="card space-y-4 p-5">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Due" htmlFor="dueAt" className="col-span-2"><Input id="dueAt" name="dueAt" type="datetime-local" defaultValue={values.dueAt} /></Field>
            <Field label="Time zone" htmlFor="timezone" className="col-span-2">
              <Select id="timezone" name="timezone" defaultValue={values.timezone}>{TIMEZONES.map((z) => <option key={z} value={z}>{z.replace("America/", "").replace("_", " ")}</option>)}</Select>
            </Field>
            <Field label="Priority" htmlFor="priority">
              <Select id="priority" name="priority" defaultValue={values.priority}>
                <option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option><option value="urgent">Urgent</option>
              </Select>
            </Field>
            <Field label="Department" htmlFor="departmentId">
              <Select id="departmentId" name="departmentId" defaultValue={values.departmentId}><option value="">None</option>{departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</Select>
            </Field>
            <Field label="Project" htmlFor="projectId">
              <Select id="projectId" name="projectId" defaultValue={values.projectId}><option value="">None</option>{projects.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</Select>
            </Field>
            <Field label="Category" htmlFor="categoryId">
              <Select id="categoryId" name="categoryId" defaultValue={values.categoryId}><option value="">None</option>{categories.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</Select>
            </Field>
          </div>
        </section>

        <section className="card space-y-3 p-5">
          <Checkbox name="requiresReview" checked={review} onChange={(e) => setReview(e.target.checked)} label="Requires review"
            description={review ? "Submitting sends it for approval. It's only complete once approved." : "Submitting marks it complete right away."} />
          {review && (
            <Field label="Reviewer" htmlFor="reviewerId" hint="Administrators can always review.">
              <Select id="reviewerId" name="reviewerId" defaultValue={values.reviewerId}><option value="">Any administrator</option>{reviewers.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</Select>
            </Field>
          )}
        </section>

        {mode === "create" && (
          <section className="card space-y-3 p-5">
            <Field label={<span className="inline-flex items-center gap-1.5"><Repeat className="h-3.5 w-3.5" />Repeat</span>} htmlFor="repeat">
              <Select id="repeat" name="repeat" value={repeat} onChange={(e) => setRepeat(e.target.value)}>
                <option value="none">Does not repeat</option><option value="weekly">Weekly</option><option value="biweekly">Every 2 weeks</option><option value="monthly">Monthly</option><option value="custom">Custom…</option>
              </Select>
            </Field>
            {repeat !== "none" && (
              <div className="grid grid-cols-2 gap-3">
                {repeat === "custom" && <Field label="Every (days)" htmlFor="intervalDays" className="col-span-2"><Input id="intervalDays" name="intervalDays" type="number" min={1} max={365} defaultValue={10} /></Field>}
                <Field label="Create ahead" htmlFor="leadDays" hint="Days before due"><Input id="leadDays" name="leadDays" type="number" min={0} max={30} defaultValue={7} /></Field>
                <Field label="Ends on" htmlFor="endsOn" hint="Optional"><Input id="endsOn" name="endsOn" type="date" /></Field>
                <p className="col-span-2 text-xs text-muted">Each person gets their own copy every time, with its own deadline and submission.</p>
              </div>
            )}
          </section>
        )}

        <div className="flex flex-col gap-2">
          <SubmitButton size="lg" pendingText={mode === "create" ? "Creating…" : "Saving…"}>{mode === "create" ? "Create & assign" : "Save changes"}</SubmitButton>
          <a href={values.id ? `/tasks/${values.id}` : "/tasks/all"} className={buttonClass("ghost")}>Cancel</a>
        </div>
      </aside>
    </ActionForm>
  );
}
