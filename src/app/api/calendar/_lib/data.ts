import "server-only";
import { and, asc, eq, inArray, lt, sql } from "drizzle-orm";
import { db } from "@/db";
import { events, projects } from "@/db/schema";
import type { CurrentUser } from "@/server/auth";
import { allowedVisibilities } from "@/server/policy";
import { loadTasks } from "@/server/queries";
import { appUrl } from "@/server/email";
import type { CalItem } from "@/components/calendar/meta";

/** Visible events overlapping [from, to) plus task deadlines due in that window. */
export async function loadCalendarItems(viewer: CurrentUser, from: Date, to: Date, taskScope: "all" | "mine"): Promise<CalItem[]> {
  const showProjects = viewer.role !== "volunteer";
  const [evRows, taskRows] = await Promise.all([
    db.select({ e: events, projectName: projects.name }).from(events)
      .leftJoin(projects, eq(projects.id, events.projectId))
      .where(and(
        lt(events.startsAt, to),
        sql`coalesce(${events.endsAt}, ${events.startsAt}) >= ${from.toISOString()}::timestamptz`,
        inArray(events.visibility, allowedVisibilities(viewer.role)),
      ))
      .orderBy(asc(events.startsAt))
      .limit(1000),
    loadTasks(viewer, { scope: taskScope, view: "everything", dueFrom: from, dueTo: to, limit: 1000 }),
  ]);
  const out: CalItem[] = evRows.map(({ e, projectName }) => ({
    key: `e:${e.id}`, kind: "event", id: e.id, type: e.type, title: e.title,
    start: e.startsAt.toISOString(), end: e.endsAt?.toISOString() ?? null, allDay: e.allDay,
    location: e.location, description: e.description, visibility: e.visibility,
    projectId: showProjects ? e.projectId : null, projectName: showProjects ? projectName : null,
  }));
  for (const t of taskRows) {
    if (!t.dueAt || t.status === "canceled" || t.status === "excused") continue;
    out.push({
      key: `t:${t.id}`, kind: "task", id: t.id, type: "task", title: t.title,
      start: t.dueAt.toISOString(), end: null, allDay: false, location: "", description: "", visibility: "everyone",
      projectId: null, projectName: showProjects ? t.projectName : null, status: t.status,
      assignees: t.assignees.map((a) => a.name),
    });
  }
  return out;
}

export const feedUrl = (token: string) => appUrl(`/api/calendar/feed/${token}`);
