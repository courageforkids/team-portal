import { notFound } from "next/navigation";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { conversationMembers, tasks } from "@/db/schema";
import { requireUser } from "@/server/auth";
import { conversationAccess, conversationMembersList, loadAround, loadMessages, loadPins } from "@/server/chat";
import { taskVisibilityWhere } from "@/server/policy";
import { ChatList } from "@/components/chat/chat-list";
import { ConversationView } from "@/components/chat/conversation-view";
import { ACTIVE } from "@/lib/task-meta";
import { chatListData } from "../chat-data";
import { academySettings, canSeeAcademy } from "@/server/academy";
import { holidayOn } from "@/server/holiday";

export const metadata = { title: "Chat" };

export default async function ConversationPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ all?: string; highlight?: string }> }) {
  const me = await requireUser();
  const { id } = await params;
  const sp = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const access = await conversationAccess(me, id);
  if (!access?.read) notFound();
  const oversight = sp.all === "1" || !access.member;
  const [{ conversations, everyone }, members, initial, pins] = await Promise.all([
    chatListData(me, oversight), conversationMembersList(id), loadMessages(id, { limit: 50, viewerId: me.id }), loadPins(id),
  ]);
  // Opened from a notification about an older message (e.g. an @mention): start the chat at that message.
  const hl = sp.highlight && /^[0-9a-f-]{36}$/i.test(sp.highlight) ? sp.highlight : undefined;
  const startAt = hl && !initial.some((m) => m.id === hl) ? await loadAround(id, hl, me.id) : null;
  const mem = access.member ? (await db.select().from(conversationMembers).where(and(eq(conversationMembers.conversationId, id), eq(conversationMembers.userId, me.id))).limit(1))[0] : null;
  const active = members.filter((m) => m.status === "active");
  const others = active.filter((m) => m.id !== me.id);
  const c = access.conv;
  const groupTasks = c.kind === "workgroup"
    ? await db.select({ id: tasks.id, title: tasks.title, status: tasks.status }).from(tasks)
      .where(and(eq(tasks.workGroupId, id), inArray(tasks.status, ACTIVE), taskVisibilityWhere(me))).limit(8)
    : [];
  const title = c.kind === "dm" ? (c.title || (others[0]?.name ?? "Former member")) : c.title || others.map((p) => p.name.split(" ")[0]).join(", ") || "Chat";
  const subtitle = c.kind === "team" ? `Everyone · ${active.length} people` : c.kind === "dm" ? (c.title ? others[0]?.name ?? "Direct message" : others[0]?.title || "Direct message")
    : c.kind === "workgroup" ? `Work group · ${active.map((p) => p.name.split(" ")[0]).join(" + ")}` : active.map((p) => p.name.split(" ")[0]).join(", ");
  const people = (c.kind === "dm" ? others : active).map((p) => ({ id: p.id, name: p.name, avatarFileId: p.avatarFileId }));
  return (
    <div className="grid gap-4 md:h-[calc(100dvh-8.5rem)] md:grid-cols-[320px_1fr]">
      <div className="hidden min-h-0 md:block"><ChatList initial={conversations} everyone={everyone} me={{ id: me.id, role: me.role }} oversight={oversight} /></div>
      {/* On phones the conversation fills the screen between the top bar and the bottom tabs. */}
      <div data-kb-fit data-no-ptr className="fixed inset-x-0 top-14 bottom-[calc(58px+env(safe-area-inset-bottom))] z-10 min-h-0 bg-surface md:static md:z-auto md:bg-transparent">
        <ConversationView key={id} me={{ id: me.id, role: me.role }} highlight={hl} spells={canSeeAcademy(me, await academySettings())} holiday={await holidayOn(me)}
          header={{ id, kind: c.kind, title, subtitle, description: c.description, people, member: access.member, canPost: access.post, archived: c.archived, muted: mem?.muted ?? false, tasks: groupTasks,
            canPin: access.pin, mentionables: c.kind === "dm" ? [] : active.map((m) => ({ id: m.id, name: m.name })) }}
          initial={startAt ?? initial} startedOlder={!!startAt} pins={pins}
          info={{ conversation: { id, kind: c.kind, title: c.title, description: c.description, archived: c.archived }, me: { id: me.id, role: me.role },
            members: active.map((m) => ({ id: m.id, name: m.name, title: m.title, avatarFileId: m.avatarFileId })), everyone,
            member: access.member, manage: access.manage, rename: access.rename, muted: mem?.muted ?? false }} />
      </div>
    </div>
  );
}
