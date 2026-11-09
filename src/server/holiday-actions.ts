"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { actionAdmin } from "./auth";
import { saveSettings } from "./settings";
import { audit } from "./audit";
import { safe } from "./safe-action";
import type { ActionResult } from "@/lib/action";

export async function setHolidayAction(audience: string): Promise<ActionResult> {
  return safe(async () => {
    const me = await actionAdmin();
    const a = z.enum(["off", "preview", "everyone"]).parse(audience);
    await saveSettings({ holiday: { audience: a } });
    await audit(me.id, "holiday.look", "settings", "1", { audience: a });
    revalidatePath("/", "layout");
    return { ok: true, message: a === "everyone" ? "🎄 The Christmas look is on for everyone!" : a === "preview" ? "Only admins see the Christmas look now." : "Christmas look turned off." };
  });
}
