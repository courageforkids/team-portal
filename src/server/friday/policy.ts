import "server-only";
import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { fridaySettings as settings } from "@/db/schema";
import { stableJson } from "@/lib/friday-pure";
export { costMills, stableJson } from "@/lib/friday-pure";

/** Level 2 permissions Jacob can switch on in Friday's settings. Friday has no tool that changes these. */
export const STANDING_PERMISSIONS = {
  internal_reminders: "Send a team member a reminder notification in the portal",
} as const;
export type StandingPermission = keyof typeof STANDING_PERMISSIONS;
export type Level = 1 | 2 | 3;

export const actionHash = (tool: string, input: unknown) => createHash("sha256").update(`${tool}\n${stableJson(input)}`).digest("hex");

export async function getSettings() {
  const [row] = await db.select().from(settings).where(eq(settings.id, 1));
  if (row) return row;
  await db.insert(settings).values({ id: 1 }).onConflictDoNothing();
  return (await db.select().from(settings).where(eq(settings.id, 1)))[0];
}

/** The single decision point every tool call goes through, for chat, background jobs and any future sub-agent. */
export async function authorize(level: Level, permission?: StandingPermission): Promise<"run" | "approve" | "paused"> {
  const s = await getSettings();
  if (s.paused) return "paused";
  if (level === 1) return "run";
  if (level === 2 && permission && s.permissions?.[permission] === true) return "run";
  return "approve";
}


export const thisMonth = () => new Date().toISOString().slice(0, 7);
export async function spentMills() {
  const s = await getSettings();
  return s.spentMonth === thisMonth() ? s.spentMills : 0;
}
export async function charge(mills: number) {
  const spent = (await spentMills()) + mills;
  await db.update(settings).set({ spentMonth: thisMonth(), spentMills: spent }).where(eq(settings.id, 1));
}
export async function budgetLeftMills() {
  const s = await getSettings();
  return s.monthlyBudgetCents * 10 - (await spentMills());
}
