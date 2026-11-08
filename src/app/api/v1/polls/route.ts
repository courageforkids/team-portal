import { desc } from "drizzle-orm";
import { db } from "@/db";
import { pollVotes, polls } from "@/db/schema";
import { apiRoute, jsonBody } from "@/server/api-auth";
import { saveApiDraft } from "@/server/drafts";
import { createPollFromApi } from "@/server/v1-creators";
import { bool } from "@/server/api-helpers";

export const GET = apiRoute(async () => {
  const ps = await db.select().from(polls).orderBy(desc(polls.createdAt)).limit(20);
  const votes = await db.select().from(pollVotes);
  return { polls: ps.map((p) => ({ id: p.id, question: p.question, open: !p.closedAt && !(p.closesAt && p.closesAt <= new Date()), votes: votes.filter((v) => v.pollId === p.id).length,
    results: p.options.map((o) => ({ label: o.label, count: votes.filter((v) => v.pollId === p.id && v.optionIds.includes(o.id)).length })) })) };
});

export const POST = apiRoute(async (req, actor) => {
  const b = await jsonBody(req);
  if (bool(b.draft, false)) return saveApiDraft(actor, "poll", b);
  return createPollFromApi(b, actor);
});
