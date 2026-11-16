import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { fridaySettings, users } from "@/db/schema";
import type { CurrentUser } from "@/server/auth";
import { getSettings } from "./policy";

/** The admin F.R.I.D.A.Y. works for, or null if nobody has claimed her yet (or that person is no longer an active admin). */
export async function fridayOwner(): Promise<CurrentUser | null> {
  const s = await getSettings();
  if (!s.ownerId) return null;
  const [u] = await db.select({ id: users.id, email: users.email, name: users.name, title: users.title, role: users.role, departmentId: users.departmentId, avatarFileId: users.avatarFileId, timezone: users.timezone, onboardedAt: users.onboardedAt, status: users.status })
    .from(users).where(eq(users.id, s.ownerId));
  if (!u || u.role !== "admin" || u.status !== "active") return null;
  const { status: _status, ...me } = u;
  void _status;
  return me;
}

/** First admin to open Friday becomes her owner. Returns true if `me` is (now) the owner. */
export async function claimOrCheck(me: CurrentUser): Promise<boolean> {
  if (me.role !== "admin") return false;
  const s = await getSettings();
  if (s.ownerId === me.id) return true;
  if (s.ownerId) return false;
  const r = await db.update(fridaySettings).set({ ownerId: me.id }).where(eq(fridaySettings.id, 1)).returning({ ownerId: fridaySettings.ownerId });
  return r[0]?.ownerId === me.id;
}
