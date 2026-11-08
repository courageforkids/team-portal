import { inArray } from "drizzle-orm";
import { FileClock } from "lucide-react";
import { db } from "@/db";
import { users } from "@/db/schema";
import { requireAdmin } from "@/server/auth";
import { KIND_LABEL, listDrafts, type Draft } from "@/server/drafts";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardHeader } from "@/components/ui/card";
import { Badge, type Tone } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { DeleteDraftButton, PublishDraftsButton } from "@/components/tasks/draft-buttons";
import { fmtDateTime } from "@/lib/dates";

export const metadata = { title: "Drafts" };

const TONE: Record<string, Tone> = { task: "brand", announcement: "amber", poll: "violet", event: "green", meeting: "blue", resource: "muted" };

/** A readable summary of a draft, whatever format it was saved in. */
function summary(d: Draft, names: Map<string, string>) {
  const get = (k: string): string => {
    if (d.format === "form") return ((d.input as { entries: [string, string][] }).entries.filter(([n]) => n === k).map(([, v]) => v)).join(", ");
    const v = (d.input as Record<string, unknown>)[k];
    return Array.isArray(v) ? v.join(", ") : v == null ? "" : String(v);
  };
  const who = d.format === "task-input" ? d.assigneeIds.map((i) => names.get(i) ?? "Former member").join(", ")
    : d.format === "form" ? get("assignees").split(", ").filter(Boolean).map((i) => names.get(i) ?? i).join(", ") : get("assignees");
  const when = get("dueAt") || get("startsAt") || get("publishAt") || get("closesAt");
  const body = get("instructions") || get("body") || get("description") || get("agenda");
  const options = d.kind === "poll" ? get("options") : "";
  return { who, when, body, options };
}

export default async function DraftsPage() {
  await requireAdmin();
  const drafts = await listDrafts();
  const ids = [...new Set(drafts.flatMap((d) => [...d.assigneeIds, ...(d.format === "form" ? (d.input as { entries: [string, string][] }).entries.filter(([k]) => k === "assignees").map(([, v]) => v) : [])]))].filter((x) => /^[0-9a-f-]{36}$/.test(x));
  const names = new Map((ids.length ? await db.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, ids)) : []).map((u) => [u.id, u.name]));
  const batches = [...new Set(drafts.map((d) => d.batch))];
  return (
    <>
      <PageHeader eyebrow="Executive" title="Drafts" description="Tasks, announcements, polls, events and more, saved privately. Nobody sees them or gets notified until you publish."
        actions={drafts.length > 1 ? <PublishDraftsButton ids={drafts.map((d) => d.id)} label={`Publish all ${drafts.length}`} size="md" confirmText={`Publish all ${drafts.length} drafts? Everyone involved will be notified.`} /> : undefined} />
      {!drafts.length && <EmptyState icon={FileClock} title="No drafts">Use “Save as draft” when creating a task, announcement, poll, event, meeting or resource, or ask Claude to save things as drafts.</EmptyState>}
      <div className="space-y-6">
        {batches.map((b) => {
          const list = drafts.filter((d) => d.batch === b);
          return (
            <Card key={b || "none"}>
              <CardHeader title={b || "Drafts"} description={`${list.length} draft${list.length === 1 ? "" : "s"}`}
                action={list.length > 1 ? <PublishDraftsButton ids={list.map((d) => d.id)} label="Publish these" variant="secondary" confirmText={`Publish ${list.length} drafts${b ? ` in “${b}”` : ""}? Everyone involved will be notified.`} /> : undefined} />
              <ul className="divide-y divide-line border-t border-line">
                {list.map((d) => {
                  const s = summary(d, names);
                  const title = d.title || "Untitled";
                  return (
                    <li key={d.id} className="px-5 py-3">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0 flex-1 basis-60">
                          <div className="flex flex-wrap items-center gap-2"><Badge tone={TONE[d.kind] ?? "neutral"}>{KIND_LABEL[d.kind] ?? d.kind}</Badge><span className="font-semibold">{title}</span></div>
                          <div className="text-xs text-muted">{[s.who, s.when && /^\d{4}-/.test(s.when) ? fmtDateTime(s.when) : s.when, `saved ${fmtDateTime(d.createdAt)}`].filter(Boolean).join(" · ")}</div>
                          {s.options && <div className="mt-1 text-xs text-fg-2">Options: {s.options}</div>}
                          {s.body && (
                            <details className="mt-1.5">
                              <summary className="cursor-pointer text-xs font-semibold text-brand-ink">Show details</summary>
                              <p className="mt-1.5 whitespace-pre-wrap text-sm text-fg-2">{s.body}</p>
                            </details>
                          )}
                        </div>
                        <div className="flex items-center gap-1">
                          <PublishDraftsButton ids={[d.id]} label="Publish" variant="secondary" confirmText={`Publish “${title}”? Everyone involved will be notified.`} />
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
