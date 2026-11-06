import { NextResponse } from "next/server";
import { getCurrentUser } from "@/server/auth";
import { listConversations, unreadMessageTotal } from "@/server/chat";

/** Conversation list + unread total, polled by the chat sidebar and the nav badge. */
export async function GET(req: Request) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "signed_out" }, { status: 401 });
  const oversight = new URL(req.url).searchParams.get("all") === "1";
  const [conversations, unread] = await Promise.all([listConversations(me, { includeOversight: oversight }), unreadMessageTotal(me.id)]);
  return NextResponse.json({ conversations, unread }, { headers: { "Cache-Control": "no-store" } });
}
