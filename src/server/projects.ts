import "server-only";
import { and, asc, count, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { departments, files, milestones, projects, tasks, users, type LinkItem } from "@/db/schema";
import type { CurrentUser } from "./auth";
import { AuthError } from "./auth";
import { UserError } from "./safe-action";
import { ACTIVE, AWAITING_REVIEW, type TaskStatus } from "@/lib/task-meta";
import type { ProjectProgressData, ProjectStatus } from "@/components/projects/meta";

export const isUuid = (s: string | null | undefined): s is string => !!s && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);

/** Admins manage everything; a leader who directs the project may manage its milestones, links and files. */
export function canManageProjectExtras(u: CurrentUser, p: { directorId: string | null }) {
  return u.role === "admin" || (u.role === "leader" && !!p.directorId && p.directorId === u.id);
}

/** Loads a project and throws unless the user may manage its milestones/links/files. */
export async function requireProjectManager(u: CurrentUser, projectId: string) {
  if (!isUuid(projectId)) throw new UserError("That project no longer exists.");
  const p = (await db.select({ id: projects.id, name: projects.name, directorId: projects.directorId, links: projects.links })
    .from(projects).where(eq(projects.id, projectId)).limit(1))[0];
  if (!p) throw new UserError("That project no longer exists.");
  if (!canManageProjectExtras(u, p)) throw new AuthError();
  return p;
}

/** Task + milestone counts per project (project-wide aggregate; no individual task details). */
export async function projectStats(projectIds: string[]) {
  const out = new Map<string, ProjectProgressData>();
  for (const id of projectIds) out.set(id, { approved: 0, counted: 0, open: 0, inReview: 0, total: 0, msDone: 0, msTotal: 0 });
  if (!projectIds.length) return out;
  const rows = await db.select({ projectId: tasks.projectId, status: tasks.status, n: count() }).from(tasks)
    .where(inArray(tasks.projectId, projectIds)).groupBy(tasks.projectId, tasks.status);
  for (const r of rows) {
    const s = out.get(r.projectId!);
    if (!s) continue;
    const st = r.status as TaskStatus;
    s.total += r.n;
    if (st !== "canceled" && st !== "excused") s.counted += r.n;
    if (st === "approved") s.approved += r.n;
    if (ACTIVE.includes(st)) s.open += r.n;
    if (AWAITING_REVIEW.includes(st)) s.inReview += r.n;
  }
  const ms = await db.select({ projectId: milestones.projectId, completedAt: milestones.completedAt }).from(milestones)
    .where(inArray(milestones.projectId, projectIds));
  for (const m of ms) {
    const s = out.get(m.projectId);
    if (!s) continue;
    s.msTotal++;
    if (m.completedAt) s.msDone++;
  }
  return out;
}

export async function listProjects(opts: { status?: ProjectStatus | "current"; departmentId?: string } = {}) {
  const conds = [];
  if (opts.status && opts.status !== "current") conds.push(eq(projects.status, opts.status));
  if (opts.departmentId) conds.push(eq(projects.departmentId, opts.departmentId));
  const rows = await db.select({
    id: projects.id, name: projects.name, description: projects.description, status: projects.status,
    startDate: projects.startDate, targetDate: projects.targetDate, directorId: projects.directorId,
    directorName: users.name, directorAvatar: users.avatarFileId, departmentId: projects.departmentId,
    departmentName: departments.name, departmentColor: departments.color, departmentSlug: departments.slug,
  }).from(projects)
    .leftJoin(users, eq(users.id, projects.directorId))
    .leftJoin(departments, eq(departments.id, projects.departmentId))
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(asc(projects.name));
  return rows;
}

/** Next incomplete milestone per project (by position). */
export async function nextMilestones(projectIds: string[]) {
  const m = new Map<string, { title: string; dueDate: string | null }>();
  if (!projectIds.length) return m;
  const rows = await db.select().from(milestones).where(inArray(milestones.projectId, projectIds))
    .orderBy(asc(milestones.position), asc(milestones.title));
  for (const r of rows) if (!r.completedAt && !m.has(r.projectId)) m.set(r.projectId, { title: r.title, dueDate: r.dueDate });
  return m;
}

export async function getProject(id: string) {
  if (!isUuid(id)) return null;
  const p = (await db.select({
    p: projects, directorName: users.name, directorAvatar: users.avatarFileId, directorTitle: users.title,
    departmentName: departments.name, departmentColor: departments.color, departmentSlug: departments.slug,
  }).from(projects)
    .leftJoin(users, eq(users.id, projects.directorId))
    .leftJoin(departments, eq(departments.id, projects.departmentId))
    .where(eq(projects.id, id)).limit(1))[0];
  return p ?? null;
}

export async function getMilestones(projectId: string) {
  return db.select().from(milestones).where(eq(milestones.projectId, projectId)).orderBy(asc(milestones.position), asc(milestones.title));
}

export async function getProjectFiles(projectId: string) {
  return db.select({ id: files.id, filename: files.filename, size: files.size, mimeType: files.mimeType, createdAt: files.createdAt, uploadedByName: users.name })
    .from(files).leftJoin(users, eq(users.id, files.uploadedById))
    .where(and(eq(files.ownerType, "project"), eq(files.ownerId, projectId))).orderBy(desc(files.createdAt));
}

/** Active leaders and admins who can direct a project. */
export async function directorOptions() {
  return db.select({ id: users.id, name: users.name, title: users.title, role: users.role }).from(users)
    .where(and(eq(users.status, "active"), inArray(users.role, ["admin", "leader"]))).orderBy(asc(users.name));
}

/* ── input parsing ── */

export function normalizeUrl(raw: string) {
  const v = raw.trim();
  if (!v) return null;
  let u: URL;
  try { u = new URL(/^[a-z][a-z0-9+.-]*:/i.test(v) ? v : `https://${v}`); } catch { return null; }
  if (u.protocol !== "http:" && u.protocol !== "https:") return null;
  if (!u.hostname.includes(".") && u.hostname !== "localhost") return null;
  return u.toString();
}

export function parseLink(labelRaw: string, urlRaw: string): LinkItem {
  const url = normalizeUrl(urlRaw);
  if (!url) throw new UserError(`"${urlRaw.trim() || "(blank)"}" isn't a valid web address. Use a full link starting with https://`);
  const label = labelRaw.trim().slice(0, 120) || new URL(url).hostname.replace(/^www\./, "");
  return { label, url };
}

/** Reads parallel linkLabel/linkUrl fields; blank rows are ignored. */
export function parseLinks(fd: FormData): LinkItem[] {
  const labels = fd.getAll("linkLabel").map(String);
  const urls = fd.getAll("linkUrl").map(String);
  const out: LinkItem[] = [];
  for (let i = 0; i < Math.max(labels.length, urls.length); i++) {
    const l = labels[i] ?? "", u = urls[i] ?? "";
    if (!l.trim() && !u.trim()) continue;
    if (!u.trim()) throw new UserError(`Add a web address for "${l.trim()}".`);
    out.push(parseLink(l, u));
  }
  if (out.length > 25) throw new UserError("Add up to 25 links.");
  return out;
}

export function parseDay(v: string | null | undefined) {
  const s = (v ?? "").trim();
  if (!s) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || isNaN(new Date(`${s}T00:00:00Z`).getTime())) throw new UserError("Please enter a valid date.");
  return s;
}
