import Link from "next/link";
import { redirect } from "next/navigation";
import { Building2, ListTodo, Users } from "lucide-react";
import { requireUser } from "@/server/auth";
import { getDepartments, getPeople, loadTasks } from "@/server/queries";
import { departmentMemberCounts } from "@/server/team";
import { PageHeader } from "@/components/ui/page-header";
import { Avatar } from "@/components/ui/avatar";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";

export const metadata = { title: "Departments" };

export default async function DepartmentsPage() {
  const me = await requireUser();
  if (me.role === "volunteer") redirect("/");
  const [depts, people, members, open] = await Promise.all([
    getDepartments(), getPeople(), departmentMemberCounts(),
    loadTasks(me, { scope: "visible", view: "active", limit: 5000 }),
  ]);
  const openBy = new Map<string, number>();
  for (const t of open) if (t.departmentId) openBy.set(t.departmentId, (openBy.get(t.departmentId) ?? 0) + 1);
  const byId = new Map(people.map((p) => [p.id, p]));

  return (
    <>
      <PageHeader title="Departments" description="How the team is organized, who leads each area and what's in motion." />
      {depts.length === 0 ? (
        <div className="card">
          <EmptyState icon={Building2} title="No departments yet"
            action={me.role === "admin" && <ButtonLink href="/settings">Set up departments in Settings</ButtonLink>}>
            {me.role === "admin" ? "Create departments in Settings to group people, projects and tasks." : "Departments will show up here once an administrator sets them up."}
          </EmptyState>
        </div>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {depts.map((d) => {
            const lead = d.leadId ? byId.get(d.leadId) : undefined;
            const n = members.get(d.id) ?? 0;
            const o = openBy.get(d.id) ?? 0;
            return (
              <li key={d.id}>
                <Link href={`/departments/${d.slug}`}
                  className="focus-ring card group relative flex h-full flex-col overflow-hidden p-5 pt-6 transition hover:border-line-strong hover:shadow-card">
                  <span className="absolute inset-x-0 top-0 h-1" style={{ background: d.color }} aria-hidden />
                  <div className="flex items-center gap-2.5">
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl" style={{ background: `color-mix(in srgb, ${d.color} 14%, transparent)`, color: d.color }}>
                      <Building2 className="h-[18px] w-[18px]" aria-hidden />
                    </span>
                    <h2 className="text-[17px] font-semibold leading-snug text-fg group-hover:text-brand-ink">{d.name}</h2>
                  </div>
                  <p className="mt-2.5 line-clamp-2 flex-1 text-sm text-muted">{d.description || "No description yet."}</p>
                  <div className="mt-4 flex items-center justify-between gap-3 border-t border-line pt-3.5 text-xs">
                    <span className="flex min-w-0 items-center gap-2">
                      {lead ? <>
                        <Avatar name={lead.name} fileId={lead.avatarFileId} size={24} />
                        <span className="min-w-0 truncate"><span className="font-medium text-fg-2">{lead.name}</span><span className="text-muted"> · Lead</span></span>
                      </> : <span className="text-muted">No lead assigned</span>}
                    </span>
                  </div>
                  <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
                    <span className="inline-flex items-center gap-1"><Users className="h-3.5 w-3.5" aria-hidden /><span className="tabular-nums font-medium text-fg-2">{n}</span> member{n === 1 ? "" : "s"}</span>
                    <span className="inline-flex items-center gap-1"><ListTodo className="h-3.5 w-3.5" aria-hidden /><span className="tabular-nums font-medium text-fg-2">{o}</span> open task{o === 1 ? "" : "s"}{me.role !== "admin" && " you can see"}</span>
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
