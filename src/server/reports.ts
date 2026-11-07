import "server-only";
import { and, eq, gte, lt, sql } from "drizzle-orm";
import { addMonths } from "date-fns";
import { fromZonedTime, formatInTimeZone } from "date-fns-tz";
import { db } from "@/db";
import {
  announcements, eventShifts, events, meetingAttendance, meetings, messages, monthlyReports, polls, shiftSignups, shoutouts, tasks, users, volunteerHours,
} from "@/db/schema";

const TZ = "America/New_York";
export const currentMonth = () => formatInTimeZone(new Date(), TZ, "yyyy-MM");
export const monthLabel = (m: string) => formatInTimeZone(fromZonedTime(`${m}-15T12:00`, TZ), TZ, "MMMM yyyy");
export function monthRange(m: string) {
  const start = fromZonedTime(`${m}-01T00:00`, TZ);
  const next = formatInTimeZone(addMonths(fromZonedTime(`${m}-15T12:00`, TZ), 1), TZ, "yyyy-MM");
  return { start, end: fromZonedTime(`${next}-01T00:00`, TZ), next, prev: formatInTimeZone(addMonths(fromZonedTime(`${m}-15T12:00`, TZ), -1), TZ, "yyyy-MM") };
}

const n = (rows: { n: number }[]) => Number(rows[0]?.n ?? 0);

/** Everything the monthly report shows. All aggregate numbers: no names of the kids or families we serve. */
export async function monthlyReport(month: string) {
  const { start, end } = monthRange(month);
  const inRange = (col: Parameters<typeof gte>[0]) => and(gte(col, start), lt(col, end));
  const dayStart = formatInTimeZone(start, TZ, "yyyy-MM-dd"), dayEnd = formatInTimeZone(end, TZ, "yyyy-MM-dd");
  const cnt = sql<number>`count(*)::int`;
  const [
    activeMembers, newMembers, tasksCreated, tasksApproved, dueSubmitted, hoursRows, eventRows, shiftRows, signupRows, meetingRows, attendanceRows,
    annCount, msgCount, pollCount, shoutCount, manual,
  ] = await Promise.all([
    db.select({ n: cnt }).from(users).where(and(eq(users.status, "active"), lt(users.createdAt, end))),
    db.select({ n: cnt }).from(users).where(inRange(users.createdAt)),
    db.select({ n: cnt }).from(tasks).where(inRange(tasks.createdAt)),
    db.select({ n: cnt }).from(tasks).where(and(eq(tasks.status, "approved"), inRange(tasks.completedAt))),
    db.select({ due: tasks.dueAt, sub: tasks.firstSubmittedAt, status: tasks.status }).from(tasks).where(inRange(tasks.dueAt)),
    db.select({ minutes: sql<number>`coalesce(sum(${volunteerHours.minutes}),0)::int`, people: sql<number>`count(distinct ${volunteerHours.userId})::int` })
      .from(volunteerHours).where(and(eq(volunteerHours.status, "approved"), gte(volunteerHours.date, dayStart), lt(volunteerHours.date, dayEnd))),
    db.select({ title: events.title, type: events.type, startsAt: events.startsAt }).from(events).where(inRange(events.startsAt)).orderBy(events.startsAt),
    db.select({ id: eventShifts.id }).from(eventShifts).where(inRange(eventShifts.startsAt)),
    db.select({ attended: shiftSignups.attended }).from(shiftSignups).innerJoin(eventShifts, eq(eventShifts.id, shiftSignups.shiftId)).where(inRange(eventShifts.startsAt)),
    db.select({ id: meetings.id }).from(meetings).where(inRange(meetings.startsAt)),
    db.select({ meetingId: meetingAttendance.meetingId, status: meetingAttendance.status }).from(meetingAttendance).innerJoin(meetings, eq(meetings.id, meetingAttendance.meetingId)).where(inRange(meetings.startsAt)),
    db.select({ n: cnt }).from(announcements).where(inRange(announcements.publishAt)),
    db.select({ n: cnt }).from(messages).where(and(inRange(messages.createdAt), eq(messages.system, false))),
    db.select({ n: cnt }).from(polls).where(inRange(polls.createdAt)),
    db.select({ n: cnt }).from(shoutouts).where(inRange(shoutouts.createdAt)),
    db.select().from(monthlyReports).where(eq(monthlyReports.month, month)).limit(1),
  ]);
  const counted = dueSubmitted.filter((t) => t.sub && !["canceled", "excused"].includes(t.status));
  const onTime = counted.filter((t) => t.due && t.sub && t.sub <= t.due).length;
  const meetingIds = meetingRows.map((m) => m.id);
  const presentPerMeeting = meetingIds.map((id) => attendanceRows.filter((a) => a.meetingId === id && (a.status === "present" || a.status === "late")).length).filter((x) => x > 0);
  return {
    month, label: monthLabel(month),
    team: { activeMembers: n(activeMembers), newMembers: n(newMembers) },
    tasks: { created: n(tasksCreated), approved: n(tasksApproved), onTimeRate: counted.length ? Math.round((onTime / counted.length) * 100) : null, onTimeBase: counted.length },
    volunteer: { hours: Math.round((Number(hoursRows[0]?.minutes ?? 0) / 60) * 10) / 10, volunteers: Number(hoursRows[0]?.people ?? 0), shifts: shiftRows.length, signups: signupRows.length, attended: signupRows.filter((s) => s.attended).length },
    events: eventRows,
    meetings: { count: meetingRows.length, avgAttendance: presentPerMeeting.length ? Math.round((presentPerMeeting.reduce((a, b) => a + b, 0) / presentPerMeeting.length) * 10) / 10 : null },
    engagement: { announcements: n(annCount), messages: n(msgCount), polls: n(pollCount), shoutouts: n(shoutCount) },
    manual: manual[0] ?? null,
  };
}
export type MonthlyReport = Awaited<ReturnType<typeof monthlyReport>>;
