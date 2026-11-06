import "server-only";
import { and, asc, desc, eq, ilike, inArray, or, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { files, resources, users } from "@/db/schema";
import type { CurrentUser } from "./auth";
import { allowedVisibilities } from "./policy";
import { isUuid } from "./projects";

export const DEFAULT_CATEGORIES = ["Handbook", "Leadership", "Policies", "Guides", "Templates", "Branding", "Meeting notes", "General"];

const fields = {
  id: resources.id, title: resources.title, description: resources.description, category: resources.category, kind: resources.kind,
  url: resources.url, body: resources.body, fileId: resources.fileId, visibility: resources.visibility, pinned: resources.pinned,
  createdAt: resources.createdAt, updatedAt: resources.updatedAt,
  fileName: files.filename, fileSize: files.size, fileMime: files.mimeType, authorName: users.name,
};

/** Resources the viewer may see, optionally filtered by search text and category. */
export async function listResources(viewer: CurrentUser, f: { q?: string; category?: string } = {}) {
  const conds: SQL[] = [inArray(resources.visibility, allowedVisibilities(viewer.role))];
  if (f.category) conds.push(eq(resources.category, f.category));
  if (f.q) {
    const like = `%${f.q.replace(/[\\%_]/g, (m) => `\\${m}`)}%`;
    conds.push(or(ilike(resources.title, like), ilike(resources.description, like), ilike(resources.body, like), ilike(files.filename, like))!);
  }
  return db.select(fields).from(resources)
    .leftJoin(files, eq(files.id, resources.fileId))
    .leftJoin(users, eq(users.id, resources.createdById))
    .where(and(...conds))
    .orderBy(desc(resources.pinned), asc(resources.title));
}
export type ResourceItem = Awaited<ReturnType<typeof listResources>>[number];

/** Categories: defaults first (in order), then any others found in data the viewer can see. */
export async function resourceCategories(viewer: CurrentUser) {
  const rows = await db.selectDistinct({ c: resources.category }).from(resources)
    .where(inArray(resources.visibility, allowedVisibilities(viewer.role)));
  const extra = rows.map((r) => r.c).filter((c) => !DEFAULT_CATEGORIES.includes(c)).sort((a, b) => a.localeCompare(b));
  return [...DEFAULT_CATEGORIES, ...extra];
}

/** All category names in use (for the admin form suggestions). */
export async function allResourceCategories() {
  const rows = await db.selectDistinct({ c: resources.category }).from(resources);
  return [...new Set([...DEFAULT_CATEGORIES, ...rows.map((r) => r.c)])];
}

export async function getResource(viewer: CurrentUser, id: string) {
  if (!isUuid(id)) return null;
  const r = (await db.select(fields).from(resources)
    .leftJoin(files, eq(files.id, resources.fileId))
    .leftJoin(users, eq(users.id, resources.createdById))
    .where(and(eq(resources.id, id), inArray(resources.visibility, allowedVisibilities(viewer.role)))).limit(1))[0];
  return r ?? null;
}
