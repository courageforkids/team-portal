import "server-only";
import { addMonths, subDays } from "date-fns";
import type { CurrentUser } from "@/server/auth";
import { getSettings } from "@/server/settings";
import { appUrl } from "@/server/email";
import { EVENT_TYPE_LABEL, STATUS_LABEL } from "@/lib/task-meta";
import { CAL_TYPE_LABEL, type CalItem } from "@/components/calendar/meta";
import { addDays, dayKey } from "@/components/calendar/date-utils";
import { loadCalendarItems } from "./data";

/* ── RFC 5545 helpers ── */

/** Escapes a TEXT value: backslash, semicolon, comma and newlines. */
export function escapeText(s: string) {
  return s
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "")
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r\n|\r|\n/g, "\\n");
}

/** Folds a content line at 75 octets (UTF-8), never splitting a multi-byte character. */
export function foldLine(line: string) {
  const enc = new TextEncoder();
  if (enc.encode(line).length <= 75) return line;
  const parts: string[] = [];
  let cur = "";
  let bytes = 0;
  let limit = 75;
  for (const ch of line) {
    const n = enc.encode(ch).length;
    if (bytes + n > limit) {
      parts.push(cur);
      cur = "";
      bytes = 0;
      limit = 74; // continuation lines start with a space, which counts toward the 75
    }
    cur += ch;
    bytes += n;
  }
  parts.push(cur);
  return parts.join("\r\n ");
}

/** 2026-11-08T17:52:57.124Z → 20261108T175257Z */
export const icsUtc = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
const icsDate = (key: string) => key.replace(/-/g, "");

export function buildIcs(items: CalItem[], opts: { name: string; tz: string; now?: Date }) {
  const now = opts.now ?? new Date();
  const stamp = icsUtc(now);
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Courage for Kids//Team Portal//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapeText(opts.name)}`,
    `X-WR-TIMEZONE:${opts.tz}`,
    "REFRESH-INTERVAL;VALUE=DURATION:PT1H",
    "X-PUBLISHED-TTL:PT1H",
  ];
  for (const it of items) {
    const start = new Date(it.start);
    const isTask = it.kind === "task";
    const url = isTask ? appUrl(`/tasks/${it.id}`) : appUrl(`/calendar?view=agenda&date=${dayKey(start, opts.tz)}`);
    lines.push("BEGIN:VEVENT", `UID:${isTask ? "task" : "event"}-${it.id}@team-portal.courageforkids`, `DTSTAMP:${stamp}`);
    if (it.allDay) {
      const sk = dayKey(start, opts.tz);
      const ek = it.end ? dayKey(it.end, opts.tz) : sk;
      lines.push(`DTSTART;VALUE=DATE:${icsDate(sk)}`, `DTEND;VALUE=DATE:${icsDate(addDays(ek < sk ? sk : ek, 1))}`);
    } else {
      lines.push(`DTSTART:${icsUtc(start)}`);
      // Task deadlines are a moment in time: no DTEND means zero duration (RFC 5545 §3.6.1).
      if (it.end && new Date(it.end) > start) lines.push(`DTEND:${icsUtc(new Date(it.end))}`);
    }
    if (isTask) {
      const done = it.status === "approved";
      lines.push(`SUMMARY:${escapeText(`${done ? "✓ " : "Due: "}${it.title}`)}`);
      const desc = [
        it.status ? `Status: ${STATUS_LABEL[it.status]}` : "",
        it.projectName ? `Project: ${it.projectName}` : "",
        `Open in the Team Portal: ${url}`,
      ].filter(Boolean).join("\n");
      lines.push(`DESCRIPTION:${escapeText(desc)}`, `CATEGORIES:${escapeText(CAL_TYPE_LABEL.task)}`, "TRANSP:TRANSPARENT");
    } else {
      lines.push(`SUMMARY:${escapeText(it.title)}`);
      const desc = [it.description, it.projectName ? `Project: ${it.projectName}` : ""].filter(Boolean).join("\n\n");
      if (desc) lines.push(`DESCRIPTION:${escapeText(desc)}`);
      if (it.location) lines.push(`LOCATION:${escapeText(it.location)}`);
      if (it.type !== "task") lines.push(`CATEGORIES:${escapeText(EVENT_TYPE_LABEL[it.type])}`);
    }
    lines.push(`URL:${url}`, "END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return lines.map(foldLine).join("\r\n") + "\r\n";
}

/** The viewer's calendar file: visible events + their own task deadlines, from 30 days ago to 6 months ahead. */
export async function calendarIcsFor(user: CurrentUser) {
  const s = await getSettings();
  const now = new Date();
  const items = await loadCalendarItems(user, subDays(now, 30), addMonths(now, 6), "mine");
  return buildIcs(items, { name: `${s.orgName} Team Calendar`, tz: s.timezone, now });
}

export const ICS_HEADERS = { "Content-Type": "text/calendar; charset=utf-8", "X-Content-Type-Options": "nosniff" } as const;
