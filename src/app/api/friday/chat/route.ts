import { desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { fridayActions, fridayBriefings, fridayJobs, fridayMessages } from "@/db/schema";
import { actionFridayOwner } from "@/server/friday/access";
import { aiConfigured, logEvent, runAgent, type AgentMessage } from "@/server/friday/agent";
import { nowLine } from "@/server/friday/worker";
import { loadTasks } from "@/server/queries";
import type { CurrentUser } from "@/server/auth";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

const Body = z.object({ text: z.string().trim().min(1).max(4000), channel: z.enum(["text", "voice"]).default("text") });

/** Without an API key Friday can't hold a conversation, but she can still read out real information. */
async function limitedReply(me: CurrentUser, text: string): Promise<string> {
  const t = text.toLowerCase();
  if (/good morning|briefing|morning report|what did you do/.test(t)) {
    const [b] = await db.select().from(fridayBriefings).orderBy(desc(fridayBriefings.forDate)).limit(1);
    if (!b) return "Good morning, sir. I don't have a briefing yet. My first one arrives after my overnight run.";
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: me.timezone }).format(new Date());
    return b.forDate === today ? b.content : `My latest briefing is from ${b.forDate}. ${b.content}`;
  }
  if (/approv|pending|waiting|decision/.test(t)) {
    const rows = await db.select({ summary: fridayActions.summary }).from(fridayActions).where(eq(fridayActions.status, "pending"));
    if (!rows.length) return "Nothing is waiting for your approval, sir.";
    return `${rows.length === 1 ? "One item is" : `${rows.length} items are`} waiting for your approval: ${rows.slice(0, 5).map((r) => r.summary).join("; ")}. You can approve them in the Approval Center.`;
  }
  if (/overdue|late|behind|deadline|task/.test(t)) {
    const rows = await loadTasks(me, { scope: "all", view: "overdue", limit: 10 });
    if (!rows.length) return "Nothing is overdue in the portal right now.";
    return `${rows.length} task${rows.length === 1 ? " is" : "s are"} overdue: ${rows.slice(0, 4).map((r) => `${r.title}${r.assignees.length ? ` (${r.assignees.map((a) => a.name.split(" ")[0]).join(", ")})` : ""}`).join("; ")}.`;
  }
  return "I'm in limited mode, sir: live conversation needs a Claude API key. I can read you this morning's briefing, what's waiting for your approval, or what's overdue. My overnight work still runs.";
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
