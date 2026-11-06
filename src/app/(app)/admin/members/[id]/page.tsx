import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft, Mail, CheckCircle2, ClipboardList, Clock3, AlertTriangle, Inbox, RotateCcw, CircleSlash, Layers, Hourglass, ShieldCheck,
  HeartHandshake, Plus, ListChecks, Settings2,
} from "lucide-react";
import { requireAdmin } from "@/server/auth";
import { getSettings } from "@/server/settings";
import { loadTasks } from "@/server/queries";
import { audit } from "@/server/audit";
import { accountabilityList, extensionHistory, getMember, lastEventBy, loadMetricInputs, todayIn } from "@/server/admin";
import { checkInReasons, computeMemberMetrics, fmtRate, monthPeriod, rollingPeriod, weekPeriod, type Period } from "@/server/metrics";
import { Card, CardHeader } from "@/components/ui/card";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { StatCard } from "@/components/ui/stat";
import { Tabs } from "@/components/ui/tabs";
import { EmptyState } from "@/components/ui/empty-state";
import { TaskRow } from "@/components/tasks/task-bits";
import { AccountabilityDialog, PrivateNotice } from "@/components/admin/accountability-dialog";
import { AccountabilityList } from "@/components/admin/accountability-list";
import { ago, fmtDate, fmtDateTime } from "@/lib/dates";
import { ACTIVE, AWAITING_REVIEW, isOverdue, ROLE_LABEL } from "@/lib/task-meta";

export const metadata = { title: "Member profile" };

const PERIODS = { week: "This week", month: "This month", "30d": "Last 30 days", "90d": "Last 90 days" } as const;
type PeriodKey = keyof typeof PERIODS;
const VIEWS = { active: "Active", overdue: "Overdue", review: "Awaiting review", completed: "Completed" } as const;
type ViewKey = keyof typeof VIEWS;
const EXT_TONE = { pending: "violet", approved: "green", declined: "neutral", withdrawn: "muted" } as const;

