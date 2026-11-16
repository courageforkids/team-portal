import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { getCurrentUser, requireUser, type CurrentUser } from "@/server/auth";
import { verifyPassword } from "@/server/crypto";
import { claimOrCheck } from "./owner";

/** Page guard: signed in, an admin, and Friday's owner (the first admin to open her claims her). */
export async function requireFridayOwner(): Promise<{ me: CurrentUser; isOwner: boolean }> {
  const me = await requireUser();
  return { me, isOwner: await claimOrCheck(me) };
}

/** Server action / API guard. Throws if the caller isn't Friday's owner. */
export async function actionFridayOwner(): Promise<CurrentUser> {
  const me = await getCurrentUser();
  if (!me) throw new Error("Your session ended. Sign in again.");
  if (!(await claimOrCheck(me))) throw new Error("F.R.I.D.A.Y. is private.");
  return me;
}

/** Step-up check before executive approvals and permission changes: the portal password again. */
export async function confirmOwnerPassword(me: CurrentUser, password: string) {
  const [u] = await db.select({ passwordHash: users.passwordHash }).from(users).where(eq(users.id, me.id));
  return verifyPassword(password, u?.passwordHash);
}
