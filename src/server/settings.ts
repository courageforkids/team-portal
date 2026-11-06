import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { settings, type OrgSettings } from "@/db/schema";

export const DEFAULT_SETTINGS: OrgSettings = {
  orgName: "Courage for Kids",
  tagline: "Their fight. Our mission.",
  logoFileId: null,
  reminderHours: [48, 24],
  overdueReminders: true,
  emailEnabled: false,
  emailFrom: "",
  quietHoursStart: 21,
  quietHoursEnd: 7,
  timezone: "America/New_York",
};

export async function getSettings(): Promise<OrgSettings> {
  const row = (await db.select().from(settings).where(eq(settings.id, 1)).limit(1))[0];
  return { ...DEFAULT_SETTINGS, ...(row?.data ?? {}) };
}

export async function saveSettings(patch: Partial<OrgSettings>) {
  const next = { ...(await getSettings()), ...patch };
  await db.insert(settings).values({ id: 1, data: next }).onConflictDoUpdate({ target: settings.id, set: { data: next, updatedAt: new Date() } });
  return next;
}
