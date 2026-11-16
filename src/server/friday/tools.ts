import "server-only";
import { z } from "zod";
import type { CurrentUser } from "@/server/auth";
import { loadTasks, getPeople } from "@/server/queries";
import { cashBetween, yearTotals, listGifts } from "@/server/donations";
import { saveDraft } from "@/server/drafts";
import { resolvePeople, parseWhen } from "@/server/api-helpers";
import { createAnnouncementFromApi } from "@/server/v1-creators";
import { notify } from "@/server/notify";
import { getSettings as portalSettings } from "@/server/settings";
import { promises } from "@/db/schema";
import { and, desc, eq, gte, ilike, isNull, or } from "drizzle-orm";
import { db } from "@/db";
import { fridayEvents as events, fridayJobs as jobs, fridayMemories as memories } from "@/db/schema";
import type { Level, StandingPermission } from "./policy";

export type ToolCtx = { jobId: string | null; timezone: string; owner: CurrentUser };

type ToolDef<S extends z.ZodType> = {
  name: string;
  description: string;
  level: Level;
  permission?: StandingPermission;
  schema: S;
  /** For the approval center: exactly what will happen, its impact and its risks. */
  describe?: (input: z.infer<S>) => { summary: string; impact: string; risks: string };
  run: (ctx: ToolCtx, input: z.infer<S>) => Promise<unknown>;
};
export type AnyTool = ToolDef<z.ZodType>;
const tool = <S extends z.ZodType>(d: ToolDef<S>) => d as unknown as AnyTool;

