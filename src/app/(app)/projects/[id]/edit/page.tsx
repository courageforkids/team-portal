import { notFound } from "next/navigation";
import { requireAdmin } from "@/server/auth";
import { getDepartments } from "@/server/queries";
import { directorOptions, getProject } from "@/server/projects";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { ProjectForm } from "@/components/projects/project-form";
import { updateProject } from "../../actions";

export const metadata = { title: "Edit project" };

export default async function EditProjectPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const row = await getProject((await params).id);
  if (!row) notFound();
  const p = row.p;
  const [directors, allDepartments] = await Promise.all([directorOptions(), getDepartments(true)]);
  // Keep the current department selectable even if it was archived since.
  const departments = allDepartments.filter((d) => !d.archived || d.id === p.departmentId);
  const directorGone = !!p.directorId && !directors.some((d) => d.id === p.directorId);
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader eyebrow="Projects" title={`Edit ${p.name}`} />
      {directorGone && (
        <p role="status" className="mb-4 rounded-xl bg-warn-soft px-4 py-3 text-sm text-warn">
          {row.directorName ?? "The current director"} is no longer an active leader. Choose a new director before saving.
        </p>
      )}
      <Card className="p-5 sm:p-6">
        <ProjectForm action={updateProject.bind(null, p.id)} directors={directors} departments={departments} cancelHref={`/projects/${p.id}`} submitLabel="Save changes"
          values={{ name: p.name, description: p.description, directorId: directorGone ? null : p.directorId, departmentId: p.departmentId, status: p.status,
            startDate: p.startDate, targetDate: p.targetDate, links: p.links }} />
      </Card>
    </div>
  );
}
