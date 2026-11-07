"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { count, eq } from "drizzle-orm";
import { db } from "@/db";
import { donations, donors, users } from "@/db/schema";
import { actionAdmin } from "./auth";
import { actionDonations } from "./donations";
import { saveGift } from "./gifts";
import { saveSettings } from "./settings";
import { audit } from "./audit";
import { all, bool, safe, str, UserError } from "./safe-action";
import { parseMoney } from "@/lib/money";
import type { ActionResult } from "@/lib/action";

const money = (v: string) => { try { return parseMoney(v); } catch (e) { throw new UserError((e as Error).message); } };

export async function saveGiftAction(_: unknown, fd: FormData): Promise<ActionResult<{ id: string }>> {
  return safe(async () => {
    const me = await actionDonations();
    const type = z.enum(["cash", "in_kind", "other"]).parse(str(fd, "type") || "cash");
    const g = await saveGift({
      id: str(fd, "id") || null, donorId: str(fd, "donorId") || null, newDonorName: str(fd, "newDonorName"), newDonorKind: str(fd, "newDonorKind"),
      receivedOn: str(fd, "receivedOn"), type, amountCents: money(str(fd, "amount")), method: str(fd, "method"), description: str(fd, "description"),
      goodsProvided: bool(fd, "goodsProvided"), goodsDescription: str(fd, "goodsDescription"), goodsValueCents: money(str(fd, "goodsValue")),
      eventId: str(fd, "eventId") || null, notes: str(fd, "notes"),
    }, me.id);
    revalidatePath("/donations");
    return { ok: true, message: str(fd, "id") ? "Gift updated." : `Gift logged · receipt ${g.receiptNumber}`, data: { id: g.id } };
  });
}

export async function deleteGiftAction(id: string): Promise<ActionResult> {
  return safe(async () => {
    const me = await actionAdmin();
    const [g] = await db.delete(donations).where(eq(donations.id, z.string().uuid().parse(id))).returning({ n: donations.receiptNumber });
    if (!g) throw new UserError("That gift no longer exists.");
    await audit(me.id, "donation.delete", "donation", id, { receiptNumber: g.n });
    revalidatePath("/donations");
    return { ok: true, message: `Gift ${g.n} deleted.` };
  });
}

export async function saveDonorAction(_: unknown, fd: FormData): Promise<ActionResult> {
  return safe(async () => {
    const me = await actionDonations();
    const id = z.string().uuid().parse(str(fd, "id"));
    const name = str(fd, "name").slice(0, 140);
    if (!name) throw new UserError("The donor needs a name.");
    await db.update(donors).set({
      name, kind: z.enum(["individual", "business", "foundation", "school", "church", "other"]).parse(str(fd, "kind")),
      email: str(fd, "email").slice(0, 200), phone: str(fd, "phone").slice(0, 40), address: str(fd, "address").slice(0, 500), notes: str(fd, "notes").slice(0, 2000), updatedAt: new Date(),
    }).where(eq(donors.id, id));
    await audit(me.id, "donor.update", "donor", id);
    revalidatePath("/donations");
    return { ok: true, message: "Donor saved." };
  });
}

export async function deleteDonorAction(id: string): Promise<ActionResult> {
  return safe(async () => {
    const me = await actionAdmin();
    const [{ n }] = await db.select({ n: count() }).from(donations).where(eq(donations.donorId, id));
    if (n > 0) throw new UserError("This donor has gifts logged. Delete those first.");
    await db.delete(donors).where(eq(donors.id, id));
    await audit(me.id, "donor.delete", "donor", id);
    revalidatePath("/donations");
    return { ok: true, message: "Donor removed." };
  });
}

export async function saveReceiptSettingsAction(_: unknown, fd: FormData): Promise<ActionResult> {
  return safe(async () => {
    const me = await actionAdmin();
    const ids = all(fd, "managers");
    if (ids.length) {
      const valid = new Set((await db.select({ id: users.id }).from(users)).map((u) => u.id));
      if (ids.some((i) => !valid.has(i))) throw new UserError("Pick members from the list.");
    }
    await saveSettings({
      receiptAddress: str(fd, "address").slice(0, 300), receiptSignerName: str(fd, "signerName").slice(0, 100), receiptSignerTitle: str(fd, "signerTitle").slice(0, 100), donationManagerIds: ids,
    });
    await audit(me.id, "settings.receipts", "settings", "1", { managers: ids.length });
    revalidatePath("/donations");
    return { ok: true, message: "Receipt settings saved." };
  });
}
