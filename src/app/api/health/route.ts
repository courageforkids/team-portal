import { sql } from "drizzle-orm";
import { db } from "@/db";
import { runMaintenanceIfDue } from "@/server/maintenance";

/**
 * Public health check. Also keeps the free database awake and runs due reminders,
 * recurring tasks and scheduled announcements (throttled to once every 10 minutes, safe to call often).
 */
export async function GET() {
  try {
    await db.execute(sql`select 1`);
    await runMaintenanceIfDue();
    return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ ok: false }, { status: 503 });
  }
}
