import "server-only";
import { db } from "@/db";
import { auditLog } from "@/db/schema";
import { clientIp } from "./rate-limit";

/** Records an important administrative change. Never throws. */
export async function audit(
  actorId: string | null, action: string, targetType?: string, targetId?: string, detail: Record<string, unknown> = {},
) {
  try {
    await db.insert(auditLog).values({ actorId, action, targetType, targetId, detail, ip: await clientIp().catch(() => null) });
  } catch (e) {
    console.error("audit failed", e);
  }
}
