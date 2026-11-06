import { requireAdmin } from "@/server/auth";
import { getDepartments } from "@/server/queries";
import { directorOptions } from "@/server/projects";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { ProjectForm } from "@/components/projects/project-form";
import { createProject } from "../actions";

export const metadata = { title: "New project" };

export default async function NewProjectPage() {
  await requireAdmin();
  const [directors, departments] = await Promise.all([directorOptions(), getDepartments()]);
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader eyebrow="Projects" title="New project" description="Give the team a shared home for a goal: who leads it, when it's due and where the documents live." />
      <Card className="p-5 sm:p-6">
        <ProjectForm action={createProject} directors={directors} departments={departments} cancelHref="/projects" submitLabel="Create project" />
      </Card>
    </div>
  );
}
