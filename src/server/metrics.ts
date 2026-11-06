/**
 * Member & team metrics.
 *
 * The math lives in pure functions over plain arrays (no DB, no server-only imports) so it can be
 * unit-tested directly. `loadMetricInputs` (bottom) fetches those arrays from Postgres.
 *
 * Definitions (also shown to admins in "How these numbers work"):
 * - Assigned: tasks assigned to the member with a due date inside the period, excluding canceled.
 * - Excused: tasks in that set with status "excused" — never counted against anyone.
 * - Approved: tasks with status "approved" whose completion time falls in the period.
 * - On-time rate: among tasks due in the period that were submitted (firstSubmittedAt set) and are not
 *   excused, canceled or currently blocked — the share first submitted at or before tasks.dueAt (which
 *   already includes approved extensions). Reviewer delay never counts: we measure submission, not approval.
 * - Revisions requested: reviews with decision "revision_requested" recorded in the period on their tasks.
 * - Overdue now / awaiting review / open workload: snapshots at `now`.
 */
import { addDays, addMonths, addWeeks, startOfMonth, startOfWeek } from "date-fns";
import { formatInTimeZone, fromZonedTime, toZonedTime } from "date-fns-tz";

export type MetricStatus =
  | "not_started" | "in_progress" | "submitted" | "under_review" | "revision_requested" | "approved" | "canceled" | "excused" | "blocked";

export type MetricTask = {
  id: string;
  status: MetricStatus;
  dueAt: Date | null;
  firstSubmittedAt: Date | null;
  completedAt: Date | null;
  assigneeIds: string[];
};
export type MetricReview = { taskId: string; decision: "approved" | "revision_requested"; createdAt: Date };
/** Half-open interval [start, end). */
export type Period = { start: Date; end: Date };

export type MemberMetrics = {
  assigned: number;
  excused: number;
  approved: number;
  onTime: number;
  onTimeEligible: number;
  /** 0..1, or null when nothing in the period could be measured. */
  onTimeRate: number | null;
  revisions: number;
  overdueNow: number;
  awaitingReview: number;
  /** Tasks the member still owes work on (not started, in progress, revision requested, blocked). */
  openWorkload: number;
  /** Open workload + tasks awaiting review. */
  active: number;
};

const OPEN: MetricStatus[] = ["not_started", "in_progress", "revision_requested", "blocked"];
const AWAITING: MetricStatus[] = ["submitted", "under_review"];

const inPeriod = (d: Date | null, p: Period) => !!d && d.getTime() >= p.start.getTime() && d.getTime() < p.end.getTime();

/** Whether a single task counts toward the on-time denominator, and whether it was on time. */
export function onTimeOutcome(t: MetricTask, p: Period): "on_time" | "late" | null {
  if (!inPeriod(t.dueAt, p)) return null;
  if (t.status === "excused" || t.status === "canceled" || t.status === "blocked") return null;
  if (!t.firstSubmittedAt) return null;
  return t.firstSubmittedAt.getTime() <= t.dueAt!.getTime() ? "on_time" : "late";
}

export function rate(n: number, d: number): number | null {
  return d > 0 ? n / d : null;
}

export function computeMemberMetrics(memberId: string, tasks: MetricTask[], reviews: MetricReview[], p: Period, now: Date): MemberMetrics {
  const mine = tasks.filter((t) => t.assigneeIds.includes(memberId));
  const mineIds = new Set(mine.map((t) => t.id));
  const m: MemberMetrics = {
    assigned: 0, excused: 0, approved: 0, onTime: 0, onTimeEligible: 0, onTimeRate: null, revisions: 0,
    overdueNow: 0, awaitingReview: 0, openWorkload: 0, active: 0,
  };
  for (const t of mine) {
    if (inPeriod(t.dueAt, p) && t.status !== "canceled") {
      m.assigned++;
      if (t.status === "excused") m.excused++;
    }
    if (t.status === "approved" && inPeriod(t.completedAt, p)) m.approved++;
    const o = onTimeOutcome(t, p);
    if (o) { m.onTimeEligible++; if (o === "on_time") m.onTime++; }
    if (OPEN.includes(t.status)) {
      m.openWorkload++;
      if (t.dueAt && t.dueAt.getTime() < now.getTime()) m.overdueNow++;
    }
    if (AWAITING.includes(t.status)) m.awaitingReview++;
  }
  m.active = m.openWorkload + m.awaitingReview;
  m.revisions = reviews.filter((r) => r.decision === "revision_requested" && mineIds.has(r.taskId) && inPeriod(r.createdAt, p)).length;
  m.onTimeRate = rate(m.onTime, m.onTimeEligible);
  return m;
}

