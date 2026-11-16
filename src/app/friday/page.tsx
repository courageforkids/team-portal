import Link from "next/link";
import { and, asc, desc, eq, ilike, ne, or } from "drizzle-orm";
import { ArrowLeft } from "lucide-react";
import { db } from "@/db";
import { fridayActions as actions, fridayBriefings as briefings, fridayEvents as events, fridayJobs as jobs, fridayMemories as memories, fridayMessages as messages, fridayPartners as partners, fridayReports as reports } from "@/db/schema";
import { requireFridayOwner } from "@/server/friday/access";
import { loadTasks } from "@/server/queries";
import { aiConfigured } from "@/server/friday/agent";
import { getSettings, spentMills, STANDING_PERMISSIONS } from "@/server/friday/policy";
import { workerStatus } from "@/server/friday/worker";
import { Command } from "@/components/friday/command";
import { ApprovalCard, CancelJob, EmergencyStop, MemoryActions, ObjectiveForm, SettingsForm, TwoFactor } from "@/components/friday/panels";

export const dynamic = "force-dynamic";
export const metadata = { title: "F.R.I.D.A.Y.", robots: { index: false, follow: false } };

const TABS = [
  ["command", "Command Center"], ["operations", "Operations"], ["agents", "Autonomous Agents"], ["comms", "Communications"],
  ["approvals", "Approval Center"], ["partners", "Partnerships"], ["memory", "Memory & Intelligence"], ["briefing", "Morning Briefing"], ["system", "System Status"],
] as const;
type Tab = (typeof TABS)[number][0];

