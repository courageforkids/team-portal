import { timingSafeEqual } from "node:crypto";
import { runMaintenance } from "@/server/maintenance";

/** Called by a scheduler (e.g. Vercel Cron or GitHub Actions) every 15–60 minutes. */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET ?? "";
  const got = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  const ok = secret.length >= 16 && got.length === secret.length && timingSafeEqual(Buffer.from(got), Buffer.from(secret));
  if (!ok) return new Response("Unauthorized", { status: 401 });
  const result = await runMaintenance();
  return Response.json({ ok: true, ...result });
}
