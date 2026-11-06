import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import {
  ArrowLeft, CheckCircle2, ExternalLink, FileText, Link2, MessageSquare, Repeat, RotateCcw, ShieldAlert, History, Lock, Info,
} from "lucide-react";
import { db } from "@/db";
import {
  conversations, departments, extensionRequests, files, projects, reviews, submissions, taskAssignees, taskCategories, taskComments, taskEvents, tasks, users,
} from "@/db/schema";
import { requireUser } from "@/server/auth";
import { taskAccess } from "@/server/policy";
import { startReview } from "@/server/tasks";
import { ACCEPT_ATTR } from "@/server/storage";
import { Card, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { DueChip, PriorityBadge, StatusBadge } from "@/components/tasks/task-bits";
import {
  AdminTaskMenu, CommentForm, DeleteTaskButton, ExtensionDecision, ExtensionRequest, ReviewPanel, StatusControls, SubmitPanel,
} from "@/components/tasks/task-panels";
import { ago, fmtDateTime, fmtFull, toLocalInput } from "@/lib/dates";
import { isOverdue, STATUS_LABEL, SUBMISSION_TYPE_LABEL, type TaskStatus } from "@/lib/task-meta";
import { cn } from "@/lib/cn";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return { title: "Task" };
  const t = (await db.select({ title: tasks.title }).from(tasks).where(eq(tasks.id, id)).limit(1))[0];
  return { title: t?.title ?? "Task" };
}

function fileSize(n: number) { return n > 1e6 ? `${(n / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1e3))} KB`; }

function FileChip({ f }: { f: { id: string; filename: string; mimeType: string; size: number } }) {
  const isImg = f.mimeType.startsWith("image/") && !f.mimeType.includes("hei");
  return (
    <a href={`/api/files/${f.id}${isImg || f.mimeType === "application/pdf" ? "?inline=1" : ""}`} target="_blank" rel="noopener"
      className="focus-ring group flex items-center gap-3 rounded-lg border border-line bg-surface p-2 pr-3 transition hover:border-line-strong hover:bg-surface-2">
      {isImg
        // eslint-disable-next-line @next/next/no-img-element
        ? <img src={`/api/files/${f.id}?inline=1`} alt="" className="h-10 w-10 shrink-0 rounded-md object-cover" loading="lazy" />
        : <span className="grid h-10 w-10 shrink-0 place-items-center rounded-md bg-surface-2 text-muted"><FileText className="h-5 w-5" /></span>}
      <span className="min-w-0"><span className="block truncate text-sm font-medium group-hover:text-brand-ink">{f.filename}</span><span className="text-xs text-muted">{fileSize(f.size)}</span></span>
    </a>
  );
}

const EVENT_TEXT: Record<string, (d: Record<string, unknown>) => string> = {
  created: (d) => (d.recurring ? "created this recurring task" : "created this task"),
  status: (d) => `changed status to ${STATUS_LABEL[d.to as TaskStatus] ?? d.to}${d.reason ? ` — "${d.reason}"` : ""}`,
  due_changed: () => "changed the due date",
  reassigned: () => "changed who's assigned",
  submitted: (d) => `submitted version ${d.version}${d.late ? " (after the deadline)" : ""}`,
  reviewed: (d) => (d.decision === "approved" ? "approved the submission" : "requested a revision"),
  extension: (d) => ({ requested: "requested an extension", approved: "approved an extension", declined: "declined an extension", withdrawn: "withdrew an extension request" } as Record<string, string>)[d.action as string] ?? "updated an extension",
  edited: () => "edited the task details",
};

