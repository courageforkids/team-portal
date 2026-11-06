import { count, eq } from "drizzle-orm";
import { Building2, Pencil, Plus, Archive, ArchiveRestore } from "lucide-react";
import { db } from "@/db";
import { users } from "@/db/schema";
import { requireAdmin } from "@/server/auth";
import { getDepartments, getPeople } from "@/server/queries";
import { Card, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { ConfirmAction } from "@/components/ui/confirm";
import { DepartmentDialog } from "@/components/settings/department-dialog";
import { setDepartmentArchivedAction } from "../actions";

export const metadata = { title: "Departments · Settings" };

export default async function DepartmentsSettingsPage() {
  await requireAdmin();
  const [depts, people, sizes] = await Promise.all([
    getDepartments(true), getPeople(),
    db.select({ id: users.departmentId, n: count() }).from(users).where(eq(users.status, "active")).groupBy(users.departmentId),
  ]);
  const size = new Map(sizes.map((s) => [s.id, s.n]));
  const names = new Map(people.map((p) => [p.id, p.name]));
  const peopleOpts = people.map((p) => ({ id: p.id, name: p.name }));
  const active = depts.filter((d) => !d.archived), archived = depts.filter((d) => d.archived);

  const Row = ({ d }: { d: (typeof depts)[number] }) => (
    <li className="flex flex-col gap-3 px-4 py-3.5 sm:flex-row sm:items-center sm:px-5">
      <span className="hidden h-9 w-9 shrink-0 place-items-center rounded-xl sm:grid" style={{ background: `${d.color}1f` }} aria-hidden>
        <span className="h-3 w-3 rounded-full" style={{ background: d.color }} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full sm:hidden" style={{ background: d.color }} aria-hidden />
          <span className="font-semibold text-fg">{d.name}</span>
          {d.archived && <Badge tone="muted">Archived</Badge>}
        </div>
        {d.description && <p className="mt-0.5 line-clamp-2 text-sm text-muted">{d.description}</p>}
        <p className="mt-1 text-xs text-muted">
          {d.leadId && names.get(d.leadId) ? <>Lead: <span className="text-fg-2">{names.get(d.leadId)}</span> · </> : "No lead · "}
          {size.get(d.id) ?? 0} member{(size.get(d.id) ?? 0) === 1 ? "" : "s"} · <span className="font-mono">{d.slug}</span>
        </p>
      </div>
      <div className="flex flex-wrap gap-2 max-md:[&>button]:h-10">
        <DepartmentDialog people={peopleOpts} dept={{ id: d.id, name: d.name, slug: d.slug, description: d.description, color: d.color, leadId: d.leadId }}
          trigger={<><Pencil className="h-3.5 w-3.5" aria-hidden />Edit</>} />
        {d.archived ? (
          <ConfirmAction trigger={<><ArchiveRestore className="h-3.5 w-3.5" aria-hidden />Restore</>} variant="primary" title={`Restore ${d.name}?`} confirmLabel="Restore"
            description="It will show up again in department lists and pickers." action={setDepartmentArchivedAction.bind(null, d.id, false)} />
        ) : (
          <ConfirmAction trigger={<><Archive className="h-3.5 w-3.5" aria-hidden />Archive</>} triggerVariant="ghost" title={`Archive ${d.name}?`} confirmLabel="Archive"
            description="It will be hidden from department lists and pickers. Existing tasks and members keep it, and you can restore it any time."
            action={setDepartmentArchivedAction.bind(null, d.id, true)} />
        )}
      </div>
    </li>
  );

  return (
    <>
      <Card>
        <CardHeader title="Departments" description="How the team is organized. Colors appear on tasks and charts."
          action={<DepartmentDialog people={peopleOpts} triggerVariant="primary" trigger={<><Plus className="h-4 w-4" aria-hidden />New department</>} />} />
        {active.length === 0 ? (
          <EmptyState compact icon={Building2} title="No departments yet">Create one to start grouping tasks and people.</EmptyState>
        ) : (
          <ul className="divide-y divide-line border-t border-line">{active.map((d) => <Row key={d.id} d={d} />)}</ul>
        )}
      </Card>
      {archived.length > 0 && (
        <Card>
          <CardHeader title="Archived" description="Hidden from lists and pickers." />
          <ul className="divide-y divide-line border-t border-line">{archived.map((d) => <Row key={d.id} d={d} />)}</ul>
        </Card>
      )}
    </>
  );
}
