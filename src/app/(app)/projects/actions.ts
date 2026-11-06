"use server";
import { and, asc, eq, inArray, max } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { departments, files, milestones, projects, users } from "@/db/schema";
import { actionAdmin, actionUser } from "@/server/auth";
import { audit } from "@/server/audit";
import { safe, str, filesOf, UserError } from "@/server/safe-action";
import { deleteStored, saveUploads } from "@/server/storage";
import {
  isUuid, parseDay, parseLink, parseLinks, requireProjectManager,
} from "@/server/projects";
import type { ActionResult } from "@/lib/action";
import { PROJECT_STATUSES } from "@/components/projects/meta";

const ProjectSchema = z.object({
  name: z.string().trim().min(1, "Give the project a name.").max(120, "Keep the name under 120 characters."),
  description: z.string().trim().max(5000, "Keep the description under 5,000 characters."),
  status: z.enum(PROJECT_STATUSES, { message: "Choose a status." }),
});

async function readProject(fd: FormData) {
  const base = ProjectSchema.parse({ name: str(fd, "name"), description: str(fd, "description"), status: str(fd, "status") });
  const directorId = str(fd, "directorId") || null;
  const departmentId = str(fd, "departmentId") || null;
  if (directorId) {
    const d = isUuid(directorId) ? (await db.select({ id: users.id }).from(users)
      .where(and(eq(users.id, directorId), eq(users.status, "active"), inArray(users.role, ["admin", "leader"]))).limit(1))[0] : null;
    if (!d) throw new UserError("Choose an active leader or admin as the director.");
  }
  if (departmentId) {
    const d = isUuid(departmentId) ? (await db.select({ id: departments.id }).from(departments).where(eq(departments.id, departmentId)).limit(1))[0] : null;
    if (!d) throw new UserError("That department no longer exists.");
  }
  const startDate = parseDay(str(fd, "startDate"));
  const targetDate = parseDay(str(fd, "targetDate"));
  if (startDate && targetDate && targetDate < startDate) throw new UserError("The target date can't be before the start date.");
  return { ...base, directorId, departmentId, startDate, targetDate, links: parseLinks(fd) };
}

export async function createProject(_: unknown, fd: FormData): Promise<ActionResult> {
  return safe(async () => {
    const me = await actionAdmin();
    const input = await readProject(fd);
    const [p] = await db.insert(projects).values(input).returning({ id: projects.id });
    await audit(me.id, "project.create", "project", p.id, { name: input.name });
    return { ok: true, message: "Project created.", redirectTo: `/projects/${p.id}` };
  });
}

export async function updateProject(id: string, _: unknown, fd: FormData): Promise<ActionResult> {
  return safe(async () => {
    const me = await actionAdmin();
    if (!isUuid(id)) throw new UserError("That project no longer exists.");
    const input = await readProject(fd);
    const r = await db.update(projects).set({ ...input, updatedAt: new Date() }).where(eq(projects.id, id)).returning({ id: projects.id });
    if (!r.length) throw new UserError("That project no longer exists.");
    await audit(me.id, "project.update", "project", id, { name: input.name, status: input.status });
    return { ok: true, message: "Project saved.", redirectTo: `/projects/${id}` };
  });
}

export async function deleteProject(id: string): Promise<ActionResult> {
  return safe(async () => {
    const me = await actionAdmin();
    if (!isUuid(id)) throw new UserError("That project no longer exists.");
    const p = (await db.select({ name: projects.name }).from(projects).where(eq(projects.id, id)).limit(1))[0];
    if (!p) throw new UserError("That project no longer exists.");
    const owned = await db.select({ id: files.id, key: files.storageKey }).from(files).where(and(eq(files.ownerType, "project"), eq(files.ownerId, id)));
    await db.delete(projects).where(eq(projects.id, id)); // milestones cascade; tasks keep existing without a project
    if (owned.length) {
      await db.delete(files).where(inArray(files.id, owned.map((f) => f.id)));
      for (const f of owned) await deleteStored(f.key).catch(() => {});
    }
    await audit(me.id, "project.delete", "project", id, { name: p.name });
    return { ok: true, message: `"${p.name}" was deleted.`, redirectTo: "/projects" };
  });
}

/* ── Milestones (admin or the project's director) ── */

async function milestoneWithProject(milestoneId: string) {
  if (!isUuid(milestoneId)) throw new UserError("That milestone no longer exists.");
  const m = (await db.select().from(milestones).where(eq(milestones.id, milestoneId)).limit(1))[0];
  if (!m) throw new UserError("That milestone no longer exists.");
  return m;
}

const titleOf = (fd: FormData) => {
  const t = str(fd, "title");
  if (!t) throw new UserError("Give the milestone a title.");
  if (t.length > 160) throw new UserError("Keep the milestone title under 160 characters.");
  return t;
};

export async function addMilestone(projectId: string, _: unknown, fd: FormData): Promise<ActionResult> {
  return safe(async () => {
    const me = await actionUser();
    const p = await requireProjectManager(me, projectId);
    const title = titleOf(fd);
    const dueDate = parseDay(str(fd, "dueDate"));
    const [{ m }] = await db.select({ m: max(milestones.position) }).from(milestones).where(eq(milestones.projectId, p.id));
    await db.insert(milestones).values({ projectId: p.id, title, dueDate, position: (m ?? -1) + 1 });
    await audit(me.id, "milestone.create", "project", p.id, { title });
    return { ok: true, message: "Milestone added." };
  });
}

