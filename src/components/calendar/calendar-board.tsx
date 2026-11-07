"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { CalendarX, Clock, Eye, FolderKanban, MapPin, Pencil, Square, SquareCheck, Trash2, TriangleAlert, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { ConfirmAction } from "@/components/ui/confirm";
import { EmptyState } from "@/components/ui/empty-state";
import { cn } from "@/lib/cn";
import { EVENT_TYPE_LABEL, isOverdue, STATUS_LABEL, VISIBILITY_LABEL } from "@/lib/task-meta";
import { deleteEventAction } from "@/server/calendar";
import { Linkify, RichText } from "@/components/announcements/rich-text";
import { CAL_TYPE_LABEL, fmtItemRange, groupByDay, TYPE_STYLE, type CalItem } from "./meta";
import { compactTime, dayKey, fmtKey, timeOf, weekday } from "./date-utils";
import { EventFormDialog, type ProjectOption } from "./event-form";

type View = "month" | "week" | "agenda";
type Ctx = {
  tz: string; tzName: string; todayKey: string; isAdmin: boolean; projects: ProjectOption[];
  open: (it: CalItem) => void; addOn: (key: string) => void;
};

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function CalendarBoard({ view, days, monthPrefix, initialSelected, items, tz, tzName, todayKey, isAdmin, projects }: {
  view: View; days: string[]; monthPrefix?: string; initialSelected: string; items: CalItem[]; tz: string; tzName: string;
  todayKey: string; isAdmin: boolean; projects: ProjectOption[];
}) {
  const [selectedDay, setSelectedDay] = useState(initialSelected);
  const [active, setActive] = useState<CalItem | null>(null);
  const [editing, setEditing] = useState<CalItem | null>(null);
  const [creatingOn, setCreatingOn] = useState<string | null>(null);
  const byDay = useMemo(() => groupByDay(items, tz, days), [items, tz, days]);
  const ctx: Ctx = { tz, tzName, todayKey, isAdmin, projects, open: setActive, addOn: setCreatingOn };

  return (
    <>
      {view === "month" && (
        <MonthView days={days} monthPrefix={monthPrefix!} byDay={byDay} selected={selectedDay} onSelect={setSelectedDay} ctx={ctx} />
      )}
      {view === "week" && <WeekView days={days} byDay={byDay} ctx={ctx} />}
      {view === "agenda" && <AgendaView days={days} byDay={byDay} ctx={ctx} />}

      <EventDetailDialog item={active} ctx={ctx} onClose={() => setActive(null)}
        onEdit={(it) => { setActive(null); setEditing(it); }} />
      {isAdmin && (
        <>
          <EventFormDialog open={!!editing} onClose={() => setEditing(null)} initial={editing ?? undefined}
            defaultDate={todayKey} projects={projects} tz={tz} tzName={tzName} />
          <EventFormDialog open={!!creatingOn} onClose={() => setCreatingOn(null)}
            defaultDate={creatingOn ?? todayKey} projects={projects} tz={tz} tzName={tzName} />
        </>
      )}
    </>
  );
}

/* ───────────── Item pieces ───────────── */

function taskTone(it: CalItem) {
  const overdue = it.status ? isOverdue({ status: it.status, dueAt: it.start }) : false;
  const done = it.status === "approved";
  return { overdue, done };
}

function TaskIcon({ it, className }: { it: CalItem; className?: string }) {
  const { done } = taskTone(it);
  const I = done ? SquareCheck : Square;
  return <I className={cn("h-3.5 w-3.5 shrink-0", className)} aria-hidden />;
}

