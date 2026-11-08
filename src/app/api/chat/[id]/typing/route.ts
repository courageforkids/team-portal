import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { conversationMembers } from "@/db/schema";
import { getCurrentUser } from "@/server/auth";

/** "I'm typing" ping from the chat screen (sent at most every few seconds while typing). */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "signed_out" }, { status: 401 });
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "not_found" }, { status: 404 });
  await db.update(conversationMembers).set({ typingAt: new Date() }).where(and(eq(conversationMembers.conversationId, id), eq(conversationMembers.userId, me.id)));
  return NextResponse.json({ ok: true });
}