/** Sums member rows. Shared tasks count once per assignee, matching the per-member rows above it. */
export function sumMetrics(rows: MemberMetrics[]): MemberMetrics {
  const t: MemberMetrics = {
    assigned: 0, excused: 0, approved: 0, onTime: 0, onTimeEligible: 0, onTimeRate: null, revisions: 0,
    overdueNow: 0, awaitingReview: 0, openWorkload: 0, active: 0,
  };
  for (const r of rows) {
    t.assigned += r.assigned; t.excused += r.excused; t.approved += r.approved; t.onTime += r.onTime; t.onTimeEligible += r.onTimeEligible;
    t.revisions += r.revisions; t.overdueNow += r.overdueNow; t.awaitingReview += r.awaitingReview; t.openWorkload += r.openWorkload; t.active += r.active;
  }
  t.onTimeRate = rate(t.onTime, t.onTimeEligible);
  return t;
}

/** Team on-time rate for a period, counted per assignment (same basis as the totals row). */
export function teamOnTime(tasks: MetricTask[], p: Period, memberIds?: Set<string>) {
  let onTime = 0, eligible = 0;
  for (const t of tasks) {
    const o = onTimeOutcome(t, p);
    if (!o) continue;
    const n = memberIds ? t.assigneeIds.filter((id) => memberIds.has(id)).length : t.assigneeIds.length;
    eligible += n;
    if (o === "on_time") onTime += n;
  }
  return { onTime, eligible, rate: rate(onTime, eligible) };
}

/**
 * Objective, supportive signal for admins. Never triggers anything automatically.
 * Returns the reasons (empty = no indicator).
 */
export function checkInReasons(m: MemberMetrics): string[] {
  const reasons: string[] = [];
  if (m.overdueNow >= 2) reasons.push(`${m.overdueNow} assignments are currently past due`);
  if (m.onTimeEligible >= 3 && m.onTimeRate !== null && m.onTimeRate < 0.6)
    reasons.push(`${m.onTime} of ${m.onTimeEligible} submissions this period arrived by the deadline`);
  return reasons;
}

export function fmtRate(r: number | null) {
  return r === null ? "—" : `${Math.round(r * 100)}%`;
}

/* ───────── Periods (timezone-aware, weeks start Monday) ───────── */

export type PeriodKind = "week" | "month";

export function weekPeriod(now: Date, tz: string, offset = 0): Period {
  const z = toZonedTime(now, tz);
  const startZ = addWeeks(startOfWeek(z, { weekStartsOn: 1 }), offset);
  return { start: fromZonedTime(startZ, tz), end: fromZonedTime(addWeeks(startZ, 1), tz) };
}

export function monthPeriod(now: Date, tz: string, offset = 0): Period {
  const z = toZonedTime(now, tz);
  const startZ = addMonths(startOfMonth(z), offset);
  return { start: fromZonedTime(startZ, tz), end: fromZonedTime(addMonths(startZ, 1), tz) };
}

/** Rolling window ending now, e.g. last 30 days. */
export function rollingPeriod(now: Date, days: number): Period {
  return { start: addDays(now, -days), end: new Date(now.getTime() + 1) };
}

export function periodLabel(kind: PeriodKind, p: Period, tz: string) {
  if (kind === "month") return formatInTimeZone(p.start, tz, "MMMM yyyy");
  const last = new Date(p.end.getTime() - 1);
  const sameMonth = formatInTimeZone(p.start, tz, "MMM") === formatInTimeZone(last, tz, "MMM");
  return `${formatInTimeZone(p.start, tz, "MMM d")} – ${formatInTimeZone(last, tz, sameMonth ? "d, yyyy" : "MMM d, yyyy")}`;
}

/** The last `n` weeks, oldest first, ending with the current week. */
export function lastWeeks(now: Date, tz: string, n: number): Period[] {
  return Array.from({ length: n }, (_, i) => weekPeriod(now, tz, i - (n - 1)));
}
