"use server";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { actionUser } from "./auth";
import { safe, str, UserError } from "./safe-action";
import type { ActionResult } from "@/lib/action";

export async function saveBirthdayAction(_: unknown, fd: FormData): Promise<ActionResult> {
  return safe(async () => {
    const me = await actionUser();
    const m = str(fd, "month"), d = str(fd, "day");
    let birthday: string | null = null;
    if (m || d) {
      const mm = Number(m), dd = Number(d);
      const max = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][mm - 1];
      if (!max || !(dd >= 1 && dd <= max)) throw new UserError("Pick a real month and day.");
      birthday = `${String(mm).padStart(2, "0")}-${String(dd).padStart(2, "0")}`;
    }
    await db.update(users).set({ birthday }).where(eq(users.id, me.id));
    revalidatePath("/profile");
    return { ok: true, message: birthday ? "Birthday saved. 🎂" : "Birthday removed." };
  });
}
