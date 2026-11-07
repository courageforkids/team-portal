import "server-only";
import { z } from "zod";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { departments, projects, taskCategories, users } from "@/db/schema";
import { ApiError } from "./api-auth";
import { parseLocalInput, DEFAULT_TZ } from "@/lib/dates";

/** Accepts an id, an exact name, or a unique first name ("Julia"). */
export async function resolvePeople(refs: unknown): Promise<string[]> {
  const list = z.array(z.string().min(1)).parse(Array.isArray(refs) ? refs : refs ? [refs] : []);
  if (!list.length) return [];
  const people = await db.select({ id: users.id, name: users.name }).from(users).where(eq(users.status, "active"));
  return list.map((ref) => {
    const r = ref.trim().toLowerCase();
    const hit = people.find((p) => p.id === ref) ?? people.find((p) => p.name.toLowerCase() === r);
    if (hit) return hit.id;
    const firsts = people.filter((p) => p.name.toLowerCase().split(/\s+/)[0] === r);
    if (firsts.length === 1) return firsts[0].id;
    throw new ApiError(400, firsts.length > 1 ? `More than one person is named “${ref}”. Use their full name or id.` : `No active member matches “${ref}”.`);
  });
}

async function resolveBy<T extends { id: string; name: string }>(rows: T[], ref: unknown, what: string): Promise<string | null> {
  if (ref === undefined || ref === null || ref === "") return null;
  const s = String(ref).trim().toLowerCase();
  const hit = rows.find((r) => r.id === ref) ?? rows.find((r) => r.name.toLowerCase() === s) ?? rows.find((r) => r.name.toLowerCase().includes(s));
  if (!hit) throw new ApiError(400, `No ${what} matches “${ref}”.`);
  return hit.id;
}
export const resolveDepartment = async (ref: unknown) => resolveBy(await db.select({ id: departments.id, name: departments.name }).from(departments), ref, "department");
export const resolveProject = async (ref: unknown) => resolveBy(await db.select({ id: projects.id, name: projects.name }).from(projects), ref, "project");
export const resolveCategory = async (ref: unknown) => resolveBy(await db.select({ id: taskCategories.id, name: taskCategories.name }).from(taskCategories).orderBy(asc(taskCategories.name)), ref, "category");

/** ISO timestamps ("2026-12-01T18:00:00-05:00") or local wall time ("2026-12-01T18:00", "2026-12-01") in tz. */
export function parseWhen(v: unknown, tz = DEFAULT_TZ, field = "date"): Date | null {
  if (v === undefined || v === null || v === "") return null;
  const s = String(v);
  const d = /[zZ]|[+-]\d{2}:?\d{2}$/.test(s) ? new Date(s) : parseLocalInput(s, tz);
  if (!d || isNaN(d.getTime())) throw new ApiError(400, `“${field}” must be a date like 2026-12-01T18:00 (Eastern) or an ISO timestamp.`);
  return d;
}

export const bool = (v: unknown, dflt: boolean) => (typeof v === "boolean" ? v : v === undefined ? dflt : v === "true" || v === 1);
export const text = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
