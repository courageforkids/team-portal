"use client";
import { useEffect, useRef, useState } from "react";
import { FileText, Paperclip, Send, CalendarClock } from "lucide-react";
import { ActionForm, Checkbox, Field, Input, Select, SubmitButton, Textarea } from "@/components/ui/form";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/cn";
import { saveAnnouncementAction } from "@/app/(app)/announcements/actions";
import { ANNOUNCEMENT_CATEGORIES, CATEGORY_LABEL } from "./meta";
import { fmtBytes } from "./attachment-list";

export type AnnouncementFormInitial = {
  id: string; title: string; body: string; category: string; pinned: boolean; requireAck: boolean;
  roles: string[]; departmentIds: string[]; published: boolean; publishAtLocal: string; publishedLabel: string;
  attachments: { id: string; filename: string; size: number }[];
};

function Segmented({ name, value, onChange, options, label }: {
  name: string; value: string; onChange: (v: string) => void; options: { value: string; label: string }[]; label: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex w-full rounded-xl bg-surface-2 p-1 sm:w-auto">
      {options.map((o) => (
        <label key={o.value} className={cn("focus-within:ring-[3px] focus-within:ring-[var(--ring)] flex h-10 flex-1 cursor-pointer items-center justify-center rounded-lg px-4 text-[13px] font-semibold transition sm:h-9 sm:flex-none",
          value === o.value ? "bg-surface text-fg shadow-soft" : "text-muted hover:text-fg")}>
          <input type="radio" name={name} value={o.value} checked={value === o.value} onChange={() => onChange(o.value)} className="sr-only" />
          {o.label}
        </label>
      ))}
    </div>
  );
}

