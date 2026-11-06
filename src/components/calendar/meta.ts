/** Shared (client + server) calendar vocabulary. */
import { formatInTimeZone } from "date-fns-tz";
import type { TaskStatus } from "@/lib/task-meta";
import { dayKey, fmtKey, rangeKeys } from "./date-utils";

export const EVENT_TYPES = ["meeting", "community", "fundraising", "volunteer", "milestone", "other"] as const;
export type EventType = (typeof EVENT_TYPES)[number];
export const CAL_TYPES = ["task", ...EVENT_TYPES] as const;
export type CalType = (typeof CAL_TYPES)[number];

export const CAL_TYPE_LABEL: Record<CalType, string> = {
  task: "Task deadlines", meeting: "Meetings", community: "Community events", fundraising: "Fundraising",
  volunteer: "Volunteer opportunities", milestone: "Milestones", other: "Other",
};

/** Token-based colors per type: dot, soft chip, and accent bar. */
export const TYPE_STYLE: Record<CalType, { dot: string; chip: string; bar: string }> = {
  meeting: { dot: "bg-brand", chip: "bg-brand-soft text-brand-ink", bar: "bg-brand" },
  volunteer: { dot: "bg-ok", chip: "bg-ok-soft text-ok", bar: "bg-ok" },
  fundraising: { dot: "bg-accent", chip: "bg-accent-soft text-accent-ink", bar: "bg-accent" },
  community: { dot: "bg-violet", chip: "bg-violet-soft text-violet", bar: "bg-violet" },
  milestone: { dot: "bg-warn", chip: "bg-warn-soft text-warn", bar: "bg-warn" },
  other: { dot: "bg-faint", chip: "bg-surface-2 text-fg-2", bar: "bg-faint" },
  task: { dot: "border-[1.5px] border-muted bg-transparent rounded-[2px]", chip: "bg-surface text-fg-2 ring-1 ring-inset ring-line", bar: "bg-line-strong" },
};

export type Visibility = "everyone" | "leadership" | "admin";

/** Serializable calendar entry (event or task deadline). Dates are ISO strings. */
export type CalItem = {
  key: string; kind: "event" | "task"; id: string; type: CalType; title: string;
  start: string; end: string | null; allDay: boolean;
  location: string; description: string; visibility: Visibility;
  projectId: string | null; projectName: string | null;
  status?: TaskStatus; assignees?: string[];
};

/** Every day (in tz) an item touches. Timed events ending exactly at midnight don't spill into the next day. */
export function itemDayKeys(item: Pick<CalItem, "start" | "end" | "allDay">, tz: string) {
  const s = dayKey(item.start, tz);
  let e = s;
  if (item.end) {
    const end = new Date(item.end);
    e = item.allDay ? dayKey(end, tz) : dayKey(new Date(end.getTime() - 1), tz);
    if (e < s) e = s;
  }
  return rangeKeys(s, e, 62);
}

/** e.g. "Friday, November 8, 2026 · 4:00 – 5:30 PM EST" */
export function fmtItemRange(item: Pick<CalItem, "start" | "end" | "allDay">, tz: string) {
  const s = new Date(item.start);
  if (item.allDay) {
    const sk = dayKey(s, tz);
    const ek = item.end ? dayKey(item.end, tz) : sk;
    return ek <= sk ? `${fmtKey(sk, "EEEE, MMMM d, yyyy")} · All day` : `${fmtKey(sk, "EEE, MMM d")} – ${fmtKey(ek, "EEE, MMM d, yyyy")} · All day`;
  }
  const date = formatInTimeZone(s, tz, "EEEE, MMMM d, yyyy");
  if (!item.end) return `${date} · ${formatInTimeZone(s, tz, "h:mm a zzz")}`;
  const e = new Date(item.end);
  if (dayKey(s, tz) === dayKey(new Date(e.getTime() - 1), tz)) {
    const sameHalf = formatInTimeZone(s, tz, "a") === formatInTimeZone(e, tz, "a");
    return `${date} · ${formatInTimeZone(s, tz, sameHalf ? "h:mm" : "h:mm a")} – ${formatInTimeZone(e, tz, "h:mm a zzz")}`;
  }
  return `${formatInTimeZone(s, tz, "EEE, MMM d, h:mm a")} – ${formatInTimeZone(e, tz, "EEE, MMM d, h:mm a zzz")}`;
}

/** Sort: all-day first, then by start time, events before tasks at the same moment. */
export function compareItems(a: CalItem, b: CalItem) {
  if (a.allDay !== b.allDay) return a.allDay ? -1 : 1;
  const d = new Date(a.start).getTime() - new Date(b.start).getTime();
  if (d) return d;
  if (a.kind !== b.kind) return a.kind === "event" ? -1 : 1;
  return a.title.localeCompare(b.title);
}

export function groupByDay(items: CalItem[], tz: string, days: string[]) {
  const wanted = new Set(days);
  const map = new Map<string, CalItem[]>();
  for (const it of items) for (const k of itemDayKeys(it, tz)) if (wanted.has(k)) map.set(k, [...(map.get(k) ?? []), it]);
  for (const list of map.values()) list.sort(compareItems);
  return map;
}

