import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { taskAssignees, tasks } from "@/db/schema";
import { requireAdmin } from "@/server/auth";
import { PageHeader } from "@/components/ui/page-header";
import { TaskForm } from "@/components/tasks/task-form";
import { taskFormOptions } from "../../form-data";
import { toLocalInput } from "@/lib/dates";

export const metadata = { title: "Edit task" };

export default async function EditTaskPage({ params }: { params: Promise<{ id: string }> }) {
  const me = await requireAdmin();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const t = (await db.select().from(tasks).where(eq(tasks.id, id)).limit(1))[0];
  if (!t) notFound();
  const asg = await db.select({ id: taskAssignees.userId }).from(taskAssignees).where(eq(taskAssignees.taskId, id));
  const opts = await taskFormOptions();
  return (
    <>
      <PageHeader title="Edit task" description={t.title} />
      <TaskForm mode="edit" {...opts} meId={me.id} values={{
        workGroupId: t.workGroupId ?? "",
        id: t.id, title: t.title, instructions: t.instructions, assignees: asg.map((a) => a.id), departmentId: t.departmentId ?? "", categoryId: t.categoryId ?? "",
        projectId: t.projectId ?? "", priority: t.priority, dueAt: toLocalInput(t.dueAt, t.timezone), timezone: t.timezone, deliverables: t.deliverables,
        completionCriteria: t.completionCriteria, submissionTypes: t.submissionTypes, checklist: t.checklist.map((c) => c.label).join("\n"),
        links: t.links.map((l) => `${l.label} | ${l.url}`).join("\n"), requiresReview: t.requiresReview, reviewerId: t.reviewerId ?? "", internalNotes: t.internalNotes,
      }} />
    </>
  );
}