export async function updateMilestone(milestoneId: string, _: unknown, fd: FormData): Promise<ActionResult> {
  return safe(async () => {
    const me = await actionUser();
    const m = await milestoneWithProject(milestoneId);
    await requireProjectManager(me, m.projectId);
    const title = titleOf(fd);
    const dueDate = parseDay(str(fd, "dueDate"));
    await db.update(milestones).set({ title, dueDate }).where(eq(milestones.id, m.id));
    await audit(me.id, "milestone.update", "project", m.projectId, { from: m.title, to: title });
    return { ok: true, message: "Milestone updated." };
  });
}

export async function toggleMilestone(milestoneId: string): Promise<ActionResult> {
  return safe(async () => {
    const me = await actionUser();
    const m = await milestoneWithProject(milestoneId);
    await requireProjectManager(me, m.projectId);
    const done = !m.completedAt;
    await db.update(milestones).set({ completedAt: done ? new Date() : null }).where(eq(milestones.id, m.id));
    await audit(me.id, done ? "milestone.complete" : "milestone.reopen", "project", m.projectId, { title: m.title });
    return { ok: true, message: done ? `Marked "${m.title}" done.` : `Reopened "${m.title}".` };
  });
}

export async function moveMilestone(milestoneId: string, dir: "up" | "down"): Promise<ActionResult> {
  return safe(async () => {
    const me = await actionUser();
    const m = await milestoneWithProject(milestoneId);
    await requireProjectManager(me, m.projectId);
    const list = await db.select({ id: milestones.id }).from(milestones).where(eq(milestones.projectId, m.projectId))
      .orderBy(asc(milestones.position), asc(milestones.title));
    const i = list.findIndex((x) => x.id === m.id);
    const j = dir === "up" ? i - 1 : i + 1;
    if (i < 0 || j < 0 || j >= list.length) return { ok: true };
    [list[i], list[j]] = [list[j], list[i]];
    await db.transaction(async (tx) => {
      for (let k = 0; k < list.length; k++) await tx.update(milestones).set({ position: k }).where(eq(milestones.id, list[k].id));
    });
    return { ok: true };
  });
}

export async function deleteMilestone(milestoneId: string): Promise<ActionResult> {
  return safe(async () => {
    const me = await actionUser();
    const m = await milestoneWithProject(milestoneId);
    await requireProjectManager(me, m.projectId);
    await db.delete(milestones).where(eq(milestones.id, m.id));
    await audit(me.id, "milestone.delete", "project", m.projectId, { title: m.title });
    return { ok: true, message: "Milestone deleted." };
  });
}

/* ── Documents: links + files (admin or the project's director) ── */

export async function addProjectLink(projectId: string, _: unknown, fd: FormData): Promise<ActionResult> {
  return safe(async () => {
    const me = await actionUser();
    const p = await requireProjectManager(me, projectId);
    const link = parseLink(str(fd, "label"), str(fd, "url"));
    if (p.links.length >= 25) throw new UserError("This project already has 25 links. Remove one first.");
    await db.update(projects).set({ links: [...p.links, link], updatedAt: new Date() }).where(eq(projects.id, p.id));
    await audit(me.id, "project.link_add", "project", p.id, { url: link.url });
    return { ok: true, message: "Link added." };
  });
}

export async function removeProjectLink(projectId: string, index: number, url: string): Promise<ActionResult> {
  return safe(async () => {
    const me = await actionUser();
    const p = await requireProjectManager(me, projectId);
    const at = p.links[index]?.url === url ? index : p.links.findIndex((l) => l.url === url);
    if (at < 0) return { ok: true, message: "Link removed." };
    const next = p.links.filter((_, k) => k !== at);
    await db.update(projects).set({ links: next, updatedAt: new Date() }).where(eq(projects.id, p.id));
    await audit(me.id, "project.link_remove", "project", p.id, { url });
    return { ok: true, message: "Link removed." };
  });
}

export async function uploadProjectFiles(projectId: string, _: unknown, fd: FormData): Promise<ActionResult> {
  return safe(async () => {
    const me = await actionUser();
    const p = await requireProjectManager(me, projectId);
    const list = filesOf(fd, "files");
    if (!list.length) throw new UserError("Choose at least one file to upload.");
    const rows = await saveUploads(list, { type: "project", id: p.id }, me.id);
    await audit(me.id, "project.file_upload", "project", p.id, { files: rows.map((r) => r.filename) });
    return { ok: true, message: rows.length === 1 ? "File uploaded." : `${rows.length} files uploaded.` };
  });
}

export async function deleteProjectFile(fileId: string): Promise<ActionResult> {
  return safe(async () => {
    const me = await actionUser();
    if (!isUuid(fileId)) throw new UserError("That file no longer exists.");
    const f = (await db.select().from(files).where(and(eq(files.id, fileId), eq(files.ownerType, "project"))).limit(1))[0];
    if (!f || !f.ownerId) throw new UserError("That file no longer exists.");
    await requireProjectManager(me, f.ownerId);
    await db.delete(files).where(eq(files.id, f.id));
    await deleteStored(f.storageKey).catch(() => {});
    await audit(me.id, "project.file_delete", "project", f.ownerId, { filename: f.filename });
    return { ok: true, message: "File removed." };
  });
}