export default async function MemberProfilePage({ params, searchParams }: {
  params: Promise<{ id: string }>; searchParams: Promise<{ period?: string; view?: string }>;
}) {
  const me = await requireAdmin();
  const { id } = await params;
  const sp = await searchParams;
  const member = await getMember(id);
  if (!member) notFound();
  const s = await getSettings();
  const now = new Date();
  const tz = me.timezone;
  const periodKey: PeriodKey = sp.period && sp.period in PERIODS ? (sp.period as PeriodKey) : "month";
  const view: ViewKey = sp.view && sp.view in VIEWS ? (sp.view as ViewKey) : "active";
  const period: Period = periodKey === "week" ? weekPeriod(now, s.timezone) : periodKey === "month" ? monthPeriod(now, s.timezone)
    : rollingPeriod(now, periodKey === "30d" ? 30 : 90);

  const [inputs, allTasks, extensions, records, lastEv] = await Promise.all([
    loadMetricInputs(period.start, member.id),
    loadTasks(me, { scope: "all", memberId: member.id, view: "everything", limit: 2000 }),
    extensionHistory(member.id),
    accountabilityList({ memberId: member.id }),
    lastEventBy(member.id),
  ]);
  await audit(me.id, "accountability.view", "user", member.id, { page: "member_profile" });

  const m = computeMemberMetrics(member.id, inputs.tasks, inputs.reviews, period, now);
  const reasons = member.status === "active" ? checkInReasons(m) : [];
  const inView: Record<ViewKey, (t: (typeof allTasks)[number]) => boolean> = {
    active: (t) => ACTIVE.includes(t.status),
    overdue: (t) => isOverdue(t, now),
    review: (t) => AWAITING_REVIEW.includes(t.status),
    completed: (t) => t.status === "approved",
  };
  const countMap = Object.fromEntries((Object.keys(VIEWS) as ViewKey[]).map((k) => [k, allTasks.filter(inView[k]).length])) as Record<ViewKey, number>;
  const taskList = allTasks.filter(inView[view]);
  if (view === "completed") taskList.sort((a, b) => (b.completedAt?.getTime() ?? 0) - (a.completedAt?.getTime() ?? 0));
  const lastActivity = [member.lastSeenAt, lastEv].filter((x): x is Date => !!x).sort((a, b) => b.getTime() - a.getTime())[0] ?? null;
  const qs = (p: Partial<{ period: string; view: string }>) => `?${new URLSearchParams({ period: periodKey, view, ...p }).toString()}`;
  const firstName = member.name.split(" ")[0];

  return (
    <div className="space-y-6">
      <Link href="/admin" className="focus-ring inline-flex items-center gap-1.5 rounded text-sm font-medium text-muted hover:text-fg">
        <ArrowLeft className="h-4 w-4" aria-hidden />Command center
      </Link>

      <Card className="animate-in p-5 sm:p-6">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
          <Avatar name={member.name} fileId={member.avatarFileId} size={72} />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-[24px] leading-tight font-bold tracking-tight text-fg">{member.name}</h1>
              {member.status === "deactivated" && <Badge tone="muted">Deactivated</Badge>}
            </div>
            <p className="mt-0.5 text-[15px] text-fg-2">{member.title || ROLE_LABEL[member.role]}</p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Badge tone={member.role === "admin" ? "brand" : member.role === "leader" ? "violet" : "neutral"}>{ROLE_LABEL[member.role]}</Badge>
              {member.departmentName && (
                <Badge tone="neutral"><span className="h-2 w-2 rounded-full" style={{ background: member.departmentColor ?? undefined }} aria-hidden />{member.departmentName}</Badge>
              )}
              {member.status === "active" && <Badge tone="green" dot>Active</Badge>}
            </div>
            <dl className="mt-4 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2 lg:grid-cols-3">
              <div className="min-w-0"><dt className="text-xs text-muted">Email</dt>
                <dd className="truncate"><a href={`mailto:${member.email}`} className="focus-ring inline-flex items-center gap-1.5 rounded text-fg hover:text-brand-ink"><Mail className="h-3.5 w-3.5 shrink-0 text-muted" aria-hidden />{member.email}</a></dd>
              </div>
              <div><dt className="text-xs text-muted">Last activity</dt>
                <dd className="text-fg">{lastActivity ? <time dateTime={lastActivity.toISOString()} title={fmtDateTime(lastActivity, tz)}>{ago(lastActivity)}</time> : "Hasn't signed in yet"}</dd>
              </div>
              <div><dt className="text-xs text-muted">Member since</dt><dd className="text-fg">{fmtDate(member.createdAt, tz, "MMMM d, yyyy")}</dd></div>
            </dl>
            {member.responsibilities && <p className="prose-body mt-3 text-sm text-fg-2"><span className="font-semibold text-fg">Responsibilities: </span>{member.responsibilities}</p>}
          </div>
          <div className="flex flex-wrap gap-2 sm:flex-col sm:items-stretch">
            <ButtonLink href={`/tasks/all?view=everything&member=${member.id}`} variant="secondary" size="sm" className="max-md:h-10"><ListChecks className="h-4 w-4" aria-hidden />All their tasks</ButtonLink>
            <ButtonLink href={`/settings/members#member-${member.id}`} variant="ghost" size="sm" className="max-md:h-10"><Settings2 className="h-4 w-4" aria-hidden />Manage access</ButtonLink>
          </div>
        </div>
      </Card>

      {reasons.length > 0 && (
        <div className="flex items-start gap-3 rounded-[14px] border border-accent/50 bg-accent-soft px-4 py-3.5 sm:px-5" role="note">
          <HeartHandshake className="mt-0.5 h-5 w-5 shrink-0 text-accent-ink" aria-hidden />
          <div className="text-sm">
            <p className="font-semibold text-fg">{firstName} may benefit from a check-in</p>
            <p className="mt-0.5 text-fg-2">{reasons.join("; ")}. A friendly conversation about workload or blockers often helps. This note is only visible to administrators and never triggers anything on its own.</p>
          </div>
        </div>
      )}

      <section aria-labelledby="metrics-h" className="space-y-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h2 id="metrics-h" className="text-[15px] font-semibold text-fg">How things are going</h2>
          <Tabs active={periodKey} items={(Object.keys(PERIODS) as PeriodKey[]).map((k) => ({ key: k, label: PERIODS[k], href: qs({ period: k }) }))} />
        </div>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard label="Assigned" value={m.assigned} icon={ClipboardList} hint="Due in this period (canceled excluded)" />
          <StatCard label="Approved" value={m.approved} icon={CheckCircle2} tone="ok" hint="Approved during this period" />
          <StatCard label="On-time rate" value={fmtRate(m.onTimeRate)} icon={Clock3} tone="accent"
            hint={m.onTimeEligible ? `${m.onTime} of ${m.onTimeEligible} submitted by the deadline` : "Nothing submitted yet that's due in this period"} />
          <StatCard label="Revisions requested" value={m.revisions} icon={RotateCcw} tone="violet" hint="Reviewer asked for changes" />
          <StatCard label="Overdue now" value={m.overdueNow} icon={AlertTriangle} tone="warn" hint="Past due and still open, right now" />
          <StatCard label="Awaiting review" value={m.awaitingReview} icon={Inbox} tone="violet" hint="Submitted, waiting on a reviewer" />
          <StatCard label="Open workload" value={m.openWorkload} icon={Layers} hint="Assignments they're still working on" />
          <StatCard label="Excused" value={m.excused} icon={CircleSlash} hint="Excused tasks never count against anyone" />
        </div>
        <p className="text-xs text-muted">Snapshot numbers (overdue, awaiting review, open workload) are as of right now. <Link href="/admin/performance#how" className="focus-ring rounded font-semibold text-brand-ink hover:underline">How these numbers work</Link></p>
      </section>

      <Card>
        <CardHeader title="Assignments" description={`Tasks assigned to ${firstName}.`} />
        <div className="px-4 pb-3 sm:px-5">
          <Tabs active={view} items={(Object.keys(VIEWS) as ViewKey[]).map((k) => ({ key: k, label: VIEWS[k], href: qs({ view: k }), count: countMap[k] }))} />
        </div>
        {taskList.length === 0 ? (
          <EmptyState compact icon={ListChecks} title={view === "overdue" ? "Nothing overdue" : view === "review" ? "Nothing waiting for review" : view === "completed" ? "No approved tasks yet" : "No active assignments"}>
            {view === "overdue" ? `${firstName} is all caught up.` : undefined}
          </EmptyState>
        ) : (
          <div className="divide-y divide-line border-t border-line">{taskList.map((t) => <TaskRow key={t.id} t={t} showAssignees={false} />)}</div>
        )}
      </Card>

      <div className="grid gap-6 lg:grid-cols-5">
        <Card className="lg:col-span-2">
          <CardHeader title="Extension history" description="Requests for more time and how they were decided." />
          {extensions.length === 0 ? (
            <EmptyState compact icon={Hourglass} title="No extension requests" />
          ) : (
            <ul className="divide-y divide-line border-t border-line">
              {extensions.map((e) => (
                <li key={e.id} className="px-4 py-3 sm:px-5">
                  <div className="flex items-start justify-between gap-3">
                    <Link href={`/tasks/${e.taskId}`} className="focus-ring min-w-0 rounded font-medium text-fg hover:text-brand-ink">{e.title}</Link>
                    <Badge tone={EXT_TONE[e.status]}>{e.status[0].toUpperCase() + e.status.slice(1)}</Badge>
                  </div>
                  <p className="mt-1 text-xs text-muted">
                    {e.currentDueAt ? `${fmtDate(e.currentDueAt, e.timezone)} → ` : "New deadline "}{fmtDateTime(e.requestedDueAt, e.timezone)} · asked {fmtDate(e.createdAt, tz)}
                  </p>
                  <p className="mt-1 line-clamp-2 text-sm text-fg-2">{e.reason}</p>
                  {e.decisionNote && <p className="mt-1 text-xs text-muted">Note: {e.decisionNote}</p>}
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="lg:col-span-3">
          <CardHeader title={<span className="inline-flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-muted" aria-hidden />Accountability records</span>}
            description="Coaching notes, follow-ups and plans for this member."
            action={<AccountabilityDialog memberId={member.id} trigger={<><Plus className="h-4 w-4" aria-hidden />Add</>} triggerVariant="primary" />} />
          <div className="px-4 pb-3 sm:px-5"><PrivateNotice /></div>
          {records.length === 0 ? (
            <EmptyState compact title="No records">Nothing has been documented for {firstName}. Most check-ins don&apos;t need a record at all.</EmptyState>
          ) : (
            <div className="border-t border-line"><AccountabilityList rows={records} today={todayIn(s.timezone, now)} tz={tz} /></div>
          )}
        </Card>
      </div>
    </div>
  );
}
