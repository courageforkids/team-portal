import { and, asc, desc, eq, gte, lte, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { events as calendar, fridayActions, fridayBriefings, fridayEvents, fridayJobs, fridayMemories, fridayMessages, fridayPartners, fridaySettings } from "@/db/schema";
import { cashBetween, yearTotals } from "@/server/donations";
import { getPeople } from "@/server/queries";
import { actionFridayOwner } from "@/server/friday/access";
import { aiConfigured, logEvent, runAgent, type AgentMessage } from "@/server/friday/agent";
import { nowLine } from "@/server/friday/worker";
import { loadTasks } from "@/server/queries";
import type { CurrentUser } from "@/server/auth";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

const Body = z.object({ text: z.string().trim().min(1).max(4000), channel: z.enum(["text", "voice"]).default("text") });

/** Without an API key Friday can't hold a conversation, but she answers from real data and queues bigger requests for her next scheduled run. */
async function limitedReply(me: CurrentUser, raw: string): Promise<string> {
  const text = raw.replace(/^\s*(hey\s+|ok(ay)?\s+)?fri(day|dae)[\s,.!?]*/i, "").trim();
  const t = text.toLowerCase();
  const first = (n: string) => n.split(" ")[0];
  const todayLocal = new Intl.DateTimeFormat("en-CA", { timeZone: me.timezone }).format(new Date());
  if (!t || /^(hi|hello|hey|yo|you there|are you there)\b/.test(t)) return "At your service, sir. Ask for your briefing, approvals, what's overdue, fundraising, this week's calendar, the team, or partnerships, or give me something to work on.";
  if (/good morning|briefing|morning report/.test(t)) {
    const [b] = await db.select().from(fridayBriefings).orderBy(desc(fridayBriefings.forDate)).limit(1);
    if (!b) return "Good morning, sir. I don't have a briefing yet. My first one arrives after my overnight run.";
    return b.forDate === todayLocal ? b.content : `My latest briefing is from ${b.forDate}. ${b.content}`;
  }
  if (/^(pause|stop everything|emergency stop|stand down|halt)\b/.test(t)) {
    await db.update(fridaySettings).set({ paused: true, updatedAt: new Date() }).where(eq(fridaySettings.id, 1));
    await logEvent(null, "security", "emergency_stop", true, { paused: true, via: "voice or chat" });
    return "Understood. I've stopped everything. Nothing will run until you press Resume in System Status.";
  }
  if (/^(remember|note|make a note)( that)?\b/.test(t)) {
    const content = text.replace(/^(remember|note|make a note)( that)?\s*/i, "").trim();
    if (content.length < 3) return "What should I remember, sir?";
    await db.insert(fridayMemories).values({ kind: "note", title: content.slice(0, 80), content, source: "Jacob told me", verified: true });
    return "Noted, sir. It's in my memory.";
  }
  // Requests to do work go straight to her queue, even if they mention a topic like fundraising.
  if (/^(please\s+|can you\s+|could you\s+|i need you to\s+)?(prepare|draft|write|research|find|create|plan|make|build|organi[sz]e|look into|figure out|work on|handle|take care|reach out|follow up|put together|come up with|help me|go through|clean up|update|review|summari[sz]e|check on)\b/.test(t)) {
    await db.insert(fridayJobs).values({ kind: "objective", title: text.slice(0, 120), instructions: text });
    await logEvent(null, "job", null, true, { title: text.slice(0, 120), outcome: "queued from chat" });
    return "On it, sir. I've added that to my work queue. I'll pick it up on my next run, within the hour during the day or overnight, and you'll find the results under Autonomous Agents, with anything that needs your sign-off in the Approval Center.";
  }
  if (/approv|pending|waiting for me|decision/.test(t)) {
    const rows = await db.select({ summary: fridayActions.summary }).from(fridayActions).where(eq(fridayActions.status, "pending"));
    if (!rows.length) return "Nothing is waiting for your approval, sir.";
    return `${rows.length === 1 ? "One item is" : `${rows.length} items are`} waiting for your approval: ${rows.slice(0, 5).map((r) => r.summary).join("; ")}. You can approve them in the Approval Center.`;
  }
  if (/fundrais|donation|raised|money|gifts?\b/.test(t)) {
    const now = new Date(), ymd = (d: Date) => d.toISOString().slice(0, 10);
    const m0 = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)), m1 = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)), mp = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
    const [a, b, y] = await Promise.all([cashBetween(ymd(m0), ymd(m1)), cashBetween(ymd(mp), ymd(m0)), yearTotals(now.getUTCFullYear())]);
    const usd = (c: number) => `$${(c / 100).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
    return `From gifts logged in the portal: ${usd(a.cents)} in cash this month from ${a.count} gift${a.count === 1 ? "" : "s"}, compared with ${usd(b.cents)} last month. This year: ${usd(y.cashCents)} in cash and ${y.inKind} in-kind gift${y.inKind === 1 ? "" : "s"} from ${y.donors} donor${y.donors === 1 ? "" : "s"}.`;
  }
  if (/calendar|schedule|this week|events?\b|what's coming|upcoming/.test(t)) {
    const rows = await db.select({ title: calendar.title, startsAt: calendar.startsAt }).from(calendar).where(and(gte(calendar.startsAt, new Date()), lte(calendar.startsAt, new Date(Date.now() + 7 * 864e5)))).orderBy(asc(calendar.startsAt)).limit(8);
    if (!rows.length) return "Nothing is on the portal calendar for the next seven days.";
    return `Coming up this week: ${rows.map((r) => `${r.title} on ${r.startsAt.toLocaleString("en-US", { timeZone: me.timezone, weekday: "long", hour: "numeric", minute: "2-digit" })}`).join("; ")}.`;
  }
  if (/overdue|late|behind|deadline|tasks?\b/.test(t)) {
    const rows = await loadTasks(me, { scope: "all", view: "overdue", limit: 10 });
    if (!rows.length) return "Nothing is overdue in the portal right now.";
    return `${rows.length} task${rows.length === 1 ? " is" : "s are"} overdue: ${rows.slice(0, 4).map((r) => `${r.title}${r.assignees.length ? ` (${r.assignees.map((a) => first(a.name)).join(", ")})` : ""}`).join("; ")}.`;
  }
  if (/partner|sponsor|brands?\b|pipeline/.test(t)) {
    const rows = await db.select().from(fridayPartners);
    if (!rows.length) return "The partnership tracker is empty so far.";
    const by = (st: string) => rows.filter((r) => r.status === st).length;
    const due = rows.filter((r) => r.nextStepOn && r.nextStepOn <= todayLocal);
    return `I'm tracking ${rows.length} partners: ${by("committed")} committed, ${by("received")} delivered, ${by("replied")} replied, ${by("contacted")} waiting on a reply.${due.length ? ` Follow-ups due: ${due.slice(0, 4).map((r) => `${r.name}, ${r.nextStep}`).join("; ")}.` : ""}`;
  }
  if (/\bteam\b|who's on|members/.test(t)) {
    const people = await getPeople();
    return `The active team is ${people.map((p) => first(p.name)).join(", ")}.`;
  }
  if (/what did you do|activity|last night|overnight/.test(t)) {
    const rows = await db.select({ kind: fridayEvents.kind, ok: fridayEvents.ok }).from(fridayEvents).where(gte(fridayEvents.createdAt, new Date(Date.now() - 864e5)));
    if (!rows.length) return "My log is empty for the last 24 hours.";
    const n = (k: string) => rows.filter((r) => r.kind === k).length;
    return `In the last 24 hours I ran ${n("tool")} actions, queued ${n("approval_requested")} for your approval, finished ${n("job")} jobs and posted ${n("report")} reports. ${rows.filter((r) => !r.ok).length} things failed. The details are under Autonomous Agents.`;
  }
  // Anything else that sounds like work goes to the queue for her next scheduled run.
  if (text.split(/\s+/).length >= 3) {
    await db.insert(fridayJobs).values({ kind: "objective", title: text.slice(0, 120), instructions: text });
    await logEvent(null, "job", null, true, { title: text.slice(0, 120), outcome: "queued from chat" });
    return "On it, sir. I've added that to my work queue. I'll pick it up on my next run, within the hour during the day or overnight, and you'll find the results under Autonomous Agents, with anything that needs your sign-off in the Approval Center.";
  }
  return "I didn't catch that, sir. Try asking for your briefing, approvals, fundraising, the calendar, overdue tasks, partnerships, or give me something to work on.";
}

