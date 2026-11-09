import "server-only";
import { getSettings } from "./settings";
import type { CurrentUser } from "./auth";

/** The Christmas look runs from Nov 1 through Jan 1 (Eastern time), then switches itself off. */
export function inHolidayWindow(now = new Date()) {
  const md = now.toLocaleDateString("en-CA", { timeZone: "America/New_York" }).slice(5);
  return md >= "11-01" || md <= "01-01";
}

export async function holidaySettings() {
  return { audience: (await getSettings()).holiday?.audience ?? "preview" };
}

export async function holidayOn(u: Pick<CurrentUser, "role">) {
  if (!inHolidayWindow()) return false;
  const { audience } = await holidaySettings();
  return audience === "everyone" || (audience === "preview" && u.role === "admin");
}

/** Days until Christmas (0 on the day), Eastern time. */
export function daysToChristmas(now = new Date()) {
  const ymd = now.toLocaleDateString("en-CA", { timeZone: "America/New_York" });
  const y = Number(ymd.slice(0, 4));
  let xmas = Date.UTC(y, 11, 25);
  const today = Date.parse(ymd + "T00:00:00Z");
  if (today > xmas) xmas = Date.UTC(y + 1, 11, 25);
  return Math.round((xmas - today) / 86400000);
}
