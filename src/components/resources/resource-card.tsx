import Link from "next/link";
import { ArrowUpRight, Download, FileText, Link2, Lock, Pin, Pencil, StickyNote, Trash2 } from "lucide-react";
import { ConfirmAction } from "@/components/ui/confirm";
import { deleteResource } from "@/app/(app)/resources/actions";
import { Badge } from "@/components/ui/badge";
import { VISIBILITY_LABEL } from "@/lib/task-meta";
import { fmtBytes } from "@/components/projects/meta";
import { PinButton } from "./pin-button";
import { ResourceFormDialog, type ResourceKind } from "./resource-form";

export type ResourceCardData = {
  id: string; title: string; description: string; category: string; kind: string; url: string | null; body: string | null; fileId: string | null;
  visibility: "everyone" | "leadership" | "admin"; pinned: boolean; fileName: string | null; fileSize: number | null;
};

export const KIND_META = {
  note: { icon: StickyNote, label: "Note", cls: "bg-brand-soft text-brand-ink" },
  link: { icon: Link2, label: "Link", cls: "bg-violet-soft text-violet" },
  file: { icon: FileText, label: "File", cls: "bg-accent-soft text-accent-ink" },
} as const;

export function hostOf(url: string | null) {
  if (!url) return "";
  try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return url; }
}

/** Where a resource's main click goes: notes open the reader, links open the site, files download. */
export function resourceHref(r: { id: string; kind: string; url: string | null; fileId: string | null }) {
  if (r.kind === "link" && r.url) return { href: r.url, external: true };
  if (r.kind === "file" && r.fileId) return { href: `/api/files/${r.fileId}`, external: false, download: true };
  return { href: `/resources/${r.id}`, external: false };
}

export function ResourceCard({ r, admin, categories, accept }: { r: ResourceCardData; admin: boolean; categories: string[]; accept: string }) {
  const kind = (r.kind in KIND_META ? r.kind : "note") as ResourceKind;
  const meta = KIND_META[kind];
  const target = resourceHref(r);
  const sub = kind === "link" ? hostOf(r.url) : kind === "file" ? [r.fileName, r.fileSize != null ? fmtBytes(r.fileSize) : null].filter(Boolean).join(" · ") : "Note";
  const ActionIcon = kind === "link" ? ArrowUpRight : kind === "file" ? Download : null;
  const inner = (
    <>
      <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${meta.cls}`}><meta.icon className="h-[18px] w-[18px]" aria-hidden /></span>
      <span className="min-w-0 flex-1">
        <span className="flex items-start gap-1.5">
          <span className="font-semibold leading-snug text-fg group-hover:text-brand-ink">{r.title}</span>
          {r.pinned && <Pin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent-ink" aria-label="Pinned" />}
        </span>
        {(r.description || (kind === "note" && r.body)) && <span className="mt-0.5 line-clamp-2 block text-sm text-muted">{r.description || r.body}</span>}
        <span className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
          <span className="truncate">{sub}</span>
          {r.visibility !== "everyone" && (
            <Badge tone={r.visibility === "admin" ? "red" : "violet"} className="text-[11px]"><Lock className="h-3 w-3" aria-hidden />{VISIBILITY_LABEL[r.visibility]}</Badge>
          )}
        </span>
      </span>
      {ActionIcon && <ActionIcon className="mt-1 h-4 w-4 shrink-0 text-faint group-hover:text-fg-2" aria-hidden />}
      {target.external && <span className="sr-only">(opens in a new tab)</span>}
      {target.download && <span className="sr-only">(download)</span>}
    </>
  );
  const cls = "focus-ring group flex min-w-0 flex-1 items-start gap-3 rounded-[13px] p-4";
  return (
    <div className="card flex h-full flex-col transition hover:border-line-strong hover:shadow-card">
      {target.external
        ? <a href={target.href} target="_blank" rel="noopener noreferrer" className={cls}>{inner}</a>
        : target.download ? <a href={target.href} className={cls}>{inner}</a>
          : <Link href={target.href} className={cls}>{inner}</Link>}
      {admin && (
        <div className="flex items-center justify-end gap-0.5 border-t border-line px-1.5 py-1">
          <ResourceFormDialog triggerVariant="ghost" triggerSize="sm" triggerClassName="h-10 text-muted"
            trigger={<><Pencil className="h-4 w-4" aria-hidden />Edit<span className="sr-only"> &quot;{r.title}&quot;</span></>} categories={categories} accept={accept}
            resource={{ id: r.id, title: r.title, description: r.description, category: r.category, kind, url: r.url, body: r.body,
              visibility: r.visibility, pinned: r.pinned, fileName: r.fileName }} />
          <PinButton id={r.id} title={r.title} pinned={r.pinned} className="h-10 w-10 text-muted" />
          <ConfirmAction triggerVariant="ghost" triggerSize="md"
            trigger={<><Trash2 className="h-4 w-4 text-muted" aria-hidden /><span className="sr-only">Delete &quot;{r.title}&quot;</span></>}
            title="Delete resource?" confirmLabel="Delete" action={deleteResource.bind(null, r.id)}
            description={<>&ldquo;{r.title}&rdquo; will be removed for everyone{kind === "file" ? ", and its file deleted" : ""}. This can&apos;t be undone.</>} />
        </div>
      )}
    </div>
  );
}
