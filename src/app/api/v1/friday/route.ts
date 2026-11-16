import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { fridayActions, fridayBriefings, fridayMemories } from "@/db/schema";
import { ApiError, apiRoute, jsonBody } from "@/server/api-auth";
import { fridayOwner } from "@/server/friday/owner";
import { getSettings } from "@/server/friday/policy";
import { logEvent, runTool } from "@/server/friday/agent";
import { TOOLS } from "@/server/friday/tools";
import { localParts } from "@/lib/friday-pure";

/**
 * F.R.I.D.A.Y.'s connection for her scheduled overnight run (a Claude task using the owner's API key).
 * Only the key of the admin who owns Friday works here, and every tool still goes through the same
 * permission gate: Level 1 runs, Level 2/3 lands in the approval center.
 */
async function ownerOnly(actorId: string) {
  const o = await fridayOwner();
  if (!o || o.id !== actorId) throw new ApiError(403, "Only F.R.I.D.A.Y.'s owner can use this.");
  return o;
}

export const GET = apiRoute(async (_req, actor) => {
  const o = await ownerOnly(actor.id);
  const s = await getSettings();
  const [mem, pending, last] = await Promise.all([
    db.select({ id: fridayMemories.id, kind: fridayMemories.kind, title: fridayMemories.title, content: fridayMemories.content, source: fridayMemories.source, verified: fridayMemories.verified })
      .from(fridayMemories).orderBy(desc(fridayMemories.updatedAt)).limit(40),
    db.select({ id: fridayActions.id, summary: fridayActions.summary }).from(fridayActions).where(eq(fridayActions.status, "pending")),
    db.select({ forDate: fridayBriefings.forDate }).from(fridayBriefings).orderBy(desc(fridayBriefings.forDate)).limit(1),
  ]);
  return {
    owner: o.name, paused: s.paused, timezone: o.timezone,
    tools: TOOLS.map((t) => ({ name: t.name, level: t.level, description: t.description })),
    memories: mem, pendingApprovals: pending, lastBriefing: last[0]?.forDate ?? null,
    howTo: "POST {action:'tool', name, input} to run a tool; {action:'briefing', content} to save this morning's briefing; {action:'log', summary} to record what the run did.",
  };
});

const Body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("tool"), name: z.string().min(1).max(60), input: z.record(z.string(), z.unknown()).default({}) }),
  z.object({ action: z.literal("briefing"), content: z.string().min(10).max(6000) }),
  z.object({ action: z.literal("log"), summary: z.string().min(3).max(4000) }),
]);

export const POST = apiRoute(async (req, actor) => {
  const o = await ownerOnly(actor.id);
  if ((await getSettings()).paused) throw new ApiError(423, "Friday is paused with the emergency stop. Do nothing.");
  const parsed = Body.safeParse(await jsonBody(req));
  if (!parsed.success) throw new ApiError(400, parsed.error.issues[0]?.message ?? "Invalid body.");
  const b = parsed.data;
  if (b.action === "tool") {
    const r = await runTool({ jobId: null, timezone: o.timezone, owner: o }, b.name, b.input);
    let result: unknown = r.content;
    try { result = JSON.parse(r.content); } catch { /* plain text */ }
    return { ok: !r.isError, result };
  }
  if (b.action === "briefing") {
    const { date } = localParts(o.timezone);
    await db.insert(fridayBriefings).values({ forDate: date, content: b.content }).onConflictDoUpdate({ target: fridayBriefings.forDate, set: { content: b.content, createdAt: new Date() } });
    await logEvent(null, "briefing", null, true, { date, via: "scheduled task" });
    return { ok: true, date };
  }
  await logEvent(null, "job", "scheduled_run", true, { title: "Overnight run (scheduled task)", summary: b.summary });
  return { ok: true };
});
