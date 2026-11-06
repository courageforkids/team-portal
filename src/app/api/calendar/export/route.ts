import { NextResponse } from "next/server";
import { getCurrentUser } from "@/server/auth";
import { calendarIcsFor, ICS_HEADERS } from "../_lib/ics";

export const dynamic = "force-dynamic";

/** One-time .ics download for the signed-in member. */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return new NextResponse("Sign in required", { status: 401 });
  const body = await calendarIcsFor(user);
  return new NextResponse(body, {
    headers: { ...ICS_HEADERS, "Content-Disposition": 'attachment; filename="courage-for-kids-calendar.ics"', "Cache-Control": "private, no-store" },
  });
}
