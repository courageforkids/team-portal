/** Calendar-date helpers (client + server safe). Day keys are "yyyy-MM-dd" wall dates in the org time zone. */
import { formatInTimeZone, fromZonedTime } from "date-fns-tz";

const KEY_RE = /^\d{4}-\d{2}-\d{2}$/;

const keyToUtc = (key: string) => { const [y, m, d] = key.split("-").map(Number); return new Date(Date.UTC(y, m - 1, d)); };
const utcToKey = (d: Date) => d.toISOString().slice(0, 10);

export function isValidKey(v: string | null | undefined): v is string {
  if (!v || !KEY_RE.test(v)) return false;
  const d = keyToUtc(v);
  return !isNaN(d.getTime()) && utcToKey(d) === v && d.getUTCFullYear() > 1970 && d.getUTCFullYear() < 2200;
}

export const dayKey = (d: Date | string, tz: string) => formatInTimeZone(new Date(d), tz, "yyyy-MM-dd");
export const addDays = (key: string, n: number) => { const d = keyToUtc(key); d.setUTCDate(d.getUTCDate() + n); return utcToKey(d); };
export const startOfMonth = (key: string) => key.slice(0, 7) + "-01";
export const addMonths = (key: string, n: number) => { const [y, m] = key.split("-").map(Number); return utcToKey(new Date(Date.UTC(y, m - 1 + n, 1))); };
export const weekday = (key: string) => keyToUtc(key).getUTCDay();
export const startOfWeek = (key: string) => addDays(key, -weekday(key));
/** Formats a day key with a date-fns pattern (no time zone shifting). */
export const fmtKey = (key: string, pattern: string) => formatInTimeZone(keyToUtc(key), "UTC", pattern);

export function rangeKeys(from: string, toInclusive: string, cap = 400) {
  const out: string[] = [];
  for (let k = from; k <= toInclusive && out.length < cap; k = addDays(k, 1)) out.push(k);
  return out;
}

/** Sunday-first weeks covering the month of `key`. */
export function monthGrid(key: string) {
  const first = startOfMonth(key);
  const last = addDays(addMonths(first, 1), -1);
  return rangeKeys(startOfWeek(first), addDays(startOfWeek(last), 6));
}

/** UTC instant of local midnight at the start of `key` in tz. */
export const keyStartUtc = (key: string, tz: string) => fromZonedTime(`${key}T00:00:00`, tz);

/** "Eastern Time" style label for hints. */
export function tzLabel(tz: string) {
  try {
    const part = new Intl.DateTimeFormat("en-US", { timeZone: tz, timeZoneName: "longGeneric" }).formatToParts(new Date()).find((p) => p.type === "timeZoneName");
    return part?.value ?? tz;
  } catch {
    return tz;
  }
}

/** "4p", "4:30p" */
export function compactTime(d: Date | string, tz: string) {
  const date = new Date(d);
  const m = formatInTimeZone(date, tz, "mm");
  return formatInTimeZone(date, tz, "h") + (m === "00" ? "" : ":" + m) + formatInTimeZone(date, tz, "a").charAt(0).toLowerCase();
}
export const timeOf = (d: Date | string, tz: string) => formatInTimeZone(new Date(d), tz, "h:mm a");
