import "server-only";
import { and, asc, eq, gte, inArray, lte, or, isNull, lt, sql } from "drizzle-orm";
import { db } from "@/db";
import { fridayActions as actions, fridayBriefings as briefings, fridayEvents as events, fridayJobs as jobs, fridaySettings as settings } from "@/db/schema";
import { getSettings } from "./policy";
import { localParts } from "@/lib/friday-pure";
import { aiConfigured, logEvent, runAgent, type AgentMessage } from "./agent";
import { fridayOwner } from "./owner";

const MAX_STEPS_PER_JOB = 40;
const MAX_ATTEMPTS = 4;

export { localParts };
export const nowLine = (tz: string) => new Date().toLocaleString("en-US", { timeZone: tz, weekday: "long", month: "long", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });

const NIGHTLY = `Overnight operations. Jacob is asleep. Work through this using only Level 1 tools unless something truly needs his decision (queue it for approval; never wait for an answer):
1. Read the team portal: overdue tasks, tasks due in the next 7 days, the review queue, and calendar events for the next 14 days. If the portal isn't connected, note that and continue with memory.
2. Search memory for deadlines, open decisions and partner follow-ups that are coming due.
3. Where a follow-up is clearly needed (a partner who hasn't been answered, a thank-you that's owed, a deadline reminder), write a draft with save_draft. Do not invent facts; leave a clear [placeholder] where you don't know something.
4. If useful team tasks are missing, prepare them with portal_draft_task (drafts only) in batch "Friday overnight".
5. Save anything important you learned to memory with its source.
6. Finish with a short internal summary of what you did and what needs Jacob. Keep it factual.`;

const BRIEFING = `Write Jacob's morning executive briefing. It will be read aloud, so write it as natural speech: no headings, bullets, markdown or symbols. Start with "Good morning, sir." Then cover, in this order and only from verified sources (recent_activity for what you did overnight, portal tools for current status, memory for deadlines):
what you completed overnight (counts from the log), decisions waiting in the approval center, the most important deadlines this week, anything urgent, and your top recommendation for today. Under 180 words. If something failed or couldn't be checked, say so plainly. End by asking whether he'd like to begin.`;

/** Queues tonight's review and this morning's briefing once per day, at the hours in Settings (owner's time zone). */
async function scheduleDaily() {
  const s = await getSettings();
  const o = await fridayOwner();
  if (!o || !aiConfigured()) return; // without an API key the overnight work runs as a Claude scheduled task instead
  const { date, hour } = localParts(o.timezone);
  if (hour >= s.nightlyHour && hour < s.briefingHour && s.lastNightlyOn !== date) {
    await db.insert(jobs).values({ kind: "nightly", title: `Overnight operations (${date})`, instructions: NIGHTLY });
    await db.update(settings).set({ lastNightlyOn: date }).where(eq(settings.id, 1));
  }
  if (hour >= s.briefingHour && s.lastBriefingOn !== date) {
    await db.insert(jobs).values({ kind: "briefing", title: `Morning briefing (${date})`, instructions: BRIEFING });
    await db.update(settings).set({ lastBriefingOn: date }).where(eq(settings.id, 1));
  }
}

/** Atomically claims one due job with a 3-minute lease (safe if two workers overlap or a run crashes). */
async function claimJob() {
  const rows = await db.execute(sql`
    update jobs set status = 'running', locked_until = now() + interval '3 minutes', attempts = attempts + 1
    where id = (
      select id from jobs
      where (status = 'queued' and run_at <= now()) or (status = 'running' and locked_until < now())
      order by run_at asc limit 1 for update skip locked
    ) returning id`);
  const id = (rows as unknown as { id: string }[])[0]?.id;
  if (!id) return null;
  return (await db.select().from(jobs).where(eq(jobs.id, id)))[0] ?? null;
}

