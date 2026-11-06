import Link from "next/link";
import { eq } from "drizzle-orm";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { db } from "@/db";
import { users } from "@/db/schema";
import { requireUser } from "@/server/auth";
import { getSettings } from "@/server/settings";
import { getProjectsLite } from "@/server/queries";
import { feedUrl, loadCalendarItems } from "@/app/api/calendar/_lib/data";
import { PageHeader } from "@/components/ui/page-header";
import { Tabs } from "@/components/ui/tabs";
import { buttonClass } from "@/components/ui/button";
import { CalendarBoard } from "@/components/calendar/calendar-board";
import { NewEventButton } from "@/components/calendar/event-form";
import { SubscribeButton } from "@/components/calendar/subscribe-button";
import { CAL_TYPES, CAL_TYPE_LABEL, TYPE_STYLE, type CalType } from "@/components/calendar/meta";
import {
  addDays, addMonths, dayKey, fmtKey, isValidKey, keyStartUtc, monthGrid, rangeKeys, startOfMonth, startOfWeek, tzLabel,
} from "@/components/calendar/date-utils";
import { cn } from "@/lib/cn";

export const metadata = { title: "Calendar" };

type View = "month" | "week" | "agenda";
type SP = Promise<Record<string, string | string[] | undefined>>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
const AGENDA_DAYS = 60;

