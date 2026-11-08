import { NextResponse } from "next/server";
import { and, eq, gt, ne } from "drizzle-orm";
import { db } from "@/db";
import { conversationMembers, users } from "@/db/schema";
import { getCurrentUser } from "@/server/auth";
import { conversationAccess, loadAround, loadMessages, loadPins, loadReactionChanges, markRead } from "@/server/chat";

/** New (after=) or older (before=) messages for one conversation. Used by the chat screen to update live. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "signed_out" }, { status: 401 });
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const access = await conversationAccess(me, id);
  if (!access?.read) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const sp = new URL(req.url).searchParams;
  const after = sp.get("after"), before = sp.get("before"), around = sp.get("around");
  // Jump to one (possibly old) message: a window starting just before it.
  if (around) {
    const win = /^[0-9a-f-]{36}$/i.test(around) ? await loadAround(id, around, me.id) : null;
    if (!win) return NextResponse.json({ error: "not_found" }, { status: 404 });
    return NextResponse.json({ messages: win }, { headers: { "Cache-Control": "no-store" } });
  }
  const msgs = await loadMessages(id, {
    after: after && !isNaN(Date.parse(after)) ? new Date(after) : undefined,
    before: before && !isNaN(Date.parse(before)) ? new Date(before) : undefined,
    limit: before ? 40 : 100, viewerId: me.id,
  });
  const rsince = sp.get("rsince");
  const changed = rsince && !isNaN(Date.parse(rsince)) ? await loadReactionChanges(id, new Date(rsince), me.id) : [];
  if (access.member && msgs.length && !before) await markRead(id, me.id);
  // Who else is typing right now (pinged in the last 6 seconds).
  const typing = before ? [] : (await db.select({ name: users.name }).from(conversationMembers).innerJoin(users, eq(users.id, conversationMembers.userId))
    .where(and(eq(conversationMembers.conversationId, id), ne(conversationMembers.userId, me.id), gt(conversationMembers.typingAt, new Date(Date.now() - 6000))))).map((r) => r.name.split(" ")[0]);
  const pins = before ? undefined : await loadPins(id);
  return NextResponse.json({ messages: msgs, changed, typing, pins, now: new Date().toISOString() }, { headers: { "Cache-Control": "no-store" } });
}
