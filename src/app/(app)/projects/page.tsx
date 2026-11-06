import Link from "next/link";
import { redirect } from "next/navigation";
import { CalendarClock, Flag, FolderKanban, ListTodo, Plus } from "lucide-react";
import { requireUser } from "@/server/auth";
import { getDepartments } from "@/server/queries";
import { isUuid, listProjects, nextMilestones, projectStats } from "@/server/projects";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Tabs } from "@/components/ui/tabs";
import { ProgressBar } from "@/components/projects/progress";
import { DepartmentFilter } from "@/components/projects/filters";
import { fmtDay, PROJECT_STATUSES, PROJECT_STATUS_LABEL, PROJECT_STATUS_TONE, todayISO, type ProjectStatus } from "@/components/projects/meta";
import { cn } from "@/lib/cn";

export const metadata = { title: "Projects" };

export default async function ProjectsPage({ searchParams }: { searchParams: Promise<{ status?: string; dept?: string }> }) {
  const me = await requireUser();
  if (me.role === "volunteer") redirect("/");
  const sp = await searchParams;
  const status: ProjectStatus | "current" = (PROJECT_STATUSES as readonly string[]).includes(sp.status ?? "") ? (sp.status as ProjectStatus) : "current";
  const dept = isUuid(sp.dept) ? sp.dept : "";

  const [all, departments] = await Promise.all([listProjects({ departmentId: dept || undefined }), getDepartments()]);
  const shown = all.filter((p) => (status === "current" ? p.status !== "archived" : p.status === status));
  const ids = shown.map((p) => p.id);
  const [stats, next] = await Promise.all([projectStats(ids), nextMilestones(ids)]);
  const today = todayISO(me.timezone);

  const counts = Object.fromEntries(PROJECT_STATUSES.map((s) => [s, all.filter((p) => p.status === s).length]));
  const href = (s: string) => {
    const q = new URLSearchParams();
    if (s !== "current") q.set("status", s);
    if (dept) q.set("dept", dept);
    const qs = q.toString();
    return qs ? `/projects?${qs}` : "/projects";
  };
  const tabs = [
    { key: "current", label: "All current", href: href("current"), count: all.length - counts.archived },
    ...PROJECT_STATUSES.map((s) => ({ key: s, label: PROJECT_STATUS_LABEL[s], href: href(s), count: counts[s] })),
  ];

  return (
    <>
      <PageHeader title="Projects" description="Everything we're building together, who's leading it and how it's going."
        actions={me.role === "admin" && <ButtonLink href="/projects/new"><Plus className="h-4 w-4" aria-hidden />New project</ButtonLink>} />

      <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <Tabs items={tabs} active={status} className="lg:max-w-max" />
        <DepartmentFilter departments={departments} value={dept} />
      </div>

      {shown.length === 0 ? (
        <div className="card">
          <EmptyState icon={FolderKanban}
            title={status === "current" && !dept ? "No projects yet" : "No projects match these filters"}
            action={me.role === "admin" && status === "current" && !dept
              ? <ButtonLink href="/projects/new"><Plus className="h-4 w-4" aria-hidden />Create the first project</ButtonLink>
              : (status !== "current" || dept) ? <ButtonLink href="/projects" variant="secondary">Show all current projects</ButtonLink> : undefined}>
            {status === "current" && !dept
              ? me.role === "admin" ? "Projects group related tasks, milestones and documents in one place." : "When an administrator creates a project, it will show up here."
              : "Try a different status or department."}
          </EmptyState>
        </div>
      ) : (
        <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {shown.map((p) => {
            const s = stats.get(p.id)!;
            const n = next.get(p.id);
            const targetLate = !!p.targetDate && p.targetDate < today && p.status !== "completed" && p.status !== "archived";
            return (
              <li key={p.id}>
                <Link href={`/projects/${p.id}`}
                  className="focus-ring card group flex h-full flex-col p-5 transition hover:border-line-strong hover:shadow-card">
                  <div className="flex items-start justify-between gap-3">
                    <span className="inline-flex min-w-0 items-center gap-1.5 text-xs font-medium text-muted">
                      <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: p.departmentColor ?? "var(--faint)" }} aria-hidden />
                      <span className="truncate">{p.departmentName ?? "No department"}</span>
                    </span>
                    <Badge tone={PROJECT_STATUS_TONE[p.status]} dot>{PROJECT_STATUS_LABEL[p.status]}</Badge>
                  </div>
                  <h2 className="mt-2 text-[17px] font-semibold leading-snug text-fg group-hover:text-brand-ink">{p.name}</h2>
                  {p.description && <p className="mt-1 line-clamp-2 text-sm text-muted">{p.description}</p>}
                  <ProgressBar p={s} className="mt-4" />
                  <div className="mt-4 flex flex-1 flex-col justify-end gap-2.5 border-t border-line pt-3.5 text-xs">
                    <div className="flex items-center justify-between gap-3">
                      <span className="flex min-w-0 items-center gap-2">
                        {p.directorName ? <>
                          <Avatar name={p.directorName} fileId={p.directorAvatar} size={24} />
                          <span className="truncate font-medium text-fg-2">{p.directorName}</span>
                        </> : <span className="text-muted">No director assigned</span>}
                      </span>
                      <span className="inline-flex shrink-0 items-center gap-1 text-muted">
                        <ListTodo className="h-3.5 w-3.5" aria-hidden />
                        <span className="tabular-nums">{s.open}</span> open task{s.open === 1 ? "" : "s"}
                      </span>
                    </div>
                    {n ? (
                      <span className={cn("inline-flex min-w-0 items-center gap-1.5", n.dueDate && n.dueDate < today ? "text-warn" : "text-muted")}>
                        <Flag className="h-3.5 w-3.5 shrink-0" aria-hidden />
                        <span className="truncate">Next: <span className="font-medium text-fg-2">{n.title}</span>{n.dueDate && ` · ${fmtDay(n.dueDate, "MMM d")}`}</span>
                      </span>
                    ) : p.targetDate ? (
                      <span className={cn("inline-flex items-center gap-1.5", targetLate ? "text-warn" : "text-muted")}>
                        <CalendarClock className="h-3.5 w-3.5" aria-hidden />Target {fmtDay(p.targetDate)}
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 text-faint"><CalendarClock className="h-3.5 w-3.5" aria-hidden />No target date</span>
                    )}
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
