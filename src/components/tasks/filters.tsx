"use client";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { Search, X, SlidersHorizontal, List, Columns3, CalendarDays } from "lucide-react";
import { cn } from "@/lib/cn";
import { PRIORITIES, PRIORITY_LABEL, STATUS_LABEL, TASK_STATUSES } from "@/lib/task-meta";

type Opt = { id: string; name: string };

export function TaskFilters({ people, departments, projects, showMember }: { people: Opt[]; departments: Opt[]; projects: Opt[]; showMember: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [q, setQ] = useState(sp.get("q") ?? "");
  const [open, setOpen] = useState(false);
  const [, start] = useTransition();
  const set = (k: string, v: string) => {
    const next = new URLSearchParams(sp.toString());
    if (v) next.set(k, v); else next.delete(k);
    start(() => router.replace(`${pathname}?${next.toString()}`, { scroll: false }));
  };
  useEffect(() => {
    const id = setTimeout(() => { if ((sp.get("q") ?? "") !== q) set("q", q.trim()); }, 300);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);
  const active = ["member", "dept", "project", "status", "priority", "due"].filter((k) => sp.get(k));
  const view = sp.get("layout") ?? "list";
  const sel = "input h-10 py-0 text-sm";
  return (
    <div className="mb-4 space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[180px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" aria-hidden />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search tasks" aria-label="Search tasks" className="input h-10 pl-9" type="search" />
        </div>
        <button onClick={() => setOpen((o) => !o)} aria-expanded={open}
          className={cn("focus-ring inline-flex h-10 items-center gap-2 rounded-[10px] border px-3 text-sm font-semibold", active.length ? "border-brand/40 bg-brand-soft text-brand-ink" : "border-line-strong bg-surface text-fg-2 hover:bg-surface-2")}>
          <SlidersHorizontal className="h-4 w-4" />Filters{active.length > 0 && <span className="rounded-full bg-brand px-1.5 text-[11px] text-brand-fg">{active.length}</span>}
        </button>
        <div role="radiogroup" aria-label="Layout" className="flex rounded-[10px] border border-line-strong bg-surface p-0.5">
          {([["list", List, "List"], ["board", Columns3, "Board"], ["calendar", CalendarDays, "Calendar"]] as const).map(([k, Icon, label]) => (
            <button key={k} role="radio" aria-checked={view === k} onClick={() => set("layout", k === "list" ? "" : k)} title={label}
              className={cn("inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[13px] font-semibold", view === k ? "bg-brand-soft text-brand-ink" : "text-muted hover:text-fg")}>
              <Icon className="h-4 w-4" aria-hidden /><span className="hidden sm:inline">{label}</span>
            </button>
          ))}
        </div>
      </div>
      {open && (
        <div className="animate-in grid grid-cols-2 gap-2 rounded-xl border border-line bg-surface p-3 sm:grid-cols-3 lg:grid-cols-6">
          {showMember && (
            <select aria-label="Member" className={sel} value={sp.get("member") ?? ""} onChange={(e) => set("member", e.target.value)}>
              <option value="">Everyone</option>{people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          )}
          <select aria-label="Department" className={sel} value={sp.get("dept") ?? ""} onChange={(e) => set("dept", e.target.value)}>
            <option value="">All departments</option>{departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
          <select aria-label="Project" className={sel} value={sp.get("project") ?? ""} onChange={(e) => set("project", e.target.value)}>
            <option value="">All projects</option>{projects.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
          <select aria-label="Status" className={sel} value={sp.get("status") ?? ""} onChange={(e) => set("status", e.target.value)}>
            <option value="">Any status</option>{TASK_STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
          </select>
          <select aria-label="Priority" className={sel} value={sp.get("priority") ?? ""} onChange={(e) => set("priority", e.target.value)}>
            <option value="">Any priority</option>{PRIORITIES.map((s) => <option key={s} value={s}>{PRIORITY_LABEL[s]}</option>)}
          </select>
          <select aria-label="Due" className={sel} value={sp.get("due") ?? ""} onChange={(e) => set("due", e.target.value)}>
            <option value="">Any due date</option><option value="today">Due today</option><option value="week">Due in 7 days</option><option value="month">Due in 30 days</option>
          </select>
          <select aria-label="Sort" className={sel} value={sp.get("sort") ?? ""} onChange={(e) => set("sort", e.target.value)}>
            <option value="">Sort: due date</option><option value="priority">Sort: priority</option><option value="updated">Sort: recently updated</option><option value="created">Sort: newest</option>
          </select>
          {active.length > 0 && (
            <button className="focus-ring inline-flex h-10 items-center justify-center gap-1 rounded-[10px] text-sm font-semibold text-muted hover:bg-surface-2 hover:text-fg"
              onClick={() => { const n = new URLSearchParams(sp.toString()); active.forEach((k) => n.delete(k)); router.replace(`${pathname}?${n}`); }}>
              <X className="h-4 w-4" />Clear filters
            </button>
          )}
        </div>
      )}
    </div>
  );
}
