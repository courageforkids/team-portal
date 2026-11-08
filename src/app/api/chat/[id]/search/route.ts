import { NextResponse } from "next/server";
import { getCurrentUser } from "@/server/auth";
import { conversationAccess, searchMessages } from "@/server/chat";
import { rateLimit } from "@/server/rate-limit";

/** Search inside one chat. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "signed_out" }, { status: 401 });
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const access = await conversationAccess(me, id);
  if (!access?.read) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (!(await rateLimit(`chatsearch:${me.id}`, 60, 60))) return NextResponse.json({ results: [] }, { status: 429 });
  const q = new URL(req.url).searchParams.get("q") ?? "";
  return NextResponse.json({ results: await searchMessages(id, q) }, { headers: { "Cache-Control": "no-store" } });
}
