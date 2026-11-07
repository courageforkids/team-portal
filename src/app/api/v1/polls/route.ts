import { z } from "zod";
import { desc, eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { db } from "@/db";
import { pollVotes, polls, users } from "@/db/schema";
import { apiRoute, ApiError, jsonBody } from "@/server/api-auth";
import { bool, parseWhen, text } from "@/server/api-helpers";
import { audienceMatches } from "@/server/policy";
import { notify } from "@/server/notify";

export const GET = apiRoute(async () => {
  const ps = await db.select().from(polls).orderBy(desc(polls.createdAt)).limit(20);
  const votes = await db.select().from(pollVotes);
  return { polls: ps.map((p) => ({ id: p.id, question: p.question, open: !p.closedAt && !(p.closesAt && p.closesAt <= new Date()), votes: votes.filter((v) => v.pollId === p.id).length,
    results: p.options.map((o) => ({ label: o.label, count: votes.filter((v) => v.pollId === p.id && v.optionIds.includes(o.id)).length })) })) };
});

export const POST = apiRoute(async (req, actor) => {
  const b = await jsonBody(req);
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
});
