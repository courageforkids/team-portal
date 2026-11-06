/** Shared (client + server) project vocabulary and date-only helpers. */
import { formatInTimeZone } from "date-fns-tz";
import { DEFAULT_TZ } from "@/lib/dates";
import type { Tone } from "@/components/ui/badge";

export const PROJECT_STATUSES = ["planning", "active", "on_hold", "completed", "archived"] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

export const PROJECT_STATUS_LABEL: Record<ProjectStatus, string> = {
  planning: "Planning", active: "Active", on_hold: "On hold", completed: "Completed", archived: "Archived",
};
export const PROJECT_STATUS_TONE: Record<ProjectStatus, Tone> = {
  planning: "blue", active: "green", on_hold: "amber", completed: "brand", archived: "muted",
};

/** `date` columns come back as "YYYY-MM-DD"; format them without shifting across timezones. */
export function fmtDay(d: string | null | undefined, pattern = "MMM d, yyyy") {
  if (!d) return "";
  return formatInTimeZone(new Date(`${d}T12:00:00Z`), "UTC", pattern);
}
export function todayISO(tz = DEFAULT_TZ) {
  return formatInTimeZone(new Date(), tz, "yyyy-MM-dd");
}

export function fmtBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export type ProjectProgressData = { approved: number; counted: number; open: number; inReview: number; total: number; msDone: number; msTotal: number };
export function progressPct(p: { approved: number; counted: number }) {
  return p.counted ? Math.round((p.approved / p.counted) * 100) : 0;
}
