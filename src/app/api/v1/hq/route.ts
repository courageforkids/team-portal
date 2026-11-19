import { eq } from "drizzle-orm";
import { db } from "@/db";
import { hqItems } from "@/db/schema";
import { apiRoute, ApiError, jsonBody } from "@/server/api-auth";
import { upsertHqItems } from "@/server/hq-items";
import { UserError } from "@/server/safe-action";

/** The key owner's Courage HQ (private to them). */
export const GET = apiRoute(async (_req, actor) => {
  const rows = await db.select().from(hqItems).where(eq(hqItems.ownerId, actor.id));
  return { items: rows.map((r) => ({ ...r, amount: r.amountCents === null ? null : r.amountCents / 100, done: !!r.doneAt })) };
});

/**
 * Add or update HQ items: { items: [{ externalId?, kind: "task"|"grant"|"gift"|"contact", title, subtitle, category, date, amount,
 * nextStep, person, link, notes, extra: {…}, done }] }. Items with an externalId are upserted (safe to re-send).
 */
export const POST = apiRoute(async (req, actor) => {
  const b = await jsonBody(req);
  if (!Array.isArray(b.items)) throw new ApiError(400, "Send { items: [...] } with 1–500 items.");
  try {
    return { ok: true, ...(await upsertHqItems(actor.id, b.items as Record<string, unknown>[])) };
  } catch (e) {
    if (e instanceof UserError) throw new ApiError(400, e.message);
    throw e;
  }
});
