import { test } from "node:test";
import assert from "node:assert/strict";
import {
  checkInReasons, computeMemberMetrics, fmtRate, lastWeeks, monthPeriod, onTimeOutcome, sumMetrics, teamOnTime, weekPeriod,
  type MetricReview, type MetricTask, type Period,
} from "../../src/server/metrics";

const d = (s: string) => new Date(s);
const P: Period = { start: d("2026-11-02T05:00:00Z"), end: d("2026-11-09T05:00:00Z") }; // Mon–Mon, America/New_York
const NOW = d("2026-11-06T17:00:00Z");
const A = "member-a", B = "member-b";

let n = 0;
function task(p: Partial<MetricTask>): MetricTask {
  return { id: `t${++n}`, status: "not_started", dueAt: null, firstSubmittedAt: null, completedAt: null, assigneeIds: [A], ...p };
}

test("assigned counts tasks due in the period, excluding canceled; excused are counted separately", () => {
  const tasks = [
    task({ dueAt: d("2026-11-03T12:00:00Z") }),
    task({ dueAt: d("2026-11-04T12:00:00Z"), status: "canceled" }),
    task({ dueAt: d("2026-11-05T12:00:00Z"), status: "excused" }),
    task({ dueAt: d("2026-11-12T12:00:00Z") }), // next week
    task({ dueAt: d("2026-11-09T05:00:00Z") }), // exactly at end → outside (half-open)
    task({ dueAt: d("2026-11-02T05:00:00Z") }), // exactly at start → inside
    task({ dueAt: d("2026-11-03T12:00:00Z"), assigneeIds: [B] }),
  ];
  const m = computeMemberMetrics(A, tasks, [], P, NOW);
  assert.equal(m.assigned, 3);
  assert.equal(m.excused, 1);
});

test("on-time compares first submission to the deadline in effect, ignoring review time", () => {
  const tasks = [
    // submitted on time, approved much later by reviewer → still on time
    task({ dueAt: d("2026-11-03T23:00:00Z"), firstSubmittedAt: d("2026-11-03T22:00:00Z"), status: "approved", completedAt: d("2026-11-08T10:00:00Z") }),
    // submitted exactly at the deadline → on time
    task({ dueAt: d("2026-11-04T23:00:00Z"), firstSubmittedAt: d("2026-11-04T23:00:00Z"), status: "submitted" }),
    // late
    task({ dueAt: d("2026-11-05T12:00:00Z"), firstSubmittedAt: d("2026-11-05T13:00:00Z"), status: "under_review" }),
    // extension already applied to dueAt → on time against the new deadline
    task({ dueAt: d("2026-11-07T12:00:00Z"), firstSubmittedAt: d("2026-11-06T12:00:00Z"), status: "revision_requested" }),
    // not submitted yet → not in denominator
    task({ dueAt: d("2026-11-05T12:00:00Z"), status: "in_progress" }),
    // excused / canceled / blocked → excluded even if submitted
    task({ dueAt: d("2026-11-05T12:00:00Z"), firstSubmittedAt: d("2026-11-06T12:00:00Z"), status: "excused" }),
    task({ dueAt: d("2026-11-05T12:00:00Z"), firstSubmittedAt: d("2026-11-06T12:00:00Z"), status: "canceled" }),
    task({ dueAt: d("2026-11-05T12:00:00Z"), firstSubmittedAt: d("2026-11-06T12:00:00Z"), status: "blocked" }),
  ];
  const m = computeMemberMetrics(A, tasks, [], P, NOW);
  assert.equal(m.onTimeEligible, 4);
  assert.equal(m.onTime, 3);
  assert.equal(m.onTimeRate, 0.75);
  assert.equal(fmtRate(m.onTimeRate), "75%");
});

test("on-time rate is null (shown as —) when nothing can be measured", () => {
  const m = computeMemberMetrics(A, [task({ dueAt: d("2026-11-03T12:00:00Z") })], [], P, NOW);
  assert.equal(m.onTimeEligible, 0);
  assert.equal(m.onTimeRate, null);
  assert.equal(fmtRate(m.onTimeRate), "—");
});

test("approved counts by completion time, not due date", () => {
  const tasks = [
    task({ status: "approved", dueAt: d("2026-10-20T12:00:00Z"), completedAt: d("2026-11-03T12:00:00Z") }),
    task({ status: "approved", dueAt: d("2026-11-03T12:00:00Z"), completedAt: d("2026-10-30T12:00:00Z") }),
    task({ status: "submitted", dueAt: d("2026-11-03T12:00:00Z"), completedAt: null }),
  ];
  assert.equal(computeMemberMetrics(A, tasks, [], P, NOW).approved, 1);
});

test("revisions requested counts revision reviews in the period on the member's tasks", () => {
  const mineT = task({ dueAt: d("2026-11-03T12:00:00Z") });
  const otherT = task({ dueAt: d("2026-11-03T12:00:00Z"), assigneeIds: [B] });
  const reviews: MetricReview[] = [
    { taskId: mineT.id, decision: "revision_requested", createdAt: d("2026-11-04T12:00:00Z") },
    { taskId: mineT.id, decision: "revision_requested", createdAt: d("2026-11-05T12:00:00Z") },
    { taskId: mineT.id, decision: "approved", createdAt: d("2026-11-06T12:00:00Z") },
    { taskId: mineT.id, decision: "revision_requested", createdAt: d("2026-10-01T12:00:00Z") },
    { taskId: otherT.id, decision: "revision_requested", createdAt: d("2026-11-04T12:00:00Z") },
  ];
  assert.equal(computeMemberMetrics(A, [mineT, otherT], reviews, P, NOW).revisions, 2);
});