export default async function CalendarPage({ searchParams }: { searchParams: SP }) {
  const me = await requireUser();
  const sp = await searchParams;
  const { timezone: tz } = await getSettings();
  const isAdmin = me.role === "admin";

  const view: View = (["month", "week", "agenda"] as const).find((v) => v === one(sp.view)) ?? "month";
  const todayKey = dayKey(new Date(), tz);
  const dateParam = one(sp.date);
  const anchor = isValidKey(dateParam) ? dateParam : todayKey;
  const rawTypes = one(sp.types).split(",").filter((t): t is CalType => (CAL_TYPES as readonly string[]).includes(t));
  const filtered = rawTypes.length > 0 && rawTypes.length < CAL_TYPES.length;
  const types = new Set<CalType>(filtered ? rawTypes : CAL_TYPES);

  let days: string[];
  let title: string;
  let prev: string;
  let next: string;
  if (view === "month") {
    days = monthGrid(anchor);
    title = fmtKey(anchor, "MMMM yyyy");
    prev = addMonths(anchor, -1);
    next = addMonths(anchor, 1);
  } else if (view === "week") {
    const s = startOfWeek(anchor);
    days = rangeKeys(s, addDays(s, 6));
    const e = days[6];
    title = s.slice(0, 7) === e.slice(0, 7) ? `${fmtKey(s, "MMM d")} – ${fmtKey(e, "d, yyyy")}`
      : s.slice(0, 4) === e.slice(0, 4) ? `${fmtKey(s, "MMM d")} – ${fmtKey(e, "MMM d, yyyy")}` : `${fmtKey(s, "MMM d, yyyy")} – ${fmtKey(e, "MMM d, yyyy")}`;
    prev = addDays(s, -7);
    next = addDays(s, 7);
  } else {
    days = rangeKeys(anchor, addDays(anchor, AGENDA_DAYS - 1));
    const e = days.at(-1)!;
    title = anchor.slice(0, 4) === e.slice(0, 4) ? `${fmtKey(anchor, "MMM d")} – ${fmtKey(e, "MMM d, yyyy")}` : `${fmtKey(anchor, "MMM d, yyyy")} – ${fmtKey(e, "MMM d, yyyy")}`;
    prev = addDays(anchor, -AGENDA_DAYS);
    next = addDays(anchor, AGENDA_DAYS);
  }
  const from = keyStartUtc(days[0], tz);
  const to = keyStartUtc(addDays(days.at(-1)!, 1), tz);

  const [allItems, projects, tokenRow] = await Promise.all([
    loadCalendarItems(me, from, to, isAdmin ? "all" : "mine"),
    isAdmin ? getProjectsLite() : Promise.resolve([]),
    db.select({ t: users.calendarToken }).from(users).where(eq(users.id, me.id)).limit(1),
  ]);
  const items = allItems.filter((i) => types.has(i.type));
  const token = tokenRow[0]?.t ?? null;
  const tzName = tzLabel(tz);
  const projectOpts = projects.filter((p) => p.status !== "archived").map((p) => ({ id: p.id, name: p.name }));

  const href = (o: { view?: View; date?: string | null; types?: CalType[] | null }) => {
    const p = new URLSearchParams();
    const v = o.view ?? view;
    if (v !== "month") p.set("view", v);
    const d = o.date === undefined ? (dateParam && isValidKey(dateParam) ? dateParam : null) : o.date;
    if (d) p.set("date", d);
    const t = o.types === undefined ? (filtered ? [...types] : null) : o.types;
    if (t && t.length && t.length < CAL_TYPES.length) p.set("types", t.join(","));
    const s = p.toString();
    return s ? `/calendar?${s}` : "/calendar";
  };
  const toggleType = (t: CalType) => {
    const nextSet = new Set(types);
    if (nextSet.has(t)) nextSet.delete(t); else nextSet.add(t);
    return href({ types: nextSet.size ? CAL_TYPES.filter((x) => nextSet.has(x)) : null });
  };

  const inView = days.includes(todayKey) && (view !== "month" || todayKey.startsWith(anchor.slice(0, 7)));
  const initialSelected = view === "month" ? (todayKey.startsWith(anchor.slice(0, 7)) ? todayKey : startOfMonth(anchor)) : anchor;
  const navBtn = "focus-ring grid h-10 w-10 place-items-center rounded-[10px] border border-line-strong bg-surface text-fg-2 shadow-soft transition hover:bg-surface-2 hover:text-fg sm:h-9 sm:w-9";

  return (
    <div>
      <PageHeader
        title="Calendar"
        description={isAdmin ? "Team events and every task deadline, in one place." : "Team events and your task deadlines, in one place."}
        actions={
          <>
            <SubscribeButton feedUrl={token ? feedUrl(token) : null} />
            {isAdmin && <NewEventButton defaultDate={view === "month" ? initialSelected : anchor} projects={projectOpts} tz={tz} tzName={tzName} />}
          </>
        }
      />

      <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <Link href={href({ date: null })} className={buttonClass("secondary", "md", cn("h-10 sm:h-9", inView && "text-muted"))}>Today</Link>
          <Link href={href({ date: prev })} className={navBtn} aria-label={`Previous ${view === "agenda" ? "60 days" : view}`}><ChevronLeft className="h-4 w-4" aria-hidden /></Link>
          <Link href={href({ date: next })} className={navBtn} aria-label={`Next ${view === "agenda" ? "60 days" : view}`}><ChevronRight className="h-4 w-4" aria-hidden /></Link>
          <h2 className="ml-1 truncate text-lg font-bold tracking-tight text-fg sm:text-xl" aria-live="polite">{title}</h2>
        </div>
        <Tabs active={view} className="self-start sm:self-auto" items={(["month", "week", "agenda"] as const).map((v) => ({
          key: v, label: v[0].toUpperCase() + v.slice(1), href: href({ view: v }),
        }))} />
      </div>

      <nav aria-label="Filter by type" className="scrollbar-thin -mx-4 mb-4 flex gap-1.5 overflow-x-auto px-4 pb-1 md:mx-0 md:flex-wrap md:px-0">
        {CAL_TYPES.map((t) => {
          const on = types.has(t);
          return (
            <Link key={t} href={toggleType(t)} aria-pressed={on} role="button"
              className={cn("focus-ring inline-flex h-10 shrink-0 items-center gap-2 rounded-full border px-3 text-[13px] font-medium transition sm:h-8",
                on ? "border-line-strong bg-surface text-fg shadow-soft" : "border-dashed border-line bg-transparent text-faint hover:text-muted")}>
              <span className={cn("h-2 w-2 shrink-0 rounded-full", TYPE_STYLE[t].dot, !on && "opacity-40")} aria-hidden />
              {CAL_TYPE_LABEL[t]}
            </Link>
          );
        })}
        {filtered && (
          <Link href={href({ types: null })} className="focus-ring inline-flex h-10 shrink-0 items-center rounded-full px-3 text-[13px] font-semibold text-brand-ink hover:underline sm:h-8">Show all</Link>
        )}
      </nav>

      <CalendarBoard key={`${view}:${days[0]}`} view={view} days={days} monthPrefix={view === "month" ? anchor.slice(0, 7) : undefined}
        initialSelected={initialSelected} items={items} tz={tz} tzName={tzName} todayKey={todayKey} isAdmin={isAdmin} projects={projectOpts} />

      <p className="mt-4 text-center text-xs text-muted">Times shown in {tzName}.</p>
    </div>
  );
}