/** Compact chip used inside month cells (desktop). */
function Chip({ it, ctx }: { it: CalItem; ctx: Ctx }) {
  const base = "focus-ring relative z-10 flex w-full min-w-0 items-center gap-1.5 rounded-md px-1.5 py-[3px] text-left text-[12px] leading-tight font-medium transition";
  if (it.kind === "task") {
    const { overdue, done } = taskTone(it);
    return (
      <Link href={`/tasks/${it.id}`} title={`${it.title} — ${STATUS_LABEL[it.status!]}`}
        className={cn(base, "hover:bg-surface-2", overdue ? "text-warn" : done ? "text-faint" : "text-fg-2")}>
        <TaskIcon it={it} />
        <span className={cn("truncate", done && "line-through")}>{it.title}</span>
      </Link>
    );
  }
  const st = TYPE_STYLE[it.type];
  return (
    <button type="button" onClick={() => ctx.open(it)} title={it.title}
      className={cn(base, it.allDay ? cn(st.chip, "hover:brightness-[.97]") : "text-fg-2 hover:bg-surface-2")}>
      {!it.allDay && <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", st.dot)} aria-hidden />}
      {!it.allDay && <span className="shrink-0 text-muted tabular-nums">{compactTime(it.start, ctx.tz)}</span>}
      <span className="truncate">{it.title}</span>
    </button>
  );
}

/** Full-width row used in agenda lists. */
function ItemRow({ it, ctx, dayKeyFor }: { it: CalItem; ctx: Ctx; dayKeyFor: string }) {
  const st = TYPE_STYLE[it.type];
  const startsToday = dayKey(it.start, ctx.tz) === dayKeyFor;
  const timeCol = it.allDay ? "All day" : startsToday ? timeOf(it.start, ctx.tz) : "Ongoing";
  const cls = "focus-ring group flex w-full min-h-[56px] items-stretch gap-3 rounded-xl px-2.5 py-2.5 text-left transition hover:bg-surface-2 sm:px-3";
  const inner = (
    <>
      <span className="w-[62px] shrink-0 pt-0.5 text-[13px] font-medium text-fg-2 tabular-nums sm:w-[72px]">
        {it.kind === "task" ? <span className="text-muted">{timeCol}</span> : timeCol}
        {!it.allDay && it.end && startsToday && <span className="block text-xs font-normal text-faint">{timeOf(it.end, ctx.tz)}</span>}
      </span>
      {it.kind === "task"
        ? <span className="flex w-1 shrink-0 justify-center pt-1"><TaskIcon it={it} className={taskTone(it).overdue ? "text-warn" : "text-muted"} /></span>
        : <span className={cn("w-1 shrink-0 rounded-full", st.bar)} aria-hidden />}
      <span className="min-w-0 flex-1 pl-1">
        <span className={cn("block font-medium leading-snug text-fg group-hover:text-brand-ink",
          it.kind === "task" && taskTone(it).done && "text-muted line-through")}>{it.title}</span>
        <span className="mt-0.5 flex flex-wrap items-center gap-y-0.5 text-xs text-muted [&>*+*]:before:mx-1.5 [&>*+*]:before:text-faint [&>*+*]:before:content-['·']">
          {it.kind === "task" ? (
            <>
              <span>Task deadline</span>
              {taskTone(it).overdue ? <span className="inline-flex items-center gap-1 font-medium text-warn"><TriangleAlert className="h-3 w-3" aria-hidden />Past due</span>
                : <span>{STATUS_LABEL[it.status!]}</span>}
              {ctx.isAdmin && it.assignees && it.assignees.length > 0 && <span className="min-w-0 truncate">{it.assignees.join(", ")}</span>}
            </>
          ) : (
            <>
              <span>{EVENT_TYPE_LABEL[it.type as keyof typeof EVENT_TYPE_LABEL]}</span>
              {it.location && <span className="inline-flex min-w-0 items-center"><MapPin className="mr-1 h-3 w-3 shrink-0" aria-hidden /><span className="truncate">{it.location}</span></span>}
              {it.visibility !== "everyone" && <span className="inline-flex items-center"><Eye className="mr-1 h-3 w-3" aria-hidden />{it.visibility === "admin" ? "Admins only" : "Leadership"}</span>}
            </>
          )}
        </span>
      </span>
    </>
  );
  return (
    <li>
      {it.kind === "task"
        ? <Link href={`/tasks/${it.id}`} className={cls}>{inner}</Link>
        : <button type="button" onClick={() => ctx.open(it)} className={cls}>{inner}</button>}
    </li>
  );
}

function DayHeading({ k, ctx, count, as: As = "h3" }: { k: string; ctx: Ctx; count?: number; as?: "h2" | "h3" }) {
  const isToday = k === ctx.todayKey;
  return (
    <As className="flex items-baseline gap-2">
      <span className={cn("text-sm font-semibold", isToday ? "text-brand-ink" : "text-fg")}>{fmtKey(k, "EEEE, MMMM d")}</span>
      {isToday && <Badge tone="brand">Today</Badge>}
      {count !== undefined && count > 0 && <span className="text-xs text-muted">{count} item{count === 1 ? "" : "s"}</span>}
    </As>
  );
}

/* ───────────── Month ───────────── */

function MonthView({ days, monthPrefix, byDay, selected, onSelect, ctx }: {
  days: string[]; monthPrefix: string; byDay: Map<string, CalItem[]>; selected: string; onSelect: (k: string) => void; ctx: Ctx;
}) {
  const selItems = byDay.get(selected) ?? [];
  return (
    <div className="space-y-4">
      <div className="card overflow-hidden">
        <div className="grid grid-cols-7 border-b border-line bg-surface-2/60" aria-hidden>
          {WEEKDAYS.map((d) => (
            <div key={d} className="py-2 text-center text-[11px] font-semibold tracking-wide text-muted uppercase">
              <span className="sm:hidden">{d.charAt(0)}</span><span className="hidden sm:inline">{d}</span>
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7" role="grid" aria-label={fmtKey(`${monthPrefix}-01`, "MMMM yyyy")}>
          {days.map((k, i) => {
            const list = byDay.get(k) ?? [];
            const inMonth = k.startsWith(monthPrefix);
            const isToday = k === ctx.todayKey;
            const isSel = k === selected;
            const shown = list.slice(0, 3);
            const more = list.length - shown.length;
            return (
              <div key={k} role="gridcell" aria-selected={isSel}
                className={cn("relative min-h-[56px] border-line p-1 md:min-h-[118px] md:p-1.5",
                  (i + 1) % 7 !== 0 && "border-r", i < days.length - 7 && "border-b",
                  !inMonth && "bg-surface-2/45", isSel && "bg-brand-soft/50")}>
                {/* Whole cell selects the day (large touch target on phones) */}
                <button type="button" onClick={() => onSelect(k)} aria-pressed={isSel}
                  aria-label={`${fmtKey(k, "EEEE, MMMM d")}${list.length ? `, ${list.length} item${list.length === 1 ? "" : "s"}` : ", nothing scheduled"}`}
                  className="focus-ring absolute inset-0 z-0 rounded-none" />
                <div className="pointer-events-none relative flex flex-col items-center md:items-start">
                  <span className={cn("grid h-7 min-w-7 place-items-center rounded-full px-1 text-[13px] font-semibold tabular-nums",
                    isToday ? "bg-brand text-brand-fg" : isSel ? "text-brand-ink" : inMonth ? "text-fg-2" : "text-faint")}>
                    {Number(k.slice(8))}
                  </span>
                  {/* phone: dots */}
                  {list.length > 0 && (
                    <span className="mt-0.5 flex items-center gap-[3px] md:hidden" aria-hidden>
                      {list.slice(0, 3).map((it) => <span key={it.key} className={cn("h-1.5 w-1.5 rounded-full", TYPE_STYLE[it.type].dot, it.kind === "task" && "h-[7px] w-[7px]")} />)}
                      {list.length > 3 && <span className="text-[9px] leading-none font-bold text-muted">+</span>}
                    </span>
                  )}
                </div>
                {/* desktop: chips */}
                <div className="relative mt-1 hidden space-y-0.5 md:block">
                  {shown.map((it) => <Chip key={it.key} it={it} ctx={ctx} />)}
                  {more > 0 && (
                    <button type="button" onClick={() => onSelect(k)}
                      className="focus-ring relative z-10 w-full rounded-md px-1.5 py-[3px] text-left text-[12px] font-semibold text-muted hover:bg-surface-2 hover:text-fg">
                      +{more} more
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <section className="card p-2 sm:p-3" aria-live="polite" aria-label="Selected day">
        <div className="flex items-center justify-between gap-3 px-2 pt-1 pb-2 sm:px-3">
          <DayHeading k={selected} ctx={ctx} as="h2" />
          {ctx.isAdmin && (
            <Button type="button" size="sm" variant="subtle" onClick={() => ctx.addOn(selected)} className="h-9 sm:h-8">Add event</Button>
          )}
        </div>
        {selItems.length ? (
          <ul className="divide-y divide-line/70">{selItems.map((it) => <ItemRow key={it.key} it={it} ctx={ctx} dayKeyFor={selected} />)}</ul>
        ) : (
          <p className="px-3 pb-3 text-sm text-muted">Nothing scheduled.</p>
        )}
      </section>
    </div>
  );
}

/* ───────────── Week ───────────── */

function WeekView({ days, byDay, ctx }: { days: string[]; byDay: Map<string, CalItem[]>; ctx: Ctx }) {
  return (
    <>
      {/* desktop: 7 columns */}
      <div className="hidden overflow-hidden rounded-[14px] border border-line bg-line shadow-soft md:grid md:grid-cols-7 md:gap-px">
        {days.map((k) => {
          const list = byDay.get(k) ?? [];
          const isToday = k === ctx.todayKey;
          return (
            <section key={k} className={cn("flex min-h-[420px] min-w-0 flex-col bg-surface", isToday && "bg-brand-soft/30")} aria-label={fmtKey(k, "EEEE, MMMM d")}>
              <div className="flex items-center justify-between border-b border-line px-2.5 py-2">
                <div className="flex items-baseline gap-1.5">
                  <span className="text-[11px] font-semibold tracking-wide text-muted uppercase">{WEEKDAYS[weekday(k)]}</span>
                  <span className={cn("grid h-7 min-w-7 place-items-center rounded-full px-1 text-sm font-bold tabular-nums", isToday ? "bg-brand text-brand-fg" : "text-fg")}>{Number(k.slice(8))}</span>
                </div>
                {ctx.isAdmin && (
                  <button type="button" onClick={() => ctx.addOn(k)} aria-label={`Add event on ${fmtKey(k, "MMMM d")}`}
                    className="focus-ring grid h-7 w-7 place-items-center rounded-md text-faint hover:bg-surface-2 hover:text-fg">+</button>
                )}
              </div>
              <ul className="flex-1 space-y-1.5 p-1.5">
                {list.map((it) => <li key={it.key}><WeekCard it={it} ctx={ctx} /></li>)}
              </ul>
            </section>
          );
        })}
      </div>
      {/* phone: stacked days */}
      <div className="space-y-3 md:hidden">
        {days.map((k) => {
          const list = byDay.get(k) ?? [];
          return (
            <section key={k} className="card p-2">
              <div className="flex items-center justify-between gap-2 px-2 pt-1 pb-1.5">
                <DayHeading k={k} ctx={ctx} />
                {ctx.isAdmin && <Button type="button" size="sm" variant="ghost" className="h-9" onClick={() => ctx.addOn(k)} aria-label={`Add event on ${fmtKey(k, "MMMM d")}`}>Add</Button>}
              </div>
              {list.length
                ? <ul className="divide-y divide-line/70">{list.map((it) => <ItemRow key={it.key} it={it} ctx={ctx} dayKeyFor={k} />)}</ul>
                : <p className="px-2 pb-2 text-[13px] text-faint">Nothing scheduled</p>}
            </section>
          );
        })}
      </div>
    </>
  );
}

function WeekCard({ it, ctx }: { it: CalItem; ctx: Ctx }) {
  const cls = "focus-ring block w-full rounded-lg px-2 py-1.5 text-left text-[12.5px] leading-snug transition";
  if (it.kind === "task") {
    const { overdue, done } = taskTone(it);
    return (
      <Link href={`/tasks/${it.id}`} className={cn(cls, "border border-line bg-surface hover:border-line-strong hover:bg-surface-2")}>
        <span className={cn("flex items-center gap-1 text-[11px] font-medium tabular-nums", overdue ? "text-warn" : "text-muted")}>
          <TaskIcon it={it} className="h-3 w-3" />Due {compactTime(it.start, ctx.tz)}
        </span>
        <span className={cn("mt-0.5 line-clamp-2 font-medium", done ? "text-faint line-through" : "text-fg")}>{it.title}</span>
      </Link>
    );
  }
  const st = TYPE_STYLE[it.type];
  return (
    <button type="button" onClick={() => ctx.open(it)} className={cn(cls, st.chip, "hover:brightness-[.97]")}>
      <span className="block text-[11px] font-semibold tabular-nums opacity-80">{it.allDay ? "All day" : compactTime(it.start, ctx.tz)}</span>
      <span className="mt-0.5 line-clamp-3 font-semibold">{it.title}</span>
    </button>
  );
}

/* ───────────── Agenda ───────────── */

function AgendaView({ days, byDay, ctx }: { days: string[]; byDay: Map<string, CalItem[]>; ctx: Ctx }) {
  const withItems = days.filter((k) => (byDay.get(k) ?? []).length > 0);
  if (!withItems.length)
    return (
      <div className="card">
        <EmptyState icon={CalendarX} title="Nothing on the calendar"
          action={ctx.isAdmin ? <Button type="button" onClick={() => ctx.addOn(days[0])}>Add an event</Button> : undefined}>
          No events or deadlines in these 60 days{ctx.isAdmin ? "." : " that match your filters."}
        </EmptyState>
      </div>
    );
  return (
    <div className="card divide-y divide-line">
      {withItems.map((k) => (
        <section key={k} className="p-2 sm:p-3">
          <div className="px-2 pt-1.5 pb-1 sm:px-3"><DayHeading k={k} ctx={ctx} count={byDay.get(k)!.length} /></div>
          <ul>{byDay.get(k)!.map((it) => <ItemRow key={it.key} it={it} ctx={ctx} dayKeyFor={k} />)}</ul>
        </section>
      ))}
    </div>
  );
}

/* ───────────── Event detail ───────────── */

function EventDetailDialog({ item, ctx, onClose, onEdit }: { item: CalItem | null; ctx: Ctx; onClose: () => void; onEdit: (it: CalItem) => void }) {
  const it = item;
  return (
    <Dialog open={!!it} onClose={onClose} title={it?.title ?? ""} size="md">
      {it && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-semibold", TYPE_STYLE[it.type].chip)}>
              <span className={cn("h-1.5 w-1.5 rounded-full", TYPE_STYLE[it.type].dot)} aria-hidden />
              {it.type === "task" ? CAL_TYPE_LABEL.task : EVENT_TYPE_LABEL[it.type]}
            </span>
            {it.visibility !== "everyone" && <Badge tone="muted"><Eye className="h-3 w-3" aria-hidden />{VISIBILITY_LABEL[it.visibility]}</Badge>}
          </div>
          <dl className="space-y-3 text-sm">
            <div className="flex gap-3">
              <dt><Clock className="mt-0.5 h-4 w-4 text-muted" aria-hidden /><span className="sr-only">When</span></dt>
              <dd className="text-fg">{fmtItemRange(it, ctx.tz)}</dd>
            </div>
            {it.location && (
              <div className="flex gap-3">
                <dt><MapPin className="mt-0.5 h-4 w-4 text-muted" aria-hidden /><span className="sr-only">Where</span></dt>
                <dd className="min-w-0 break-words text-fg"><Linkify text={it.location} /></dd>
              </div>
            )}
            {it.projectId && it.projectName && (
              <div className="flex gap-3">
                <dt><FolderKanban className="mt-0.5 h-4 w-4 text-muted" aria-hidden /><span className="sr-only">Project</span></dt>
                <dd><Link href={`/projects/${it.projectId}`} className="font-medium text-brand-ink underline-offset-2 hover:underline">{it.projectName}</Link></dd>
              </div>
            )}
            {it.visibility !== "everyone" && (
              <div className="flex gap-3">
                <dt><Users className="mt-0.5 h-4 w-4 text-muted" aria-hidden /><span className="sr-only">Visible to</span></dt>
                <dd className="text-muted">Only visible to {it.visibility === "admin" ? "administrators" : "leadership members and administrators"}.</dd>
              </div>
            )}
          </dl>
          {it.description && <div className="border-t border-line pt-4"><RichText text={it.description} className="text-sm" /></div>}
          {it.kind === "event" && (
            <Link href={`/volunteer/events/${it.id}`} className="flex items-center justify-between rounded-xl border border-line px-4 py-3 text-sm font-semibold text-brand-ink transition hover:border-brand/40 hover:bg-brand-soft">
              {ctx.isAdmin ? "Volunteer sign-ups & attendance" : "Volunteer sign-ups"}<span aria-hidden>→</span>
            </Link>
          )}
          {ctx.isAdmin && it.kind === "event" && (
            <div className="flex flex-col-reverse gap-2 border-t border-line pt-4 sm:flex-row sm:justify-end">
              <ConfirmAction
                trigger={<><Trash2 className="h-4 w-4" aria-hidden />Delete</>}
                triggerVariant="ghost" triggerSize="md"
                title="Delete this event?"
                description={<>“{it.title}” will be removed from everyone&apos;s calendar, including subscribed calendar apps.</>}
                confirmLabel="Delete event"
                action={async () => {
                  const r = await deleteEventAction(it.id);
                  if (r.ok) onClose();
                  return r;
                }}
              />
              <Button type="button" variant="secondary" onClick={() => onEdit(it)}><Pencil className="h-4 w-4" aria-hidden />Edit event</Button>
            </div>
          )}
        </div>
      )}
    </Dialog>
  );
}
