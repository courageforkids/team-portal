import "server-only";
import { and, eq, gt, inArray, isNotNull, isNull, lte, lt, ne, or, sql } from "drizzle-orm";
import { addDays } from "date-fns";
import { nextOccurrence } from "@/lib/recurrence";
import { formatInTimeZone } from "date-fns-tz";
import { db } from "@/db";
import { announcements, conversations, messages, taskAssignees, taskSeries, tasks, users } from "@/db/schema";
import { ensureTeamConversation } from "./chat";
import { getSettings } from "./settings";
import { adminIds, notify } from "./notify";
import { createTasks } from "./tasks";
import { audienceMatches } from "./policy";
import { OPEN_FOR_ASSIGNEE } from "@/lib/task-meta";
import { fmtDateTime } from "@/lib/dates";

/** Runs at most every 10 minutes when someone loads the portal (works without a cron service). */
export async function runMaintenanceIfDue() {
  try {
    const claimed = await db.execute(sql`
      update settings set data = jsonb_set(data, '{lastMaintenanceAt}', to_jsonb(now()::text))
      where id = 1 and (data->>'lastMaintenanceAt' is null or (data->>'lastMaintenanceAt')::timestamptz < now() - interval '10 minutes')
      returning id`);
    if ((claimed as unknown as unknown[]).length) await runMaintenance();
  } catch (e) {
    console.error("maintenance failed", e);
  }
}

export async function runMaintenance(now = new Date()) {
  const generated = await generateRecurring(now);
  const reminders = await sendDeadlineReminders(now);
  const announced = await publishDueAnnouncements(now);
  const shiftReminders = await remindUpcomingShifts(now);
  const birthdays = await postBirthdays(now);
  return { generated, reminders, announced, shiftReminders, birthdays };
}

export { nextOccurrence };

export async function generateRecurring(now = new Date()) {
  const series = await db.select().from(taskSeries).where(eq(taskSeries.active, true));
  let count = 0;
  for (const s of series) {
    let due = s.nextDueAt;
    let guard = 0;
    while (due.getTime() - s.leadDays * 86400_000 <= now.getTime() && guard++ < 12) {
      if (s.endsOn && formatInTimeZone(due, s.template.timezone, "yyyy-MM-dd") > s.endsOn) {
        await db.update(taskSeries).set({ active: false }).where(eq(taskSeries.id, s.id));
        break;
      }
      // Claim this occurrence atomically so concurrent runs can't double-create it.
      const next = nextOccurrence(due, s.recurrence, s.intervalDays);
      const claimed = await db.update(taskSeries).set({ nextDueAt: next }).where(and(eq(taskSeries.id, s.id), eq(taskSeries.nextDueAt, due))).returning({ id: taskSeries.id });
      if (!claimed.length) break;
      const tpl = s.template;
      await createTasks(null, {
        title: tpl.title, instructions: tpl.instructions, departmentId: tpl.departmentId, categoryId: tpl.categoryId, projectId: tpl.projectId,
        priority: tpl.priority, dueAt: due, timezone: tpl.timezone, deliverables: tpl.deliverables, completionCriteria: tpl.completionCriteria,
        submissionTypes: tpl.submissionTypes, checklist: tpl.checklist, links: tpl.links, requiresReview: tpl.requiresReview, reviewerId: tpl.reviewerId, internalNotes: "",
      }, s.assigneeIds, { separate: true, seriesId: s.id });
      count++;
      due = next;
    }
  }
  return count;
}

function inQuietHours(now: Date, tz: string, start?: number, end?: number) {
  if (start === undefined || end === undefined || start === end) return false;
  const h = Number(formatInTimeZone(now, tz, "H"));
  return start > end ? h >= start || h < end : h >= start && h < end;
}

/**
 * Sends at most one "due soon" reminder per threshold window and one "missed" notice per deadline.
 * Dedupe keys include the due timestamp, so changing a deadline re-arms reminders exactly once.
 */
