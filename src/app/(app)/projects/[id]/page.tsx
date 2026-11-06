import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, CalendarClock, CheckCircle2, Info, ListTodo, Pencil, Plus, Trash2 } from "lucide-react";
import { requireUser } from "@/server/auth";
import { loadTasks } from "@/server/queries";
import { canManageProjectExtras, getMilestones, getProject, getProjectFiles, projectStats } from "@/server/projects";
import { ACCEPT_ATTR } from "@/server/storage";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { ButtonLink } from "@/components/ui/button";
import { ConfirmAction } from "@/components/ui/confirm";
import { EmptyState } from "@/components/ui/empty-state";
import { DueChip, TaskRow } from "@/components/tasks/task-bits";
import { ProgressBar, progressExplanation } from "@/components/projects/progress";
import { MilestoneList } from "@/components/projects/milestones";
import { ProjectDocuments } from "@/components/projects/documents";
import { fmtDay, PROJECT_STATUS_LABEL, PROJECT_STATUS_TONE, todayISO } from "@/components/projects/meta";
import { AWAITING_REVIEW, CLOSED, OPEN_FOR_ASSIGNEE, type TaskStatus } from "@/lib/task-meta";
import { cn } from "@/lib/cn";
import { deleteProject } from "../actions";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const p = await getProject((await params).id);
  return { title: p?.p.name ?? "Project" };
}

