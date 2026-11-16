import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { fridayActions as actions, fridayEvents as events } from "@/db/schema";
import { FRIDAY_MODEL, FRIDAY_SYSTEM } from "./persona";
import { actionHash, authorize, budgetLeftMills, charge, costMills, getSettings } from "./policy";
import { apiTools, toolByName, type ToolCtx } from "./tools";
import { fridayOwner } from "./owner";
import type { CurrentUser } from "@/server/auth";

export type AgentMessage = Anthropic.Beta.BetaMessageParam;

export const aiConfigured = () => !!(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);

export async function logEvent(jobId: string | null, kind: string, tool: string | null, ok: boolean, detail: Record<string, unknown>) {
  await db.insert(events).values({ jobId, kind, tool, ok, detail });
}

/** One tool call through the central policy. A Level 2/3 action never runs here without approval. */
export async function runTool(ctx: ToolCtx, name: string, rawInput: unknown): Promise<{ content: string; isError: boolean }> {
  const def = toolByName(name);
  if (!def) return { content: `Unknown tool "${name}".`, isError: true };
  const parsed = def.schema.safeParse(rawInput ?? {});
  if (!parsed.success) return { content: `Invalid input: ${parsed.error.message}`, isError: true };
  const input = parsed.data;
  const decision = await authorize(def.level, def.permission);
  if (decision === "paused") {
    await logEvent(ctx.jobId, "tool", name, false, { blocked: "emergency stop" });
    return { content: "Blocked: Jacob has paused you with the emergency stop. Stop and tell him.", isError: true };
  }
  if (decision === "approve") {
    const d = def.describe?.(input) ?? { summary: `${name}: ${JSON.stringify(input)}`, impact: "", risks: "" };
    const [a] = await db.insert(actions).values({
      tool: name, input: input as object, inputHash: actionHash(name, input), level: def.level,
      summary: d.summary, impact: d.impact, risks: d.risks, jobId: ctx.jobId,
    }).returning({ id: actions.id });
    await logEvent(ctx.jobId, "approval_requested", name, true, { actionId: a.id, summary: d.summary });
    return { content: JSON.stringify({ status: "awaiting_approval", actionId: a.id, summary: d.summary, note: "NOT done. It runs only if Jacob approves it in the approval center." }), isError: false };
  }
  try {
    const out = await def.run(ctx, input);
    await logEvent(ctx.jobId, "tool", name, true, { input: input as object });
    return { content: JSON.stringify(out ?? { ok: true }).slice(0, 30_000), isError: false };
  } catch (e) {
    const msg = (e as Error).message || "failed";
    await logEvent(ctx.jobId, "error", name, false, { input: input as object, error: msg });
    return { content: `Tool failed: ${msg}`, isError: true };
  }
}

/** Runs an approved action exactly as proposed. Refuses if anything about it changed (hash) or Friday is paused. */
export async function executeAction(actionId: string) {
  const [a] = await db.select().from(actions).where(eq(actions.id, actionId));
  if (!a) throw new Error("Action not found.");
  if (a.status !== "pending") throw new Error(`This action is already ${a.status}.`);
  if (actionHash(a.tool, a.input) !== a.inputHash) throw new Error("The action changed after it was proposed, so it was not run.");
  if ((await getSettings()).paused) throw new Error("Friday is paused (emergency stop). Resume her first.");
  const def = toolByName(a.tool);
  const parsed = def?.schema.safeParse(a.input);
  if (!def || !parsed?.success) throw new Error("This action is no longer valid.");
  const claimed = await db.update(actions).set({ status: "executed", decidedAt: new Date() }).where(eq(actions.id, a.id)).returning({ id: actions.id });
  if (!claimed.length) throw new Error("Action not found.");
  try {
    const owner = await fridayOwner();
    if (!owner) throw new Error("Friday has no active owner.");
    const out = await def.run({ jobId: a.jobId, timezone: owner.timezone, owner }, parsed.data);
    await db.update(actions).set({ result: (out ?? { ok: true }) as object }).where(eq(actions.id, a.id));
    await logEvent(a.jobId, "action_executed", a.tool, true, { actionId: a.id, summary: a.summary });
    return out;
  } catch (e) {
    await db.update(actions).set({ status: "failed", result: { error: (e as Error).message } }).where(eq(actions.id, a.id));
    await logEvent(a.jobId, "action_executed", a.tool, false, { actionId: a.id, error: (e as Error).message });
    throw e;
  }
}

export type AgentResult = { messages: AgentMessage[]; done: boolean; text: string; stopped?: "no_key" | "paused" | "budget" | "refusal" | "deadline" | "steps" };

/**
 * The agent loop: think, call tools, repeat. Stops at the step limit or deadline and returns the conversation so a
 * background job can save it and continue on the next worker tick.
 */
export async function runAgent(opts: { owner: CurrentUser; messages: AgentMessage[]; jobId?: string | null; context?: string; effort?: "low" | "medium" | "high"; maxSteps?: number; deadline?: number; timezone?: string }): Promise<AgentResult> {
  const messages = [...opts.messages];
  if (!aiConfigured()) return { messages, done: true, text: "I'm not connected to my AI service yet, sir. I need a Claude API key for live conversation. Until then, my overnight work runs as a scheduled task, and I can read you your briefing and approvals.", stopped: "no_key" };
  const ctx: ToolCtx = { jobId: opts.jobId ?? null, timezone: opts.timezone ?? opts.owner.timezone, owner: opts.owner };
  const client = new Anthropic();
  let text = "";
  for (let step = 0; step < (opts.maxSteps ?? 10); step++) {
    if (opts.deadline && Date.now() > opts.deadline) return { messages, done: false, text, stopped: "deadline" };
    if ((await getSettings()).paused) return { messages, done: true, text: "I'm paused, sir. Resume me from the command center when you're ready.", stopped: "paused" };
    if ((await budgetLeftMills()) <= 0) return { messages, done: true, text: "I've hit this month's spending cap, so I've stopped. You can raise it in Settings.", stopped: "budget" };

    const res = await client.beta.messages.create({
      model: FRIDAY_MODEL,
      max_tokens: 16000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: opts.effort ?? "medium" },
      system: [
        { type: "text", text: FRIDAY_SYSTEM, cache_control: { type: "ephemeral" } },
        ...(opts.context ? [{ type: "text" as const, text: opts.context }] : []),
      ],
      tools: apiTools() as Anthropic.Beta.BetaToolUnion[],
      messages,
    });
    await charge(costMills(res.usage));
    messages.push({ role: "assistant", content: res.content });
    text = res.content.filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text").map((b) => b.text).join("\n").trim();

    if (res.stop_reason === "refusal") return { messages, done: true, text: text || "I can't help with that one, sir.", stopped: "refusal" };
    if (res.stop_reason === "pause_turn") continue;
    if (res.stop_reason !== "tool_use") return { messages, done: true, text };

    const calls = res.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use");
    const results: Anthropic.Beta.BetaToolResultBlockParam[] = [];
    for (const c of calls) {
      const r = await runTool(ctx, c.name, c.input);
      results.push({ type: "tool_result", tool_use_id: c.id, content: r.content, is_error: r.isError });
    }
    messages.push({ role: "user", content: results });
  }
  return { messages, done: false, text, stopped: "steps" };
}