async function runJob(job: typeof jobs.$inferSelect, deadline: number) {
  const o = await fridayOwner();
  if (!o) throw new Error("Friday has no active owner.");
  const tz = o.timezone;
  const messages: AgentMessage[] = (job.state as AgentMessage[] | null) ?? [{ role: "user", content: job.instructions }];
  const context = `Background job "${job.title}" (id ${job.id}). Now: ${nowLine(tz)} (${tz}). Jacob is not watching; do not ask him questions, queue decisions instead.`;
  try {
    const r = await runAgent({ owner: o, messages, jobId: job.id, context, effort: "medium", maxSteps: 8, deadline, timezone: tz });
    const steps = job.steps + Math.max(1, Math.ceil((r.messages.length - messages.length) / 2));
    if (r.done) {
      const failed = r.stopped === "no_key" || r.stopped === "budget" || r.stopped === "refusal";
      await db.update(jobs).set({ status: r.stopped === "paused" ? "queued" : failed ? "failed" : "done", state: r.messages as object, steps, result: r.text, error: failed ? r.stopped : null, lockedUntil: null, finishedAt: r.stopped === "paused" ? null : new Date(), runAt: r.stopped === "paused" ? new Date(Date.now() + 10 * 60_000) : job.runAt }).where(eq(jobs.id, job.id));
      if (job.kind === "briefing" && !failed && r.stopped !== "paused" && r.text) {
        const { date } = localParts(tz);
        await db.insert(briefings).values({ forDate: date, content: r.text }).onConflictDoUpdate({ target: briefings.forDate, set: { content: r.text, createdAt: new Date() } });
        await logEvent(job.id, "briefing", null, true, { date });
      }
      await logEvent(job.id, "job", null, !failed, { title: job.title, outcome: r.stopped ?? "done" });
    } else if (steps >= MAX_STEPS_PER_JOB) {
      await db.update(jobs).set({ status: "failed", state: r.messages as object, steps, error: "Stopped after too many steps.", lockedUntil: null, finishedAt: new Date() }).where(eq(jobs.id, job.id));
      await logEvent(job.id, "job", null, false, { title: job.title, outcome: "too many steps" });
    } else {
      // Out of time this tick: save progress and continue on the next one.
      await db.update(jobs).set({ status: "queued", state: r.messages as object, steps, attempts: 0, lockedUntil: null, runAt: new Date() }).where(eq(jobs.id, job.id));
    }
  } catch (e) {
    const msg = (e as Error).message || "error";
    const give = job.attempts >= MAX_ATTEMPTS;
    await db.update(jobs).set({ status: give ? "failed" : "queued", error: msg, lockedUntil: null, runAt: new Date(Date.now() + 2 ** job.attempts * 60_000), finishedAt: give ? new Date() : null }).where(eq(jobs.id, job.id));
    await logEvent(job.id, "error", null, false, { title: job.title, error: msg, willRetry: !give });
  }
}

/** One worker tick, called by the scheduler every few minutes. Works until the time budget runs out. */
export async function workerTick(budgetMs = Number(process.env.WORKER_BUDGET_MS ?? 45_000)) {
  const started = Date.now();
  const deadline = started + budgetMs;
  await db.update(settings).set({ lastWorkerAt: new Date() }).where(eq(settings.id, 1));
  await scheduleDaily();
  if ((await getSettings()).paused) return { ran: 0, paused: true };
  let ran = 0;
  while (Date.now() < deadline - 5_000) {
    const job = await claimJob();
    if (!job) break;
    await runJob(job, deadline);
    ran++;
  }
  return { ran, paused: false, ms: Date.now() - started };
}

/** Status numbers for the dashboard. */
export async function workerStatus() {
  const s = await getSettings();
  const since = new Date(Date.now() - 24 * 36e5);
  const [q, f, pending, errs] = await Promise.all([
    db.select({ n: sql<number>`count(*)::int` }).from(jobs).where(inArray(jobs.status, ["queued", "running"])),
    db.select({ n: sql<number>`count(*)::int` }).from(jobs).where(and(eq(jobs.status, "failed"), gte(jobs.createdAt, since))),
    db.select({ n: sql<number>`count(*)::int` }).from(actions).where(eq(actions.status, "pending")),
    db.select({ n: sql<number>`count(*)::int` }).from(events).where(and(eq(events.ok, false), gte(events.createdAt, since))),
  ]);
  return { lastWorkerAt: s.lastWorkerAt, queued: q[0].n, failed24h: f[0].n, pendingApprovals: pending[0].n, errors24h: errs[0].n };
}

export async function dueJobs() {
  return db.select().from(jobs).where(or(and(eq(jobs.status, "queued"), lte(jobs.runAt, new Date())), and(eq(jobs.status, "running"), or(isNull(jobs.lockedUntil), lt(jobs.lockedUntil, new Date()))))).orderBy(asc(jobs.runAt));
}