export default async function TaskPage({ params }: { params: Promise<{ id: string }> }) {
  const me = await requireUser();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const access = await taskAccess(me, id);
  if (!access?.view) notFound();
  if (access.review) await startReview(me, id); // a reviewer opening a submitted task moves it to "Under review"

  const t = (await db.select({ task: tasks, dept: departments, project: projects, category: taskCategories })
    .from(tasks).leftJoin(departments, eq(departments.id, tasks.departmentId)).leftJoin(projects, eq(projects.id, tasks.projectId))
    .leftJoin(taskCategories, eq(taskCategories.id, tasks.categoryId)).where(eq(tasks.id, id)).limit(1))[0];
  const task = t.task;
  const userCols = { id: users.id, name: users.name, title: users.title, avatarFileId: users.avatarFileId };
  const [assignees, attachments, subs, revs, comments, events, exts, peopleRows] = await Promise.all([
    db.select(userCols).from(taskAssignees).innerJoin(users, eq(users.id, taskAssignees.userId)).where(eq(taskAssignees.taskId, id)),
    db.select().from(files).where(and(eq(files.ownerType, "task"), eq(files.ownerId, id))),
    db.select().from(submissions).where(eq(submissions.taskId, id)).orderBy(desc(submissions.version)),
    db.select().from(reviews).where(eq(reviews.taskId, id)).orderBy(asc(reviews.createdAt)),
    db.select().from(taskComments).where(eq(taskComments.taskId, id)).orderBy(asc(taskComments.createdAt)),
    db.select().from(taskEvents).where(eq(taskEvents.taskId, id)).orderBy(desc(taskEvents.createdAt)).limit(30),
    db.select().from(extensionRequests).where(eq(extensionRequests.taskId, id)).orderBy(desc(extensionRequests.createdAt)),
    db.select(userCols).from(users),
  ]);
  const people = new Map(peopleRows.map((p) => [p.id, p]));
  const subFiles = subs.length ? await db.select().from(files).where(and(eq(files.ownerType, "submission"), inArray(files.ownerId, subs.map((s) => s.id)))) : [];
  const reviewer = task.reviewerId ? people.get(task.reviewerId) : null;
  const workGroup = task.workGroupId ? (await db.select({ id: conversations.id, title: conversations.title }).from(conversations).where(eq(conversations.id, task.workGroupId)).limit(1))[0] : null;
  const creator = task.createdById ? people.get(task.createdById) : null;
  const latestReview = revs.at(-1);
  const status = task.status;
  const canSubmit = access.isAssignee && ["not_started", "in_progress", "revision_requested", "blocked"].includes(status);
  const awaitingReview = status === "submitted" || status === "under_review";
  const pendingExt = exts.find((e) => e.status === "pending");
  const overdue = isOverdue(task);
  const tz = task.timezone;

  return (
    <div className="animate-in">
      <Link href={access.isAssignee ? "/tasks" : me.role === "admin" ? "/tasks/all" : "/tasks"} className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-muted hover:text-fg">
        <ArrowLeft className="h-4 w-4" />{access.isAssignee ? "My tasks" : "Tasks"}
      </Link>

      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <StatusBadge status={status} />
            <PriorityBadge priority={task.priority} />
            {task.seriesId && <Badge tone="muted"><Repeat className="h-3 w-3" />Recurring</Badge>}
            {t.category && <Badge tone="neutral">{t.category.name}</Badge>}
          </div>
          <h1 className="text-2xl font-bold tracking-tight sm:text-[28px]">{task.title}</h1>
          <div className="mt-2"><DueChip status={status} dueAt={task.dueAt} tz={tz} className="text-sm" /></div>
        </div>
        {access.manage && <AdminTaskMenu taskId={id} status={status} />}
      </div>

      {/* Callouts */}
      {status === "revision_requested" && latestReview?.decision === "revision_requested" && (
        <div className="mb-5 flex gap-3 rounded-xl border border-warn/30 bg-warn-soft p-4">
          <RotateCcw className="mt-0.5 h-5 w-5 shrink-0 text-warn" />
          <div className="min-w-0 text-sm">
            <div className="font-semibold text-fg">{access.isAssignee ? "A revision was requested" : "Revision requested"}</div>
            <p className="prose-body mt-1 text-fg-2">{latestReview.feedback}</p>
            <div className="mt-1 text-xs text-muted">— {people.get(latestReview.reviewerId ?? "")?.name ?? "Reviewer"}, {ago(latestReview.createdAt)}</div>
          </div>
        </div>
      )}
      {status === "blocked" && task.blockedReason && (
        <div className="mb-5 flex gap-3 rounded-xl border border-bad/25 bg-bad-soft p-4 text-sm">
          <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-bad" />
          <div><div className="font-semibold text-fg">Blocked</div><p className="mt-0.5 text-fg-2">{task.blockedReason}</p></div>
        </div>
      )}
      {status === "approved" && (
        <div className="mb-5 flex items-center gap-3 rounded-xl border border-ok/25 bg-ok-soft p-4 text-sm">
          <CheckCircle2 className="h-5 w-5 shrink-0 text-ok" />
          <div><span className="font-semibold text-fg">Completed</span>{task.completedAt && <span className="text-fg-2"> · approved {ago(task.completedAt)}</span>}
            {latestReview?.decision === "approved" && latestReview.feedback && <p className="mt-0.5 text-fg-2">“{latestReview.feedback}”</p>}</div>
        </div>
      )}
      {(status === "canceled" || status === "excused") && (
        <div className="mb-5 flex items-center gap-3 rounded-xl border border-line bg-surface-2 p-4 text-sm">
          <Info className="h-5 w-5 shrink-0 text-muted" />
          <span>This task was {status}.{task.excusedReason ? ` ${task.excusedReason}` : ""} It doesn't count against anyone.</span>
        </div>
      )}
      {awaitingReview && access.isAssignee && !access.review && (
        <div className="mb-5 flex items-center gap-3 rounded-xl border border-violet/25 bg-violet-soft p-4 text-sm">
          <CheckCircle2 className="h-5 w-5 shrink-0 text-violet" />
          <span><b>Submitted — nice work!</b> It's waiting for review. You'll get a notification when it's reviewed.</span>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="min-w-0 space-y-6">
          {/* Review panel */}
          {awaitingReview && access.review && (
            <Card className="border-violet/30 p-5">
              <h2 className="mb-1 font-semibold">Review this submission</h2>
              <p className="mb-4 text-sm text-muted">Version {subs[0]?.version} from {people.get(subs[0]?.submittedById ?? "")?.name ?? "the assignee"}, {subs[0] ? ago(subs[0].submittedAt) : ""}.</p>
              <ReviewPanel taskId={id} />
            </Card>
          )}

          <Card>
            <CardHeader title="Instructions" />
            <div className="space-y-5 px-5 pb-5">
              {task.instructions ? <p className="prose-body text-[15px] text-fg-2">{task.instructions}</p> : <p className="text-sm text-muted">No extra instructions.</p>}
              {(task.deliverables || task.completionCriteria) && (
                <div className="grid gap-3 sm:grid-cols-2">
                  {task.deliverables && <div className="rounded-xl bg-surface-2 p-4"><div className="eyebrow mb-1">Deliverables</div><p className="prose-body text-sm">{task.deliverables}</p></div>}
                  {task.completionCriteria && <div className="rounded-xl bg-surface-2 p-4"><div className="eyebrow mb-1">Done when</div><p className="prose-body text-sm">{task.completionCriteria}</p></div>}
                </div>
              )}
              {task.links.length > 0 && (
                <div><div className="eyebrow mb-2">Links</div><div className="flex flex-wrap gap-2">
                  {task.links.map((l, i) => <a key={i} href={l.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-sm font-medium text-brand-ink hover:bg-brand-soft"><Link2 className="h-3.5 w-3.5" />{l.label}<ExternalLink className="h-3 w-3 opacity-60" /></a>)}
                </div></div>
              )}
              {attachments.length > 0 && (
                <div><div className="eyebrow mb-2">Attachments</div><div className="grid gap-2 sm:grid-cols-2">{attachments.map((f) => <FileChip key={f.id} f={f} />)}</div></div>
              )}
              <div className="flex flex-wrap items-center gap-2 border-t border-line pt-4 text-xs text-muted">
                <span className="font-semibold text-fg-2">Submit as:</span>
                {task.submissionTypes.length ? task.submissionTypes.map((s) => <Badge key={s} tone="neutral">{SUBMISSION_TYPE_LABEL[s]}</Badge>) : <span>Anything</span>}
                <span className="ml-auto">{task.requiresReview ? "Needs approval to complete" : "Completes on submit"}</span>
              </div>
            </div>
          </Card>

          {canSubmit && (
            <Card className="p-5">
              <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="font-semibold">{status === "revision_requested" ? "Submit your revision" : "Submit your work"}</h2>
                  <p className="text-sm text-muted">{task.requiresReview ? "Your reviewer will approve it or ask for changes." : "Submitting completes this task."}</p>
                </div>
                <StatusControls taskId={id} status={status} />
              </div>
              <SubmitPanel taskId={id} types={task.submissionTypes} checklist={task.checklist} requiresReview={task.requiresReview} isRevision={subs.length > 0} accept={ACCEPT_ATTR} />
            </Card>
          )}

          {subs.length > 0 && (
            <Card>
              <CardHeader title={<span className="inline-flex items-center gap-2"><History className="h-4 w-4 text-muted" />Submission history</span>} description={`${subs.length} version${subs.length === 1 ? "" : "s"} · every version is kept`} />
              <ol className="space-y-4 px-5 pb-5">
                {subs.map((s, i) => {
                  const review = revs.find((r) => r.submissionId === s.id);
                  const author = people.get(s.submittedById ?? "");
                  const late = s.dueAtSubmission && s.submittedAt > s.dueAtSubmission;
                  return (
                    <li key={s.id} className={cn("rounded-xl border p-4", i === 0 ? "border-line-strong" : "border-line opacity-90")}>
                      <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
                        <Badge tone={i === 0 ? "brand" : "muted"}>Version {s.version}</Badge>
                        {author && <span className="inline-flex items-center gap-1.5 font-medium"><Avatar name={author.name} fileId={author.avatarFileId} size={20} />{author.name}</span>}
                        <span className="text-muted" title={fmtFull(s.submittedAt, tz)}>{fmtDateTime(s.submittedAt, tz)}</span>
                        {late && <span className="text-xs text-warn">after deadline</span>}
                      </div>
                      {s.text && <p className="prose-body mb-3 text-sm text-fg-2">{s.text}</p>}
                      {s.links.length > 0 && <div className="mb-3 flex flex-wrap gap-2">{s.links.map((l, j) => <a key={j} href={l.url} target="_blank" rel="noopener noreferrer" className="inline-flex max-w-full items-center gap-1.5 truncate rounded-lg border border-line px-2.5 py-1 text-sm text-brand-ink hover:bg-brand-soft"><Link2 className="h-3.5 w-3.5 shrink-0" /><span className="truncate">{l.url}</span></a>)}</div>}
                      {s.checklist.length > 0 && <ul className="mb-3 space-y-1">{s.checklist.map((c) => <li key={c.id} className="flex items-center gap-2 text-sm"><CheckCircle2 className={cn("h-4 w-4", c.done ? "text-ok" : "text-faint")} />{c.label}</li>)}</ul>}
                      {subFiles.filter((f) => f.ownerId === s.id).length > 0 && <div className="mb-3 grid gap-2 sm:grid-cols-2">{subFiles.filter((f) => f.ownerId === s.id).map((f) => <FileChip key={f.id} f={f} />)}</div>}
                      {s.note && <p className="text-sm text-muted"><span className="font-semibold text-fg-2">Note:</span> {s.note}</p>}
                      {review && (
                        <div className={cn("mt-3 rounded-lg p-3 text-sm", review.decision === "approved" ? "bg-ok-soft" : "bg-warn-soft")}>
                          <div className="font-semibold">{review.decision === "approved" ? "Approved" : "Revision requested"} by {people.get(review.reviewerId ?? "")?.name ?? "reviewer"} · <span className="font-normal text-muted">{ago(review.createdAt)}</span></div>
                          {review.feedback && <p className="prose-body mt-1 text-fg-2">{review.feedback}</p>}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ol>
            </Card>
          )}

          <Card id="comments">
            <CardHeader title={<span className="inline-flex items-center gap-2"><MessageSquare className="h-4 w-4 text-muted" />Comments</span>} />
            <div className="space-y-4 px-5 pb-5">
              {comments.length === 0 && <p className="text-sm text-muted">Questions about this task? Ask here — your reviewer gets notified.</p>}
              {comments.map((c) => {
                const a = people.get(c.authorId ?? "");
                return (
                  <div key={c.id} className="flex gap-3">
                    <Avatar name={a?.name ?? "?"} fileId={a?.avatarFileId} size={30} />
                    <div className="min-w-0 flex-1"><div className="text-sm"><span className="font-semibold">{a?.name ?? "Former member"}</span> <span className="text-xs text-muted">{ago(c.createdAt)}</span></div><p className="prose-body text-sm text-fg-2">{c.body}</p></div>
                  </div>
                );
              })}
              <CommentForm taskId={id} />
            </div>
          </Card>
        </div>

        {/* Sidebar */}
        <aside className="space-y-4">
          <Card className="p-5">
            <dl className="space-y-4 text-sm">
              <div><dt className="eyebrow mb-1.5">Assigned to</dt><dd className="space-y-2">{assignees.map((a) => <div key={a.id} className="flex items-center gap-2"><Avatar name={a.name} fileId={a.avatarFileId} size={26} /><span className="font-medium">{a.name}</span></div>)}</dd></div>
              <div><dt className="eyebrow mb-1">Due</dt><dd className={cn(overdue && "text-warn")}>{task.dueAt ? fmtFull(task.dueAt, tz) : "No due date"}</dd>
                {task.originalDueAt && task.dueAt && task.originalDueAt.getTime() !== task.dueAt.getTime() && <dd className="text-xs text-muted">Originally {fmtDateTime(task.originalDueAt, tz)}</dd>}</div>
              {workGroup && <div><dt className="eyebrow mb-1">Work group</dt><dd><Link href={`/messages/${workGroup.id}`} className="font-medium text-brand-ink hover:underline">{workGroup.title} · open group chat</Link></dd></div>}
              {task.requiresReview && <div><dt className="eyebrow mb-1">Reviewer</dt><dd>{reviewer?.name ?? "Any administrator"}</dd></div>}
              {t.dept && <div><dt className="eyebrow mb-1">Department</dt><dd className="flex items-center gap-2"><span className="h-2 w-2 rounded-full" style={{ background: t.dept.color }} />{t.dept.name}</dd></div>}
              {t.project && <div><dt className="eyebrow mb-1">Project</dt><dd>{me.role === "volunteer" ? t.project.name : <Link href={`/projects/${t.project.id}`} className="font-medium text-brand-ink hover:underline">{t.project.name}</Link>}</dd></div>}
              <div><dt className="eyebrow mb-1">Created</dt><dd className="text-muted">{fmtDateTime(task.createdAt, tz)}{creator ? ` by ${creator.name}` : task.seriesId ? " automatically" : ""}</dd></div>
            </dl>
          </Card>

          {access.isAssignee && !["approved", "canceled", "excused"].includes(status) && (
            <Card className="p-5">
              <h3 className="mb-1 text-sm font-semibold">Need more time?</h3>
              <p className="mb-3 text-xs text-muted">Ask for an extension — it's okay, things come up.</p>
              <ExtensionRequest taskId={id} minValue={toLocalInput(new Date(), tz)}
                pending={pendingExt ? { id: pendingExt.id, label: `Asked for ${fmtDateTime(pendingExt.requestedDueAt, tz)}` } : null} />
            </Card>
          )}

          {access.manage && pendingExt && (
            <Card className="border-accent/50 p-5">
              <h3 className="text-sm font-semibold">Extension request</h3>
              <p className="mt-1 text-sm text-fg-2">{people.get(pendingExt.requestedById ?? "")?.name} asked for <b>{fmtDateTime(pendingExt.requestedDueAt, tz)}</b></p>
              <p className="mt-1 text-sm text-muted">“{pendingExt.reason}”{pendingExt.note ? ` — ${pendingExt.note}` : ""}</p>
              <ExtensionDecision requestId={pendingExt.id} timezone={tz} requestedValue={toLocalInput(pendingExt.requestedDueAt, tz)} />
            </Card>
          )}

          {access.seeInternal && task.internalNotes && (
            <Card className="p-5">
              <h3 className="mb-1 flex items-center gap-1.5 text-sm font-semibold"><Lock className="h-3.5 w-3.5 text-muted" />Internal notes</h3>
              <p className="prose-body text-sm text-fg-2">{task.internalNotes}</p>
            </Card>
          )}

          <Card className="p-5">
            <h3 className="mb-3 text-sm font-semibold">Activity</h3>
            <ol className="relative space-y-3 border-l border-line pl-4">
              {events.map((e) => (
                <li key={e.id} className="text-sm">
                  <span className="absolute -left-[5px] mt-1.5 h-2.5 w-2.5 rounded-full border-2 border-surface bg-line-strong" aria-hidden />
                  <span className="font-medium">{e.actorId ? people.get(e.actorId)?.name ?? "Someone" : "Team Portal"}</span>{" "}
                  <span className="text-fg-2">{EVENT_TEXT[e.kind]?.(e.detail) ?? e.kind}</span>
                  <div className="text-xs text-muted">{ago(e.createdAt)}</div>
                </li>
              ))}
            </ol>
            {exts.filter((e) => e.status !== "pending").length > 0 && (
              <div className="mt-4 border-t border-line pt-3 text-xs text-muted">
                {exts.filter((e) => e.status !== "pending").map((e) => <div key={e.id}>Extension {e.status} · {fmtDateTime(e.requestedDueAt, tz)}</div>)}
              </div>
            )}
          </Card>
          {access.manage && <div className="flex justify-end"><DeleteTaskButton taskId={id} /></div>}
        </aside>
      </div>
    </div>
  );
}
