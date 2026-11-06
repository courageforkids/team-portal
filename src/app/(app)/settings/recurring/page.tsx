import { desc } from "drizzle-orm";
import { Repeat, Pause, Play, Trash2, Plus } from "lucide-react";
import { db } from "@/db";
import { taskSeries } from "@/db/schema";
import { requireAdmin } from "@/server/auth";
import { getPeople } from "@/server/queries";
import { Card, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AvatarStack } from "@/components/ui/avatar";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ConfirmAction } from "@/components/ui/confirm";
import { SeriesDialog } from "@/components/settings/series-dialog";
import { deleteSeriesAction, setSeriesActiveAction } from "../actions";
import { fmtDateTime, toLocalInput } from "@/lib/dates";

export const metadata = { title: "Recurring tasks · Settings" };

const RULE = { weekly: "Every week", biweekly: "Every 2 weeks", monthly: "Every month", custom: "Custom" } as const;

export default async function RecurringSettingsPage() {
  await requireAdmin();
  const [rows, people] = await Promise.all([db.select().from(taskSeries).orderBy(desc(taskSeries.active), desc(taskSeries.createdAt)), getPeople({ includeInactive: true })]);
  const byId = new Map(people.map((p) => [p.id, p]));
  const activePeople = people.filter((p) => p.status === "active").map((p) => ({ id: p.id, name: p.name }));
  return (
    <Card>
      <CardHeader title="Recurring tasks" description="Schedules that create a fresh task for each assignee ahead of every due date."
        action={<ButtonLink href="/tasks/new" size="sm" className="max-md:h-10"><Plus className="h-4 w-4" aria-hidden />New recurring task</ButtonLink>} />
      {rows.length === 0 ? (
        <EmptyState compact icon={Repeat} title="No recurring tasks" action={<ButtonLink href="/tasks/new" size="sm" variant="secondary">Create one on the New task page</ButtonLink>}>
          Turn on “Repeat” when creating a task to schedule it automatically.
        </EmptyState>
      ) : (
        <ul className="divide-y divide-line border-t border-line">
          {rows.map((s) => {
            const tz = s.template.timezone;
            const assignees = s.assigneeIds.map((id) => byId.get(id)).filter((p): p is NonNullable<typeof p> => !!p);
            const rule = s.recurrence === "custom" ? `Every ${s.intervalDays ?? 7} days` : RULE[s.recurrence];
            return (
              <li key={s.id} className="flex flex-col gap-3 px-4 py-4 sm:px-5 lg:flex-row lg:items-center">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-fg">{s.template.title}</span>
                    {s.active ? <Badge tone="green" dot>Active</Badge> : <Badge tone="muted">Paused</Badge>}
                  </div>
                  <p className="mt-1 text-sm text-fg-2">
                    {rule} · next due <b className="font-semibold">{fmtDateTime(s.nextDueAt, tz)}</b>
                    {s.endsOn && <> · ends {new Date(`${s.endsOn}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })}</>}
                  </p>
                  <div className="mt-1.5 flex items-center gap-2 text-xs text-muted">
                    {assignees.length ? <><AvatarStack people={assignees} size={22} max={5} /><span className="truncate">{assignees.map((a) => a.name).join(", ")}</span></> : <span>No assignees</span>}
                    <span>· created {s.leadDays} day{s.leadDays === 1 ? "" : "s"} ahead</span>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2 max-md:[&>button]:h-10">
                  <SeriesDialog people={activePeople} series={{ id: s.id, title: s.template.title, nextDueLocal: toLocalInput(s.nextDueAt, tz), endsOn: s.endsOn, assigneeIds: s.assigneeIds, timezone: tz }} />
                  {s.active ? (
                    <ConfirmAction trigger={<><Pause className="h-3.5 w-3.5" aria-hidden />Pause</>} variant="primary" title="Pause this schedule?" confirmLabel="Pause"
                      description="No new tasks will be created until you resume it. Existing tasks aren't affected." action={setSeriesActiveAction.bind(null, s.id, false)} />
                  ) : (
                    <ConfirmAction trigger={<><Play className="h-3.5 w-3.5" aria-hidden />Resume</>} variant="primary" title="Resume this schedule?" confirmLabel="Resume"
                      description="If due dates passed while it was paused, those occurrences are skipped and the schedule picks up with the next future date."
                      action={setSeriesActiveAction.bind(null, s.id, true)} />
                  )}
                  <ConfirmAction trigger={<><Trash2 className="h-3.5 w-3.5" aria-hidden /><span className="sr-only sm:not-sr-only">Delete</span></>} triggerVariant="ghost"
                    title="Delete this recurring task?" confirmLabel="Delete schedule"
                    description="The schedule stops for good. Tasks it already created are kept." action={deleteSeriesAction.bind(null, s.id)} />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
