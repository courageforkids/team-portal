import Link from "next/link";
import {
  Users, ClipboardList, CheckCircle2, Inbox, AlertTriangle, CalendarClock, Hourglass, ChevronRight, Plus, Activity, CalendarCheck, FileCheck2,
} from "lucide-react";
import { requireAdmin } from "@/server/auth";
import { getSettings } from "@/server/settings";
import { loadTasks } from "@/server/queries";
import { activityFeed, departmentActivity, describeEvent, overviewCounts, recentSubmissions, teamOverview } from "@/server/admin";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardHeader } from "@/components/ui/card";
import { StatCard } from "@/components/ui/stat";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { TaskRow, StatusBadge } from "@/components/tasks/task-bits";
import { SegmentBar } from "@/components/admin/charts";
import { cn } from "@/lib/cn";
import { ago, dueLabel, fmtDateTime } from "@/lib/dates";
import { OPEN_FOR_ASSIGNEE, ROLE_LABEL } from "@/lib/task-meta";

export const metadata = { title: "Command center" };

export default async function CommandCenterPage() {
  const me = await requireAdmin();
  const s = await getSettings();
  const now = new Date();
  const tz = me.timezone;
  const [counts, subs, upcomingRaw, depts, feed, team] = await Promise.all([
    overviewCounts(now, s.timezone), recentSubmissions(8),
    loadTasks(me, { scope: "all", view: "active", dueFrom: now, limit: 40 }),
    departmentActivity(now), activityFeed(10), teamOverview(now),
  ]);
  const upcoming = upcomingRaw.filter((t) => OPEN_FOR_ASSIGNEE.includes(t.status)).slice(0, 10);
  const deptMax = Math.max(1, ...depts.map((d) => d.open + d.completed));

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Executive" title="Command center" description="A calm, current view of the team's work — what's moving, what's waiting, and who might need a hand."
        actions={<>
          <ButtonLink href="/review" variant="secondary"><Inbox className="h-4 w-4" aria-hidden />Review center</ButtonLink>
          <ButtonLink href="/tasks/new"><Plus className="h-4 w-4" aria-hidden />New task</ButtonLink>
        </>} />

      <section aria-label="Overview" className="grid grid-cols-2 gap-3 lg:grid-cols-12">
        <div className="col-span-2 lg:col-span-3"><StatCard label="Active team members" value={counts.members} icon={Users} href="/team" hint="People with portal access" /></div>
        <div className="lg:col-span-3"><StatCard label="Open assignments" value={counts.open} icon={ClipboardList} href="/tasks/all?view=active" hint="In progress or awaiting review" /></div>
        <div className="lg:col-span-3"><StatCard label="Completed this week" value={counts.completedWeek} icon={CheckCircle2} tone="ok" href="/tasks/all?view=completed" hint="Approved since Monday" /></div>
        <div className="lg:col-span-3"><StatCard label="Awaiting approval" value={counts.awaiting} icon={Inbox} tone="violet" href="/review" hint="Submitted or under review" /></div>
        <div className="lg:col-span-4"><StatCard label="Overdue" value={counts.overdue} icon={AlertTriangle} tone="warn" href="/tasks/all?view=overdue" hint="Past due and still open" /></div>
        <div className="lg:col-span-4"><StatCard label="Due in next 7 days" value={counts.dueSoon} icon={CalendarClock} tone="accent" href="/tasks/all?view=active" hint="Still being worked on" /></div>
        <div className="col-span-2 lg:col-span-4"><StatCard label="Extension requests" value={counts.pendingExtensions} icon={Hourglass} href="/review?tab=extensions" hint="Waiting for a decision" /></div>
      </section>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader title="Recent submissions" description="The latest work turned in by the team."
              action={<Link href="/review" className="focus-ring rounded text-[13px] font-semibold text-brand-ink hover:underline">Review center</Link>} />
            {subs.length === 0 ? (
              <EmptyState compact icon={FileCheck2} title="No submissions yet">Submitted work will show up here as soon as it&apos;s turned in.</EmptyState>
            ) : (
              <ul className="divide-y divide-line border-t border-line">
                {subs.map((x) => {
                  const late = !!x.dueAtSubmission && x.submittedAt > x.dueAtSubmission;
                  return (
                    <li key={x.id}>
                      <Link href={`/review?task=${x.taskId}`} className="focus-ring group flex items-center gap-3 px-4 py-3 transition hover:bg-surface-2 sm:px-5">
                        <Avatar name={x.by ?? "Former member"} fileId={x.byAvatar} size={32} />
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-medium text-fg group-hover:text-brand-ink">{x.title}</p>
                          <p className="mt-0.5 text-xs text-muted">
                            {x.by ?? "Former member"}{x.version > 1 ? ` · revision ${x.version}` : ""} · {fmtDateTime(x.submittedAt, tz)}
                            {late && <span className="text-warn"> · after the deadline</span>}
                          </p>
                        </div>
                        <span className="shrink-0"><StatusBadge status={x.status} /></span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>

          <Card>
            <CardHeader title="Upcoming deadlines" description="The next 10 assignments still being worked on."
              action={<Link href="/tasks/all?view=active" className="focus-ring rounded text-[13px] font-semibold text-brand-ink hover:underline">All tasks</Link>} />
            {upcoming.length === 0 ? (
              <EmptyState compact icon={CalendarCheck} title="Nothing due soon">No open assignments have an upcoming deadline.</EmptyState>
            ) : (
              <div className="divide-y divide-line border-t border-line">{upcoming.map((t) => <TaskRow key={t.id} t={t} />)}</div>
            )}
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader title="Department activity" description="Open and overdue now; completed in the last 30 days." />
            {depts.length === 0 ? (
              <EmptyState compact title="No departments yet" action={<ButtonLink href="/settings/departments" size="sm" variant="secondary">Add a department</ButtonLink>} />
            ) : (
              <div className="border-t border-line px-4 pb-4 sm:px-5">
                <table className="w-full text-sm">
                  <caption className="sr-only">Department activity: open, overdue, and completed in the last 30 days</caption>
                  <thead>
                    <tr className="text-left text-[11px] font-semibold tracking-wide text-muted uppercase">
                      <th scope="col" className="py-2.5 font-semibold">Department</th>
                      <th scope="col" className="w-14 py-2.5 pl-2 text-right font-semibold">Open</th>
                      <th scope="col" className="w-14 py-2.5 pl-2 text-right font-semibold">Overdue</th>
                      <th scope="col" className="w-14 py-2.5 pl-2 text-right font-semibold">Done</th>
                    </tr>
                  </thead>
                  <tbody>
                    {depts.map((d) => (
                      <tr key={d.id} className="border-t border-line align-top">
                        <th scope="row" className="py-2.5 pr-2 text-left font-medium">
                          <Link href={`/tasks/all?view=active&dept=${d.id}`} className="focus-ring inline-flex items-center gap-2 rounded text-fg hover:text-brand-ink">
                            <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: d.color }} aria-hidden />{d.name}
                          </Link>
                          <div className="mt-1.5">
                            <SegmentBar max={deptMax} parts={[
                              { value: d.open - d.overdue, className: "bg-brand" },
                              { value: d.overdue, className: "bg-warn" },
                              { value: d.completed, className: "bg-ok" },
                            ]} />
                          </div>
                        </th>
                        <td className="py-2.5 pl-2 text-right tabular-nums text-fg-2">{d.open}</td>
                        <td className={cn("py-2.5 pl-2 text-right tabular-nums", d.overdue ? "font-semibold text-warn" : "text-muted")}>{d.overdue}</td>
                        <td className="py-2.5 pl-2 text-right tabular-nums text-fg-2">{d.completed}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted" aria-hidden>
                  <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-brand" />Open</span>
                  <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-warn" />Overdue</span>
                  <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-ok" />Completed (30 days)</span>
                </div>
              </div>
            )}
          </Card>

          <Card>
            <CardHeader title="Recent activity" description="Latest updates across all tasks." />
            {feed.length === 0 ? (
              <EmptyState compact icon={Activity} title="Quiet so far">Task updates will appear here.</EmptyState>
            ) : (
              <ol className="space-y-3.5 border-t border-line px-4 py-4 sm:px-5">
                {feed.map((e) => (
                  <li key={e.id} className="flex gap-3">
                    <Avatar name={e.actor ?? "Portal"} fileId={e.actorAvatar} size={28} />
                    <div className="min-w-0 text-sm">
                      <p className="text-fg-2">
                        <span className="font-semibold text-fg">{e.actor ?? "The portal"}</span> {describeEvent(e.kind, e.detail)}{" "}
                        <Link href={`/tasks/${e.taskId}`} className="focus-ring rounded font-medium text-fg hover:text-brand-ink hover:underline">{e.title}</Link>
                      </p>
                      <p className="mt-0.5 text-xs text-muted"><time dateTime={e.createdAt.toISOString()} title={fmtDateTime(e.createdAt, tz)}>{ago(e.createdAt)}</time></p>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </Card>
        </div>
      </div>

      <Card>
        <CardHeader title="Team overview" description="Everyone on the team, alphabetically. Select a member for their full profile."
          action={<Link href="/admin/performance" className="focus-ring rounded text-[13px] font-semibold text-brand-ink hover:underline">Performance</Link>} />
        {team.length === 0 ? (
          <EmptyState compact icon={Users} title="No active members" action={<ButtonLink href="/settings/invitations" size="sm">Invite someone</ButtonLink>} />
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden border-t border-line md:block">
              <table className="w-full text-sm">
                <caption className="sr-only">Team overview</caption>
                <thead className="bg-surface-2/60">
                  <tr className="text-left text-[11px] font-semibold tracking-wide text-muted uppercase">
                    <th scope="col" className="px-5 py-2.5 font-semibold">Member</th>
                    <th scope="col" className="px-3 py-2.5 text-right font-semibold">Active</th>
                    <th scope="col" className="px-3 py-2.5 text-right font-semibold">Completed <span className="normal-case">(30d)</span></th>
                    <th scope="col" className="px-3 py-2.5 text-right font-semibold">Overdue</th>
                    <th scope="col" className="px-3 py-2.5 text-right font-semibold">In review</th>
                    <th scope="col" className="px-3 py-2.5 font-semibold">Last activity</th>
                    <th scope="col" className="px-3 py-2.5 font-semibold">Next deadline</th>
                    <th scope="col" className="w-8 px-3 py-2.5"><span className="sr-only">Open profile</span></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {team.map((m) => (
                    <tr key={m.id} className="group relative transition hover:bg-surface-2">
                      <th scope="row" className="px-5 py-3 text-left font-normal">
                        <Link href={`/admin/members/${m.id}`} className="focus-ring flex items-center gap-3 rounded-md after:absolute after:inset-0">
                          <Avatar name={m.name} fileId={m.avatarFileId} size={34} />
                          <span className="min-w-0">
                            <span className="block truncate font-semibold text-fg group-hover:text-brand-ink">{m.name}</span>
                            <span className="block truncate text-xs text-muted">{m.title || ROLE_LABEL[m.role]}</span>
                          </span>
                        </Link>
                      </th>
                      <td className="px-3 py-3 text-right tabular-nums text-fg-2">{m.active}</td>
                      <td className="px-3 py-3 text-right tabular-nums text-fg-2">{m.completed30}</td>
                      <td className={cn("px-3 py-3 text-right tabular-nums", m.overdue ? "font-semibold text-warn" : "text-muted")}>{m.overdue}</td>
                      <td className="px-3 py-3 text-right tabular-nums text-fg-2">{m.awaitingReview}</td>
                      <td className="px-3 py-3 text-muted">{m.lastActivity ? ago(m.lastActivity) : "Not yet"}</td>
                      <td className="px-3 py-3 text-fg-2">{m.nextDue ? dueLabel(m.nextDue, m.nextDueTz ?? tz) : <span className="text-muted">—</span>}</td>
                      <td className="px-3 py-3 text-faint"><ChevronRight className="h-4 w-4 transition group-hover:translate-x-0.5" aria-hidden /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {/* Mobile cards */}
            <ul className="divide-y divide-line border-t border-line md:hidden">
              {team.map((m) => (
                <li key={m.id}>
                  <Link href={`/admin/members/${m.id}`} className="focus-ring block px-4 py-3.5 transition hover:bg-surface-2">
                    <div className="flex items-center gap-3">
                      <Avatar name={m.name} fileId={m.avatarFileId} size={38} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-semibold text-fg">{m.name}</p>
                        <p className="truncate text-xs text-muted">{m.title || ROLE_LABEL[m.role]}</p>
                      </div>
                      {m.overdue > 0 && <Badge tone="amber">{m.overdue} overdue</Badge>}
                      <ChevronRight className="h-4 w-4 shrink-0 text-faint" aria-hidden />
                    </div>
                    <dl className="mt-3 grid grid-cols-3 gap-2 text-center">
                      <div className="rounded-lg bg-surface-2 px-2 py-1.5"><dt className="text-[11px] text-muted">Active</dt><dd className="font-semibold tabular-nums">{m.active}</dd></div>
                      <div className="rounded-lg bg-surface-2 px-2 py-1.5"><dt className="text-[11px] text-muted">Done (30d)</dt><dd className="font-semibold tabular-nums">{m.completed30}</dd></div>
                      <div className="rounded-lg bg-surface-2 px-2 py-1.5"><dt className="text-[11px] text-muted">In review</dt><dd className="font-semibold tabular-nums">{m.awaitingReview}</dd></div>
                    </dl>
                    <p className="mt-2 flex flex-wrap gap-x-3 text-xs text-muted">
                      <span>Active {m.lastActivity ? ago(m.lastActivity) : "— not yet"}</span>
                      {m.nextDue && <span>· Next: {dueLabel(m.nextDue, m.nextDueTz ?? tz)}</span>}
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
          </>
        )}
      </Card>
    </div>
  );
}
