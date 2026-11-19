import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { hqItems } from "@/db/schema";
import { HQ_EXTRA, HQ_KINDS, type HqKind } from "@/lib/hq";
import { UserError } from "./safe-action";

export type HqInput = {
  kind: string; title: string; subtitle?: string; category?: string; date?: string | null; amountCents?: number | null;
  nextStep?: string; person?: string; link?: string; notes?: string; extra?: Record<string, string | boolean | null>; done?: boolean;
};

const cut = (v: unknown, n: number) => (typeof v === "string" ? v.trim().slice(0, n) : "");

/** Validates one HQ item into column values. Shared by the page's forms and the API import. */
export function cleanHq(i: HqInput) {
  if (!HQ_KINDS.includes(i.kind as HqKind)) throw new UserError("Pick tasks, grants, gifts or people.");
  const kind = i.kind as HqKind;
  const title = cut(i.title, 200);
  if (!title) throw new UserError("Give it a name.");
  const date = i.date ? String(i.date).slice(0, 10) : null;
  if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new UserError("Pick a valid date.");
  const amount = i.amountCents ?? null;
  if (amount !== null && (!Number.isFinite(amount) || amount < 0 || amount > 1e11)) throw new UserError("Enter an amount like 250 or 1,500.");
  const extra: Record<string, string | boolean | null> = {};
  for (const k of HQ_EXTRA[kind]) { const v = i.extra?.[k]; if (typeof v === "string" && v.trim()) extra[k] = v.trim().slice(0, 1000); }
  if (kind === "grant" && i.extra?.rolling === true) extra.rolling = true;
  return {
    kind, title, subtitle: cut(i.subtitle, 300), category: cut(i.category, 60), date, amountCents: amount === null ? null : Math.round(amount),
    nextStep: cut(i.nextStep, 500), person: cut(i.person, 120), link: cut(i.link, 500), notes: cut(i.notes, 4000), extra,
  };
}

export async function ownedHq(ownerId: string, id: string) {
  const r = (await db.select().from(hqItems).where(and(eq(hqItems.id, id), eq(hqItems.ownerId, ownerId))).limit(1))[0];
  if (!r) throw new UserError("That item wasn't found.");
  return r;
}

/**
 * Adds or updates many items for one owner. Items with an externalId are upserted, so importing the same file twice is safe.
 * `amount` is in dollars. Throws UserError naming the first bad item.
 */
export async function upsertHqItems(ownerId: string, items: Record<string, unknown>[]) {
  if (!items.length || items.length > 500) throw new UserError("Send between 1 and 500 items.");
  const clean = items.map((raw, n) => {
    try {
      const amount = raw.amount === undefined || raw.amount === null || raw.amount === "" ? null : Number(raw.amount) * 100;
      const v = cleanHq({ ...(raw as unknown as HqInput), amountCents: amount });
      if (v.kind === "gift" && v.category !== "Cash") v.amountCents = null; // no dollar values on donated items
      const doneAt = raw.done === true ? (typeof raw.doneAt === "string" && !isNaN(Date.parse(raw.doneAt)) ? new Date(raw.doneAt) : new Date()) : null;
      const externalId = typeof raw.externalId === "string" && raw.externalId.trim() ? raw.externalId.trim().slice(0, 120) : null;
      return { v, doneAt, externalId };
    } catch (e) {
      if (e instanceof UserError) throw new UserError(`Item ${n + 1}: ${e.message}`);
      throw e;
    }
  });
  let added = 0, updated = 0;
  for (const { v, doneAt, externalId } of clean) {
    if (externalId) {
      const prev = (await db.select({ id: hqItems.id }).from(hqItems).where(and(eq(hqItems.ownerId, ownerId), eq(hqItems.externalId, externalId))).limit(1))[0];
      if (prev) { await db.update(hqItems).set({ ...v, doneAt, updatedAt: sql`now()` }).where(eq(hqItems.id, prev.id)); updated++; continue; }
    }
    await db.insert(hqItems).values({ ...v, doneAt, externalId, ownerId });
    added++;
  }
  return { added, updated };
}
