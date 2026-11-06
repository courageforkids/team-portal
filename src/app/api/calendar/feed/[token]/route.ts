import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import type { CurrentUser } from "@/server/auth";
import { calendarIcsFor, ICS_HEADERS } from "../../_lib/ics";

export const dynamic = "force-dynamic";

const notFound = () => new NextResponse("Not found", { status: 404, headers: { "Cache-Control": "no-store" } });

/**
 * Personal subscription feed. No cookie: the unguessable token in the URL is the credential,
 * and it only ever returns what that member is allowed to see.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const token = (await params).token.replace(/\.ics$/i, "");
  if (!/^[A-Za-z0-9_-]{32,128}$/.test(token)) return notFound();
  const u = (await db.select().from(users).where(eq(users.calendarToken, token)).limit(1))[0];
  if (!u || u.status !== "active") return notFound();
  const viewer: CurrentUser = {
    id: u.id, email: u.email, name: u.name, title: u.title, role: u.role, departmentId: u.departmentId,
    avatarFileId: u.avatarFileId, timezone: u.timezone, onboardedAt: u.onboardedAt,
  };
  const body = await calendarIcsFor(viewer);
  return new NextResponse(body, {
    headers: {
      ...ICS_HEADERS,
      "Content-Disposition": 'inline; filename="courage-for-kids.ics"',
      "Cache-Control": "private, max-age=300",
      "Referrer-Policy": "no-referrer",
    },
  });
}