const ago = (d: Date | null) => {
  if (!d) return "never";
  const m = Math.round((Date.now() - d.getTime()) / 60000);
  return m < 1 ? "just now" : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} d ago`;
};
const when = (d: Date, tz: string) => d.toLocaleString("en-US", { timeZone: tz, month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

function Section({ title, eyebrow, children }: { title: string; eyebrow?: string; children: React.ReactNode }) {
  return (
    <section className="fr-panel p-5">
      {eyebrow && <div className="fr-eyebrow mb-1">{eyebrow}</div>}
      <h2 className="mb-3 text-lg font-semibold">{title}</h2>
      {children}
    </section>
  );
}
const Status = ({ ok, warn }: { ok: boolean; warn?: boolean }) => <span className={`fr-dot ${ok ? "bg-fr-ok" : warn ? "bg-fr-warn" : "bg-fr-bad"}`} aria-hidden />;

type PortalTask = { id?: string; title?: string; status?: string; dueAt?: Date | string | null; assignees?: { name?: string }[] };

export default async function Home({ searchParams }: { searchParams: Promise<{ tab?: string; q?: string; kind?: string }> }) {
  const { me, isOwner } = await requireFridayOwner();
  if (!isOwner) return (
    <div className="friday grid place-items-center p-6"><div className="fr-panel max-w-md p-6 text-center"><div className="fr-eyebrow">Private</div><p className="mt-2">F.R.I.D.A.Y. belongs to another admin.</p><Link href="/" className="fr-btn fr-btn-ghost mt-4">Back to the portal</Link></div></div>
  );
  const sp = await searchParams;
  const tab: Tab = (TABS.find(([k]) => k === sp.tab)?.[0] ?? "command") as Tab;
  const [s, ws] = await Promise.all([getSettings(), workerStatus()]);
  const tz = me.timezone;

  return (
    <div className="friday"><div className="mx-auto max-w-[1280px] px-4 pb-16 pt-5 md:px-6">
      <header className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="font-mono text-xl font-semibold tracking-[0.35em]">F.R.I.D.A.Y.</div>
          <div className="mt-0.5 flex flex-wrap items-center gap-3 text-xs text-fr-muted">
            <span className="flex items-center gap-1.5"><Status ok={!s.paused && aiConfigured()} warn={s.paused || !aiConfigured()} />{s.paused ? "Paused" : aiConfigured() ? "Online" : "Limited mode"}</span>
            
            {ws.pendingApprovals > 0 && <Link href="/friday?tab=approvals" className="text-fr-gold">{ws.pendingApprovals} awaiting approval</Link>}
          </div>
        </div>
        <Link href="/" className="fr-btn fr-btn-ghost"><ArrowLeft className="h-4 w-4" aria-hidden />Portal</Link>
      </header>


      <nav aria-label="Sections" className="-mx-4 mb-5 flex gap-1 overflow-x-auto px-4 pb-1">
        {TABS.map(([k, label]) => (
          <Link key={k} href={`/friday?tab=${k}`} aria-current={tab === k ? "page" : undefined}
            className={`whitespace-nowrap rounded-xl px-3.5 py-2 text-sm ${tab === k ? "bg-fr-arc/15 text-fr-arc ring-1 ring-fr-arc/40" : "text-fr-muted hover:text-fr-fg"}`}>
            {label}{k === "approvals" && ws.pendingApprovals > 0 ? ` (${ws.pendingApprovals})` : ""}
          </Link>
        ))}
      </nav>

      {tab === "command" && <CommandTab firstName={me.name.split(" ")[0]} />}
      {tab === "operations" && <OperationsTab tz={tz} me={me} />}
      {tab === "agents" && <AgentsTab tz={tz} />}
      {tab === "comms" && <CommsTab tz={tz} />}
      {tab === "approvals" && <ApprovalsTab tz={tz} />}
      {tab === "partners" && <PartnersTab tz={tz} />}
      {tab === "memory" && <MemoryTab q={sp.q} kind={sp.kind} />}
      {tab === "briefing" && <BriefingTab tz={tz} />}
      {tab === "system" && <SystemTab tz={tz} />}
    </div></div>
  );
}

async function CommandTab({ firstName }: { firstName: string }) {
  const rows = (await db.select().from(messages).orderBy(desc(messages.createdAt)).limit(30)).reverse();
  return <Command firstName={firstName} initial={rows.map((m) => ({ role: m.role === "assistant" ? "assistant" : "user", content: m.content }))} />;
}

async function OperationsTab({ tz, me }: { tz: string; me: Awaited<ReturnType<typeof requireFridayOwner>>["me"] }) {
  const [overdue, active, review] = await Promise.all([loadTasks(me, { scope: "all", view: "overdue", limit: 15 }), loadTasks(me, { scope: "all", view: "active", limit: 15 }), loadTasks(me, { scope: "all", view: "review", limit: 15 })]);
  const list = (rows: PortalTask[], empty: string) => rows.length === 0 ? <p className="text-fr-muted">{empty}</p> : (
    <ul className="divide-y divide-fr-line">{rows.slice(0, 15).map((t, i) => (
      <li key={t.id ?? i} className="flex flex-wrap justify-between gap-2 py-2 text-sm"><span>{t.title}</span><span className="text-fr-muted">{t.assignees?.map((a) => a.name).join(", ")}{t.dueAt ? ` · ${when(new Date(t.dueAt), tz)}` : ""}</span></li>
    ))}</ul>
  );
  return (
    <div className="grid gap-5 lg:grid-cols-3">
      <Section title="Overdue" eyebrow="Live">{list(overdue, "Nothing overdue.")}</Section>
      <Section title="Active tasks" eyebrow="Live">{list(active, "No active tasks.")}</Section>
      <Section title="Waiting for review" eyebrow="Live">{list(review, "Nothing waiting.")}</Section>
    </div>
  );
}

async function AgentsTab({ tz }: { tz: string }) {
  const [jobRows, log] = await Promise.all([
    db.select().from(jobs).orderBy(desc(jobs.createdAt)).limit(30),
    db.select().from(events).orderBy(desc(events.createdAt)).limit(60),
  ]);
  const color: Record<string, string> = { queued: "text-fr-arc", running: "text-fr-gold", done: "text-fr-ok", failed: "text-fr-bad", cancelled: "text-fr-muted" };
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <div className="space-y-5">
        <Section title="New objective" eyebrow="Background work"><ObjectiveForm /></Section>
        <Section title="Workflows" eyebrow="Queue & history">
          {jobRows.length === 0 ? <p className="text-fr-muted">No jobs yet. Overnight work and the morning briefing are scheduled automatically.</p> : (
            <ul className="divide-y divide-fr-line">{jobRows.map((j) => (
              <li key={j.id} className="py-2.5 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">{j.title}</span>
                  <span className="flex items-center gap-2"><span className={`font-mono text-xs uppercase ${color[j.status] ?? ""}`}>{j.status}</span>{(j.status === "queued" || j.status === "running") && <CancelJob id={j.id} />}</span>
                </div>
                <div className="mt-0.5 text-xs text-fr-muted">{j.kind} · created {when(j.createdAt, tz)}{j.steps ? ` · ${j.steps} steps` : ""}{j.error ? ` · ${j.error}` : ""}</div>
                {j.result && <details className="mt-1"><summary className="cursor-pointer text-xs text-fr-arc">Result</summary><p className="mt-1 whitespace-pre-wrap text-fr-muted">{j.result}</p></details>}
              </li>
            ))}</ul>
          )}
        </Section>
      </div>
      <Section title="Execution log" eyebrow="Verified record">
        {log.length === 0 ? <p className="text-fr-muted">Nothing has run yet.</p> : (
          <ul className="space-y-1.5 font-mono text-xs">{log.map((e) => (
            <li key={e.id} className="flex gap-2"><span className="shrink-0 text-fr-muted">{when(e.createdAt, tz)}</span><Status ok={e.ok} /><span className="text-fr-arc-2">{e.kind}</span><span className="truncate text-fr-muted">{e.tool ?? ""} {String((e.detail as Record<string, unknown>).summary ?? (e.detail as Record<string, unknown>).title ?? (e.detail as Record<string, unknown>).error ?? "")}</span></li>
          ))}</ul>
        )}
      </Section>
    </div>
  );
}

type InboxItem = { category?: string; from?: string; subject?: string; summary?: string; action?: string; deadline?: string; drafted?: boolean };
type InboxReport = { reviewed?: number; items?: InboxItem[]; unanswered?: { from?: string; subject?: string; waitingDays?: number }[] };
const CAT: Record<string, { label: string; cls: string }> = {
  urgent: { label: "Urgent", cls: "text-fr-bad" }, sponsorship: { label: "Sponsorship", cls: "text-fr-gold" }, donation: { label: "Donation", cls: "text-fr-ok" },
  hospital: { label: "Hospital", cls: "text-fr-arc" }, team: { label: "Team", cls: "text-fr-arc-2" }, other: { label: "Other", cls: "text-fr-muted" },
};

async function CommsTab({ tz }: { tz: string }) {
  const [drafts, [inbox]] = await Promise.all([
    db.select().from(memories).where(eq(memories.kind, "draft")).orderBy(desc(memories.updatedAt)).limit(30),
    db.select().from(reports).where(eq(reports.kind, "inbox")).orderBy(desc(reports.createdAt)).limit(1),
  ]);
  const r = (inbox?.content ?? {}) as InboxReport;
  const items = Array.isArray(r.items) ? r.items.slice(0, 40) : [];
  const order = ["urgent", "hospital", "sponsorship", "donation", "team", "other"];
  items.sort((a, b) => order.indexOf(a.category ?? "other") - order.indexOf(b.category ?? "other"));
  return (
    <div className="grid gap-5 lg:grid-cols-[1.3fr_1fr]">
      <Section title={inbox ? `Inbox report · ${when(inbox.createdAt, tz)}` : "Inbox report"} eyebrow="Communications">
        {!inbox ? <p className="text-sm text-fr-muted">Her first inbox report arrives after her next run. She reads your Gmail, sorts it into urgent, hospital, sponsorship, donation and team, pulls out deadlines and action items, and writes reply drafts straight into your Gmail Drafts folder. She never sends anything.</p> : (
          <>
            <p className="mb-3 text-sm text-fr-muted">{r.reviewed ?? items.length} emails reviewed · {items.filter((i) => i.drafted).length} reply drafts waiting in Gmail</p>
            {items.length === 0 ? <p className="text-fr-muted">Nothing needed attention.</p> : (
              <ul className="divide-y divide-fr-line">{items.map((i, n) => {
                const c = CAT[i.category ?? "other"] ?? CAT.other;
                return (
                  <li key={n} className="py-2.5 text-sm">
                    <div className="flex flex-wrap items-baseline gap-2"><span className={`font-mono text-[10px] uppercase ${c.cls}`}>{c.label}</span><span className="font-medium">{i.from}</span><span className="text-fr-muted">{i.subject}</span></div>
                    {i.summary && <p className="mt-0.5 text-fr-muted">{i.summary}</p>}
                    <p className="mt-0.5 text-xs">{i.action && <span className="text-fr-arc-2">Next: {i.action}</span>}{i.deadline && <span className="text-fr-gold"> · Deadline {i.deadline}</span>}{i.drafted && <span className="text-fr-ok"> · Draft ready</span>}</p>
                  </li>
                );
              })}</ul>
            )}
            {Array.isArray(r.unanswered) && r.unanswered.length > 0 && (
              <div className="mt-4"><div className="fr-eyebrow mb-1">Still waiting on a reply from you</div>
                <ul className="text-sm text-fr-muted">{r.unanswered.slice(0, 10).map((u, n) => <li key={n}>{u.from}: {u.subject}{u.waitingDays ? ` (${u.waitingDays} days)` : ""}</li>)}</ul></div>
            )}
          </>
        )}
      </Section>
      <Section title="Drafts here" eyebrow="Ready for your review">
        {drafts.length === 0 ? <p className="text-fr-muted">Drafts she writes for things other than email (captions, plans, campaigns) show up here.</p> : (
          <ul className="space-y-3">{drafts.map((d) => (
            <li key={d.id} className="rounded-xl border border-fr-line bg-fr-deep/70 p-3">
              <div className="flex items-start justify-between gap-2"><div><p className="font-medium">{d.title}</p><p className="text-xs text-fr-muted">{when(d.updatedAt, tz)}</p></div><MemoryActions id={d.id} verified /></div>
              <details className="mt-2"><summary className="cursor-pointer text-sm text-fr-arc">Read draft</summary><p className="mt-2 whitespace-pre-wrap text-sm">{d.content}</p></details>
            </li>
          ))}</ul>
        )}
      </Section>
    </div>
  );
}

const PSTAGE = ["prospect", "contacted", "replied", "committed", "received", "declined", "dormant"] as const;
async function PartnersTab({ tz }: { tz: string }) {
  const rows = await db.select().from(partners).orderBy(desc(partners.updatedAt));
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(new Date());
  const stageCls: Record<string, string> = { committed: "text-fr-gold", received: "text-fr-ok", replied: "text-fr-arc", contacted: "text-fr-arc-2", declined: "text-fr-bad" };
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-7">
        {PSTAGE.map((st) => <div key={st} className="fr-panel p-3 text-center"><div className="font-mono text-xl">{rows.filter((r) => r.status === st).length}</div><div className="text-xs capitalize text-fr-muted">{st}</div></div>)}
      </div>
      <Section title="Partnership tracker" eyebrow="Brands, sponsors, hospitals">
        {rows.length === 0 ? <p className="text-fr-muted">No partners yet. Friday adds them from your email during her runs.</p> : (
          <ul className="divide-y divide-fr-line">{rows.map((p) => (
            <li key={p.id} className="py-3 text-sm">
              <div className="flex flex-wrap items-baseline justify-between gap-2"><span className="font-medium">{p.name} <span className="ml-1 font-mono text-[10px] uppercase text-fr-muted">{p.kind}</span></span><span className={`font-mono text-xs uppercase ${stageCls[p.status] ?? "text-fr-muted"}`}>{p.status}</span></div>
              {p.notes && <p className="mt-0.5 text-fr-muted">{p.notes}</p>}
              {p.promised && <p className="mt-0.5 text-fr-gold">We promised: {p.promised}</p>}
              {p.nextStep && <p className={`mt-0.5 ${p.nextStepOn && p.nextStepOn <= today ? "text-fr-warn" : "text-fr-arc-2"}`}>Next: {p.nextStep}{p.nextStepOn ? ` (by ${p.nextStepOn})` : ""}</p>}
              <p className="mt-0.5 text-xs text-fr-muted">{p.contact ? `${p.contact} · ` : ""}{p.lastContactOn ? `last contact ${p.lastContactOn} · ` : ""}source: {p.source}</p>
            </li>
          ))}</ul>
        )}
      </Section>
    </div>
  );
}

async function ApprovalsTab({ tz }: { tz: string }) {
  const needsCode = !!(await getSettings()).totpSecret;
  const [pending, history] = await Promise.all([
    db.select().from(actions).where(eq(actions.status, "pending")).orderBy(asc(actions.createdAt)),
    db.select().from(actions).where(ne(actions.status, "pending")).orderBy(desc(actions.createdAt)).limit(25),
  ]);
  return (
    <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
      <div>
        <div className="fr-eyebrow mb-2">Awaiting executive authorization</div>
        {pending.length === 0 ? <div className="fr-panel p-5 text-fr-muted">Nothing needs your approval.</div> : (
          <ul className="space-y-3">{pending.map((a) => <ApprovalCard key={a.id} needsCode={needsCode} a={{ id: a.id, tool: a.tool, level: a.level, summary: a.summary, reason: a.reason, impact: a.impact, risks: a.risks, input: JSON.stringify(a.input, null, 2), createdAt: a.createdAt.toISOString() }} />)}</ul>
        )}
      </div>
      <Section title="Audit history" eyebrow="Decisions">
        {history.length === 0 ? <p className="text-fr-muted">No decisions yet.</p> : (
          <ul className="divide-y divide-fr-line text-sm">{history.map((a) => (
            <li key={a.id} className="py-2"><div className="flex justify-between gap-2"><span>{a.summary}</span><span className={`font-mono text-xs uppercase ${a.status === "executed" ? "text-fr-ok" : a.status === "failed" ? "text-fr-bad" : "text-fr-muted"}`}>{a.status}</span></div><div className="text-xs text-fr-muted">{when(a.decidedAt ?? a.createdAt, tz)}</div></li>
          ))}</ul>
        )}
      </Section>
    </div>
  );
}

async function MemoryTab({ q, kind }: { q?: string; kind?: string }) {
  const kinds = ["fact", "preference", "decision", "deadline", "partner", "note", "draft"];
  const k = kinds.includes(kind ?? "") ? kind : undefined;
  const rows = await db.select().from(memories).where(and(k ? eq(memories.kind, k) : undefined, q ? or(ilike(memories.title, `%${q}%`), ilike(memories.content, `%${q}%`)) : undefined)).orderBy(desc(memories.updatedAt)).limit(100);
  return (
    <Section title="Searchable memory" eyebrow="Long-term knowledge">
      <form className="mb-4 flex flex-wrap gap-2" method="get" action="/friday">
        <input type="hidden" name="tab" value="memory" />
        <label htmlFor="mq" className="sr-only">Search memory</label>
        <input id="mq" name="q" defaultValue={q} placeholder="Search memory…" className="fr-input max-w-sm" />
        <label htmlFor="mk" className="sr-only">Kind</label>
        <select id="mk" name="kind" defaultValue={k ?? ""} className="fr-input max-w-[180px]"><option value="">All kinds</option>{kinds.map((x) => <option key={x} value={x}>{x}</option>)}</select>
        <button className="fr-btn fr-btn-ghost">Search</button>
      </form>
      {rows.length === 0 ? <p className="text-fr-muted">Nothing saved yet. Tell Friday things to remember, like &ldquo;Remember that our next delivery goes to ECU Health.&rdquo;</p> : (
        <ul className="divide-y divide-fr-line">{rows.map((m) => (
          <li key={m.id} className="flex items-start gap-3 py-3">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2"><span className="font-medium">{m.title}</span><span className="rounded-md bg-fr-panel-2 px-1.5 py-0.5 font-mono text-[10px] uppercase text-fr-arc">{m.kind}</span>
                <span className={`text-xs ${m.verified ? "text-fr-ok" : "text-fr-warn"}`}>{m.verified ? "verified" : "unverified"}</span></div>
              <p className="mt-1 line-clamp-3 whitespace-pre-wrap text-sm text-fr-muted">{m.content}</p>
              <p className="mt-1 text-xs text-fr-muted">Source: {m.source}{m.expiresAt ? ` · expires ${m.expiresAt.toISOString().slice(0, 10)}` : ""}</p>
            </div>
            <MemoryActions id={m.id} verified={m.verified} />
          </li>
        ))}</ul>
      )}
    </Section>
  );
}

async function BriefingTab({ tz }: { tz: string }) {
  const [rows, [weekly]] = await Promise.all([
    db.select().from(briefings).orderBy(desc(briefings.forDate)).limit(7),
    db.select().from(reports).where(eq(reports.kind, "weekly")).orderBy(desc(reports.createdAt)).limit(1),
  ]);
  const w = (weekly?.content ?? {}) as { weekOf?: string; priorities?: string[]; deadlines?: { what?: string; when?: string }[]; bottlenecks?: string[]; recommendations?: string[] };
  const list = (title: string, xs?: string[]) => Array.isArray(xs) && xs.length > 0 && <div><div className="fr-eyebrow mb-1">{title}</div><ul className="list-disc space-y-1 pl-5 text-sm">{xs.slice(0, 10).map((x, i) => <li key={i}>{x}</li>)}</ul></div>;
  return (
    <div className="space-y-4">
      {weekly && (
        <Section title={`Weekly priorities${w.weekOf ? ` · week of ${w.weekOf}` : ""}`} eyebrow="Executive planning">
          <div className="grid gap-4 md:grid-cols-2">
            {list("Top priorities", w.priorities)}
            {Array.isArray(w.deadlines) && w.deadlines.length > 0 && <div><div className="fr-eyebrow mb-1">Deadlines</div><ul className="space-y-1 text-sm">{w.deadlines.slice(0, 10).map((d, i) => <li key={i}><span className="text-fr-gold">{d.when}</span> {d.what}</li>)}</ul></div>}
            {list("Bottlenecks", w.bottlenecks)}
            {list("Recommendations", w.recommendations)}
          </div>
          <p className="mt-3 text-xs text-fr-muted">Written {when(weekly.createdAt, tz)}</p>
        </Section>
      )}
      {rows.length === 0 ? <Section title="No briefings yet" eyebrow="Morning briefing"><p className="text-fr-muted">Friday writes one every morning after her overnight run, from her verified log and the portal.</p></Section>
        : rows.map((b, i) => (
          <Section key={b.id} title={new Date(`${b.forDate}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" })} eyebrow={i === 0 ? "Latest briefing" : "Earlier"}>
            <p className="whitespace-pre-wrap leading-relaxed">{b.content}</p>
            <p className="mt-2 text-xs text-fr-muted">Written {when(b.createdAt, tz)}</p>
          </Section>
        ))}
    </div>
  );
}

