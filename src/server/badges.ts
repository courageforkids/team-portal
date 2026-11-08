import "server-only";
import { and, count, eq, inArray, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { notifications, taskAssignees, tasks } from "@/db/schema";
import { unreadMessageTotal } from "./chat";
import { OPEN_FOR_ASSIGNEE } from "@/lib/task-meta";
import type { CurrentUser } from "./auth";

export type Badges = { notifications: number; reviews: number; messages: number; hours: number; drafts: number; tasks: number };

/** The little numbers on the menu: unread chats, unread notifications, open tasks, and admin queues. */
export async function computeBadges(user: CurrentUser): Promise<Badges> {
  const admin = user.role === "admin";
  const reviewWhere = admin
    ? inArray(tasks.status, ["submitted", "under_review"])
    : and(inArray(tasks.status, ["submitted", "under_review"]), eq(tasks.reviewerId, user.id));
  const n = (r: unknown) => Number((r as { n: number }[])[0]?.n ?? 0);
  const [[unread], [reviews], messages, hours, drafts, [mine]] = await Promise.all([
    db.select({ n: count() }).from(notifications).where(and(eq(notifications.userId, user.id), isNull(notifications.readAt))),
    db.select({ n: count() }).from(tasks).where(reviewWhere),
    unreadMessageTotal(user.id),
    admin ? db.execute(sql`select count(*)::int as n from volunteer_hours where status = 'pending'`).then(n) : Promise.resolve(0),
    admin ? db.execute(sql`select count(*)::int as n from task_drafts`).then(n) : Promise.resolve(0),
    db.select({ n: count() }).from(tasks).innerJoin(taskAssignees, eq(taskAssignees.taskId, tasks.id))
      .where(and(eq(taskAssignees.userId, user.id), inArray(tasks.status, OPEN_FOR_ASSIGNEE))),
  ]);
  return { notifications: unread.n, reviews: reviews.n, messages, hours, drafts, tasks: mine.n };
}
