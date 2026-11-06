import "server-only";
import { and, asc, desc, eq, gte, inArray, isNotNull, lt, or, sql } from "drizzle-orm";
import { addDays } from "date-fns";
import { db } from "@/db";
import {
  accountabilityRecords, departments, extensionRequests, reviews, submissions, taskAssignees, taskEvents, tasks, users,
} from "@/db/schema";
import { ACTIVE, AWAITING_REVIEW, OPEN_FOR_ASSIGNEE, STATUS_LABEL, type TaskStatus } from "@/lib/task-meta";
import { weekPeriod, type MetricReview, type MetricTask } from "./metrics";

/* ───────── Metric inputs ───────── */

/**
 * Loads every task that can affect metrics from `since` onward (plus all currently-active tasks for
 * snapshots) and the reviews recorded since then, as plain arrays for the pure functions in metrics.ts.
 */
export async function loadMetricInputs(since: Date, memberId?: string): Promise<{ tasks: MetricTask[]; reviews: MetricReview[] }> {
  const conds = [or(inArray(tasks.status, ACTIVE), gte(tasks.dueAt, since), gte(tasks.completedAt, since))];
  if (memberId) conds.push(inArray(tasks.id, db.select({ id: taskAssignees.taskId }).from(taskAssignees).where(eq(taskAssignees.userId, memberId))));
  const rows = await db.select({
    id: tasks.id, status: tasks.status, dueAt: tasks.dueAt, firstSubmittedAt: tasks.firstSubmittedAt, completedAt: tasks.completedAt,
  }).from(tasks).where(and(...conds));
  const ids = rows.map((r) => r.id);
  const asg = ids.length ? await db.select({ taskId: taskAssignees.taskId, userId: taskAssignees.userId }).from(taskAssignees).where(inArray(taskAssignees.taskId, ids)) : [];
  const byTask = new Map<string, string[]>();
  for (const a of asg) byTask.set(a.taskId, [...(byTask.get(a.taskId) ?? []), a.userId]);
  const rv = ids.length ? await db.select({ taskId: reviews.taskId, decision: reviews.decision, createdAt: reviews.createdAt })
    .from(reviews).where(and(inArray(reviews.taskId, ids), gte(reviews.createdAt, since))) : [];
  return { tasks: rows.map((r) => ({ ...r, assigneeIds: byTask.get(r.id) ?? [] })), reviews: rv };
}

export type MemberLite = {
  id: string; name: string; title: string; email: string; role: "admin" | "leader" | "volunteer"; avatarFileId: string | null;
  departmentId: string | null; departmentName: string | null; departmentColor: string | null; lastSeenAt: Date | null;
};

export async function activeMembers(): Promise<MemberLite[]> {
  return db.select({
    id: users.id, name: users.name, title: users.title, email: users.email, role: users.role, avatarFileId: users.avatarFileId,
    departmentId: users.departmentId, departmentName: departments.name, departmentColor: departments.color, lastSeenAt: users.lastSeenAt,
  }).from(users).leftJoin(departments, eq(departments.id, users.departmentId)).where(eq(users.status, "active")).orderBy(asc(sql`lower(${users.name})`));
}

/* ───────── Command center ───────── */

export async function overviewCounts(now: Date, tz: string) {
  const week = weekPeriod(now, tz);
  const n = (cond: ReturnType<typeof sql>) => sql<number>`count(*) filter (where ${cond})::int`;
  const [t] = await db.select({
    open: n(sql`${inArray(tasks.status, ACTIVE)}`),
    completedWeek: n(sql`${and(eq(tasks.status, "approved"), gte(tasks.completedAt, week.start), lt(tasks.completedAt, week.end))}`),
    awaiting: n(sql`${inArray(tasks.status, AWAITING_REVIEW)}`),
    overdue: n(sql`${and(inArray(tasks.status, OPEN_FOR_ASSIGNEE), lt(tasks.dueAt, now))}`),
    dueSoon: n(sql`${and(inArray(tasks.status, OPEN_FOR_ASSIGNEE), gte(tasks.dueAt, now), lt(tasks.dueAt, addDays(now, 7)))}`),
  }).from(tasks);
  const [m] = await db.select({ n: sql<number>`count(*)::int` }).from(users).where(eq(users.status, "active"));
  const [e] = await db.select({ n: sql<number>`count(*)::int` }).from(extensionRequests).where(eq(extensionRequests.status, "pending"));
  return { ...t, members: m.n, pendingExtensions: e.n };
}