export async function sendDeadlineReminders(now = new Date()) {
  const s = await getSettings();
  if (inQuietHours(now, s.timezone, s.quietHoursStart, s.quietHoursEnd)) return 0;
  const thresholds = [...new Set(s.reminderHours)].filter((h) => h > 0).sort((a, b) => a - b);
  const maxH = thresholds.at(-1) ?? 0;
  let sent = 0;
  if (maxH > 0) {
    const soon = await db.select({ t: tasks, userId: taskAssignees.userId }).from(tasks)
      .innerJoin(taskAssignees, eq(taskAssignees.taskId, tasks.id))
      .where(and(inArray(tasks.status, OPEN_FOR_ASSIGNEE), isNotNull(tasks.dueAt), gt(tasks.dueAt, now), lte(tasks.dueAt, new Date(now.getTime() + maxH * 3600_000))));
    for (const { t, userId } of soon) {
      const hoursLeft = (t.dueAt!.getTime() - now.getTime()) / 3600_000;
      const window = thresholds.find((h) => hoursLeft <= h)!; // smallest threshold that applies → never double-send
      sent += await notify([userId], {
        type: "deadline_soon", title: `Reminder: "${t.title}" is due soon`, body: `Due ${fmtDateTime(t.dueAt, t.timezone)}`, href: `/tasks/${t.id}`,
        dedupeKey: `due:${t.id}:${window}:${t.dueAt!.getTime()}`,
      });
    }
  }
  if (s.overdueReminders) {
    const missed = await db.select({ t: tasks, userId: taskAssignees.userId }).from(tasks)
      .innerJoin(taskAssignees, eq(taskAssignees.taskId, tasks.id))
      .where(and(inArray(tasks.status, OPEN_FOR_ASSIGNEE), isNotNull(tasks.dueAt), lt(tasks.dueAt, now), gt(tasks.dueAt, addDays(now, -14))));
    const admins = await adminIds();
    const names = new Map((await db.select({ id: users.id, name: users.name }).from(users)).map((u) => [u.id, u.name]));
    for (const { t, userId } of missed) {
      const key = `missed:${t.id}:${t.dueAt!.getTime()}`;
      sent += await notify([userId], {
        type: "deadline_missed", title: `"${t.title}" is past due`, body: "Submit when you can, or request an extension if you need more time.", href: `/tasks/${t.id}`, dedupeKey: key,
      });
      sent += await notify(admins, {
        type: "deadline_missed", title: `Missed deadline: ${t.title}`, body: `${names.get(userId) ?? "A member"} · was due ${fmtDateTime(t.dueAt, t.timezone)}`,
        href: `/tasks/${t.id}`, dedupeKey: `${key}:${userId}`, excludeUserId: userId,
      });
    }
  }
  return sent;
}

/** Notifies the audience of an announcement once it is published (immediately or on schedule). */
export async function notifyAnnouncementAudience(announcementId: string) {
  const a = (await db.select().from(announcements).where(eq(announcements.id, announcementId)).limit(1))[0];
  if (!a || a.notifiedAt || a.publishAt > new Date()) return 0;
  const claimed = await db.update(announcements).set({ notifiedAt: new Date() }).where(and(eq(announcements.id, a.id), isNull(announcements.notifiedAt))).returning({ id: announcements.id });
  if (!claimed.length) return 0;
  const members = await db.select({ id: users.id, role: users.role, departmentId: users.departmentId }).from(users).where(eq(users.status, "active"));
  const ids = members.filter((m) => audienceMatches(a.audience, m)).map((m) => m.id);
  return notify(ids, { type: "announcement", title: a.pinned ? `📌 ${a.title}` : a.title, body: a.body.slice(0, 160), href: `/announcements/${a.id}`, dedupeKey: `ann:${a.id}`, excludeUserId: a.authorId ?? undefined });
}

export async function publishDueAnnouncements(now = new Date()) {
  const due = await db.select({ id: announcements.id }).from(announcements).where(and(isNull(announcements.notifiedAt), lte(announcements.publishAt, now)));
  let n = 0;
  for (const a of due) n += await notifyAnnouncementAudience(a.id);
  return n;
}

/** One reminder per person, about a day before a shift they signed up for. */
export async function remindUpcomingShifts(now = new Date()) {
  const { eventShifts, shiftSignups, events } = await import("@/db/schema");
  const soon = await db.select({ s: eventShifts, title: events.title, location: events.location, userId: shiftSignups.userId })
    .from(shiftSignups).innerJoin(eventShifts, eq(eventShifts.id, shiftSignups.shiftId)).innerJoin(events, eq(events.id, eventShifts.eventId))
    .where(and(gt(eventShifts.startsAt, now), lte(eventShifts.startsAt, new Date(now.getTime() + 26 * 3600_000))));
  let n = 0;
  for (const r of soon) {
    n += await notify([r.userId], {
      type: "deadline_soon", title: `Coming up: ${r.title} (${r.s.label})`,
      body: `${fmtDateTime(r.s.startsAt, "America/New_York")}${r.location ? ` · ${r.location}` : ""}`, href: `/volunteer/events/${r.s.eventId}`,
      dedupeKey: `shift:${r.s.id}:${r.s.startsAt.getTime()}`,
    });
  }
  return n;
}

/** Posts a birthday shout-out in team chat once a year, on the day (Eastern time). */
export async function postBirthdays(now = new Date()) {
  const md = formatInTimeZone(now, "America/New_York", "MM-dd"), year = Number(formatInTimeZone(now, "America/New_York", "yyyy"));
  const people = await db.select({ id: users.id, name: users.name }).from(users)
    .where(and(eq(users.status, "active"), eq(users.birthday, md), or(isNull(users.birthdayPostedYear), ne(users.birthdayPostedYear, year))));
  if (!people.length) return 0;
  const team = await ensureTeamConversation();
  let n = 0;
  for (const p of people) {
    const claimed = await db.update(users).set({ birthdayPostedYear: year }).where(and(eq(users.id, p.id), or(isNull(users.birthdayPostedYear), ne(users.birthdayPostedYear, year)))).returning({ id: users.id });
    if (!claimed.length) continue;
    await db.insert(messages).values({ conversationId: team.id, body: `🎂 Happy birthday, ${p.name.split(" ")[0]}! Send them some love today 🎉`, system: true });
    await db.update(conversations).set({ lastMessageAt: new Date() }).where(eq(conversations.id, team.id));
    n++;
  }
  return n;
}
