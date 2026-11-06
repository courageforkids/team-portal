import Link from "next/link";
import { and, desc, eq, inArray } from "drizzle-orm";
import { CalendarClock, CheckCircle2, ExternalLink, FileText, Inbox, Link2 } from "lucide-react";
import { db } from "@/db";
import { extensionRequests, files, submissions, tasks, users } from "@/db/schema";
import { requireUser } from "@/server/auth";
import { loadTasks } from "@/server/queries";
import { PageHeader } from "@/components/ui/page-header";
import { Tabs } from "@/components/ui/tabs";
import { Card } from "@/components/ui/card";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { ReviewItem } from "@/components/tasks/review-item";
import { ExtensionDecision } from "@/components/tasks/task-panels";
import { ago, fmtDateTime, toLocalInput } from "@/lib/dates";
import { redirect } from "next/navigation";

export const metadata = { title: "Review center" };

export default async function ReviewPage({ searchParams }: { searchParams: Promise<{ tab?: string; task?: string }> }) {
  const me = await requireUser();
  if (me.role === "volunteer") redirect("/");
  const sp = await searchParams;
  const tab = sp.tab === "extensions" && me.role === "admin" ? "extensions" : "submissions";

  let pending = await loadTasks(me, { scope: me.role === "admin" ? "all" : "visible", view: "review", sort: "updated" });
  if (me.role !== "admin") pending = pending.filter((t) => t.reviewerId === me.id);
  if (me.role !== "admin" && !pending.length && !(await db.select({ id: tasks.id }).from(tasks).where(eq(tasks.reviewerId, me.id)).limit(1))[0]) redirect("/");
  const exts = me.role === "admin" ? await db.select({ e: extensionRequests, title: tasks.title, tz: tasks.timezone, dueAt: tasks.dueAt, name: users.name, avatar: users.avatarFileId })
    .from(extensionRequests).innerJoin(tasks, eq(tasks.id, extensionRequests.taskId)).leftJoin(users, eq(users.id, extensionRequests.requestedById))
    .where(eq(extensionRequests.status, "pending")).orderBy(desc(extensionRequests.createdAt)) : [];

  const ids = pending.map((t) => t.id);
  const subs = ids.length ? await db.select().from(submissions).where(inArray(submissions.taskId, ids)).orderBy(desc(submissions.version)) : [];
  const latest = new Map<string, (typeof subs)[number]>();
  for (const s of subs) if (!latest.has(s.taskId)) latest.set(s.taskId, s);
  const subIds = [...latest.values()].map((s) => s.id);
  const sFiles = subIds.length ? await db.select().from(files).where(and(eq(files.ownerType, "submission"), inArray(files.ownerId, subIds))) : [];
  // Opening the review center marks a specific requested item as under review.
  if (sp.task && ids.includes(sp.task)) await db.update(tasks).set({ status: "under_review" }).where(and(eq(tasks.id, sp.task), eq(tasks.status, "submitted")));

  return (
    <>
      <PageHeader eyebrow="Reviewing" title="Review center" description="Approve work or ask for changes — right here, without opening each task." />
      {me.role === "admin" && (
        <Tabs className="mb-5" active={tab} items={[
          { key: "submissions", label: "Submissions", href: "/review", count: pending.length },
          { key: "extensions", label: "Extension requests", href: "/review?tab=extensions", count: exts.length },
        ]} />
      )}
      {tab === "submissions" && (pending.length ? (
        <ul className="space-y-3">
          {pending.map((t) => {
            const s = latest.get(t.id);
            const fs = sFiles.filter((f) => f.ownerId === s?.id);
            const who = t.assignees.find((a) => a.id === s?.submittedById) ?? t.assignees[0];
            return (
              <ReviewItem key={t.id} id={t.id} defaultOpen={sp.task === t.id || pending.length === 1}
                header={
                  <div className="flex items-center gap-3">
                    {who && <Avatar name={who.name} fileId={who.avatarFileId} size={36} />}
                    <div className="min-w-0">
                      <div className="truncate font-semibold">{t.title}</div>
                      <div className="flex flex-wrap items-center gap-x-2 text-xs text-muted">
                        <span className="font-medium text-fg-2">{who?.name}</span>
                        {s && <span>submitted {ago(s.submittedAt)}</span>}
                        {s && s.version > 1 && <Badge tone="amber">Revision {s.version - 1}</Badge>}
                        {s?.dueAtSubmission && s.submittedAt > s.dueAtSubmission && <span className="text-warn">after deadline</span>}
                        {t.departmentName && <span className="hidden sm:inline">· {t.departmentName}</span>}
                      </div>
                    </div>
                  </div>
                }>
                <div className="space-y-3 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
                    <span>{t.dueAt ? `Due ${fmtDateTime(t.dueAt, t.timezone)}` : "No due date"}{s ? ` · submitted ${fmtDateTime(s.submittedAt, t.timezone)}` : ""}</span>
                    <Link href={`/tasks/${t.id}`} className="inline-flex items-center gap-1 font-semibold text-brand-ink hover:underline">Open task<ExternalLink className="h-3 w-3" /></Link>
                  </div>
                  {t.deliverables && <div className="rounded-lg bg-surface-2 p-3"><span className="eyebrow">Asked for</span><p className="prose-body mt-1 text-fg-2">{t.deliverables}</p></div>}
                  {!s && <p className="text-muted">No submission content (marked submitted).</p>}
                  {s?.text && <p className="prose-body text-fg-2">{s.text}</p>}
                  {s && s.links.length > 0 && <div className="flex flex-wrap gap-2">{s.links.map((l, i) => <a key={i} href={l.url} target="_blank" rel="noopener noreferrer" className="inline-flex max-w-full items-center gap-1.5 rounded-lg border border-line px-2.5 py-1 text-brand-ink hover:bg-brand-soft"><Link2 className="h-3.5 w-3.5 shrink-0" /><span className="truncate">{l.url}</span></a>)}</div>}
                  {s && s.checklist.length > 0 && <ul className="space-y-1">{s.checklist.map((c) => <li key={c.id} className="flex items-center gap-2"><CheckCircle2 className={c.done ? "h-4 w-4 text-ok" : "h-4 w-4 text-faint"} />{c.label}</li>)}</ul>}
                  {fs.length > 0 && (
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                      {fs.map((f) => f.mimeType.startsWith("image/") && !f.mimeType.includes("hei") ? (
                        <a key={f.id} href={`/api/files/${f.id}?inline=1`} target="_blank" rel="noopener" className="group block overflow-hidden rounded-lg border border-line">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={`/api/files/${f.id}?inline=1`} alt={f.filename} className="aspect-square w-full object-cover transition group-hover:scale-[1.02]" loading="lazy" />
                        </a>
                      ) : (
                        <a key={f.id} href={`/api/files/${f.id}${f.mimeType === "application/pdf" ? "?inline=1" : ""}`} target="_blank" rel="noopener" className="flex items-center gap-2 rounded-lg border border-line p-2 hover:bg-surface-2">
                          <FileText className="h-5 w-5 shrink-0 text-muted" /><span className="truncate text-sm">{f.filename}</span>
                        </a>
                      ))}
                    </div>
                  )}
                  {s?.note && <p className="text-muted"><span className="font-semibold text-fg-2">Their note:</span> {s.note}</p>}
                </div>
              </ReviewItem>
            );
          })}
        </ul>
      ) : (
        <Card><EmptyState icon={Inbox} title="You're all caught up">No submissions are waiting for review. New ones will show up here and in your notifications.</EmptyState></Card>
      ))}
      {tab === "extensions" && (exts.length ? (
        <ul className="space-y-3">
          {exts.map(({ e, title, tz, dueAt, name, avatar }) => (
            <li key={e.id} className="card p-4 sm:p-5">
              <div className="flex items-start gap-3">
                <Avatar name={name ?? "?"} fileId={avatar} size={36} />
                <div className="min-w-0 flex-1">
                  <div className="text-sm"><b>{name}</b> asked for more time on <Link href={`/tasks/${e.taskId}`} className="font-semibold text-brand-ink hover:underline">{title}</Link></div>
                  <div className="mt-1 text-sm text-fg-2">{dueAt ? fmtDateTime(dueAt, tz) : "No deadline"} → <b>{fmtDateTime(e.requestedDueAt, tz)}</b></div>
                  <p className="mt-1 text-sm text-muted">“{e.reason}”{e.note ? ` — ${e.note}` : ""} · {ago(e.createdAt)}</p>
                  <ExtensionDecision requestId={e.id} timezone={tz} requestedValue={toLocalInput(e.requestedDueAt, tz)} />
                </div>
              </div>
            </li>
          ))}
        </ul>
      ) : <Card><EmptyState icon={CalendarClock} title="No extension requests">When a member asks for more time, it'll appear here.</EmptyState></Card>)}
    </>
  );
}
