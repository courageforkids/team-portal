import "server-only";
import type { CurrentUser } from "@/server/auth";
import { listConversations } from "@/server/chat";
import { getPeople } from "@/server/queries";

export async function chatListData(me: CurrentUser, oversight: boolean) {
  const [conversations, people] = await Promise.all([listConversations(me, { includeOversight: oversight && me.role === "admin" }), getPeople()]);
  return { conversations, everyone: people.map((p) => ({ id: p.id, name: p.name, title: p.title, avatarFileId: p.avatarFileId })) };
}
