import { addDays, endOfDay, endOfMonth, startOfMonth } from "date-fns";
import { formatInTimeZone } from "date-fns-tz";
import { CheckCircle2, ClipboardList, Plus, PartyPopper } from "lucide-react";
import type { CurrentUser } from "@/server/auth";
import { getDepartments, getPeople, getProjectsLite, loadTasks, type TaskFilters } from "@/server/queries";
import { PageHeader } from "@/components/ui/page-header";
import { Tabs } from "@/components/ui/tabs";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { TaskRow } from "./task-bits";
import { TaskFilters as Filters } from "./filters";
import { TaskBoard } from "./task-board";
import { TaskMonth } from "./task-month";
import { PRIORITIES, TASK_STATUSES, type Priority, type TaskStatus } from "@/lib/task-meta";
import { DEFAULT_TZ } from "@/lib/dates";

type SP = Record<string, string | undefined>;

export async function TasksPage({ me, sp, scope }: { me: CurrentUser; sp: SP; scope: "mine" | "all" }) {
  const base = scope === "all" ? "/tasks/all" : "/tasks";
  const layout = sp.layout === "board" ? "board" : sp.layout === "calendar" ? "calendar" : "list";
  const view = (["active", "overdue", "completed", "review", "everything"].includes(sp.view ?? "") ? sp.view : "active") as NonNullable<TaskFilters["view"]>;
  const now = new Date();
  const month = /^\d{4}-\d{2}$/.test(sp.month ?? "") ? sp.month! : formatInTimeZone(now, DEFAULT_TZ, "yyyy-MM");
  const filters: TaskFilters = {
    scope: scope === "all" ? "all" : "mine",
    q: sp.q?.slice(0, 100), memberId: scope === "all" ? sp.member : undefined, departmentId: sp.dept, projectId: sp.project,
    status: TASK_STATUSES.includes(sp.status as TaskStatus) ? (sp.status as TaskStatus) : undefined,
    priority: PRIORITIES.includes(sp.priority as Priority) ? (sp.priority as Priority) : undefined,
    sort: sp.sort as TaskFilters["sort"],
  };
  if (sp.due === "today") filters.dueTo = endOfDay(now);
  if (sp.due === "week") filters.dueTo = addDays(now, 7);
  if (sp.due === "month") filters.dueTo = addDays(now, 30);
  const listFilters: TaskFilters = layout === "list" ? { ...filters, view } : layout === "board" ? { ...filters, view: "everything" } : {
    ...filters, view: "everything", dueFrom: addDays(startOfMonth(new Date(`${month}-01T12:00:00`)), -7), dueTo: addDays(endOfMonth(new Date(`${month}-01T12:00:00`)), 7),
  };
  const [tasks, counts, people, departments, projects] = await Promise.all([
    loadTasks(me, listFilters),
    Promise.all((["active", "overdue", "review", "completed"] as const).map(async (v) => [v, (await loadTasks(me, { ...filters, view: v, limit: 1000 })).length] as const)),
    scope === "all" ? getPeople() : Promise.resolve([]),
    getDepartments(), getProjectsLite(),
  ]);
  const boardTasks = layout === "board" ? tasks.filter((t) => !["canceled", "excused"].includes(t.status) && (t.status !== "approved" || (t.completedAt && t.completedAt > addDays(now, -14)))) : tasks;
  const c = Object.fromEntries(counts) as Record<string, number>;
  const qs = (patch: SP) => {
    const n = new URLSearchParams(Object.entries({ ...sp, ...patch }).filter(([, v]) => v) as [string, string][]);
    const s = n.toString();
    return s ? `${base}?${s}` : base;
  };
  const isFiltered = !!(sp.q || sp.member || sp.dept || sp.project || sp.status || sp.priority || sp.due);
  return (
    <>
      <PageHeader
        eyebrow={scope === "all" ? "Executive" : undefined}
        title={scope === "all" ? "All tasks" : "My tasks"}
        description={scope === "all" ? "Every assignment across the organization." : "Everything assigned to you, in one place."}
        actions={me.role === "admin" && <ButtonLink href="/tasks/new"><Plus className="h-4 w-4" />New task</ButtonLink>}
      />
      <Filters showMember={scope === "all"} people={people.map((p) => ({ id: p.id, name: p.name }))} departments={departments} projects={projects} />
      {layout === "list" && (
        <>
          <Tabs className="mb-4" active={view} items={[
            { key: "active", label: "Active", href: qs({ view: undefined }), count: c.active },
            { key: "overdue", label: "Overdue", href: qs({ view: "overdue" }), count: c.overdue },
            { key: "review", label: "In review", href: qs({ view: "review" }), count: c.review },
            { key: "completed", label: "Completed", href: qs({ view: "completed" }), count: c.completed },
            { key: "everything", label: "All", href: qs({ view: "everything" }) },
          ]} />
          <div className="card overflow-hidden">
            {tasks.length ? (
              <div className="divide-y divide-line">{tasks.map((t) => <TaskRow key={t.id} t={t} showAssignees={scope === "all"} />)}</div>
            ) : isFiltered ? (
              <EmptyState icon={ClipboardList} title="No tasks match these filters">Try clearing a filter or searching for something else.</EmptyState>
            ) : view === "overdue" ? (
              <EmptyState icon={CheckCircle2} title="Nothing overdue">{scope === "all" ? "Every open task is on schedule." : "You're all caught up on deadlines. 🎉"}</EmptyState>
            ) : view === "completed" ? (
              <EmptyState icon={PartyPopper} title="No completed tasks yet">Approved tasks will show up here.</EmptyState>
            ) : view === "review" ? (
              <EmptyState icon={ClipboardList} title="Nothing waiting for review">Submitted work appears here until it's approved.</EmptyState>
            ) : (
              <EmptyState icon={ClipboardList} title={scope === "all" ? "No active tasks" : "You're all caught up"}
                action={me.role === "admin" ? <ButtonLink href="/tasks/new"><Plus className="h-4 w-4" />Create a task</ButtonLink> : undefined}>
                {scope === "all" ? "Create a task to assign work to the team." : "New assignments will appear here as soon as they're given to you."}
              </EmptyState>
            )}
          </div>
        </>
      )}
      {layout === "board" && (boardTasks.length ? <TaskBoard tasks={boardTasks} /> : <div className="card"><EmptyState icon={ClipboardList} title="No tasks to show">Tasks you can see will appear on the board.</EmptyState></div>)}
      {layout === "calendar" && <TaskMonth tasks={tasks.filter((t) => !["canceled", "excused"].includes(t.status))} month={month} hrefFor={(m) => qs({ month: m })} />}
    </>
  );
}
