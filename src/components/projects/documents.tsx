"use client";
import { useState } from "react";
import { Download, ExternalLink, FileText, FolderOpen, Link2, Plus, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmAction } from "@/components/ui/confirm";
import { Dialog } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { ActionForm, Field, Input, SubmitButton } from "@/components/ui/form";
import { fmtDate } from "@/lib/dates";
import { addProjectLink, deleteProjectFile, removeProjectLink, uploadProjectFiles } from "@/app/(app)/projects/actions";
import { fmtBytes } from "./meta";
import { useFields } from "./use-fields";

export type ProjectFile = { id: string; filename: string; size: number; createdAt: Date; uploadedByName: string | null };

export function ProjectDocuments({ projectId, links, files, canManage, accept }: {
  projectId: string; links: { label: string; url: string }[]; files: ProjectFile[]; canManage: boolean; accept: string;
}) {
  const [dlg, setDlg] = useState<"link" | "file" | null>(null);
  const empty = !links.length && !files.length;
  const { bind, reset } = useFields({ label: "", url: "" });
  return (
    <div>
      {empty ? (
        <EmptyState compact icon={FolderOpen} title="No documents yet">
          {canManage ? "Add links to shared docs or upload files the team needs for this project." : "Links and files for this project will show up here."}
        </EmptyState>
      ) : (
        <ul className="divide-y divide-line">
          {links.map((l, i) => (
            <li key={`l-${i}-${l.url}`} className="flex items-center gap-1 pr-2">
              <a href={l.url} target="_blank" rel="noopener noreferrer"
                className="focus-ring group flex min-w-0 flex-1 items-center gap-3 px-4 py-2.5 hover:bg-surface-2 sm:px-5">
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-brand-soft text-brand-ink"><Link2 className="h-4 w-4" aria-hidden /></span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-fg group-hover:text-brand-ink">{l.label}</span>
                  <span className="block truncate text-xs text-muted">{hostOf(l.url)}</span>
                </span>
                <ExternalLink className="h-4 w-4 shrink-0 text-faint" aria-hidden />
                <span className="sr-only">(opens in a new tab)</span>
              </a>
              {canManage && (
                <ConfirmAction triggerVariant="ghost" triggerSize="md"
                  trigger={<><Trash2 className="h-4 w-4" aria-hidden /><span className="sr-only">Remove link {l.label}</span></>}
                  title="Remove link?" description={<>&ldquo;{l.label}&rdquo; will be removed from this project. The page itself isn&apos;t affected.</>}
                  confirmLabel="Remove" action={() => removeProjectLink(projectId, i, l.url)} />
              )}
            </li>
          ))}
          {files.map((f) => (
            <li key={f.id} className="flex items-center gap-1 pr-2">
              <a href={`/api/files/${f.id}`} className="focus-ring group flex min-w-0 flex-1 items-center gap-3 px-4 py-2.5 hover:bg-surface-2 sm:px-5">
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-surface-2 text-fg-2"><FileText className="h-4 w-4" aria-hidden /></span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-fg group-hover:text-brand-ink">{f.filename}</span>
                  <span className="block truncate text-xs text-muted">
                    {fmtBytes(f.size)} · {fmtDate(f.createdAt)}{f.uploadedByName ? ` · ${f.uploadedByName}` : ""}
                  </span>
                </span>
                <Download className="h-4 w-4 shrink-0 text-faint" aria-hidden />
                <span className="sr-only">Download</span>
              </a>
              {canManage && (
                <ConfirmAction triggerVariant="ghost" triggerSize="md"
                  trigger={<><Trash2 className="h-4 w-4" aria-hidden /><span className="sr-only">Delete file {f.filename}</span></>}
                  title="Delete file?" description={<>&ldquo;{f.filename}&rdquo; will be permanently deleted.</>}
                  confirmLabel="Delete" action={() => deleteProjectFile(f.id)} />
              )}
            </li>
          ))}
        </ul>
      )}
      {canManage && (
        <div className="flex flex-wrap gap-2 border-t border-line px-4 py-3 sm:px-5">
          <Button variant="secondary" size="sm" className="h-10" onClick={() => setDlg("link")}><Plus className="h-4 w-4" aria-hidden />Add link</Button>
          <Button variant="secondary" size="sm" className="h-10" onClick={() => setDlg("file")}><Upload className="h-4 w-4" aria-hidden />Upload files</Button>
        </div>
      )}
      <Dialog open={dlg === "link"} onClose={() => setDlg(null)} title="Add a link" description="Point the team to a shared doc, sheet or folder.">
        <ActionForm action={addProjectLink.bind(null, projectId)} onSuccess={() => { setDlg(null); reset(); }} className="space-y-4">
          <Field label="Label" htmlFor="pl-label" hint="Optional — we'll use the site name if you leave it blank.">
            <Input id="pl-label" {...bind("label")} maxLength={120} placeholder="e.g. Packing checklist" />
          </Field>
          <Field label="Web address" htmlFor="pl-url" required>
            <Input id="pl-url" {...bind("url")} type="url" inputMode="url" required placeholder="https://docs.google.com/…" />
          </Field>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setDlg(null)}>Cancel</Button>
            <SubmitButton pendingText="Adding…">Add link</SubmitButton>
          </div>
        </ActionForm>
      </Dialog>
      <Dialog open={dlg === "file"} onClose={() => setDlg(null)} title="Upload files" description="Up to 10 files, 25 MB each. Visible to leaders and admins.">
        <ActionForm action={uploadProjectFiles.bind(null, projectId)} onSuccess={() => setDlg(null)} resetOnSuccess className="space-y-4">
          <Field label="Files" htmlFor="pf-files" required hint="PDF, images, Office documents, CSV, audio or video.">
            <Input id="pf-files" name="files" type="file" multiple required accept={accept} className="file:mr-3 file:rounded-lg file:border-0 file:bg-surface-2 file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-fg-2" />
          </Field>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setDlg(null)}>Cancel</Button>
            <SubmitButton pendingText="Uploading…">Upload</SubmitButton>
          </div>
        </ActionForm>
      </Dialog>
    </div>
  );
}

function hostOf(url: string) {
  try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return url; }
}
