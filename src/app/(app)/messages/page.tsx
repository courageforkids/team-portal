import { MessagesSquare } from "lucide-react";
import { requireUser } from "@/server/auth";
import { ChatList } from "@/components/chat/chat-list";
import { chatListData } from "./chat-data";

export const metadata = { title: "Chat" };

export default async function MessagesPage({ searchParams }: { searchParams: Promise<{ all?: string }> }) {
  const me = await requireUser();
  const oversight = (await searchParams).all === "1";
  const { conversations, everyone } = await chatListData(me, oversight);
  return (
    <div className="grid gap-4 md:h-[calc(100dvh-8.5rem)] md:grid-cols-[320px_1fr]">
      <div className="min-h-0"><ChatList initial={conversations} everyone={everyone} me={{ id: me.id, role: me.role }} oversight={oversight} /></div>
      <div className="hidden min-h-0 place-items-center rounded-xl border border-dashed border-line md:grid">
        <div className="text-center text-sm text-muted">
          <MessagesSquare className="mx-auto mb-2 h-8 w-8 text-faint" />
          <p className="font-semibold text-fg">Pick a chat</p>
          <p>Or start a new one with someone on the team.</p>
        </div>
      </div>
    </div>
  );
}
