import { Download, Eye, FileText, Image as ImageIcon, Paperclip } from "lucide-react";

const PREVIEWABLE = new Set(["image/png", "image/jpeg", "image/gif", "image/webp", "application/pdf", "video/mp4", "video/quicktime", "audio/mpeg", "audio/mp4"]);

export function fmtBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export function AttachmentList({ files }: { files: { id: string; filename: string; mimeType: string; size: number }[] }) {
  if (!files.length) return null;
  return (
    <section aria-labelledby="att-h" className="mt-8">
      <h2 id="att-h" className="eyebrow mb-2.5 flex items-center gap-1.5"><Paperclip className="h-3.5 w-3.5" aria-hidden />Attachments</h2>
      <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line">
        {files.map((f) => {
          const Icon = f.mimeType.startsWith("image/") ? ImageIcon : FileText;
          return (
            <li key={f.id} className="flex items-center gap-3 bg-surface px-3 py-2.5 sm:px-4">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-surface-2 text-muted"><Icon className="h-4 w-4" aria-hidden /></span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-fg">{f.filename}</p>
                <p className="text-xs text-muted">{fmtBytes(f.size)}</p>
              </div>
              {PREVIEWABLE.has(f.mimeType) && (
                <a href={`/api/files/${f.id}?inline=1`} target="_blank" rel="noopener" className="focus-ring grid h-10 w-10 place-items-center rounded-lg text-muted hover:bg-surface-2 hover:text-fg" aria-label={`Open ${f.filename}`}>
                  <Eye className="h-4 w-4" aria-hidden />
                </a>
              )}
              <a href={`/api/files/${f.id}`} className="focus-ring grid h-10 w-10 place-items-center rounded-lg text-muted hover:bg-surface-2 hover:text-fg" aria-label={`Download ${f.filename}`}>
                <Download className="h-4 w-4" aria-hidden />
              </a>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
