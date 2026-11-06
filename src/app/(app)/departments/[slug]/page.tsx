import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, CheckCircle2, FolderKanban, ListTodo, Users } from "lucide-react";
import { requireUser } from "@/server/auth";
import { loadTasks } from "@/server/queries";
import { listProjects, projectStats } from "@/server/projects";
import { getDepartmentBySlug, getDirectory, getPersonLite } from "@/server/team";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardHeader } from "@/components/ui/card";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Tabs } from "@/components/ui/tabs";
import { TaskRow } from "@/components/tasks/task-bits";
import { ProgressBar } from "@/components/projects/progress";
import { PROJECT_STATUS_LABEL, PROJECT_STATUS_TONE } from "@/components/projects/meta";
import { ROLE_LABEL } from "@/lib/task-meta";

type View = "active" | "completed" | "overdue";
const VIEWS: { key: View; label: string }[] = [{ key: "active", label: "Active" }, { key: "completed", label: "Completed" }, { key: "overdue", label: "Overdue" }];

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const d = await getDepartmentBySlug((await params).slug);
  return { title: d?.name ?? "Department" };
}

export default async function DepartmentPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ view?: string }> }) {
  const me = await requireUser();
  if (me.role === "volunteer") redirect("/");
  const { slug } = await params;
  const d = await getDepartmentBySlug(slug);
  if (!d || (d.archived && me.role !== "admin")) notFound();
  const sp = await searchParams;
  const view: View = VIEWS.some((v) => v.key === sp.view) ? (sp.view as View) : "active";

  const [lead, people, projects, active, completed, overdue] = await Promise.all([
    getPersonLite(d.leadId), getDirectory(), listProjects({ departmentId: d.id }),
    loadTasks(me, { scope: "visible", departmentId: d.id, view: "active" }),
    loadTasks(me, { scope: "visible", departmentId: d.id, view: "completed" }),
    loadTasks(me, { scope: "visible", departmentId: d.id, view: "overdue" }),
  ]);
  const members = people.filter((p) => p.departmentId === d.id);
  const liveProjects = projects.filter((p) => p.status !== "archived" && p.status !== "completed");
  const stats = await projectStats(liveProjects.map((p) => p.id));
  const lists = { active, completed, overdue };
  const tasks = lists[view];

  return (
    <>
      <Link href="/departments" className="focus-ring mb-3 inline-flex h-10 items-center gap-1.5 rounded-lg text-sm font-medium text-muted hover:text-fg">
        <ArrowLeft className="h-4 w-4" aria-hidden />All departments
      </Link>
      <PageHeader
        eyebrow={<span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ background: d.color }} aria-hidden />Department{d.archived && " · Archived"}</span>}
        title={d.name} description={d.description || undefined} />

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <Card>
            <CardHeader title="Active projects" />
            {liveProjects.length === 0 ? (
              <EmptyState compact icon={FolderKanban} title="No active projects">This department isn&apos;t leading a project right now.</EmptyState>
            ) : (
              <ul className="divide-y divide-line border-t border-line">
                {liveProjects.map((p) => (
                  <li key={p.id}>
                    <Link href={`/projects/${p.id}`} className="focus-ring group grid gap-2 px-4 py-3 hover:bg-surface-2 sm:grid-cols-[1fr_220px] sm:items-center sm:gap-6 sm:px-5">
                      <span className="min-w-0">
                        <span className="flex flex-wrap items-center gap-2">
                          <span className="font-medium text-fg group-hover:text-brand-ink">{p.name}</span>
                          <Badge tone={PROJECT_STATUS_TONE[p.status]} dot>{PROJECT_STATUS_LABEL[p.status]}</Badge>
                        </span>
                        {p.directorName && <span className="mt-0.5 block text-xs text-muted">Led by {p.directorName}</span>}
                      </span>
                      <ProgressBar p={stats.get(p.id)!} compact />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card>
            <CardHeader title="Department tasks" description={me.role === "admin" ? undefined : "Tasks in this department that you can see."} />
            <div className="px-4 pb-3 sm:px-5">
              <Tabs active={view} items={VIEWS.map((v) => ({
                key: v.key, label: v.label, count: lists[v.key].length,
                href: v.key === "active" ? `/departments/${d.slug}` : `/departments/${d.slug}?view=${v.key}`,
              }))} />
            </div>
            {tasks.length === 0 ? (
              <EmptyState compact icon={view === "overdue" ? CheckCircle2 : ListTodo}
                title={view === "active" ? "No active tasks" : view === "completed" ? "Nothing completed yet" : "Nothing overdue"}>
                {view === "overdue" ? "Everyone's on track here." : view === "active" ? "Open work in this department will show up here." : "Approved work will show up here."}
              </EmptyState>
            ) : (
              <div className="divide-y divide-line border-t border-line">{tasks.map((t) => <TaskRow key={t.id} t={t} />)}</div>
            )}
          </Card>
        </div>

        <div className="space-y-5">
          <Card>
            <CardHeader title="Lead" />
            <div className="px-5 pb-5">
              {lead ? (
                <Link href={`/team/${lead.id}`} className="focus-ring group -mx-2 flex items-center gap-3 rounded-xl p-2 hover:bg-surface-2">
                  <Avatar name={lead.name} fileId={lead.avatarFileId} size={40} />
                  <span className="min-w-0">
                    <span className="block truncate font-semibold text-fg group-hover:text-brand-ink">{lead.name}</span>
                    <span className="block truncate text-xs text-muted">{lead.title || "Department lead"}</span>
                  </span>
                </Link>
              ) : <p className="text-sm text-muted">No lead assigned yet.</p>}
            </div>
          </Card>

          <Card>
            <CardHeader title="Members" description={`${members.length} ${members.length === 1 ? "person" : "people"}`} />
            {members.length === 0 ? (
              <EmptyState compact icon={Users} title="No members yet">People assigned to this department will be listed here.</EmptyState>
            ) : (
              <ul className="divide-y divide-line border-t border-line">
                {members.map((m) => (
                  <li key={m.id}>
                    <Link href={`/team/${m.id}`} className="focus-ring group flex items-center gap-3 px-4 py-2.5 hover:bg-surface-2 sm:px-5">
                      <Avatar name={m.name} fileId={m.avatarFileId} size={32} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-fg group-hover:text-brand-ink">{m.name}</span>
                        <span className="block truncate text-xs text-muted">{m.title || ROLE_LABEL[m.role]}</span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          {me.role === "admin" && (
            <p className="px-1 text-xs text-muted">
              Edit the name, color, lead or description in <Link href="/settings" className="font-medium text-brand-ink underline-offset-2 hover:underline">Settings</Link>.
            </p>
          )}
        </div>
      </div>
    </>
  );
}
