import "server-only";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { donations, donors } from "@/db/schema";
import { nextReceiptNumber } from "./donations";
import { audit } from "./audit";
import { UserError } from "./safe-action";

export type GiftInput = {
  id?: string | null;
  donorId?: string | null; newDonorName?: string; newDonorKind?: string;
  receivedOn: string; type: "cash" | "in_kind" | "other";
  amountCents: number | null; method: string; description: string;
  goodsProvided: boolean; goodsDescription: string; goodsValueCents: number | null;
  eventId: string | null; notes: string;
};
const KINDS = ["individual", "business", "foundation", "school", "church", "other"] as const;

export async function saveGift(input: GiftInput, actorId: string, via?: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.receivedOn) || isNaN(Date.parse(input.receivedOn))) throw new UserError("Pick the date the gift was received.");
  if (input.receivedOn > new Date(Date.now() + 86400000).toISOString().slice(0, 10)) throw new UserError("The gift date can't be in the future.");
  if (input.type === "cash" && !input.amountCents) throw new UserError("Enter the amount of the gift.");
  if (input.type !== "cash" && !input.description.trim()) throw new UserError("Describe what was donated, e.g. “40 coloring books and crayons”.");
  if (input.goodsProvided && !input.goodsDescription.trim()) throw new UserError("Describe what the donor received in return.");

  let donorId = input.donorId || null;
  if (!donorId) {
    const name = (input.newDonorName ?? "").trim().slice(0, 140);
    if (!name) throw new UserError("Choose a donor or type a new donor's name.");
    const existing = (await db.select({ id: donors.id }).from(donors).where(sql`lower(${donors.name}) = ${name.toLowerCase()}`).limit(1))[0];
    if (existing) donorId = existing.id;
    else {
      const kind = (KINDS as readonly string[]).includes(input.newDonorKind ?? "") ? (input.newDonorKind as (typeof KINDS)[number]) : "individual";
      const [d] = await db.insert(donors).values({ name, kind, createdById: actorId }).returning({ id: donors.id });
      donorId = d.id;
      await audit(actorId, "donor.create", "donor", d.id, { name, via });
    }
  }
  const values = {
    donorId, receivedOn: input.receivedOn, type: input.type,
    amountCents: input.type === "in_kind" ? null : input.amountCents,
    method: input.type === "cash" ? input.method.slice(0, 40) : "",
    description: input.description.trim().slice(0, 1000),
    goodsProvided: input.type !== "other" && input.goodsProvided,
    goodsDescription: input.type !== "other" && input.goodsProvided ? input.goodsDescription.trim().slice(0, 300) : "",
    goodsValueCents: input.type !== "other" && input.goodsProvided ? input.goodsValueCents : null,
    eventId: input.eventId || null, notes: input.notes.trim().slice(0, 2000), updatedAt: new Date(),
  };
  if (input.id) {
    const [g] = await db.update(donations).set(values).where(eq(donations.id, input.id)).returning({ id: donations.id, receiptNumber: donations.receiptNumber });
    if (!g) throw new UserError("That gift no longer exists.");
    await audit(actorId, "donation.update", "donation", g.id, { via });
    return { ...g, donorId };
  }
  for (let attempt = 0; ; attempt++) {
    try {
      const receiptNumber = await nextReceiptNumber(input.receivedOn);
      const [g] = await db.insert(donations).values({ ...values, receiptNumber, createdById: actorId }).returning({ id: donations.id, receiptNumber: donations.receiptNumber });
      await audit(actorId, "donation.create", "donation", g.id, { receiptNumber, via });
      return { ...g, donorId };
    } catch (e) {
      if (attempt < 3 && String((e as { code?: string })?.code) === "23505") continue; // two gifts saved at once; take the next number
      throw e;
    }
  }
}
