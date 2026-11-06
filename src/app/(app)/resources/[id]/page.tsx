import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowUpRight, Download, Eye, Lock, Pencil, Pin, Trash2 } from "lucide-react";
import { requireUser } from "@/server/auth";
import { allResourceCategories, getResource } from "@/server/resources";
import { ACCEPT_ATTR } from "@/server/storage";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { buttonClass } from "@/components/ui/button";
import { ConfirmAction } from "@/components/ui/confirm";
import { ResourceFormDialog, type ResourceKind } from "@/components/resources/resource-form";
import { PinButton } from "@/components/resources/pin-button";
import { hostOf, KIND_META } from "@/components/resources/resource-card";
import { fmtBytes } from "@/components/projects/meta";
import { fmtDate } from "@/lib/dates";
import { VISIBILITY_LABEL } from "@/lib/task-meta";
import { deleteResource } from "../actions";

const INLINE = new Set(["image/png", "image/jpeg", "image/gif", "image/webp", "application/pdf"]);

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const me = await requireUser();
  const r = await getResource(me, (await params).id);
  return { title: r?.title ?? "Resource" };
}

export default async function ResourcePage({ params }: { params: Promise<{ id: string }> }) {
  const me = await requireUser();
  const r = await getResource(me, (await params).id);
  if (!r) notFound();
  const admin = me.role === "admin";
  const kind = (r.kind in KIND_META ? r.kind : "note") as ResourceKind;
  const meta = KIND_META[kind];
  const paragraphs = (r.body ?? "").split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  const cats = admin ? await allResourceCategories() : [];

  return (
    <div className="mx-auto max-w-3xl">
      <Link href="/resources" className="focus-ring mb-3 inline-flex h-10 items-center gap-1.5 rounded-lg text-sm font-medium text-muted hover:text-fg">
        <ArrowLeft className="h-4 w-4" aria-hidden />Resources
      </Link>
      <Card className="animate-in">
        <header className="border-b border-line p-5 sm:p-8">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="neutral"><meta.icon className="h-3 w-3" aria-hidden />{meta.label}</Badge>
            <Link href={`/resources?category=${encodeURIComponent(r.category)}`} className="focus-ring rounded-full">
              <Badge tone="brand">{r.category}</Badge>
            </Link>
            {r.pinned && <Badge tone="accent"><Pin className="h-3 w-3" aria-hidden />Pinned</Badge>}
            {r.visibility !== "everyone" && <Badge tone={r.visibility === "admin" ? "red" : "violet"}><Lock className="h-3 w-3" aria-hidden />{VISIBILITY_LABEL[r.visibility]}</Badge>}
          </div>
          <h1 className="mt-3 text-[26px] font-bold leading-tight tracking-tight text-fg sm:text-[30px]">{r.title}</h1>
          {r.description && <p className="mt-2 text-[15px] text-muted">{r.description}</p>}
          <p className="mt-3 text-xs text-muted">
            Updated {fmtDate(r.updatedAt, me.timezone, "MMMM d, yyyy")}{r.authorName && <> · Added by {r.authorName}</>}
          </p>
          {admin && (
            <div className="mt-5 flex flex-wrap gap-2">
              <ResourceFormDialog triggerVariant="secondary" categories={cats} accept={ACCEPT_ATTR}
                trigger={<><Pencil className="h-4 w-4" aria-hidden />Edit</>}
                resource={{ id: r.id, title: r.title, description: r.description, category: r.category, kind, url: r.url, body: r.body,
                  visibility: r.visibility, pinned: r.pinned, fileName: r.fileName }} />
              <PinButton id={r.id} title={r.title} pinned={r.pinned} withLabel />
              <ConfirmAction triggerSize="md" trigger={<><Trash2 className="h-4 w-4" aria-hidden />Delete</>}
                title="Delete resource?" confirmLabel="Delete" action={deleteResource.bind(null, r.id)}
                description={<>&ldquo;{r.title}&rdquo; will be removed for everyone{kind === "file" ? ", and its file deleted" : ""}. This can&apos;t be undone.</>} />
            </div>
          )}
        </header>

        <div className="p-5 sm:p-8">
          {kind === "note" && (
            paragraphs.length
              ? <div className="space-y-4 text-[15px] leading-relaxed text-fg-2">{paragraphs.map((p, i) => <p key={i} className="whitespace-pre-line [overflow-wrap:anywhere]">{p}</p>)}</div>
              : <p className="text-sm text-muted">This note is empty.</p>
          )}
          {kind === "link" && r.url && (
            <div className="flex flex-col gap-4 rounded-xl bg-surface-2 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="text-xs font-medium text-muted">Opens an outside page</p>
                <p className="truncate font-medium text-fg">{hostOf(r.url)}</p>
              </div>
              <a href={r.url} target="_blank" rel="noopener noreferrer" className={buttonClass("primary")}>
                Open link<ArrowUpRight className="h-4 w-4" aria-hidden /><span className="sr-only">(opens in a new tab)</span>
              </a>
            </div>
          )}
          {kind === "file" && (r.fileId ? (
            <div className="flex flex-col gap-4 rounded-xl bg-surface-2 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="truncate font-medium text-fg">{r.fileName}</p>
                {r.fileSize != null && <p className="text-xs text-muted">{fmtBytes(r.fileSize)}</p>}
              </div>
              <div className="flex flex-wrap gap-2">
                {r.fileMime && INLINE.has(r.fileMime) && (
                  <a href={`/api/files/${r.fileId}?inline=1`} target="_blank" rel="noopener noreferrer" className={buttonClass("secondary")}>
                    <Eye className="h-4 w-4" aria-hidden />Preview<span className="sr-only">(opens in a new tab)</span>
                  </a>
                )}
                <a href={`/api/files/${r.fileId}`} className={buttonClass("primary")}><Download className="h-4 w-4" aria-hidden />Download</a>
              </div>
            </div>
          ) : <p className="text-sm text-muted">The file for this resource is missing.{admin && " Edit it to upload a new one."}</p>)}
        </div>
      </Card>
    </div>
  );
}
