import { z } from "zod";
import { desc } from "drizzle-orm";
import { db } from "@/db";
import { announcements } from "@/db/schema";
import { apiRoute, ApiError, jsonBody } from "@/server/api-auth";
import { bool, parseWhen, resolveDepartment, text } from "@/server/api-helpers";
import { notifyAnnouncementAudience } from "@/server/maintenance";
import { audit } from "@/server/audit";

export const GET = apiRoute(async () => ({
  announcements: await db.select({ id: announcements.id, title: announcements.title, category: announcements.category, pinned: announcements.pinned, publishAt: announcements.publishAt })
    .from(announcements).orderBy(desc(announcements.publishAt)).limit(30),
}));

export const POST = apiRoute(async (req, actor) => {
  const b = await jsonBody(req);
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
});
