import { formatInTimeZone, fromZonedTime, toZonedTime } from "date-fns-tz";
import { differenceInCalendarDays, formatDistanceToNowStrict } from "date-fns";

export const DEFAULT_TZ = "America/New_York";

export function fmtDate(d: Date | string | null | undefined, tz = DEFAULT_TZ, pattern = "MMM d") {
  if (!d) return "";
  return formatInTimeZone(new Date(d), tz, pattern);
}
export function fmtDateTime(d: Date | string | null | undefined, tz = DEFAULT_TZ) {
  if (!d) return "";
  return formatInTimeZone(new Date(d), tz, "MMM d, h:mm a");
}
export function fmtFull(d: Date | string | null | undefined, tz = DEFAULT_TZ) {
  if (!d) return "";
  return formatInTimeZone(new Date(d), tz, "EEEE, MMMM d, yyyy 'at' h:mm a zzz");
}
export function ago(d: Date | string) {
  const ms = Date.now() - new Date(d).getTime();
  if (ms < 60_000) return "just now";
  return formatDistanceToNowStrict(new Date(d), { addSuffix: true });
}

/** Friendly relative due label, e.g. "Due today", "Due tomorrow", "Due in 3 days", "2 days past due". */
export function dueLabel(due: Date | string | null | undefined, tz = DEFAULT_TZ, now = new Date()) {
  if (!due) return "No due date";
  const d = new Date(due);
  const days = differenceInCalendarDays(toZonedTime(d, tz), toZonedTime(now, tz));
  const time = formatInTimeZone(d, tz, "h:mm a");
  if (d.getTime() < now.getTime()) {
    if (days === 0) return `Was due today, ${time}`;
    const n = Math.abs(days);
    return `${n} day${n === 1 ? "" : "s"} past due`;
  }
  if (days === 0) return `Due today, ${time}`;
  if (days === 1) return `Due tomorrow, ${time}`;
  if (days < 7) return `Due ${formatInTimeZone(d, tz, "EEEE")}`;
  return `Due ${formatInTimeZone(d, tz, "MMM d")}`;
}

/** Parse a <input type="datetime-local"> value as wall-clock time in tz. */
export function parseLocalInput(value: string | null | undefined, tz = DEFAULT_TZ): Date | null {
  if (!value) return null;
  const v = value.length === 10 ? `${value}T23:59` : value;
  const d = fromZonedTime(v, tz);
  return isNaN(d.getTime()) ? null : d;
}
/** Format a Date for a datetime-local input in tz. */
export function toLocalInput(d: Date | string | null | undefined, tz = DEFAULT_TZ) {
  if (!d) return "";
  return formatInTimeZone(new Date(d), tz, "yyyy-MM-dd'T'HH:mm");
}

export const TIMEZONES = [
  "America/New_York", "America/Chicago", "America/Denver", "America/Phoenix", "America/Los_Angeles", "America/Anchorage", "Pacific/Honolulu", "UTC",
];