export async function recentSubmissions(limit = 8) {
  return db.select({
    id: submissions.id, taskId: submissions.taskId, version: submissions.version, submittedAt: submissions.submittedAt,
    dueAtSubmission: submissions.dueAtSubmission, title: tasks.title, status: tasks.status, timezone: tasks.timezone,
    by: users.name, byAvatar: users.avatarFileId,
  }).from(submissions).innerJoin(tasks, eq(tasks.id, submissions.taskId)).leftJoin(users, eq(users.id, submissions.submittedById))
    .orderBy(desc(submissions.submittedAt)).limit(limit);
}

export async function departmentActivity(now: Date) {
  const since = addDays(now, -30);
  const rows = await db.select({
    id: departments.id, name: departments.name, color: departments.color,
    open: sql<number>`count(${tasks.id}) filter (where ${inArray(tasks.status, ACTIVE)})::int`,
    overdue: sql<number>`count(${tasks.id}) filter (where ${and(inArray(tasks.status, OPEN_FOR_ASSIGNEE), lt(tasks.dueAt, now))})::int`,
    completed: sql<number>`count(${tasks.id}) filter (where ${and(eq(tasks.status, "approved"), gte(tasks.completedAt, since))})::int`,
  }).from(departments).leftJoin(tasks, eq(tasks.departmentId, departments.id))
    .where(eq(departments.archived, false)).groupBy(departments.id).orderBy(asc(departments.name));
  return rows;
}

const EVENT_TEXT: Record<string, (d: Record<string, unknown>) => string> = {
  created: (d) => (d.recurring ? "created a recurring assignment" : "created"),
  status: (d) => `moved to ${STATUS_LABEL[d.to as TaskStatus] ?? String(d.to ?? "a new status")}`,
  due_changed: () => "changed the due date of",
  reassigned: () => "updated who's assigned to",
  submitted: (d) => (Number(d.version) > 1 ? `submitted revision ${d.version} of` : "submitted"),
  reviewed: (d) => (d.decision === "approved" ? "approved" : "requested a revision on"),
  extension: (d) => (d.action === "requested" ? "requested an extension for" : d.action === "approved" ? "approved an extension for" : "declined an extension for"),
  edited: () => "edited",
};
export function describeEvent(kind: string, detail: Record<string, unknown>) {
  return (EVENT_TEXT[kind] ?? (() => "updated"))(detail ?? {});
}

export async function activityFeed(limit = 14, actorId?: string) {
  return db.select({
    id: taskEvents.id, kind: taskEvents.kind, detail: taskEvents.detail, createdAt: taskEvents.createdAt,
    taskId: tasks.id, title: tasks.title, actor: users.name, actorAvatar: users.avatarFileId,
  }).from(taskEvents).innerJoin(tasks, eq(tasks.id, taskEvents.taskId)).leftJoin(users, eq(users.id, taskEvents.actorId))
    .where(actorId ? eq(taskEvents.actorId, actorId) : undefined)
    .orderBy(desc(taskEvents.createdAt)).limit(limit);
}

export type TeamRow = MemberLite & {
  active: number; completed30: number; overdue: number; awaitingReview: number; lastActivity: Date | null; nextDue: Date | null; nextDueTz: string | null;
};

/** Snapshot per active member for the team overview (alphabetical, never ranked). */
export async function teamOverview(now: Date): Promise<TeamRow[]> {
  const members = await activeMembers();
  const since = addDays(now, -30);
  const rows = await db.select({
    userId: taskAssignees.userId, status: tasks.status, dueAt: tasks.dueAt, completedAt: tasks.completedAt, tz: tasks.timezone,
  }).from(taskAssignees).innerJoin(tasks, eq(tasks.id, taskAssignees.taskId))
    .where(or(inArray(tasks.status, ACTIVE), and(eq(tasks.status, "approved"), gte(tasks.completedAt, since))));
  const lastEvents = await db.select({ actorId: taskEvents.actorId, at: sql<Date>`max(${taskEvents.createdAt})` })
    .from(taskEvents).where(isNotNull(taskEvents.actorId)).groupBy(taskEvents.actorId);
  const lastEv = new Map(lastEvents.map((r) => [r.actorId!, new Date(r.at)]));
  return members.map((m) => {
    const mine = rows.filter((r) => r.userId === m.id);
    const open = mine.filter((r) => OPEN_FOR_ASSIGNEE.includes(r.status));
    const upcoming = open.filter((r) => r.dueAt && r.dueAt >= now).sort((a, b) => a.dueAt!.getTime() - b.dueAt!.getTime())[0];
    const ev = lastEv.get(m.id) ?? null;
    const last = [m.lastSeenAt, ev].filter((x): x is Date => !!x).sort((a, b) => b.getTime() - a.getTime())[0] ?? null;
    return {
      ...m,
      active: mine.filter((r) => ACTIVE.includes(r.status)).length,
      completed30: mine.filter((r) => r.status === "approved").length,
      overdue: open.filter((r) => r.dueAt && r.dueAt < now).length,
      awaitingReview: mine.filter((r) => AWAITING_REVIEW.includes(r.status)).length,
      lastActivity: last,
      nextDue: upcoming?.dueAt ?? null,
      nextDueTz: upcoming?.tz ?? null,
    };
  });
}

