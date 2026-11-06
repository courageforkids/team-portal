import { requireAdmin } from "@/server/auth";
import { PageHeader } from "@/components/ui/page-header";
import { TaskForm } from "@/components/tasks/task-form";
import { taskFormOptions } from "../form-data";
import { DEFAULT_TZ } from "@/lib/dates";

export const metadata = { title: "New task" };

export default async function NewTaskPage({ searchParams }: { searchParams: Promise<{ projectId?: string; assignee?: string; departmentId?: string }> }) {
  await requireAdmin();
  const sp = await searchParams;
  const opts = await taskFormOptions();
  return (
    <>
      <PageHeader title="New task" description="Assign work to one person, several people, or set up a recurring assignment." />
      <TaskForm mode="create" {...opts} values={{
        title: "", instructions: "", assignees: sp.assignee && opts.people.some((p) => p.id === sp.assignee) ? [sp.assignee] : [],
        departmentId: sp.departmentId ?? "", categoryId: "", projectId: sp.projectId && opts.projects.some((p) => p.id === sp.projectId) ? sp.projectId : "",
        priority: "medium", dueAt: "", timezone: DEFAULT_TZ, deliverables: "", completionCriteria: "", submissionTypes: ["text"], checklist: "", links: "",
        requiresReview: true, reviewerId: "", internalNotes: "",
      }} />
    </>
  );
}
