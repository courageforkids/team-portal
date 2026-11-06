import "server-only";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { headers } from "next/headers";

/**
 * Fixed-window rate limit stored in Postgres (works across serverless instances).
 * Returns true when the action is allowed.
 */
export async function rateLimit(key: string, limit: number, windowSeconds: number): Promise<boolean> {
  const rows = await db.execute<{ count: number }>(sql`
    insert into rate_limits (key, count, window_start) values (${key}, 1, now())
    on conflict (key) do update set
      count = case when rate_limits.window_start < now() - make_interval(secs => ${windowSeconds}) then 1 else rate_limits.count + 1 end,
      window_start = case when rate_limits.window_start < now() - make_interval(secs => ${windowSeconds}) then now() else rate_limits.window_start end
    returning count`);
  const count = Number((rows as unknown as { count: number }[])[0]?.count ?? 0);
  return count <= limit;
}

export async function resetRateLimit(key: string) {
  await db.execute(sql`delete from rate_limits where key = ${key}`);
}

export async function clientIp() {
  const h = await headers();
  return (h.get("x-forwarded-for")?.split(",")[0] ?? h.get("x-real-ip") ?? "local").trim();
}