/* ───────── Member profile ───────── */

export async function getMember(id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  return (await db.select({
    id: users.id, name: users.name, title: users.title, email: users.email, role: users.role, status: users.status,
    avatarFileId: users.avatarFileId, responsibilities: users.responsibilities, timezone: users.timezone, lastSeenAt: users.lastSeenAt,
    createdAt: users.createdAt, departmentId: users.departmentId, departmentName: departments.name, departmentColor: departments.color,
  }).from(users).leftJoin(departments, eq(departments.id, users.departmentId)).where(eq(users.id, id)).limit(1))[0] ?? null;
}

export async function extensionHistory(memberId: string) {
  return db.select({
    id: extensionRequests.id, taskId: extensionRequests.taskId, title: tasks.title, timezone: tasks.timezone, status: extensionRequests.status,
    currentDueAt: extensionRequests.currentDueAt, requestedDueAt: extensionRequests.requestedDueAt, reason: extensionRequests.reason,
    decisionNote: extensionRequests.decisionNote, createdAt: extensionRequests.createdAt, decidedAt: extensionRequests.decidedAt,
  }).from(extensionRequests).innerJoin(tasks, eq(tasks.id, extensionRequests.taskId))
    .where(eq(extensionRequests.requestedById, memberId)).orderBy(desc(extensionRequests.createdAt)).limit(50);
}

export async function lastEventBy(memberId: string) {
  const [r] = await db.select({ at: sql<Date | null>`max(${taskEvents.createdAt})` }).from(taskEvents).where(eq(taskEvents.actorId, memberId));
  return r?.at ? new Date(r.at) : null;
}

/* ───────── Accountability ───────── */

export type AccountabilityFilters = { status?: "open" | "in_progress" | "resolved"; type?: AccountabilityType; memberId?: string };
export type AccountabilityType = "coaching_note" | "documented_warning" | "improvement_plan" | "follow_up";

export async function accountabilityList(f: AccountabilityFilters = {}) {
  const author = db.$with("author").as(db.select({ id: users.id, name: users.name }).from(users));
  const conds = [];
  if (f.status) conds.push(eq(accountabilityRecords.status, f.status));
  if (f.type) conds.push(eq(accountabilityRecords.type, f.type));
  if (f.memberId) conds.push(eq(accountabilityRecords.memberId, f.memberId));
  return db.with(author).select({
    id: accountabilityRecords.id, memberId: accountabilityRecords.memberId, type: accountabilityRecords.type, title: accountabilityRecords.title,
    details: accountabilityRecords.details, followUpDate: accountabilityRecords.followUpDate, status: accountabilityRecords.status,
    resolution: accountabilityRecords.resolution, createdAt: accountabilityRecords.createdAt, updatedAt: accountabilityRecords.updatedAt,
    memberName: users.name, memberAvatar: users.avatarFileId, authorName: author.name,
  }).from(accountabilityRecords).innerJoin(users, eq(users.id, accountabilityRecords.memberId))
    .leftJoin(author, eq(author.id, accountabilityRecords.authorId))
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(sql`case when ${accountabilityRecords.status} = 'resolved' then 1 else 0 end`, sql`${accountabilityRecords.followUpDate} asc nulls last`, desc(accountabilityRecords.createdAt));
}
export type AccountabilityRow = Awaited<ReturnType<typeof accountabilityList>>[number];

/** "Today" in the org timezone as yyyy-MM-dd (follow-up dates are calendar dates). */
export function todayIn(tz: string, now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

