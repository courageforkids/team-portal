"use server";
import { z } from "zod";
import { db } from "@/db";
import { monthlyReports } from "@/db/schema";
import { actionAdmin } from "./auth";
import { safe, str, UserError } from "./safe-action";
import type { ActionResult } from "@/lib/action";

const int = (v: string) => { if (!v) return null; const n = Math.floor(Number(v)); if (!Number.isFinite(n) || n < 0 || n > 100000) throw new UserError("Numbers must be 0 or more."); return n; };

export async function saveMonthlyReportAction(_: unknown, fd: FormData): Promise<ActionResult> {
  return safe(async () => {
    const me = await actionAdmin();
    const month = z.string().regex(/^\d{4}-\d{2}$/).parse(str(fd, "month"));
    const values = {
      highlights: str(fd, "highlights").slice(0, 4000), challenges: str(fd, "challenges").slice(0, 4000), nextMonth: str(fd, "nextMonth").slice(0, 4000),
      boxesDelivered: int(str(fd, "boxesDelivered")), hospitalsServed: int(str(fd, "hospitalsServed")), moneyRaised: str(fd, "moneyRaised").slice(0, 60),
      updatedById: me.id, updatedAt: new Date(),
    };
    await db.insert(monthlyReports).values({ month, ...values }).onConflictDoUpdate({ target: monthlyReports.month, set: values });
    return { ok: true, message: "Report saved." };
  });
}