/** One conversational turn. Voice and text share the same history. */
export async function POST(req: Request) {
  let me: CurrentUser;
  try { me = await actionFridayOwner(); } catch (e) { return Response.json({ error: (e as Error).message }, { status: 401 }); }
  const origin = req.headers.get("origin");
  if (origin && new URL(origin).host !== req.headers.get("host")) return Response.json({ error: "Bad origin." }, { status: 403 });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Say or type something first." }, { status: 400 });
  const { text, channel } = parsed.data;

  if (!aiConfigured()) {
    await db.insert(fridayMessages).values({ role: "user", content: text, channel });
    const reply = await limitedReply(me, text);
    await db.insert(fridayMessages).values({ role: "assistant", content: reply, channel });
    return Response.json({ reply, limited: true });
  }

  const history = (await db.select().from(fridayMessages).orderBy(desc(fridayMessages.createdAt)).limit(24)).reverse();
  const convo: AgentMessage[] = [];
  for (const m of history) {
    const role = m.role === "assistant" ? "assistant" : "user";
    if (!convo.length && role === "assistant") continue;
    const last = convo[convo.length - 1];
    if (last && last.role === role) last.content = `${last.content as string}\n\n${m.content}`;
    else convo.push({ role, content: m.content });
  }
  if (convo.length && convo[convo.length - 1].role === "user") convo.push({ role: "assistant", content: "(No reply was recorded.)" });
  convo.push({ role: "user", content: text });
  await db.insert(fridayMessages).values({ role: "user", content: text, channel });

  const [{ n: pending }] = await db.select({ n: sql<number>`count(*)::int` }).from(fridayActions).where(eq(fridayActions.status, "pending"));
  const context = [
    `Now: ${nowLine(me.timezone)} (${me.timezone}).`,
    `Channel: ${channel === "voice" ? "voice: reply in natural spoken sentences, short, no lists or markdown" : "text"}.`,
    `Approval center: ${pending} pending. You are inside the team portal, so portal tools read live data. Gmail, Calendar, Drive: not connected.`,
  ].join("\n");

  try {
    const r = await runAgent({ owner: me, messages: convo, context, effort: channel === "voice" ? "low" : "medium", maxSteps: 8, deadline: Date.now() + 50_000 });
    let reply = r.text;
    if (!r.done) {
      const [j] = await db.insert(fridayJobs).values({ kind: "objective", title: `Continue: ${text.slice(0, 120)}`, instructions: text, state: r.messages as object }).returning({ id: fridayJobs.id });
      reply = `${reply ? `${reply}\n\n` : ""}This needs more time, so I'm continuing in the background. You'll find it under Agents.`;
      await logEvent(j.id, "job", null, true, { title: "Continued from chat", outcome: "queued" });
    }
    if (!reply) reply = "Done.";
    await db.insert(fridayMessages).values({ role: "assistant", content: reply, channel });
    return Response.json({ reply, stopped: r.stopped ?? null });
  } catch (e) {
    await logEvent(null, "error", "chat", false, { error: (e as Error).message || "error" });
    const reply = "Something went wrong on my side, sir, and nothing was done. Try again in a moment.";
    await db.insert(fridayMessages).values({ role: "assistant", content: reply, channel });
    return Response.json({ reply, error: true });
  }
}