async function SystemTab({ tz }: { tz: string }) {
  const [s, ws, spent, lastRun] = await Promise.all([getSettings(), workerStatus(), spentMills(),
    db.select({ at: events.createdAt }).from(events).where(and(eq(events.kind, "job"), eq(events.tool, "scheduled_run"))).orderBy(desc(events.createdAt)).limit(1)]);
  const runAt = lastRun[0]?.at ?? null;
  const capMills = s.monthlyBudgetCents * 10;
  const rows: [string, boolean, string, boolean?][] = [
    ["Live conversation", aiConfigured(), aiConfigured() ? "Claude API connected" : "Limited mode (no Claude API key): answers from portal data; bigger requests go to her work queue", !aiConfigured()],
    ["Scheduled runs", !!runAt && Date.now() - runAt.getTime() < 36 * 36e5, runAt ? `Last run ${ago(runAt)} (${when(runAt, tz)})` : "No run yet (overnight, plus hourly checks of her work queue during the day)", !runAt],
    ["Team portal", true, "Built in (live data)"],
    ["Gmail", !!runAt, "Through her scheduled runs: reads mail, writes drafts, never sends", !runAt],
    ["Google Calendar / Drive", false, "Add the connectors to her scheduled tasks in claude.ai Routines", true],
    ["Database", true, "Connected"],
  ];
  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_1.2fr]">
      <div className="space-y-5">
        <Section title="Health" eyebrow="System status">
          <ul className="space-y-2 text-sm">{rows.map(([n, ok, d, warn]) => <li key={n} className="flex items-start gap-2"><span className="mt-1.5"><Status ok={ok} warn={warn} /></span><span className="w-44 shrink-0 font-medium">{n}</span><span className="text-fr-muted">{d}</span></li>)}</ul>
          <div className="mt-4 grid grid-cols-3 gap-2 text-center text-sm">
            <div className="rounded-xl bg-fr-deep p-2"><div className="font-mono text-lg">{ws.queued}</div><div className="text-xs text-fr-muted">queued</div></div>
            <div className="rounded-xl bg-fr-deep p-2"><div className={`font-mono text-lg ${ws.failed24h ? "text-fr-bad" : ""}`}>{ws.failed24h}</div><div className="text-xs text-fr-muted">failed (24h)</div></div>
            <div className="rounded-xl bg-fr-deep p-2"><div className={`font-mono text-lg ${ws.errors24h ? "text-fr-warn" : ""}`}>{ws.errors24h}</div><div className="text-xs text-fr-muted">errors (24h)</div></div>
          </div>
        </Section>
        <Section title="AI spending this month" eyebrow="Cost control">
          <div className="h-2 overflow-hidden rounded-full bg-fr-deep"><div className="h-full bg-fr-arc" style={{ width: `${Math.min(100, (spent / Math.max(1, capMills)) * 100)}%` }} /></div>
          <p className="mt-2 text-sm text-fr-muted">${(spent / 1000).toFixed(2)} of ${(capMills / 1000).toFixed(2)} cap. Friday stops on her own when she hits it.</p>
        </Section>
        <Section title="Two-step approvals" eyebrow="Security">
          <TwoFactor enabled={!!s.totpSecret} />
        </Section>
        <Section title="Emergency stop" eyebrow="Override">
          <p className="mb-3 text-sm text-fr-muted">Stops every conversation tool, background job and approval immediately until you resume.</p>
          <EmergencyStop paused={s.paused} />
        </Section>
      </div>
      <Section title="Settings" eyebrow="Schedule, budget & permissions">
        <SettingsForm permissionLabels={STANDING_PERMISSIONS} s={{ nightlyHour: s.nightlyHour, briefingHour: s.briefingHour, quietStart: s.quietStart, quietEnd: s.quietEnd, monthlyBudgetDollars: s.monthlyBudgetCents / 100, timezone: tz, permissions: s.permissions ?? {} }} />
      </Section>
    </div>
  );
}
