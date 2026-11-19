import "server-only";
import { and, eq, inArray, isNotNull, isNull, lte } from "drizzle-orm";
import { addDays } from "date-fns";
import { formatInTimeZone } from "date-fns-tz";
import { db } from "@/db";
import { hqItems } from "@/db/schema";
import { getSettings } from "./settings";
import { todayIn } from "./admin";
import { notify } from "./notify";
import { GRANT_OPEN, shortDate, type HqKind } from "@/lib/hq";

export const listHq = (ownerId: string) => db.select().from(hqItems).where(eq(hqItems.ownerId, ownerId));

const TAB: Record<HqKind, string> = { task: "task", grant: "grant", gift: "gift", contact: "contact" };

/**
 * Phone + in-app nudges for the owner's HQ: tasks due today/tomorrow, grant deadlines a week and a day out,
 * follow-ups due today, and one calm "slipped" notice for anything that went past its date in the last 3 days.
 * Only after 7am in the org's timezone; dedupe keys make each nudge fire once.
 */
export async function sendHqReminders(now = new Date()) {
  const { timezone: tz } = await getSettings();
  if (Number(formatInTimeZone(now, tz, "H")) < 7) return 0;
  const today = todayIn(tz, now), tomorrow = todayIn(tz, addDays(now, 1)), week = todayIn(tz, addDays(now, 7)), recent = todayIn(tz, addDays(now, -3));
  const rows = await db.select().from(hqItems).where(and(
    isNull(hqItems.doneAt), isNotNull(hqItems.date), lte(hqItems.date, week), inArray(hqItems.kind, ["task", "grant", "contact"]),
  ));
  let sent = 0;
  for (const r of rows) {
    const d = r.date!;
    if (r.kind === "grant" && !GRANT_OPEN.includes(r.category)) continue;
    let tag = "", title = "";
    if (r.kind === "task") {
      if (d === today) { tag = "today"; title = `Due today: ${r.title}`; }
      else if (d === tomorrow) { tag = "tomorrow"; title = `Due tomorrow: ${r.title}`; }
      else if (d < today && d >= recent) { tag = "slipped"; title = `Still open from ${shortDate(d)}: ${r.title}`; }
    } else if (r.kind === "grant") {
      const name = r.subtitle ? `${r.title} (${r.subtitle})` : r.title;
      if (d === week) { tag = "week"; title = `Grant deadline in a week: ${name}`; }
      else if (d === tomorrow) { tag = "tomorrow"; title = `Grant deadline tomorrow: ${name}`; }
      else if (d === today) { tag = "today"; title = `Grant deadline today: ${name}`; }
    } else {
      if (d === today) { tag = "today"; title = `Follow up today: ${r.title}`; }
      else if (d < today && d >= recent) { tag = "slipped"; title = `Follow-up waiting since ${shortDate(d)}: ${r.title}`; }
    }
    if (!tag) continue;
    sent += await notify([r.ownerId], {
      type: "hq", title: title.slice(0, 160), body: (r.nextStep || r.person && `Owner: ${r.person}` || "").slice(0, 300),
      href: `/admin/hq?tab=${TAB[r.kind]}`, dedupeKey: `hq:${r.id}:${tag}:${d}`,
    });
  }
  return sent;
}
