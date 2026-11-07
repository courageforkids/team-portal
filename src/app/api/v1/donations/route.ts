import { z } from "zod";
import { apiRoute, ApiError, jsonBody } from "@/server/api-auth";
import { bool, text } from "@/server/api-helpers";
import { listGifts, yearTotals } from "@/server/donations";
import { saveGift } from "@/server/gifts";
import { UserError } from "@/server/safe-action";
import { parseMoney } from "@/lib/money";

const money = (v: unknown, field: string) => {
  if (v === undefined || v === null || v === "") return null;
  try { return typeof v === "number" ? Math.round(v * 100) : parseMoney(String(v)); } catch { throw new ApiError(400, `“${field}” must be an amount like 25 or "1,250.50".`); }
};

export const GET = apiRoute(async (req) => {
  const y = Number(new URL(req.url).searchParams.get("year")) || new Date().getFullYear();
  const rows = await listGifts({ year: y, limit: 200 });
  return {
    year: y, totals: await yearTotals(y),
    gifts: rows.map(({ gift: g, donorName }) => ({ id: g.id, receiptNumber: g.receiptNumber, donor: donorName, receivedOn: g.receivedOn, type: g.type, amount: g.amountCents === null ? null : g.amountCents / 100, description: g.description, receiptUrl: `/api/donations/${g.id}/receipt` })),
  };
});

/** { donor: "Smith Family", receivedOn: "2026-11-07", type: "cash"|"in_kind"|"other", amount: 50, method: "Check", description, goodsReceived: "2 tickets", goodsValue: 20 } */
export const POST = apiRoute(async (req, actor) => {
  const b = await jsonBody(req);
  const donor = text(b.donor, 140);
  if (!donor) throw new ApiError(400, "“donor” (a name) is required.");
  const goodsDescription = text(b.goodsReceived, 300);
  try {
    const g = await saveGift({
      newDonorName: donor, newDonorKind: text(b.donorKind, 20), receivedOn: text(b.receivedOn, 10) || new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" }),
      type: z.enum(["cash", "in_kind", "other"]).parse(b.type ?? "cash"), amountCents: money(b.amount, "amount"), method: text(b.method, 40), description: text(b.description, 1000),
      goodsProvided: bool(b.goodsProvided, !!goodsDescription), goodsDescription, goodsValueCents: money(b.goodsValue, "goodsValue"), eventId: null, notes: text(b.notes, 2000),
    }, actor.id, "api");
    return { ok: true, id: g.id, receiptNumber: g.receiptNumber, receiptUrl: `/api/donations/${g.id}/receipt` };
  } catch (e) {
    if (e instanceof UserError) throw new ApiError(400, e.message);
    throw e;
  }
});