export default async function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const me = await requireUser();
  if (me.role === "volunteer") redirect("/");
  const { id } = await params;
  const row = await getProject(id);
  if (!row) notFound();
  const p = row.p;
  const isAdmin = me.role === "admin";
  const canManage = canManageProjectExtras(me, p);

  const [ms, files, statsMap, tasks] = await Promise.all([
    getMilestones(p.id), getProjectFiles(p.id), projectStats([p.id]),
    loadTasks(me, { scope: "visible", view: "everything", projectId: p.id }),
  ]);
  const stats = statsMap.get(p.id)!;
  const today = todayISO(me.timezone);

  const groups: { key: string; label: string; statuses: TaskStatus[] }[] = [
    { key: "open", label: "Open", statuses: OPEN_FOR_ASSIGNEE },
    { key: "review", label: "In review", statuses: AWAITING_REVIEW },
    { key: "done", label: "Done", statuses: CLOSED },
  ];
  const hidden = stats.total - tasks.length;
  const upcoming = tasks.filter((t) => t.dueAt && OPEN_FOR_ASSIGNEE.includes(t.status))
    .sort((a, b) => a.dueAt!.getTime() - b.dueAt!.getTime()).slice(0, 5);
  const targetLate = !!p.targetDate && p.targetDate < today && p.status !== "completed" && p.status !== "archived";

  return (
    <>
      <Link href="/projects" className="focus-ring mb-3 inline-flex h-10 items-center gap-1.5 rounded-lg text-sm font-medium text-muted hover:text-fg">
        <ArrowLeft className="h-4 w-4" aria-hidden />All projects
      </Link>
      <PageHeader
        eyebrow={<span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full" style={{ background: row.departmentColor ?? "var(--faint)" }} aria-hidden />
          {row.departmentName ?? "Project"}
        </span>}
        title={p.name}
        actions={isAdmin && <>
          <ButtonLink href={`/tasks/new?projectId=${p.id}`}><Plus className="h-4 w-4" aria-hidden />New task in this project</ButtonLink>
          <ButtonLink href={`/projects/${p.id}/edit`} variant="secondary"><Pencil className="h-4 w-4" aria-hidden />Edit</ButtonLink>
          <ConfirmAction triggerSize="md" trigger={<><Trash2 className="h-4 w-4" aria-hidden />Delete</>}
            title="Delete this project?" requireText={p.name} confirmLabel="Delete project"
            description={<>
              This permanently deletes <b>{p.name}</b>, its milestones and uploaded files. Its {stats.total} task{stats.total === 1 ? "" : "s"} will
              stay but will no longer belong to a project. Consider setting the status to <b>Archived</b> instead.
            </>}
            action={deleteProject.bind(null, p.id)} />
        </>} />

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <Card>
            <div className="p-5">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={PROJECT_STATUS_TONE[p.status]} dot>{PROJECT_STATUS_LABEL[p.status]}</Badge>
                {canManage && !isAdmin && <Badge tone="brand">You direct this project</Badge>}
              </div>
              {p.description
                ? <p className="prose-body mt-3 text-[15px] text-fg-2">{p.description}</p>
                : <p className="mt-3 text-sm text-muted">No description yet.</p>}
              <dl className="mt-5 grid grid-cols-2 gap-x-4 gap-y-4 border-t border-line pt-4 text-sm sm:grid-cols-4">
                <div className="col-span-2 sm:col-span-1">
                  <dt className="text-xs font-medium text-muted">Director</dt>
                  <dd className="mt-1 flex items-center gap-2">
                    {row.directorName ? <>
                      <Avatar name={row.directorName} fileId={row.directorAvatar} size={24} />
                      <Link href={`/team/${p.directorId}`} className="focus-ring truncate rounded font-medium text-fg hover:text-brand-ink">{row.directorName}</Link>
                    </> : <span className="text-muted">Not assigned</span>}
                  </dd>
                </div>
                <div className="col-span-2 sm:col-span-1">
                  <dt className="text-xs font-medium text-muted">Department</dt>
                  <dd className="mt-1">
                    {row.departmentName && row.departmentSlug
                      ? <Link href={`/departments/${row.departmentSlug}`} className="focus-ring rounded font-medium text-fg hover:text-brand-ink">{row.departmentName}</Link>
                      : <span className="text-muted">None</span>}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-medium text-muted">Start</dt>
                  <dd className="mt-1 font-medium text-fg">{p.startDate ? fmtDay(p.startDate) : <span className="font-normal text-muted">Not set</span>}</dd>
                </div>
                <div>
                  <dt className="text-xs font-medium text-muted">Target</dt>
                  <dd className={cn("mt-1 font-medium", targetLate ? "text-warn" : "text-fg")}>
                    {p.targetDate ? fmtDay(p.targetDate) : <span className="font-normal text-muted">Not set</span>}
                  </dd>
                </div>
              </dl>
              <div className="mt-5 rounded-xl bg-surface-2 p-4">
                <ProgressBar p={stats} size="md" />
                <p className="mt-2.5 flex items-start gap-1.5 text-xs text-muted">
                  <Info className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden />
                  <span>Progress is the share of this project&apos;s tasks that are approved. {progressExplanation(stats)}</span>
                </p>
              </div>
            </div>
          </Card>

          <Card>
            <CardHeader title="Tasks" description={tasks.length ? `${stats.open} open across the project` : undefined} />
            {tasks.length === 0 ? (
              <EmptyState compact icon={ListTodo} title={hidden > 0 ? "No tasks you can see" : "No tasks yet"}
                action={isAdmin && <ButtonLink href={`/tasks/new?projectId=${p.id}`} size="sm"><Plus className="h-4 w-4" aria-hidden />New task in this project</ButtonLink>}>
                {hidden > 0
                  ? `This project has ${hidden} task${hidden === 1 ? "" : "s"} assigned to other members.`
                  : isAdmin ? "Connect work to this project so progress updates automatically." : "Tasks connected to this project will show up here."}
              </EmptyState>
            ) : (
              <div className="pb-2">
                {groups.map((g) => {
                  const list = tasks.filter((t) => g.statuses.includes(t.status));
                  if (!list.length) return null;
                  return (
                    <section key={g.key} aria-labelledby={`grp-${g.key}`}>
                      <h3 id={`grp-${g.key}`} className="flex items-center gap-2 border-y border-line bg-surface-2/60 px-4 py-1.5 text-xs font-semibold text-muted sm:px-5">
                        {g.label}<span className="rounded-full bg-surface-3 px-1.5 text-[11px] tabular-nums">{list.length}</span>
                      </h3>
                      <div className="divide-y divide-line">{list.map((t) => <TaskRow key={t.id} t={{ ...t, projectName: null }} />)}</div>
                    </section>
                  );
                })}
                {hidden > 0 && (
                  <p className="px-4 pt-3 text-xs text-muted sm:px-5">
                    {hidden} more task{hidden === 1 ? " is" : "s are"} assigned to other members and not shown here.
                  </p>
                )}
              </div>
            )}
          </Card>
        </div>

        <div className="space-y-5">
          <Card>
            <MilestoneList projectId={p.id} canManage={canManage} today={today}
              items={ms.map((m) => ({ id: m.id, title: m.title, dueDate: m.dueDate, completedAt: m.completedAt }))} />
          </Card>

          <Card>
            <CardHeader title="Upcoming deadlines" />
            {upcoming.length === 0 ? (
              <EmptyState compact icon={CheckCircle2} title="Nothing due">No open tasks with deadlines right now.</EmptyState>
            ) : (
              <ul className="divide-y divide-line border-t border-line">
                {upcoming.map((t) => (
                  <li key={t.id}>
                    <Link href={`/tasks/${t.id}`} className="focus-ring group block px-4 py-2.5 hover:bg-surface-2 sm:px-5">
                      <span className="block truncate text-sm font-medium text-fg group-hover:text-brand-ink">{t.title}</span>
                      <DueChip status={t.status} dueAt={t.dueAt} tz={t.timezone} />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
            {p.targetDate && (
              <p className={cn("flex items-center gap-1.5 border-t border-line px-4 py-3 text-xs sm:px-5", targetLate ? "text-warn" : "text-muted")}>
                <CalendarClock className="h-3.5 w-3.5" aria-hidden />Project target: {fmtDay(p.targetDate)}
              </p>
            )}
          </Card>

          <Card>
            <CardHeader title="Documents" description={canManage ? "Links and files for this project" : undefined} />
            <div className="border-t border-line">
              <ProjectDocuments projectId={p.id} links={p.links} canManage={canManage} accept={ACCEPT_ATTR}
                files={files.map((f) => ({ id: f.id, filename: f.filename, size: f.size, createdAt: f.createdAt, uploadedByName: f.uploadedByName }))} />
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}
