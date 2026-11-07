import "server-only";
import { redirect } from "next/navigation";
import { and, asc, desc, eq, gte, lt, sql } from "drizzle-orm";
import { db } from "@/db";
import { donations, donors, events } from "@/db/schema";
import { getSettings } from "./settings";
import { actionUser, AuthError, requireUser, type CurrentUser } from "./auth";
import { fmtMoney } from "@/lib/money";

export const ORG_LEGAL_NAME = "Courage for Kids";
export const ORG_EIN = "39-3833022";

/** Admins always; other members only if an admin added them as donation managers. */
export async function canManageDonations(u: { id: string; role: string }) {
  if (u.role === "admin") return true;
  return ((await getSettings()).donationManagerIds ?? []).includes(u.id);
}
export async function requireDonations(): Promise<CurrentUser> {
  const u = await requireUser();
  if (!(await canManageDonations(u))) redirect("/?denied=1");
  return u;
}
export async function actionDonations(): Promise<CurrentUser> {
  const u = await actionUser();
  if (!(await canManageDonations(u))) throw new AuthError();
  return u;
}

export type Gift = typeof donations.$inferSelect;
export type Donor = typeof donors.$inferSelect;

/** Next number like 2026-0007, per calendar year of the gift. */
export async function nextReceiptNumber(receivedOn: string) {
  const year = receivedOn.slice(0, 4);
  const [r] = await db.select({ max: sql<string | null>`max(${donations.receiptNumber})` }).from(donations).where(sql`${donations.receiptNumber} like ${year + "-%"}`);
  const n = r?.max ? Number(r.max.split("-")[1]) + 1 : 1;
  return `${year}-${String(n).padStart(4, "0")}`;
}

export async function listGifts(opts: { year?: number; donorId?: string; limit?: number } = {}) {
  const where = [];
  if (opts.year) where.push(gte(donations.receivedOn, `${opts.year}-01-01`), lt(donations.receivedOn, `${opts.year + 1}-01-01`));
  if (opts.donorId) where.push(eq(donations.donorId, opts.donorId));
  return db.select({ gift: donations, donorName: donors.name, eventTitle: events.title })
    .from(donations).innerJoin(donors, eq(donors.id, donations.donorId)).leftJoin(events, eq(events.id, donations.eventId))
    .where(where.length ? and(...where) : undefined)
    .orderBy(desc(donations.receivedOn), desc(donations.createdAt)).limit(opts.limit ?? 500);
}

export async function listDonors() {
  return db.select({
    donor: donors,
    gifts: sql<number>`count(${donations.id})::int`,
    cashCents: sql<number>`coalesce(sum(${donations.amountCents}) filter (where ${donations.type} = 'cash'), 0)::int`,
    lastGift: sql<string | null>`max(${donations.receivedOn})`,
  }).from(donors).leftJoin(donations, eq(donations.donorId, donors.id)).groupBy(donors.id).orderBy(asc(donors.name));
}

export async function yearTotals(year: number) {
  const [r] = await db.select({
    cashCents: sql<number>`coalesce(sum(${donations.amountCents}) filter (where ${donations.type} = 'cash'), 0)::int`,
    gifts: sql<number>`count(*)::int`,
    inKind: sql<number>`count(*) filter (where ${donations.type} = 'in_kind')::int`,
    donors: sql<number>`count(distinct ${donations.donorId})::int`,
  }).from(donations).where(and(gte(donations.receivedOn, `${year}-01-01`), lt(donations.receivedOn, `${year + 1}-01-01`)));
  return r;
}

/** Cash logged between two YYYY-MM-DD dates (end exclusive). Used by the monthly report. */
export async function cashBetween(start: string, end: string) {
  const [r] = await db.select({ c: sql<number>`coalesce(sum(${donations.amountCents}), 0)::int`, n: sql<number>`count(*)::int` })
    .from(donations).where(and(eq(donations.type, "cash"), gte(donations.receivedOn, start), lt(donations.receivedOn, end)));
  return { cents: r.c, count: r.n };
}

/** The wording that goes on a receipt. Tax wording only for money and donated items. */
export function receiptStatements(g: Pick<Gift, "type" | "amountCents" | "goodsProvided" | "goodsDescription" | "goodsValueCents">) {
  if (g.type === "other") return { tax: false, lines: [] as string[], missingValue: false };
  const lines: string[] = [];
  let missingValue = false;
  if (g.type === "in_kind") lines.push(`${ORG_LEGAL_NAME} does not assign a dollar value to donated items. Determining their value is the donor's responsibility.`);
  if (!g.goodsProvided) lines.push("No goods or services were provided in exchange for this contribution.");
  else {
    missingValue = g.goodsValueCents === null;
    const v = g.goodsValueCents === null ? "$________" : fmtMoney(g.goodsValueCents);
    let s = `In exchange for this contribution, the donor received ${g.goodsDescription || "goods or services"} with an estimated fair market value of ${v}.`;
    s += " The amount deductible for federal income tax purposes is limited to the amount of the contribution in excess of that value";
    if (g.type === "cash" && g.amountCents !== null && g.goodsValueCents !== null) s += ` (${fmtMoney(Math.max(0, g.amountCents - g.goodsValueCents))})`;
    lines.push(s + ".");
  }
  return { tax: true, lines, missingValue };
}

export async function receiptSettings() {
  const s = await getSettings();
  return { address: s.receiptAddress ?? "", signerName: s.receiptSignerName || "Jacob Rogers", signerTitle: s.receiptSignerTitle || "Founder & Executive Director", managerIds: s.donationManagerIds ?? [] };
}
