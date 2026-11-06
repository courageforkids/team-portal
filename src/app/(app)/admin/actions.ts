"use server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { accountabilityRecords, users } from "@/db/schema";
import { actionAdmin } from "@/server/auth";
import { audit } from "@/server/audit";
import { safe, str, UserError } from "@/server/safe-action";
import type { ActionResult } from "@/lib/action";

const schema = z.object({
  memberId: z.string().uuid("Choose a team member."),
  type: z.enum(["coaching_note", "documented_warning", "improvement_plan", "follow_up"], { message: "Choose a record type." }),
  title: z.string().trim().min(2, "Add a short title.").max(160, "Keep the title under 160 characters."),
  details: z.string().trim().max(5000, "Details are limited to 5,000 characters."),
  followUpDate: z.union([z.literal(""), z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a valid follow-up date.")]),
  status: z.enum(["open", "in_progress", "resolved"]),
  resolution: z.string().trim().max(5000, "The resolution is limited to 5,000 characters."),
});

/** Create (no id) or update (id) an accountability record. Admin-only. */
export async function saveAccountabilityAction(_: unknown, fd: FormData): Promise<ActionResult> {
  return safe(async () => {
    const me = await actionAdmin();
    const id = str(fd, "id");
    const v = schema.parse({
      memberId: str(fd, "memberId"), type: str(fd, "type"), title: str(fd, "title"), details: str(fd, "details"),
      followUpDate: str(fd, "followUpDate"), status: str(fd, "status") || "open", resolution: str(fd, "resolution"),
    });
    if (v.status === "resolved" && !v.resolution) throw new UserError("Add a short note about how this was resolved.");
    const member = (await db.select({ id: users.id }).from(users).where(eq(users.id, v.memberId)).limit(1))[0];
    if (!member) throw new UserError("That member no longer exists.");
    const values = { ...v, followUpDate: v.followUpDate || null };
    if (id) {
      const before = (await db.select().from(accountabilityRecords).where(eq(accountabilityRecords.id, id)).limit(1))[0];
      if (!before) throw new UserError("That record no longer exists.");
      await db.update(accountabilityRecords).set({ ...values, memberId: before.memberId, updatedAt: new Date() }).where(eq(accountabilityRecords.id, id));
      const action = before.status !== "resolved" && v.status === "resolved" ? "accountability.resolve" : "accountability.update";
      await audit(me.id, action, "accountability", id, { memberId: before.memberId, status: v.status, from: before.status });
      return { ok: true, message: v.status === "resolved" && before.status !== "resolved" ? "Marked as resolved." : "Record updated." };
    }
    const [row] = await db.insert(accountabilityRecords).values({ ...values, authorId: me.id }).returning({ id: accountabilityRecords.id });
    await audit(me.id, "accountability.create", "accountability", row.id, { memberId: v.memberId, type: v.type });
    return { ok: true, message: "Record saved privately." };
  });
}
