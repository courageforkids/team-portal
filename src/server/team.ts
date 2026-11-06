import "server-only";
import { and, asc, count, eq } from "drizzle-orm";
import { db } from "@/db";
import { departments, users } from "@/db/schema";
import { isUuid } from "./projects";

/** Directory fields only — never performance, tasks or private details. */
const directoryFields = {
  id: users.id, name: users.name, title: users.title, role: users.role, avatarFileId: users.avatarFileId,
  responsibilities: users.responsibilities, departmentId: users.departmentId,
  departmentName: departments.name, departmentColor: departments.color, departmentSlug: departments.slug,
};

export async function getDirectory() {
  return db.select(directoryFields).from(users)
    .leftJoin(departments, eq(departments.id, users.departmentId))
    .where(eq(users.status, "active")).orderBy(asc(users.name));
}
export type DirectoryPerson = Awaited<ReturnType<typeof getDirectory>>[number];

export async function getProfile(id: string) {
  if (!isUuid(id)) return null;
  const r = (await db.select({ ...directoryFields, email: users.email, showEmail: users.showEmail, createdAt: users.createdAt })
    .from(users).leftJoin(departments, eq(departments.id, users.departmentId))
    .where(and(eq(users.id, id), eq(users.status, "active"))).limit(1))[0];
  if (!r) return null;
  const { email, showEmail, ...rest } = r;
  return { ...rest, email: showEmail ? email : null };
}

export async function getDepartmentBySlug(slug: string) {
  const d = (await db.select().from(departments).where(eq(departments.slug, slug)).limit(1))[0];
  return d ?? null;
}

export async function departmentMemberCounts() {
  const rows = await db.select({ departmentId: users.departmentId, n: count() }).from(users)
    .where(eq(users.status, "active")).groupBy(users.departmentId);
  return new Map(rows.filter((r) => r.departmentId).map((r) => [r.departmentId!, r.n]));
}

export async function getPersonLite(id: string | null) {
  if (!id) return null;
  return (await db.select({ id: users.id, name: users.name, title: users.title, avatarFileId: users.avatarFileId })
    .from(users).where(and(eq(users.id, id), eq(users.status, "active"))).limit(1))[0] ?? null;
}
