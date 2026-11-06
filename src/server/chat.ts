import "server-only";
import { and, asc, desc, eq, gt, inArray, lt, ne, sql } from "drizzle-orm";
import { db } from "@/db";
import { conversationMembers, conversations, files, messages, users } from "@/db/schema";
import type { CurrentUser } from "./auth";

/**
 * Chat rules:
 * - Members can read and post in their conversations.
 * - Executive Administrators can READ every conversation (youth-safety oversight) and remove messages,
 *   but only post where they are a member.
 * - Everyone active is a member of the single "team" conversation.
 */

export type ConvAccess = { read: boolean; post: boolean; member: boolean; manage: boolean };

export async function conversationAccess(u: CurrentUser, conversationId: string): Promise<(ConvAccess & { conv: typeof conversations.$inferSelect }) | null> {
  const conv = (await db.select().from(conversations).where(eq(conversations.id, conversationId)).limit(1))[0];
  if (!conv) return null;
  const member = !!(await db.select({ x: conversationMembers.userId }).from(conversationMembers)
    .where(and(eq(conversationMembers.conversationId, conversationId), eq(conversationMembers.userId, u.id))).limit(1))[0];
  const isAdmin = u.role === "admin";
  const read = member || isAdmin;
  const post = member && !conv.archived;
  // Who can rename / add / remove: admins for work groups; the creator or an admin for group chats.
  const manage = conv.kind === "workgroup" ? isAdmin : conv.kind === "group" ? isAdmin || conv.createdById === u.id : false;
  return { conv, read, post, member, manage };
}

/** Makes sure the all-team conversation exists and every active person is in it. */
export async function ensureTeamConversation() {
  let team = (await db.select().from(conversations).where(eq(conversations.kind, "team")).limit(1))[0];
  if (!team) {
    [team] = await db.insert(conversations).values({ kind: "team", title: "Everyone", description: "The whole Courage for Kids team." }).returning();
  }
  await db.execute(sql`
    insert into conversation_members (conversation_id, user_id)
    select ${team.id}, id from users where status = 'active'
    on conflict do nothing`);
  return team;
}

export const dmKeyFor = (a: string, b: string) => [a, b].sort().join(":");

export type ConversationListItem = {
  id: string; kind: "team" | "dm" | "group" | "workgroup"; title: string; subtitle: string; member: boolean;
  people: { id: string; name: string; avatarFileId: string | null }[];
  lastMessageAt: string | null; lastPreview: string; unread: number; muted: boolean; archived: boolean;
};

/** Conversations for the sidebar, newest activity first. Admins can include ones they only oversee. */
export async function listConversations(u: CurrentUser, opts: { includeOversight?: boolean } = {}): Promise<ConversationListItem[]> {
  await ensureTeamConversation();
  const mine = await db.select({ c: conversations, m: conversationMembers }).from(conversationMembers)
    .innerJoin(conversations, eq(conversations.id, conversationMembers.conversationId))
    .where(eq(conversationMembers.userId, u.id));
  const rows: { c: typeof conversations.$inferSelect; m: typeof conversationMembers.$inferSelect | null }[] = [...mine];
  if (opts.includeOversight && u.role === "admin") {
    const ids = new Set(mine.map((r) => r.c.id));
    const others = await db.select().from(conversations).where(ne(conversations.kind, "team"));
    for (const c of others) if (!ids.has(c.id)) rows.push({ c, m: null });
  }
  if (!rows.length) return [];
  const convIds = rows.map((r) => r.c.id);
  const memberRows = await db.select({ conversationId: conversationMembers.conversationId, id: users.id, name: users.name, avatarFileId: users.avatarFileId, status: users.status })
    .from(conversationMembers).innerJoin(users, eq(users.id, conversationMembers.userId)).where(inArray(conversationMembers.conversationId, convIds));
  const lastRows = await db.execute<{ conversation_id: string; body: string; system: boolean; deleted_at: string | null; author_name: string | null; created_at: string }>(sql`
    select distinct on (m.conversation_id) m.conversation_id, m.body, m.system, m.deleted_at, u.name as author_name, m.created_at
    from messages m left join users u on u.id = m.author_id
    where m.conversation_id in (${sql.join(convIds.map((id) => sql`${id}::uuid`), sql`, `)})
    order by m.conversation_id, m.created_at desc`);
  const unreadRows = await db.execute<{ conversation_id: string; n: number }>(sql`
    select m.conversation_id, count(*)::int as n from messages m
    join conversation_members cm on cm.conversation_id = m.conversation_id and cm.user_id = ${u.id}
    where m.deleted_at is null and m.system = false and (m.author_id is null or m.author_id <> ${u.id})
      and (cm.last_read_at is null or m.created_at > cm.last_read_at)
    group by m.conversation_id`);
  const last = new Map((lastRows as unknown as { conversation_id: string; body: string; system: boolean; deleted_at: string | null; author_name: string | null }[]).map((r) => [r.conversation_id, r]));
  const unread = new Map((unreadRows as unknown as { conversation_id: string; n: number }[]).map((r) => [r.conversation_id, Number(r.n)]));
  return rows.map(({ c, m }) => {
    const people = memberRows.filter((p) => p.conversationId === c.id && p.status === "active").map((p) => ({ id: p.id, name: p.name, avatarFileId: p.avatarFileId }));
    const others = people.filter((p) => p.id !== u.id);
    const title = c.kind === "dm" ? (others[0]?.name ?? "Former member") : c.title || others.map((p) => p.name.split(" ")[0]).join(", ") || "Chat";
    const subtitle = c.kind === "team" ? `${people.length} people` : c.kind === "workgroup" ? `Work group · ${people.map((p) => p.name.split(" ")[0]).join(" + ")}` : c.kind === "group" ? `${people.length} people` : "Direct message";
    const l = last.get(c.id);
    const lastPreview = !l ? "No messages yet" : l.deleted_at ? "Message removed" : l.system ? l.body : `${l.author_name?.split(" ")[0] ?? "Someone"}: ${l.body || "📷 Photo"}`;
    return {
      id: c.id, kind: c.kind, title, subtitle, member: !!m, people: c.kind === "dm" ? others : people,
      lastMessageAt: (c.lastMessageAt ?? c.createdAt).toISOString(), lastPreview: lastPreview.slice(0, 90),
      unread: m ? unread.get(c.id) ?? 0 : 0, muted: m?.muted ?? false, archived: c.archived,
    };
  }).filter((c) => !c.archived || c.kind === "workgroup")
    .sort((a, b) => (a.kind === "team" ? -1 : b.kind === "team" ? 1 : 0) || (b.lastMessageAt ?? "").localeCompare(a.lastMessageAt ?? ""));
}

