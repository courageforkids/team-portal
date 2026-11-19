import Link from "next/link";
import { Lock } from "lucide-react";
import { formatInTimeZone } from "date-fns-tz";
import { requireAdmin } from "@/server/auth";
import { getSettings } from "@/server/settings";
import { todayIn } from "@/server/admin";
import { listHq } from "@/server/hq";
import { GRANT_OPEN, HQ_KINDS, shortDate, type HqKind } from "@/lib/hq";
import { HqAddButton, HqImport, HqList, HqTabs, type HqRow } from "@/components/hq/board";
import { cn } from "@/lib/cn";

export const metadata = { title: "Courage HQ" };

const plusDays = (d: string, n: number) => { const x = new Date(`${d}T12:00:00Z`); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
const usd = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export default async function HqPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const me = await requireAdmin();
  const { tab: rawTab } = await searchParams;
  const tab: HqKind = HQ_KINDS.includes(rawTab as HqKind) ? (rawTab as HqKind) : "task";
  const { timezone: tz } = await getSettings();
  const now = new Date();
  const today = todayIn(tz, now), week = plusDays(today, 7);
  const hour = Number(formatInTimeZone(now, tz, "H"));
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  const rows: HqRow[] = (await listHq(me.id)).map((r) => ({
    id: r.id, kind: r.kind, title: r.title, subtitle: r.subtitle, category: r.category, date: r.date,
    amount: r.amountCents === null ? null : r.amountCents / 100, nextStep: r.nextStep, person: r.person, link: r.link, notes: r.notes,
    extra: r.extra ?? {}, done: !!r.doneAt,
  }));
  const of = (k: HqKind) => rows.filter((r) => r.kind === k);
  const tasks = of("task"), grants = of("grant"), gifts = of("gift"), people = of("contact");

  // Headline numbers
  const openTasks = tasks.filter((t) => !t.done);
  const dueThisWeek = openTasks.filter((t) => t.date && t.date >= today && t.date <= week);
  const slipped = openTasks.filter((t) => t.date && t.date < today);
  const liveGrants = grants.filter((g) => GRANT_OPEN.includes(g.category));
  const pipeline = liveGrants.reduce((s, g) => s + (g.amount ?? 0), 0);
  const grantSoon = liveGrants.filter((g) => g.date && g.date >= today && g.date <= plusDays(today, 30));
  const raised = gifts.filter((g) => g.category === "Cash").reduce((s, g) => s + (g.amount ?? 0), 0);
  const toThank = gifts.filter((g) => !g.done);
  const followUps = people.filter((p) => p.date && p.date <= week);

  // Gifts per month, last 8 months
  const months: { key: string; label: string; n: number }[] = [];
  for (let i = 7; i >= 0; i--) {
    const d = new Date(`${today.slice(0, 7)}-15T12:00:00Z`); d.setUTCMonth(d.getUTCMonth() - i);
    months.push({ key: d.toISOString().slice(0, 7), label: d.toLocaleDateString("en-US", { month: "short", timeZone: "UTC" }), n: 0 });
  }
  for (const g of gifts) { const m = months.find((x) => g.date?.startsWith(x.key)); if (m) m.n++; }
  const maxN = Math.max(1, ...months.map((m) => m.n));
  const best = months.reduce((a, b) => (b.n > a.n ? b : a), months[0]);

  // On-time rate: of finished tasks that had a due date, how many were finished by then (we only know done, so use open-late as the miss)
  const dated = tasks.filter((t) => t.date && t.date < today);
  const onTime = dated.length ? Math.round((dated.filter((t) => t.done).length / dated.length) * 100) : null;

  // Coming up across everything
  const upcoming = [
    ...openTasks.map((t) => ({ id: t.id, date: t.date, title: t.title, what: "Task", tab: "task" })),
    ...liveGrants.map((g) => ({ id: g.id, date: g.date, title: `${g.title}${g.subtitle ? ` · ${g.subtitle}` : ""}`, what: "Grant deadline", tab: "grant" })),
    ...people.map((p) => ({ id: p.id, date: p.date, title: p.title, what: "Follow up", tab: "contact" })),
  ].filter((x) => x.date && x.date >= today).sort((a, b) => a.date!.localeCompare(b.date!)).slice(0, 5);

  const summary = [
    dueThisWeek.length ? plural(dueThisWeek.length, "task") + " due this week" : "no tasks due this week",
    grantSoon.length ? plural(grantSoon.length, "grant deadline") + " this month" : null,
    followUps.length ? plural(followUps.length, "follow-up") : null,
    toThank.length ? plural(toThank.length, "gift") + " to thank" : null,
  ].filter(Boolean);

  const counts = { task: openTasks.length, grant: liveGrants.length, gift: gifts.length, contact: people.length };
  const firstName = me.name.split(" ")[0];

  return (
    <div className="-mx-1 rounded-[28px] bg-hq-paper p-4 text-hq-ink sm:p-7">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-hq-muted">Courage HQ · {formatInTimeZone(now, tz, "EEEE, MMM d")}</p>
          <h1 className="mt-1 font-display text-4xl font-bold leading-tight tracking-tight sm:text-5xl">{greeting}, <i>{firstName}</i></h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {rows.length === 0 && <HqImport prominent />}
          <HqAddButton kind={tab} />
        </div>
      </header>

      <section className="relative mt-6 overflow-hidden rounded-3xl bg-hq-banner px-6 py-6 text-hq-banner-fg sm:px-8">
        <Blob className="absolute -right-24 -top-24 h-44 w-44 text-accent opacity-90 sm:-right-10 sm:-top-16 sm:h-56 sm:w-56" />
        <Blob className="absolute -bottom-20 right-28 h-40 w-40 text-white/10" rot={140} />
        <div className="relative max-w-xl pr-10 sm:pr-0">
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] opacity-70">Your week</p>
          <p className="mt-2 font-display text-2xl leading-snug sm:text-[28px]">
            You have {summary.length > 1 ? `${summary.slice(0, -1).join(", ")} and ${summary.at(-1)}` : summary[0]}.
          </p>
          {slipped.length > 0 && <p className="mt-2 text-sm opacity-80">{plural(slipped.length, "task")} slipped past {slipped.length === 1 ? "its" : "their"} date. Pick one to close out or move.</p>}
        </div>
      </section>

      <section className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4" aria-label="At a glance">
        <StatCard tone="pink" label="Open tasks" value={String(openTasks.length)} note={`${dueThisWeek.length} due this week`} href="?tab=task" />
        <StatCard tone="sage" label="Grants in play" value={pipeline ? usd(pipeline) : String(liveGrants.length)} note={plural(liveGrants.length, "application")} href="?tab=grant" />
        <StatCard tone="sand" label="Cash gifts logged" value={usd(raised)} note={`${gifts.length} gifts logged`} href="?tab=gift" />
        <StatCard tone="butter" label="Follow-ups" value={String(followUps.length)} note="due now or this week" href="?tab=contact" />
      </section>

      <section className="mt-5 grid gap-3 lg:grid-cols-[1.5fr_1fr_1.2fr]">
        <Panel title="Gifts by month" note={best.n ? `Best month: ${best.label} (${plural(best.n, "gift")})` : "No gifts in the last 8 months"}>
          <div className="mt-4 flex h-40 items-end gap-2" role="img" aria-label={`Gifts per month: ${months.map((m) => `${m.label} ${m.n}`).join(", ")}`}>
            {months.map((m) => (
              <div key={m.key} className="flex h-full flex-1 flex-col items-center justify-end gap-1.5">
                <span className="text-[11px] font-semibold tabular-nums text-hq-muted">{m.n || ""}</span>
                <div className={cn("w-full max-w-9 rounded-t-xl rounded-b-md", m.key === best.key && m.n ? "bg-hq-banner" : "bg-hq-sage-2")}
                  style={{ height: `${Math.max(4, (m.n / maxN) * 100)}%` }} />
                <span className="text-[11px] text-hq-muted">{m.label}</span>
              </div>
            ))}
          </div>
        </Panel>
        <Panel title="Staying on time" note={onTime === null ? "Shows once tasks have due dates" : "Past-due tasks that got done"}>
          <Gauge pct={onTime} />
        </Panel>
        <Panel title="Coming up" note="Across tasks, grants and people">
          {upcoming.length === 0 ? <p className="mt-4 text-sm text-hq-muted">Nothing on the calendar yet.</p> : (
            <ul className="mt-3 divide-y divide-hq-line">
              {upcoming.map((u) => (
                <li key={u.id}>
                  <Link href={`/admin/hq?tab=${u.tab}`} scroll={false} className="focus-ring flex items-center gap-3 rounded-lg py-2.5">
                    <span className="w-12 shrink-0 font-display text-sm font-bold">{u.date === today ? "Today" : shortDate(u.date!)}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold">{u.title}</span>
                      <span className="block text-[12px] text-hq-muted">{u.what}</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </section>

      <section className="mt-6 space-y-3" aria-label="Your lists">
        <HqTabs active={tab} counts={counts} />
        <HqList key={tab} kind={tab} rows={of(tab).sort(order(tab))} today={today} />
      </section>

      <div className="mt-6 flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-[13px] text-hq-muted"><Lock className="h-4 w-4" aria-hidden />Only you can see Courage HQ. Due dates send you a phone notification.</p>
        {rows.length > 0 && <HqImport prominent={false} />}
      </div>
    </div>
  );
}

function order(kind: HqKind) {
  return (a: HqRow, b: HqRow) => {
    if (kind === "gift") return (b.date ?? "").localeCompare(a.date ?? "");
    return (a.date ?? "9999").localeCompare(b.date ?? "9999") || a.title.localeCompare(b.title);
  };
}

const TONES = {
  pink: ["bg-hq-pink", "text-hq-pink-2"], sage: ["bg-hq-sage", "text-hq-sage-2"],
  sand: ["bg-hq-sand", "text-hq-sand-2"], butter: ["bg-hq-butter", "text-hq-butter-2"],
} as const;

function StatCard({ tone, label, value, note, href }: { tone: keyof typeof TONES; label: string; value: string; note: string; href: string }) {
  const [bg, blob] = TONES[tone];
  return (
    <Link href={`/admin/hq${href}`} scroll={false} className={cn("focus-ring relative block min-h-32 overflow-hidden rounded-3xl p-4 transition hover:-translate-y-0.5 sm:p-5", bg)}>
      <Blob className={cn("absolute -bottom-10 -right-8 h-32 w-32", blob)} rot={tone === "sage" ? 60 : tone === "sand" ? 200 : tone === "butter" ? 300 : 0} />
      <div className="relative">
        <p className="text-[13px] font-semibold">{label}</p>
        <p className="mt-2 font-display text-3xl font-bold tabular-nums tracking-tight sm:text-4xl">{value}</p>
        <p className="mt-1 text-[12px] text-hq-ink/70">{note}</p>
      </div>
    </Link>
  );
}

function Panel({ title, note, children }: { title: string; note: string; children: React.ReactNode }) {
  return (
    <div className="rounded-3xl bg-hq-card p-5 shadow-soft">
      <h2 className="font-display text-xl font-bold">{title}</h2>
      <p className="text-[12px] text-hq-muted">{note}</p>
      {children}
    </div>
  );
}

function Gauge({ pct }: { pct: number | null }) {
  const p = pct ?? 0;
  const r = 70, c = Math.PI * r;
  return (
    <div className="mt-3 flex flex-col items-center">
      <svg viewBox="0 0 180 100" className="w-full max-w-[220px]" role="img" aria-label={pct === null ? "No data yet" : `${p} percent`}>
        <path d="M20 90 A70 70 0 0 1 160 90" fill="none" className="stroke-hq-paper" strokeWidth="18" strokeLinecap="round" />
        <path d="M20 90 A70 70 0 0 1 160 90" fill="none" className="stroke-hq-banner" strokeWidth="18" strokeLinecap="round"
          strokeDasharray={`${(p / 100) * c} ${c}`} />
      </svg>
      <p className="-mt-12 font-display text-4xl font-bold tabular-nums">{pct === null ? "—" : `${p}%`}</p>
      <p className="mt-3 text-[12px] text-hq-muted">{p >= 80 ? "Strong. Keep it up." : p >= 50 ? "Getting there." : pct === null ? "" : "A few are piling up."}</p>
    </div>
  );
}

/** Soft organic blob used as decoration on the cards. */
function Blob({ className, rot = 0 }: { className?: string; rot?: number }) {
  return (
    <svg viewBox="0 0 200 200" aria-hidden className={className} style={{ transform: `rotate(${rot}deg)` }}>
      <path fill="currentColor" d="M44.7,-58.5C57.1,-49.4,65.9,-35.2,70.4,-19.6C74.9,-4,75,13,68.3,26.6C61.6,40.2,48.1,50.4,33.4,58.3C18.7,66.2,2.8,71.8,-13.6,70.7C-30,69.6,-46.9,61.8,-58.4,49.1C-69.9,36.4,-76,18.8,-75.1,1.9C-74.2,-15,-66.3,-31.2,-54.5,-40.6C-42.7,-50,-27,-52.6,-12.3,-57.3C2.4,-62,32.3,-67.6,44.7,-58.5Z" transform="translate(100 100)" />
    </svg>
  );
}
