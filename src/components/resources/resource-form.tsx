"use client";
import { useState, type ReactNode } from "react";
import { FileText, Link2, StickyNote } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ActionForm, Checkbox, Field, Input, SubmitButton, Textarea } from "@/components/ui/form";
import { VISIBILITY_LABEL } from "@/lib/task-meta";
import { cn } from "@/lib/cn";
import { useFields } from "@/components/projects/use-fields";
import { KeepSelect } from "@/components/projects/keep-select";
import { createResource, updateResource } from "@/app/(app)/resources/actions";

export type ResourceKind = "file" | "link" | "note";
export type EditableResource = {
  id: string; title: string; description: string; category: string; kind: ResourceKind; url: string | null; body: string | null;
  visibility: "everyone" | "leadership" | "admin"; pinned: boolean; fileName: string | null;
};

const KINDS: { key: ResourceKind; label: string; icon: typeof FileText; hint: string }[] = [
  { key: "note", label: "Note", icon: StickyNote, hint: "Text written here" },
  { key: "link", label: "Link", icon: Link2, hint: "An outside page" },
  { key: "file", label: "File", icon: FileText, hint: "Upload a document" },
];

/** Create/edit dialog. Renders its own trigger so it works anywhere (cards, detail page, header). */
export function ResourceFormDialog({ resource, categories, accept, defaultCategory, trigger, triggerClassName, triggerVariant = "primary", triggerSize = "md", triggerLabel }: {
  resource?: EditableResource; categories: string[]; accept: string; defaultCategory?: string;
  trigger: ReactNode; triggerClassName?: string; triggerVariant?: "primary" | "secondary" | "ghost" | "subtle"; triggerSize?: "sm" | "md" | "icon";
  triggerLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<ResourceKind>(resource?.kind ?? "note");
  const r = resource;
  const uid = r?.id ?? "new";
  const action = r ? updateResource.bind(null, r.id) : createResource;
  const initial = {
    title: r?.title ?? "", description: r?.description ?? "", url: r?.url ?? "", body: r?.body ?? "",
    category: r?.category ?? defaultCategory ?? "General", visibility: r?.visibility ?? "everyone",
  };
  const { bind, reset } = useFields(initial);
  const [pinned, setPinned] = useState(!!r?.pinned);
  return (
    <>
      <Button type="button" variant={triggerVariant} size={triggerSize} className={triggerClassName} aria-label={triggerLabel} onClick={() => { if (r) { reset(); setKind(r.kind); setPinned(r.pinned); } setOpen(true); }}>{trigger}</Button>
      <Dialog open={open} onClose={() => setOpen(false)} size="lg" title={r ? "Edit resource" : "Add a resource"}
        description={r ? undefined : "Share a note, an outside link or a file with the team."}>
        <ActionForm action={action} onSuccess={() => { setOpen(false); if (!r) { setKind("note"); reset(); setPinned(false); } }} resetOnSuccess={!r} className="space-y-5">
          <fieldset>
            <legend className="label">Type</legend>
            <div className="grid grid-cols-3 gap-2">
              {KINDS.map((k) => (
                <label key={k.key} className={cn("focus-within:ring-[3px] focus-within:ring-[var(--ring)] flex cursor-pointer flex-col items-center gap-1 rounded-xl border px-2 py-3 text-center transition",
                  kind === k.key ? "border-brand bg-brand-soft text-brand-ink" : "border-line-strong text-fg-2 hover:bg-surface-2")}>
                  <input type="radio" name="kind" value={k.key} checked={kind === k.key} onChange={() => setKind(k.key)} className="sr-only" />
                  <k.icon className="h-5 w-5" aria-hidden />
                  <span className="text-sm font-semibold">{k.label}</span>
                  <span className="hidden text-[11px] text-muted sm:block">{k.hint}</span>
                </label>
              ))}
            </div>
          </fieldset>
          <Field label="Title" htmlFor={`rs-title-${uid}`} required>
            <Input id={`rs-title-${uid}`} {...bind("title")} required maxLength={160} placeholder="e.g. Packing-day checklist" />
          </Field>
          <Field label="Short description" htmlFor={`rs-desc-${uid}`} hint="Shown on the card and used in search.">
            <Textarea id={`rs-desc-${uid}`} {...bind("description")} rows={2} maxLength={1000} />
          </Field>
          {kind === "link" && (
            <Field label="Web address" htmlFor={`rs-url-${uid}`} required hint="Opens in a new tab.">
              <Input id={`rs-url-${uid}`} {...bind("url")} type="url" inputMode="url" required placeholder="https://…" />
            </Field>
          )}
          {kind === "note" && (
            <Field label="Content" htmlFor={`rs-body-${uid}`} required hint="Leave a blank line between paragraphs.">
              <Textarea id={`rs-body-${uid}`} {...bind("body")} rows={10} required />
            </Field>
          )}
          {kind === "file" && (
            <Field label={r?.fileName ? "Replace file" : "File"} htmlFor={`rs-file-${uid}`} required={!r?.fileName}
              hint={r?.fileName ? <>Current file: <b className="font-semibold text-fg-2">{r.fileName}</b>. Leave empty to keep it.</> : "Up to 25 MB. PDF, images, Office documents and more."}>
              <Input id={`rs-file-${uid}`} name="file" type="file" accept={accept} required={!r?.fileName}
                className="file:mr-3 file:rounded-lg file:border-0 file:bg-surface-2 file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-fg-2" />
            </Field>
          )}
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Category" htmlFor={`rs-cat-${uid}`} required hint="Pick one or type a new category.">
              <Input id={`rs-cat-${uid}`} {...bind("category")} required maxLength={40} list={`rs-cats-${uid}`} />
              <datalist id={`rs-cats-${uid}`}>{categories.map((c) => <option key={c} value={c} />)}</datalist>
            </Field>
            <Field label="Who can see this" htmlFor={`rs-vis-${uid}`} required>
              <KeepSelect id={`rs-vis-${uid}`} {...bind("visibility")}>
                {(["everyone", "leadership", "admin"] as const).map((v) => <option key={v} value={v}>{VISIBILITY_LABEL[v]}</option>)}
              </KeepSelect>
            </Field>
          </div>
          <Checkbox name="pinned" checked={pinned} onChange={(e) => setPinned(e.target.checked)} label="Pin to the top" description="Pinned resources appear first for everyone who can see them." />
          <div className="flex flex-col-reverse gap-2 border-t border-line pt-4 sm:flex-row sm:justify-end">
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
            <SubmitButton pendingText="Saving…">{r ? "Save changes" : "Add resource"}</SubmitButton>
          </div>
        </ActionForm>
      </Dialog>
    </>
  );
}
