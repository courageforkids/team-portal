import { NextResponse } from "next/server";
import { getCurrentUser } from "@/server/auth";
import { computeBadges } from "@/server/badges";

export const dynamic = "force-dynamic";

/** Polled by the menu so its numbers stay current without reloading. */
export async function GET() {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "signed_out" }, { status: 401 });
  return NextResponse.json(await computeBadges(me), { headers: { "Cache-Control": "no-store" } });
}
