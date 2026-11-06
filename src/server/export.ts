import "server-only";
import { asc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import {
  accountabilityRecords, announcementReads, announcements, auditLog, departments, emailOutbox, events, extensionRequests, files, invitations,
  milestones, notifications, passwordResets, projects, resources, reviews, settings, submissions, taskAssignees, taskCategories, taskComments,
  taskEvents, taskSeries, tasks, users,
} from "@/db/schema";

/** Fields that must never leave the server, whatever table they're on. */
const SECRET_FIELDS = new Set(["passwordHash", "calendarToken", "tokenHash"]);
/** Invitation / reset URLs in queued emails carry live tokens — redact them. */
const TOKEN_URL = /(\/(?:invite|reset-password)\/)[A-Za-z0-9_-]+/g;

function strip<T extends Record<string, unknown>>(rows: T[]) {
  return rows.map((r) => Object.fromEntries(Object.entries(r).filter(([k]) => !SECRET_FIELDS.has(k))));
}

/** Every organizational table except sessions and rate limits, with secrets removed. */
export async function buildJsonExport() {
  const outbox = (await db.select().from(emailOutbox)).map((m) => ({ ...m, body: m.body.replace(TOKEN_URL, "$1[redacted]") }));
  const data = {
    departments: await db.select().from(departments),
    users: strip(await db.select().from(users)),
    invitations: strip(await db.select().from(invitations)),
    passwordResets: strip(await db.select().from(passwordResets)),
    files: await db.select().from(files),
    projects: await db.select().from(projects),
    milestones: await db.select().from(milestones),
    taskCategories: await db.select().from(taskCategories),
    taskSeries: await db.select().from(taskSeries),
    tasks: await db.select().from(tasks),
    taskAssignees: await db.select().from(taskAssignees),
    submissions: await db.select().from(submissions),
    reviews: await db.select().from(reviews),
    taskComments: await db.select().from(taskComments),
    taskEvents: await db.select().from(taskEvents),
    extensionRequests: await db.select().from(extensionRequests),
    announcements: await db.select().from(announcements),
    announcementReads: await db.select().from(announcementReads),
    events: await db.select().from(events),
    notifications: await db.select().from(notifications),
    emailOutbox: outbox,
    resources: await db.select().from(resources),
    accountabilityRecords: await db.select().from(accountabilityRecords),
    settings: await db.select().from(settings),
    auditLog: await db.select().from(auditLog),
  };
  const counts = Object.fromEntries(Object.entries(data).map(([k, v]) => [k, v.length]));
  return {
    meta: {
      exportedAt: new Date().toISOString(), format: "courage-for-kids-team-portal/v1",
      excluded: ["sessions", "rate_limits", "password hashes", "token hashes", "calendar tokens", "file contents (metadata only)"],
      counts,
    },
    data,
  };
}

/* ───────── CSV ───────── */

export function csvCell(v: unknown): string {
  if (v === null || v === undefined) return "";
  let s = v instanceof Date ? v.toISOString() : Array.isArray(v) ? v.join("; ") : typeof v === "object" ? JSON.stringify(v) : String(v);
  // Neutralize spreadsheet formulas (CSV injection).
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
export function toCsv(header: string[], rows: unknown[][]) {
  return "﻿" + [header, ...rows].map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";
}

export async function tasksCsv() {
  const rows = await db.select({
    id: tasks.id, title: tasks.title, status: tasks.status, priority: tasks.priority, department: departments.name, project: projects.name,
    category: taskCategories.name, dueAt: tasks.dueAt, originalDueAt: tasks.originalDueAt, timezone: tasks.timezone, requiresReview: tasks.requiresReview,
    firstSubmittedAt: tasks.firstSubmittedAt, completedAt: tasks.completedAt, recurring: tasks.seriesId, createdAt: tasks.createdAt, updatedAt: tasks.updatedAt,
  }).from(tasks).leftJoin(departments, eq(departments.id, tasks.departmentId)).leftJoin(projects, eq(projects.id, tasks.projectId))
    .leftJoin(taskCategories, eq(taskCategories.id, tasks.categoryId)).orderBy(asc(tasks.createdAt));
  const ids = rows.map((r) => r.id);
  const asg = ids.length ? await db.select({ taskId: taskAssignees.taskId, name: users.name, email: users.email })
    .from(taskAssignees).innerJoin(users, eq(users.id, taskAssignees.userId)).where(inArray(taskAssignees.taskId, ids)) : [];
  const byTask = new Map<string, { name: string; email: string }[]>();
  for (const a of asg) byTask.set(a.taskId, [...(byTask.get(a.taskId) ?? []), a]);
  return toCsv(
    ["id", "title", "status", "priority", "department", "project", "category", "assignees", "assignee_emails", "due_at", "original_due_at", "timezone",
      "requires_review", "first_submitted_at", "completed_at", "recurring", "created_at", "updated_at"],
    rows.map((r) => [r.id, r.title, r.status, r.priority, r.department, r.project, r.category, (byTask.get(r.id) ?? []).map((a) => a.name),
      (byTask.get(r.id) ?? []).map((a) => a.email), r.dueAt, r.originalDueAt, r.timezone, r.requiresReview ? "yes" : "no", r.firstSubmittedAt,
      r.completedAt, r.recurring ? "yes" : "no", r.createdAt, r.updatedAt]),
  );
}

export async function membersCsv() {
  const rows = await db.select({
    id: users.id, name: users.name, email: users.email, role: users.role, title: users.title, department: departments.name, status: users.status,
    responsibilities: users.responsibilities, timezone: users.timezone, lastSeenAt: users.lastSeenAt, createdAt: users.createdAt,
  }).from(users).leftJoin(departments, eq(departments.id, users.departmentId)).orderBy(asc(users.name));
  return toCsv(
    ["id", "name", "email", "role", "title", "department", "status", "responsibilities", "timezone", "last_seen_at", "created_at"],
    rows.map((r) => [r.id, r.name, r.email, r.role, r.title, r.department, r.status, r.responsibilities, r.timezone, r.lastSeenAt, r.createdAt]),
  );
}