test("snapshots: overdue only for work still owed; awaiting review is never overdue", () => {
  const tasks = [
    task({ status: "not_started", dueAt: d("2026-11-01T12:00:00Z") }),
    task({ status: "revision_requested", dueAt: d("2026-11-05T12:00:00Z") }),
    task({ status: "blocked", dueAt: d("2026-11-05T12:00:00Z") }),
    task({ status: "in_progress", dueAt: d("2026-11-20T12:00:00Z") }),
    task({ status: "in_progress", dueAt: null }),
    task({ status: "submitted", dueAt: d("2026-11-01T12:00:00Z") }),
    task({ status: "under_review", dueAt: d("2026-11-01T12:00:00Z") }),
    task({ status: "approved", dueAt: d("2026-11-01T12:00:00Z") }),
  ];
  const m = computeMemberMetrics(A, tasks, [], P, NOW);
  assert.equal(m.overdueNow, 3);
  assert.equal(m.openWorkload, 5);
  assert.equal(m.awaitingReview, 2);
  assert.equal(m.active, 7);
});

test("totals add each member's assignments; team on-time is assignment-weighted", () => {
  const shared = task({ dueAt: d("2026-11-03T12:00:00Z"), firstSubmittedAt: d("2026-11-03T10:00:00Z"), status: "submitted", assigneeIds: [A, B] });
  const lateB = task({ dueAt: d("2026-11-03T12:00:00Z"), firstSubmittedAt: d("2026-11-04T10:00:00Z"), status: "submitted", assigneeIds: [B] });
  const tasks = [shared, lateB];
  const a = computeMemberMetrics(A, tasks, [], P, NOW);
  const b = computeMemberMetrics(B, tasks, [], P, NOW);
  const total = sumMetrics([a, b]);
  assert.equal(total.assigned, 3);
  assert.equal(total.onTime, 2);
  assert.equal(total.onTimeEligible, 3);
  const team = teamOnTime(tasks, P);
  assert.deepEqual([team.onTime, team.eligible], [2, 3]);
  assert.equal(teamOnTime(tasks, P, new Set([A])).eligible, 1);
  assert.equal(onTimeOutcome(lateB, P), "late");
});

test("check-in signal requires objective conditions", () => {
  const base = computeMemberMetrics(A, [], [], P, NOW);
  assert.deepEqual(checkInReasons(base), []);
  assert.equal(checkInReasons({ ...base, overdueNow: 1 }).length, 0);
  assert.equal(checkInReasons({ ...base, overdueNow: 2 }).length, 1);
  // low rate but too few tasks → no signal
  assert.equal(checkInReasons({ ...base, onTime: 0, onTimeEligible: 2, onTimeRate: 0 }).length, 0);
  assert.equal(checkInReasons({ ...base, onTime: 1, onTimeEligible: 3, onTimeRate: 1 / 3 }).length, 1);
  assert.equal(checkInReasons({ ...base, onTime: 2, onTimeEligible: 3, onTimeRate: 2 / 3 }).length, 0);
});

test("weeks start Monday in America/New_York, including across DST", () => {
  const tz = "America/New_York";
  // Friday Nov 6 2026, 12:00 ET
  const w = weekPeriod(d("2026-11-06T17:00:00Z"), tz);
  assert.equal(w.start.toISOString(), "2026-11-02T05:00:00.000Z"); // Mon Nov 2 00:00 EST
  assert.equal(w.end.toISOString(), "2026-11-09T05:00:00.000Z");
  // Sunday night 11pm ET still belongs to the week that started Monday
  const sun = weekPeriod(d("2026-11-09T04:00:00Z"), tz);
  assert.equal(sun.start.toISOString(), "2026-11-02T05:00:00.000Z");
  // Week containing the Nov 1 2026 DST change starts Mon Oct 26 00:00 EDT
  const dst = weekPeriod(d("2026-10-29T12:00:00Z"), tz);
  assert.equal(dst.start.toISOString(), "2026-10-26T04:00:00.000Z");
  assert.equal(dst.end.toISOString(), "2026-11-02T05:00:00.000Z");
  const prev = weekPeriod(d("2026-11-06T17:00:00Z"), tz, -1);
  assert.equal(prev.start.toISOString(), dst.start.toISOString());
  const weeks = lastWeeks(d("2026-11-06T17:00:00Z"), tz, 8);
  assert.equal(weeks.length, 8);
  assert.equal(weeks[7].start.toISOString(), w.start.toISOString());
  for (let i = 1; i < 8; i++) assert.equal(weeks[i].start.toISOString(), weeks[i - 1].end.toISOString());
});

test("month periods are calendar months in the org timezone", () => {
  const tz = "America/New_York";
  const m = monthPeriod(d("2026-11-06T17:00:00Z"), tz);
  assert.equal(m.start.toISOString(), "2026-11-01T04:00:00.000Z"); // Nov 1 00:00 EDT
  assert.equal(m.end.toISOString(), "2026-12-01T05:00:00.000Z");
  const prev = monthPeriod(d("2026-11-06T17:00:00Z"), tz, -1);
  assert.equal(prev.start.toISOString(), "2026-10-01T04:00:00.000Z");
  assert.equal(prev.end.toISOString(), m.start.toISOString());
});
