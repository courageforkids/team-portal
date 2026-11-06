"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { Search, Users, X } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input, Select } from "@/components/ui/form";
import { ROLE_LABEL } from "@/lib/task-meta";

export type DirectoryCard = {
  id: string; name: string; title: string; role: "admin" | "leader" | "volunteer"; avatarFileId: string | null; responsibilities: string;
  departmentId: string | null; departmentName: string | null; departmentColor: string | null;
};

export function TeamDirectory({ people, departments }: { people: DirectoryCard[]; departments: { id: string; name: string }[] }) {
  const [q, setQ] = useState("");
  const [dept, setDept] = useState("");
  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return people.filter((p) =>
      (!dept || (dept === "none" ? !p.departmentId : p.departmentId === dept)) &&
      (!needle || [p.name, p.title, p.departmentName ?? "", p.responsibilities, ROLE_LABEL[p.role]].some((s) => s.toLowerCase().includes(needle))));
  }, [people, q, dept]);
  const hasUnassigned = people.some((p) => !p.departmentId);

  return (
    <>
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <label htmlFor="team-q" className="sr-only">Search people</label>
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" aria-hidden />
          <Input id="team-q" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name, title or responsibility" className="pl-9" />
        </div>
        <div className="sm:w-60">
          <label htmlFor="team-dept" className="sr-only">Filter by department</label>
          <Select id="team-dept" value={dept} onChange={(e) => setDept(e.target.value)}>
            <option value="">All departments</option>
            {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            {hasUnassigned && <option value="none">No department</option>}
          </Select>
        </div>
      </div>
      <p className="sr-only" aria-live="polite">{shown.length} {shown.length === 1 ? "person" : "people"} shown</p>

      {shown.length === 0 ? (
        <div className="card">
          <EmptyState icon={Users} title="No one matches that search"
            action={<Button variant="secondary" onClick={() => { setQ(""); setDept(""); }}><X className="h-4 w-4" aria-hidden />Clear filters</Button>}>
            Try a first name, a title like &ldquo;Director&rdquo;, or another department.
          </EmptyState>
        </div>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {shown.map((p) => (
            <li key={p.id}>
              <Link href={`/team/${p.id}`} className="focus-ring card group flex h-full flex-col p-5 transition hover:border-line-strong hover:shadow-card">
                <div className="flex items-start gap-3.5">
                  <Avatar name={p.name} fileId={p.avatarFileId} size={48} />
                  <div className="min-w-0 flex-1">
                    <h2 className="truncate text-[15px] font-semibold text-fg group-hover:text-brand-ink">{p.name}</h2>
                    <p className="truncate text-sm text-fg-2">{p.title || ROLE_LABEL[p.role]}</p>
                    <div className="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1">
                      {p.departmentName && (
                        <span className="inline-flex items-center gap-1.5 text-xs text-muted">
                          <span className="h-2 w-2 rounded-full" style={{ background: p.departmentColor ?? "var(--faint)" }} aria-hidden />{p.departmentName}
                        </span>
                      )}
                      <Badge tone={p.role === "admin" ? "brand" : p.role === "leader" ? "violet" : "neutral"} className="text-[11px]">{ROLE_LABEL[p.role]}</Badge>
                    </div>
                  </div>
                </div>
                {p.responsibilities && <p className="mt-3.5 line-clamp-2 border-t border-line pt-3 text-sm text-muted">{p.responsibilities}</p>}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
