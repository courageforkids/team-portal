import "server-only";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { db } from "@/db";
import { announcements, events, meetings, polls, resources, users } from "@/db/schema";
import { ApiError } from "@/server/api-auth";
import { bool, parseWhen, resolveDepartment, resolveProject, text } from "@/server/api-helpers";
import { notifyAnnouncementAudience } from "@/server/maintenance";
import { audienceMatches } from "@/server/policy";
import { notify } from "@/server/notify";
import { audit } from "@/server/audit";
import type { CurrentUser } from "@/server/auth";

/** Create functions shared by the API and by publishing drafts. */
export async function createAnnouncementFromApi(b: Record<string, unknown>, actor: CurrentUser) {
  const title = text(b.title, 160), body = text(b.body, 10000);
  if (!title || !body) throw new ApiError(400, "“title” and “body” are required.");
  const roles = z.array(z.enum(["admin", "leader", "volunteer"])).parse((b.audience as { roles?: unknown })?.roles ?? []);
  const deptRefs = z.array(z.string()).parse((b.audience as { departments?: unknown })?.departments ?? []);
  const departmentIds = (await Promise.all(deptRefs.map((d) => resolveDepartment(d)))).filter((x): x is string => !!x);
  const publishAt = parseWhen(b.publishAt, undefined, "publishAt") ?? new Date();
  const [a] = await db.insert(announcements).values({
    title, body, category: z.enum(["update", "reminder", "event", "news", "policy", "meeting"]).parse(b.category ?? "update"),
    pinned: bool(b.pinned, false), requireAck: bool(b.requireAck, false), audience: { roles, departmentIds }, publishAt, authorId: actor.id,
  }).returning();
  if (publishAt <= new Date()) await notifyAnnouncementAudience(a.id);
  await audit(actor.id, "announcement.create", "announcement", a.id, { title, via: "api" });
  return { ok: true, id: a.id, url: `/announcements/${a.id}`, scheduled: publishAt > new Date() };
}

export async function createEventFromApi(b: Record<string, unknown>, actor: CurrentUser) {
  const title = text(b.title, 160);
  if (!title) throw new ApiError(400, "“title” is required.");
  const startsAt = parseWhen(b.startsAt, undefined, "startsAt");
  if (!startsAt) throw new ApiError(400, "“startsAt” is required.");
  const endsAt = parseWhen(b.endsAt, undefined, "endsAt");
  if (endsAt && endsAt < startsAt) throw new ApiError(400, "“endsAt” must be after “startsAt”.");
  const [e] = await db.insert(events).values({
    title, startsAt, endsAt, allDay: bool(b.allDay, false), location: text(b.location, 200), description: text(b.description, 4000),
    type: z.enum(["meeting", "community", "fundraising", "volunteer", "milestone", "other"]).parse(b.type ?? "other"),
    visibility: z.enum(["everyone", "leadership", "admin"]).parse(b.visibility ?? "everyone"), projectId: await resolveProject(b.project), createdById: actor.id,
  }).returning();
  await audit(actor.id, "event.create", "event", e.id, { title, via: "api" });
  return { ok: true, id: e.id, url: `/volunteer/events/${e.id}` };
}

export async function createPollFromApi(b: Record<string, unknown>, actor: CurrentUser) {
  const question = text(b.question, 200);
  const options = [...new Set(z.array(z.string().min(1).max(100)).min(2).max(12).parse(b.options).map((o) => o.trim()))];
  if (!question || options.length < 2) throw new ApiError(400, "“question” and at least 2 different “options” are required.");
  const roles = z.array(z.enum(["admin", "leader", "volunteer"])).parse(b.roles ?? []);
  const closesAt = parseWhen(b.closesAt, undefined, "closesAt");
  const [p] = await db.insert(polls).values({
    question, description: text(b.description, 1000), options: options.map((label) => ({ id: randomUUID().slice(0, 8), label })),
    multiple: bool(b.multiple, false), anonymous: bool(b.anonymous, false), showResults: z.enum(["always", "after_vote", "after_close"]).parse(b.showResults ?? "after_vote"),
    audience: roles.length ? { roles } : {}, closesAt, createdById: actor.id,
  }).returning();
  const people = await db.select({ id: users.id, role: users.role, departmentId: users.departmentId }).from(users).where(eq(users.status, "active"));
  await notify(people.filter((x) => audienceMatches(p.audience, x)).map((x) => x.id), { type: "announcement", title: `New poll: ${question}`, href: `/polls#poll-${p.id}`, dedupeKey: `poll:${p.id}`, excludeUserId: actor.id });
  return { ok: true, id: p.id, url: `/polls#poll-${p.id}` };
}

export async function createResourceFromApi(b: Record<string, unknown>, actor: CurrentUser) {
  const title = text(b.title, 160);
  if (!title) throw new ApiError(400, "“title” is required.");
  const kind = z.enum(["note", "link"]).parse(b.kind ?? (b.url ? "link" : "note"));
  const url = kind === "link" ? z.string().url().refine((u) => /^https?:/.test(u), "Links must start with http(s)://").parse(b.url) : null;
  const body = kind === "note" ? text(b.body, 50000) : null;
  if (kind === "note" && !body) throw new ApiError(400, "A note needs a “body”.");
  const [r] = await db.insert(resources).values({
    title, description: text(b.description, 1000), category: text(b.category, 60) || "General", kind, url, body,
    visibility: z.enum(["everyone", "leadership", "admin"]).parse(b.visibility ?? "everyone"), pinned: bool(b.pinned, false), createdById: actor.id,
  }).returning();
  await audit(actor.id, "resource.create", "resource", r.id, { title, via: "api" });
  return { ok: true, id: r.id, url: `/resources/${r.id}` };
}

export async function createMeetingFromApi(b: Record<string, unknown>, actor: CurrentUser) {
  let eventId: string | null = null, title = text(b.title, 120), startsAt = parseWhen(b.startsAt, undefined, "startsAt");
  if (b.event) {
    const ev = (await db.select().from(events).where(eq(events.id, z.string().uuid().parse(b.event))).limit(1))[0];
    if (!ev) throw new ApiError(404, "Event not found.");
    const existing = (await db.select().from(meetings).where(eq(meetings.eventId, ev.id)).limit(1))[0];
    if (existing) {
      if (typeof b.agenda === "string") await db.update(meetings).set({ agenda: text(b.agenda, 20000), updatedAt: new Date(), updatedById: actor.id }).where(eq(meetings.id, existing.id));
      return { ok: true, id: existing.id, url: `/meetings/${existing.id}`, existed: true };
    }
    eventId = ev.id; title ||= ev.title; startsAt ??= ev.startsAt;
  }
  if (!title || !startsAt) throw new ApiError(400, "“title” and “startsAt” are required (or pass “event”).");
  const [m] = await db.insert(meetings).values({
    eventId, title, startsAt, agenda: text(b.agenda, 20000), visibility: z.enum(["everyone", "leadership", "admin"]).parse(b.visibility ?? "everyone"), createdById: actor.id, updatedById: actor.id,
  }).returning();
  return { ok: true, id: m.id, url: `/meetings/${m.id}` };
}