const ymd = (d: Date) => d.toISOString().slice(0, 10);
const short = (t: string, n = 300) => (t.length > n ? `${t.slice(0, n)}…` : t);
const DATE = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD");
const KINDS = ["fact", "preference", "decision", "deadline", "partner", "note"] as const;
const when = (d: Date | null | undefined, tz: string) => d ? d.toLocaleString("en-US", { timeZone: tz, weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : null;


export const TOOLS: AnyTool[] = [
  // ───────── Level 1: memory, drafts, planning ─────────
  tool({
    name: "search_memory",
    description: "Search long-term memory (facts, preferences, decisions, deadlines, partners, drafts, notes). Returns ids for update_memory/forget.",
    level: 1,
    schema: z.object({ query: z.string().max(200).optional(), kind: z.enum([...KINDS, "draft"]).optional() }),
    run: async (_c, i) => {
      const words = (i.query ?? "").split(/\s+/).filter((w) => w.length > 2).slice(0, 6);
      const rows = await db.select().from(memories).where(and(
        i.kind ? eq(memories.kind, i.kind) : undefined,
        or(isNull(memories.expiresAt), gte(memories.expiresAt, new Date())),
        words.length ? or(...words.flatMap((w) => [ilike(memories.title, `%${w}%`), ilike(memories.content, `%${w}%`)])) : undefined,
      )).orderBy(desc(memories.updatedAt)).limit(20);
      return rows.map((m) => ({ id: m.id, kind: m.kind, title: m.title, content: short(m.content, 1500), source: m.source, verified: m.verified, saved: ymd(m.updatedAt), expires: m.expiresAt ? ymd(m.expiresAt) : null }));
    },
  }),
  tool({
    name: "remember",
    description: "Save to long-term memory. verified=true only if Jacob told you directly or it came from a system of record (the portal); web research and your inferences are verified=false. Always give a source. Never save patient names or medical details.",
    level: 1,
    schema: z.object({ kind: z.enum(KINDS), title: z.string().min(2).max(160), content: z.string().min(1).max(4000), source: z.string().min(2).max(300), verified: z.boolean(), expires_on: DATE.optional() }),
    run: async (_c, i) => {
      const [m] = await db.insert(memories).values({ kind: i.kind, title: i.title, content: i.content, source: i.source, verified: i.verified, expiresAt: i.expires_on ? new Date(`${i.expires_on}T23:59:59Z`) : null }).returning({ id: memories.id });
      return { saved: true, id: m.id };
    },
  }),
  tool({
    name: "update_memory",
    description: "Correct a memory by id when Jacob corrects you or information changes.",
    level: 1,
    schema: z.object({ id: z.string().uuid(), content: z.string().min(1).max(4000), source: z.string().min(2).max(300), verified: z.boolean() }),
    run: async (_c, i) => {
      const r = await db.update(memories).set({ content: i.content, source: i.source, verified: i.verified, updatedAt: new Date() }).where(eq(memories.id, i.id)).returning({ id: memories.id });
      return r.length ? { updated: true } : { error: "No memory with that id." };
    },
  }),
  tool({
    name: "forget",
    description: "Delete a memory by id when Jacob asks you to forget it or it's wrong.",
    level: 1, schema: z.object({ id: z.string().uuid() }),
    run: async (_c, i) => {
      const r = await db.delete(memories).where(eq(memories.id, i.id)).returning({ id: memories.id });
      return r.length ? { deleted: true } : { error: "No memory with that id." };
    },
  }),
  tool({
    name: "save_draft",
    description: "Save a draft (email, outreach, caption, campaign plan, report) for Jacob to review and send himself. Nothing is sent.",
    level: 1,
    schema: z.object({ title: z.string().min(2).max(160), body: z.string().min(1).max(12000), for_whom: z.string().max(160).optional() }),
    run: async (_c, i) => {
      const [m] = await db.insert(memories).values({ kind: "draft", title: i.title, content: i.for_whom ? `To: ${i.for_whom}\n\n${i.body}` : i.body, source: "Drafted by Friday", verified: false }).returning({ id: memories.id });
      return { saved: true, id: m.id, where: "Memory → Drafts" };
    },
  }),
  tool({
    name: "schedule_followup",
    description: "Schedule background work for yourself. It runs on the cloud worker even when Jacob's devices are off. Give complete instructions; the job starts without this conversation.",
    level: 1,
    schema: z.object({ title: z.string().min(3).max(160), instructions: z.string().min(5).max(4000), run_in_minutes: z.number().int().min(0).max(60 * 24 * 14) }),
    run: async (_c, i) => {
      const [j] = await db.insert(jobs).values({ kind: "objective", title: i.title, instructions: i.instructions, runAt: new Date(Date.now() + i.run_in_minutes * 60_000) }).returning({ id: jobs.id });
      return { scheduled: true, jobId: j.id };
    },
  }),
  tool({
    name: "recent_activity",
    description: "Your verified execution log for the last N hours: tools run, approvals requested/decided, jobs finished, errors. Report your work only from this.",
    level: 1, schema: z.object({ hours: z.number().int().min(1).max(168) }),
    run: async (_c, i) => {
      const rows = await db.select().from(events).where(gte(events.createdAt, new Date(Date.now() - i.hours * 36e5))).orderBy(desc(events.createdAt)).limit(200);
      return rows.map((e) => ({ at: e.createdAt.toISOString(), kind: e.kind, tool: e.tool, ok: e.ok, detail: e.detail }));
    },
  }),

  // ───────── Level 1: read the team portal (live) ─────────
  tool({
    name: "operations_overview",
    description: "Live snapshot of Courage for Kids from the team portal: overdue tasks, tasks due in the next 7 days, items waiting for review, the active team roster, and Jacob's open sponsor promises. Use this first for any 'what's happening' question.",
    level: 1, schema: z.object({}),
    run: async ({ owner }) => {
      const s = await portalSettings();
      const in7 = new Date(Date.now() + 7 * 864e5);
      const [overdue, upcoming, review, people, open] = await Promise.all([
        loadTasks(owner, { scope: "all", view: "overdue", limit: 25 }),
        loadTasks(owner, { scope: "all", view: "active", dueFrom: new Date(), dueTo: in7, limit: 25 }),
        loadTasks(owner, { scope: "all", view: "review", limit: 25 }),
        getPeople(),
        db.select().from(promises).where(and(eq(promises.ownerId, owner.id), isNull(promises.doneAt))).orderBy(promises.dueDate),
      ]);
      const row = (t: (typeof overdue)[number]) => ({ id: t.id, title: t.title, status: t.status, priority: t.priority, due: when(t.dueAt, s.timezone), assignees: t.assignees.map((a) => a.name) });
      return {
        overdue: overdue.map(row), dueThisWeek: upcoming.map(row), waitingForReview: review.map(row),
        team: people.map((p) => ({ name: p.name, title: p.title, role: p.role })),
        openSponsorPromises: open.map((p) => ({ who: p.who, what: p.what, due: p.dueDate })),
      };
    },
  }),
  tool({
    name: "search_tasks",
    description: "Search portal tasks by words in the title or instructions, optionally for one team member (first name) and a view.",
    level: 1,
    schema: z.object({ query: z.string().max(100).optional(), member: z.string().max(80).optional(), view: z.enum(["active", "overdue", "review", "completed", "everything"]).optional() }),
    run: async ({ owner }, i) => {
      const s = await portalSettings();
      const memberId = i.member ? (await resolvePeople([i.member]).catch(() => []))[0] : undefined;
      if (i.member && !memberId) return { error: `No active team member named "${i.member}".` };
      const rows = await loadTasks(owner, { scope: "all", view: i.view ?? "active", q: i.query || undefined, memberId, limit: 30 });
      return rows.map((t) => ({ id: t.id, title: t.title, status: t.status, priority: t.priority, due: when(t.dueAt, s.timezone), assignees: t.assignees.map((a) => a.name), instructions: short(t.instructions, 200) }));
    },
  }),
  tool({
    name: "fundraising_summary",
    description: "Donations logged in the portal: cash this month vs last month, this year's totals, latest gifts. Private to Jacob. In-kind gifts are counted, never valued.",
    level: 1, schema: z.object({}),
    run: async () => {
      const now = new Date();
      const m0 = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)), m1 = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)), mPrev = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
      const [thisMonth, lastMonth, year, recent] = await Promise.all([cashBetween(ymd(m0), ymd(m1)), cashBetween(ymd(mPrev), ymd(m0)), yearTotals(now.getUTCFullYear()), listGifts({ limit: 10 })]);
      return {
        note: "Only gifts logged on the portal's Donations page are counted.",
        cashThisMonth: { dollars: thisMonth.cents / 100, gifts: thisMonth.count }, cashLastMonth: { dollars: lastMonth.cents / 100, gifts: lastMonth.count },
        thisYear: { cashDollars: year.cashCents / 100, gifts: year.gifts, inKindGifts: year.inKind, donors: year.donors },
        recentGifts: recent.map((g) => ({ donor: g.donorName, type: g.gift.type, received: g.gift.receivedOn, dollars: g.gift.type === "cash" ? (g.gift.amountCents ?? 0) / 100 : null, items: g.gift.type !== "cash" ? short(g.gift.goodsDescription ?? "", 120) : null })),
      };
    },
  }),
  tool({
    name: "draft_task",
    description: "Prepare a team task as a private DRAFT in the portal. Nobody is assigned or notified until Jacob publishes it from Tasks → Drafts.",
    level: 1,
    schema: z.object({ title: z.string().min(3).max(160), instructions: z.string().max(4000), assignees: z.array(z.string().max(80)).min(1).max(10), due: z.string().max(40).optional(), priority: z.enum(["low", "medium", "high", "urgent"]).optional() }),
    run: async ({ owner }, i) => {
      const s = await portalSettings();
      const ids = await resolvePeople(i.assignees);
      const draftId = await saveDraft(owner, {
        title: i.title, instructions: i.instructions, departmentId: null, categoryId: null, projectId: null, priority: i.priority ?? "medium",
        dueAt: parseWhen(i.due, s.timezone, "due"), timezone: s.timezone, deliverables: "", completionCriteria: "", submissionTypes: ["text"], checklist: [], links: [],
        requiresReview: true, reviewerId: null, internalNotes: "Prepared by Friday", workGroupId: null,
      }, ids, true, "From Friday");
      return { saved: true, draftId, where: "/tasks/drafts" };
    },
  }),

  // ───────── Level 2: standing permission (otherwise approval) ─────────
  tool({
    name: "send_team_reminder",
    description: "Send one active team member a reminder notification in the portal (internal only).",
    level: 2, permission: "internal_reminders",
    schema: z.object({ member: z.string().min(1).max(80), message: z.string().min(3).max(300) }),
    describe: (i) => ({ summary: `Send ${i.member} a portal reminder: "${i.message}"`, impact: `${i.member} gets a notification in the portal.`, risks: "Low. Internal only." }),
    run: async ({ owner }, i) => {
      const [id] = await resolvePeople([i.member]);
      await notify([id], { type: "task_updated", title: `Reminder from ${owner.name.split(" ")[0]}`, body: i.message, href: "/tasks" });
      return { sent: true, to: i.member };
    },
  }),

  // ───────── Level 3: executive authorization ─────────
  tool({
    name: "post_announcement",
    description: "Publish an announcement to the whole team (or chosen roles) in the portal. Always requires Jacob's approval.",
    level: 3,
    schema: z.object({ title: z.string().min(3).max(160), body: z.string().min(3).max(5000), roles: z.array(z.enum(["admin", "leader", "volunteer"])).optional() }),
    describe: (i) => ({ summary: `Post announcement "${i.title}" to ${i.roles?.length ? i.roles.join(", ") : "the whole team"}`, impact: "Everyone in the audience is notified right away.", risks: "Visible to the team; notifications can't be unsent." }),
    run: async ({ owner }, i) => createAnnouncementFromApi({ title: i.title, body: i.body, audience: { roles: i.roles ?? [] } }, owner),
  }),
];
export const toolByName = (n: string) => TOOLS.find((t) => t.name === n);

/** Tool definitions for the Messages API, plus Anthropic's web search for research. */
export function apiTools() {
  return [
    ...TOOLS.map((t) => ({
      name: t.name,
      description: `${t.description} [Level ${t.level}${t.level === 3 ? ": needs approval" : t.level === 2 ? ": needs a standing permission, otherwise approval" : ""}]`,
      input_schema: z.toJSONSchema(t.schema) as { type: "object"; [k: string]: unknown },
    })),
    { type: "web_search_20260209" as const, name: "web_search" as const, max_uses: 5 },
  ];
}
