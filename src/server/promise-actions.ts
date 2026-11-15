"use server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { promises } from "@/db/schema";
import { actionAdmin } from "./auth";
import { safe, str, optStr, UserError } from "./safe-action";
import type { ActionResult } from "@/lib/action";

// Promises are private: every query is scoped to the admin who wrote them.

export async function addPromiseAction(_: unknown, fd: FormData): Promise<ActionResult> {
  return safe(async () => {
    const me = await actionAdmin();
    const who = str(fd, "who"), what = str(fd, "what"), due = optStr(fd, "due");
    if (who.length < 1 || who.length > 120) throw new UserError("Add who you made the promise to.");
    if (what.length < 1 || what.length > 500) throw new UserError("Add what you promised (up to 500 characters).");
    if (due && !/^\d{4}-\d{2}-\d{2}$/.test(due)) throw new UserError("Pick a valid date.");
    await db.insert(promises).values({ ownerId: me.id, who, what, dueDate: due });
    return { ok: true, message: "Promise saved." };
  });
}

export async function setPromiseDoneAction(id: string, done: boolean): Promise<ActionResult> {
  return safe(async () => {
    const me = await actionAdmin();
    const r = await db.update(promises).set({ doneAt: done ? new Date() : null })
      .where(and(eq(promises.id, id), eq(promises.ownerId, me.id))).returning({ id: promises.id });
    if (!r.length) throw new UserError("That promise wasn't found.");
    return { ok: true, message: done ? "Marked as done." : "Moved back to open." };
  });
}

export async function deletePromiseAction(id: string): Promise<ActionResult> {
  return safe(async () => {
    const me = await actionAdmin();
    const r = await db.delete(promises).where(and(eq(promises.id, id), eq(promises.ownerId, me.id))).returning({ id: promises.id });
    if (!r.length) throw new UserError("That promise wasn't found.");
    return { ok: true, message: "Promise deleted." };
  });
}
