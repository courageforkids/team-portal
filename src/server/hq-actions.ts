"use server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { hqItems } from "@/db/schema";
import { parseMoney } from "@/lib/money";
import { HQ_EXTRA, HQ_KINDS, type HqKind } from "@/lib/hq";
import { actionAdmin } from "./auth";
import { safe, str, optStr, bool, UserError } from "./safe-action";
import { cleanHq, ownedHq, upsertHqItems } from "./hq-items";
import type { ActionResult } from "@/lib/action";

// Courage HQ is private: every query is scoped to the admin who owns it.

export async function saveHqItemAction(_: unknown, fd: FormData): Promise<ActionResult> {
  return safe(async () => {
    const me = await actionAdmin();
    const kind = str(fd, "kind") as HqKind;
    if (!HQ_KINDS.includes(kind)) throw new UserError("Pick tasks, grants, gifts or people.");
    let amountCents: number | null = null;
    const rawAmount = str(fd, "amount");
    if (rawAmount) { try { amountCents = parseMoney(rawAmount); } catch { throw new UserError("Enter an amount like 250 or 1,500."); } }
    const extra: Record<string, string | boolean | null> = {};
    for (const k of HQ_EXTRA[kind]) extra[k] = str(fd, `x_${k}`);
    if (kind === "grant") extra.rolling = bool(fd, "x_rolling");
    const v = cleanHq({
      kind, title: str(fd, "title"), subtitle: str(fd, "subtitle"), category: str(fd, "category"), date: optStr(fd, "date"), amountCents,
      nextStep: str(fd, "nextStep"), person: str(fd, "person"), link: str(fd, "link"), notes: str(fd, "notes"), extra,
    });
    if (v.kind === "gift" && v.category !== "Cash") v.amountCents = null; // no dollar values on donated items
    const id = optStr(fd, "id");
    if (id) {
      await ownedHq(me.id, id);
      await db.update(hqItems).set({ ...v, updatedAt: new Date() }).where(and(eq(hqItems.id, id), eq(hqItems.ownerId, me.id)));
      return { ok: true, message: "Saved." };
    }
    await db.insert(hqItems).values({ ...v, ownerId: me.id });
    return { ok: true, message: "Added to HQ." };
  });
}

export async function setHqDoneAction(id: string, done: boolean): Promise<ActionResult> {
  return safe(async () => {
    const me = await actionAdmin();
    const r = await ownedHq(me.id, id);
    await db.update(hqItems).set({ doneAt: done ? new Date() : null, updatedAt: new Date() }).where(and(eq(hqItems.id, id), eq(hqItems.ownerId, me.id)));
    const msg = r.kind === "gift" ? (done ? "Marked as thanked." : "Marked as not thanked yet.") : done ? "Nice. Marked done." : "Moved back to open.";
    return { ok: true, message: msg };
  });
}

export async function deleteHqItemAction(id: string): Promise<ActionResult> {
  return safe(async () => {
    const me = await actionAdmin();
    const r = await db.delete(hqItems).where(and(eq(hqItems.id, id), eq(hqItems.ownerId, me.id))).returning({ id: hqItems.id });
    if (!r.length) throw new UserError("That item wasn't found.");
    return { ok: true, message: "Deleted." };
  });
}

/** One-time import of a Courage HQ export (.json file with { items: [...] } or a bare array). Safe to run twice. */
export async function importHqAction(_: unknown, fd: FormData): Promise<ActionResult> {
  return safe(async () => {
    const me = await actionAdmin();
    const file = fd.get("file");
    let text = String(fd.get("json") ?? "").trim();
    if (text.length > 2_000_000) throw new UserError("That's too much text for an HQ export.");
    if (file && typeof file === "object" && "size" in file && file.size > 0) {
      if (file.size > 2_000_000) throw new UserError("That file is too big for an HQ export.");
      text = await file.text();
    }
    if (!text) throw new UserError("Paste the HQ data or pick the export file.");
    let parsed: unknown;
    try { parsed = JSON.parse(text); } catch { throw new UserError("That file isn't an HQ export."); }
    const items = Array.isArray(parsed) ? parsed : (parsed as { items?: unknown }).items;
    if (!Array.isArray(items)) throw new UserError("That file isn't an HQ export.");
    const r = await upsertHqItems(me.id, items as Record<string, unknown>[]);
    return { ok: true, message: `Imported ${r.added} new${r.updated ? ` and updated ${r.updated}` : ""}.` };
  });
}
