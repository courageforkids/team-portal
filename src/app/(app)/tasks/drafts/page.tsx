import Link from "next/link";
import { inArray } from "drizzle-orm";
import { ArrowLeft, FileClock } from "lucide-react";
import { db } from "@/db";
import { users } from "@/db/schema";
import { requireAdmin } from "@/server/auth";
import { listDrafts } from "@/server/task-drafts";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { DeleteDraftButton, PublishDraftsButton } from "@/components/tasks/draft-buttons";
import { fmtDateTime } from "@/lib/dates";

export const metadata = { title: "Task drafts" };

export default async function DraftsPage() {
  await requireAdmin();
  const drafts = await listDrafts();
  const ids = [...new Set(drafts.flatMap((d) => d.assigneeIds))];
  const names = new Map((ids.length ? await db.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, ids)) : []).map((u) => [u.id, u.name]));
  const batches = [...new Set(drafts.map((d) => d.batch))];
  return (
    <>
      <Link href="/tasks/all" className="mb-3 inline-flex items-center gap-1 text-sm text-muted hover:text-fg"><ArrowLeft className="h-4 w-4" />All tasks</Link>
      <PageHeader eyebrow="Executive" title="Task drafts" description="Saved privately. Nobody sees these or gets notified until you publish them."
        actions={drafts.length > 1 ? <PublishDraftsButton ids={drafts.map((d) => d.id)} label={`Publish all ${drafts.length}`} size="md" confirmText={`Publish all ${drafts.length} drafts? Every assignee will be notified.`} /> : undefined} />
      {!drafts.length && <EmptyState icon={FileClock} title="No drafts">Ask Claude to “save this week's tasks as drafts”, or create tasks normally from New task.</EmptyState>}
      <div className="space-y-6">
        {batches.map((b) => {
          const list = drafts.filter((d) => d.batch === b);
          return (
            <Card key={b || "none"}>
              <CardHeader title={b || "Drafts"} description={`${list.length} draft${list.length === 1 ? "" : "s"}`}
                action={<PublishDraftsButton ids={list.map((d) => d.id)} label="Publish these" variant="secondary" confirmText={`Publish ${list.length} draft${list.length === 1 ? "" : "s"}${b ? ` in “${b}”` : ""}? Assignees will be notified.`} />} />
              <ul className="divide-y divide-line border-t border-line">
                {list.map((d) => {
                  const inp = d.input as { title?: string; instructions?: string; dueAt?: string | null; priority?: string };
                  const title = inp.title ?? "Untitled";
                  return (
                    <li key={d.id} className="px-5 py-3">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0 flex-1 basis-60">
                          <div className="flex flex-wrap items-center gap-2"><span className="font-semibold">{title}</span>{inp.priority && inp.priority !== "medium" && <Badge tone={inp.priority === "low" ? "muted" : "amber"}>{inp.priority}</Badge>}</div>
                          <div className="text-xs text-muted">{d.assigneeIds.map((i) => names.get(i) ?? "Former member").join(", ")}{inp.dueAt ? ` · due ${fmtDateTime(inp.dueAt)}` : ""}</div>
                          {inp.instructions && (
                            <details className="mt-1.5">
                              <summary className="cursor-pointer text-xs font-semibold text-brand-ink">Show instructions</summary>
                              <p className="mt-1.5 whitespace-pre-wrap text-sm text-fg-2">{inp.instructions}</p>
                            </details>
                          )}
                        </div>
                        <div className="flex items-center gap-1">
                          <PublishDraftsButton ids={[d.id]} label="Publish" variant="secondary" confirmText={`Publish “${title}”? ${d.assigneeIds.length === 1 ? "The assignee" : "Assignees"} will be notified.`} />
                          <DeleteDraftButton id={d.id} title={title} />
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </Card>
          );
        })}
      </div>
    </>
  );
}