export function AnnouncementForm({ initial, departments, accept, tzLabel, minLocal }: {
  initial?: AnnouncementFormInitial; departments: { id: string; name: string; color: string }[]; accept: string; tzLabel: string; minLocal: string;
}) {
  const startsGrouped = !!initial && (initial.roles.length > 0 || initial.departmentIds.length > 0);
  const [audienceMode, setAudienceMode] = useState(startsGrouped ? "groups" : "everyone");
  const [publishMode, setPublishMode] = useState(initial && !initial.published && initial.publishAtLocal ? "schedule" : "now");
  const [picked, setPicked] = useState<File[]>([]);
  // Controlled fields: React resets uncontrolled inputs after every form action, which would wipe the draft on a validation error.
  const [title, setTitle] = useState(initial?.title ?? "");
  const [body, setBody] = useState(initial?.body ?? "");
  const [category, setCategory] = useState(initial?.category ?? "update");
  const [pinned, setPinned] = useState(initial?.pinned ?? false);
  const [requireAck, setRequireAck] = useState(initial?.requireAck ?? false);
  const [roles, setRoles] = useState<string[]>(initial?.roles ?? []);
  const [deptIds, setDeptIds] = useState<string[]>(initial?.departmentIds ?? []);
  const [publishAt, setPublishAt] = useState(initial?.publishAtLocal ?? "");
  const fileRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const form = fileRef.current?.form;
    const clear = () => setPicked([]);
    form?.addEventListener("reset", clear);
    return () => form?.removeEventListener("reset", clear);
  }, []);
  const toggle = (list: string[], v: string, on: boolean) => (on ? [...new Set([...list, v])] : list.filter((x) => x !== v));
  const cancelHref = initial ? `/announcements/${initial.id}` : "/announcements";
  const editingPublished = !!initial?.published;

  return (
    <ActionForm action={saveAnnouncementAction} className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
      {initial && <input type="hidden" name="id" value={initial.id} />}
      <Card className="space-y-5 self-start p-5 sm:p-6">
        <Field label="Title" htmlFor="title" required>
          <Input id="title" name="title" required maxLength={160} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Packing day moved to Saturday" />
        </Field>
        <Field label="Message" htmlFor="body" required hint="Leave a blank line between paragraphs. Links become clickable.">
          <Textarea id="body" name="body" required rows={12} maxLength={20000} value={body} onChange={(e) => setBody(e.target.value)} className="min-h-[220px]" />
        </Field>

        <div>
          <span className="label">Attachments</span>
          {initial && initial.attachments.length > 0 && (
            <ul className="mb-3 divide-y divide-line rounded-xl border border-line">
              {initial.attachments.map((f) => (
                <li key={f.id} className="flex items-center gap-3 px-3 py-2">
                  <FileText className="h-4 w-4 shrink-0 text-muted" aria-hidden />
                  <span className="min-w-0 flex-1 truncate text-sm text-fg">{f.filename} <span className="text-xs text-muted">· {fmtBytes(f.size)}</span></span>
                  <label className="flex h-10 shrink-0 cursor-pointer items-center gap-2 text-xs font-medium text-muted">
                    <input type="checkbox" name="removeFileIds" value={f.id} className="h-4 w-4 accent-[var(--bad)]" />Remove
                  </label>
                </li>
              ))}
            </ul>
          )}
          <label htmlFor="files" className="focus-within:ring-[3px] focus-within:ring-[var(--ring)] flex cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-line-strong bg-surface-2/50 px-4 py-5 text-center transition hover:bg-surface-2">
            <Paperclip className="h-5 w-5 text-muted" aria-hidden />
            <span className="text-sm font-semibold text-fg-2">{picked.length ? `${picked.length} file${picked.length === 1 ? "" : "s"} selected` : "Choose files"}</span>
            <span className="text-xs text-muted">PDF, images, Office docs · up to 10 files, 25 MB each</span>
            <input ref={fileRef} id="files" name="files" type="file" multiple accept={accept} className="sr-only"
              onChange={(e) => setPicked(Array.from(e.target.files ?? []))} />
          </label>
          {picked.length > 0 && (
            <ul className="mt-2 space-y-1 text-xs text-muted">
              {picked.map((f, i) => <li key={i} className="truncate">{f.name} · {fmtBytes(f.size)}</li>)}
            </ul>
          )}
        </div>
      </Card>

      <div className="space-y-4">
        <Card className="space-y-4 p-5">
          <Field label="Category" htmlFor="category">
            <Select id="category" name="category" value={category} onChange={(e) => setCategory(e.target.value)}>
              {ANNOUNCEMENT_CATEGORIES.map((c) => <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>)}
            </Select>
          </Field>
          <div className="space-y-1">
            <Checkbox name="pinned" label="Pin to top" description="Stays above newer announcements." checked={pinned} onChange={(e) => setPinned(e.target.checked)} />
            <Checkbox name="requireAck" label="Ask members to acknowledge" description="Adds an “I've read this” button and tracks who has." checked={requireAck} onChange={(e) => setRequireAck(e.target.checked)} />
          </div>
        </Card>

        <Card className="space-y-3 p-5">
          <span className="label mb-0">Who should see this?</span>
          <Segmented name="audienceMode" label="Audience" value={audienceMode} onChange={setAudienceMode}
            options={[{ value: "everyone", label: "Everyone" }, { value: "groups", label: "Specific groups" }]} />
          {audienceMode === "groups" && (
            <div className="space-y-3 pt-1">
              <fieldset>
                <legend className="eyebrow mb-1">Roles</legend>
                <Checkbox name="roles" value="leader" label="Leadership members" checked={roles.includes("leader")} onChange={(e) => setRoles(toggle(roles, "leader", e.target.checked))} />
                <Checkbox name="roles" value="volunteer" label="Volunteers" checked={roles.includes("volunteer")} onChange={(e) => setRoles(toggle(roles, "volunteer", e.target.checked))} />
              </fieldset>
              {departments.length > 0 && (
                <fieldset>
                  <legend className="eyebrow mb-1">Departments</legend>
                  {departments.map((d) => (
                    <Checkbox key={d.id} name="departmentIds" value={d.id} checked={deptIds.includes(d.id)} onChange={(e) => setDeptIds(toggle(deptIds, d.id, e.target.checked))}
                      label={<span className="inline-flex items-center gap-2"><span className="h-2 w-2 rounded-full" style={{ background: d.color }} aria-hidden />{d.name}</span>} />
                  ))}
                </fieldset>
              )}
              <p className="hint">Administrators always see every announcement. If you pick roles and departments, members must match both.</p>
            </div>
          )}
        </Card>

        <Card className="space-y-3 p-5">
          <span className="label mb-0">Publishing</span>
          {editingPublished ? (
            <p className="text-sm text-muted">Published {initial!.publishedLabel}. Edits show up right away; members aren&apos;t notified again.</p>
          ) : (
            <>
              <Segmented name="publishMode" label="When to publish" value={publishMode} onChange={setPublishMode}
                options={[{ value: "now", label: "Publish now" }, { value: "schedule", label: "Schedule" }]} />
              {publishMode === "schedule" && (
                <Field label="Publish on" htmlFor="publishAt" hint={`${tzLabel}. Members are notified when it goes live.`}>
                  <Input id="publishAt" name="publishAt" type="datetime-local" required min={minLocal} value={publishAt} onChange={(e) => setPublishAt(e.target.value)} />
                </Field>
              )}
            </>
          )}
        </Card>

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end lg:flex-col-reverse">
          <ButtonLink href={cancelHref} variant="secondary" className="w-full sm:w-auto lg:w-full">Cancel</ButtonLink>
          {!initial && <SubmitButton name="intent" value="draft" variant="secondary" pendingText="Saving…" className="w-full sm:w-auto lg:w-full">Save as draft</SubmitButton>}
          <SubmitButton pendingText="Saving…" className="w-full sm:w-auto lg:w-full">
            {initial ? "Save changes" : publishMode === "schedule"
              ? <><CalendarClock className="h-4 w-4" aria-hidden />Schedule announcement</>
              : <><Send className="h-4 w-4" aria-hidden />Publish announcement</>}
          </SubmitButton>
        </div>
      </div>
    </ActionForm>
  );
}
