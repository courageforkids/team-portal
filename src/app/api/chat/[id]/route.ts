import { NextResponse } from "next/server";
import { getCurrentUser } from "@/server/auth";
import { conversationAccess, loadMessages, markRead } from "@/server/chat";

/** New (after=) or older (before=) messages for one conversation. Used by the chat screen to update live. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "signed_out" }, { status: 401 });
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const access = await conversationAccess(me, id);
  if (!access?.read) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const sp = new URL(req.url).searchParams;
  const after = sp.get("after"), before = sp.get("before");
  const msgs = await loadMessages(id, {
    after: after && !isNaN(Date.parse(after)) ? new Date(after) : undefined,
    before: before && !isNaN(Date.parse(before)) ? new Date(before) : undefined,
    limit: before ? 40 : 100,
  });
  if (access.member && msgs.length && !before) await markRead(id, me.id);
  return NextResponse.json({ messages: msgs }, { headers: { "Cache-Control": "no-store" } });
}
