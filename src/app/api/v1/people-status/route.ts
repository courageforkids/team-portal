import { asc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { pushSubscriptions, users } from "@/db/schema";
import { apiRoute } from "@/server/api-auth";

/** Admin view of who can be reached: phone notifications on (devices), last time in the portal, account set up. */
export const GET = apiRoute(async () => {
  const rows = await db.select({
    name: users.name, role: users.role, status: users.status, lastSeenAt: users.lastSeenAt, hasPassword: sql<boolean>`${users.passwordHash} is not null`,
    pushDevices: sql<number>`(select count(*)::int from ${pushSubscriptions} where ${pushSubscriptions.userId} = ${users.id})`,
  }).from(users).where(eq(users.status, "active")).orderBy(asc(users.name));
  return { people: rows.map((r) => ({ ...r, phoneNotifications: r.pushDevices > 0 })) };
});