export async function unreadMessageTotal(userId: string) {
  const r = await db.execute<{ n: number }>(sql`
    select count(*)::int as n from messages m
    join conversation_members cm on cm.conversation_id = m.conversation_id and cm.user_id = ${userId}
    where m.deleted_at is null and m.system = false and (m.author_id is null or m.author_id <> ${userId})
      and cm.muted = false and (cm.last_read_at is null or m.created_at > cm.last_read_at)`);
  return Number((r as unknown as { n: number }[])[0]?.n ?? 0);
}

export type ChatMessage = {
  id: string; authorId: string | null; authorName: string; authorAvatar: string | null; body: string; system: boolean;
  createdAt: string; editedAt: string | null; deleted: boolean; files: { id: string; filename: string; mimeType: string; size: number }[];
};

export async function loadMessages(conversationId: string, opts: { before?: Date; after?: Date; limit?: number } = {}): Promise<ChatMessage[]> {
  const limit = Math.min(opts.limit ?? 50, 100);
  const where = and(
    eq(messages.conversationId, conversationId),
    opts.before ? lt(messages.createdAt, opts.before) : undefined,
    opts.after ? gt(messages.createdAt, opts.after) : undefined,
  );
  const rows = await db.select({ m: messages, name: users.name, avatar: users.avatarFileId }).from(messages)
    .leftJoin(users, eq(users.id, messages.authorId)).where(where)
    .orderBy(opts.after ? asc(messages.createdAt) : desc(messages.createdAt)).limit(limit);
  const list = opts.after ? rows : rows.reverse();
  const ids = list.map((r) => r.m.id);
  const fileRows = ids.length ? await db.select().from(files).where(and(eq(files.ownerType, "message"), inArray(files.ownerId, ids))) : [];
  return list.map(({ m, name, avatar }) => ({
    id: m.id, authorId: m.authorId, authorName: name ?? "Former member", authorAvatar: avatar ?? null,
    body: m.deletedAt ? "" : m.body, system: m.system, createdAt: m.createdAt.toISOString(), editedAt: m.editedAt?.toISOString() ?? null,
    deleted: !!m.deletedAt,
    files: m.deletedAt ? [] : fileRows.filter((f) => f.ownerId === m.id).map((f) => ({ id: f.id, filename: f.filename, mimeType: f.mimeType, size: f.size })),
  }));
}

export async function conversationMembersList(conversationId: string) {
  return db.select({ id: users.id, name: users.name, title: users.title, avatarFileId: users.avatarFileId, status: users.status })
    .from(conversationMembers).innerJoin(users, eq(users.id, conversationMembers.userId))
    .where(eq(conversationMembers.conversationId, conversationId)).orderBy(asc(users.name));
}

export async function addSystemMessage(conversationId: string, body: string) {
  await db.insert(messages).values({ conversationId, body, system: true });
  await db.update(conversations).set({ lastMessageAt: new Date() }).where(eq(conversations.id, conversationId));
}

export async function markRead(conversationId: string, userId: string) {
  await db.update(conversationMembers).set({ lastReadAt: new Date() })
    .where(and(eq(conversationMembers.conversationId, conversationId), eq(conversationMembers.userId, userId)));
}

export async function workGroupsLite() {
  return db.select({ id: conversations.id, title: conversations.title }).from(conversations)
    .where(and(eq(conversations.kind, "workgroup"), eq(conversations.archived, false))).orderBy(asc(conversations.title));
}

