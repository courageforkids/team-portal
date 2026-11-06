"use server";
import { and, eq, inArray, lt, or, isNull } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { conversationMembers, conversations, messages, users } from "@/db/schema";
import { actionAdmin, actionUser, AuthError } from "./auth";
import { all, filesOf, safe, str, UserError } from "./safe-action";
import { addSystemMessage, conversationAccess, dmKeyFor, ensureTeamConversation, markRead } from "./chat";
import { prepareUploads, storePrepared } from "./storage";
import { rateLimit } from "./rate-limit";
import { sendPush } from "./push";
import { adminIds, notify } from "./notify";
import { audit } from "./audit";
import type { ActionResult } from "@/lib/action";

const uuid = z.string().uuid();
const MAX_BODY = 4000;

async function activeUsers(ids: string[]) {
  if (!ids.length) return [];
  return db.select({ id: users.id, name: users.name }).from(users).where(and(inArray(users.id, ids), eq(users.status, "active")));
}

/** Phone alert to members who haven't read it, aren't muted, and haven't been alerted for this chat in the last minute. */
async function pushNewMessage(conversationId: string, senderId: string, senderName: string, title: string | null, kind: string, preview: string) {
  const cutoff = new Date(Date.now() - 60_000);
  const targets = await db.select({ userId: conversationMembers.userId }).from(conversationMembers).where(and(
    eq(conversationMembers.conversationId, conversationId), eq(conversationMembers.muted, false),
    or(isNull(conversationMembers.lastPushAt), lt(conversationMembers.lastPushAt, cutoff)),
  ));
  const ids = targets.map((t) => t.userId).filter((id) => id !== senderId);
  if (!ids.length) return;
  await db.update(conversationMembers).set({ lastPushAt: new Date() })
    .where(and(eq(conversationMembers.conversationId, conversationId), inArray(conversationMembers.userId, ids)));
  const first = senderName.split(" ")[0];
  const heading = kind === "dm" ? senderName : `${first} in ${title ?? "a chat"}`;
  await Promise.allSettled(ids.map((id) => sendPush(id, { title: heading, body: preview.slice(0, 140) || "📷 Photo", href: `/messages/${conversationId}`, tag: `chat:${conversationId}` })));
}

export async function sendMessageAction(_: unknown, fd: FormData): Promise<ActionResult<{ id: string }>> {
  return safe(async () => {
    const me = await actionUser();
    const conversationId = uuid.parse(str(fd, "conversationId"));
    const access = await conversationAccess(me, conversationId);
    if (!access?.post) throw new AuthError(access?.read ? "You can read this chat but you're not a member, so you can't post." : "You're not in this chat.");
    const body = str(fd, "body").slice(0, MAX_BODY);
    const uploads = filesOf(fd, "files");
    if (!body && !uploads.length) throw new UserError("Type a message first.");
    if (!(await rateLimit(`chat:${me.id}`, 30, 60))) throw new UserError("You're sending messages too fast. Wait a moment.");
    const prepared = await prepareUploads(uploads);
    const [msg] = await db.insert(messages).values({ conversationId, authorId: me.id, body }).returning();
    if (prepared.length) {
      try { await storePrepared(prepared, { type: "message", id: msg.id }, me.id); }
      catch (e) { await db.delete(messages).where(eq(messages.id, msg.id)); throw e; }
    }
    const now = new Date();
    await db.update(conversations).set({ lastMessageAt: now }).where(eq(conversations.id, conversationId));
    await markRead(conversationId, me.id);
    await pushNewMessage(conversationId, me.id, me.name, access.conv.title, access.conv.kind, body);
    return { ok: true, data: { id: msg.id } };
  });
}

export async function markReadAction(conversationId: string): Promise<ActionResult> {
  return safe(async () => {
    const me = await actionUser();
    await markRead(uuid.parse(conversationId), me.id);
    return { ok: true };
  });
}

export async function editMessageAction(messageId: string, body: string): Promise<ActionResult> {
  return safe(async () => {
    const me = await actionUser();
    const m = (await db.select().from(messages).where(eq(messages.id, uuid.parse(messageId))).limit(1))[0];
    if (!m || m.authorId !== me.id || m.deletedAt || m.system) throw new AuthError("You can only edit your own messages.");
    const text = String(body ?? "").trim().slice(0, MAX_BODY);
    if (!text) throw new UserError("A message can't be empty. Delete it instead.");
    await db.update(messages).set({ body: text, editedAt: new Date() }).where(eq(messages.id, m.id));
    return { ok: true };
  });
}

export async function deleteMessageAction(messageId: string): Promise<ActionResult> {
  return safe(async () => {
    const me = await actionUser();
    const m = (await db.select().from(messages).where(eq(messages.id, uuid.parse(messageId))).limit(1))[0];
    if (!m || m.deletedAt) throw new UserError("That message was already removed.");
    const own = m.authorId === me.id;
    if (!own && me.role !== "admin") throw new AuthError("You can only delete your own messages.");
    await db.update(messages).set({ deletedAt: new Date(), deletedById: me.id }).where(eq(messages.id, m.id));
    if (!own) await audit(me.id, "chat.message_removed", "message", m.id, { conversationId: m.conversationId, authorId: m.authorId });
    return { ok: true, message: "Message removed." };
  });
}

export async function reportMessageAction(messageId: string, reason: string): Promise<ActionResult> {
  return safe(async () => {
    const me = await actionUser();
    const m = (await db.select().from(messages).where(eq(messages.id, uuid.parse(messageId))).limit(1))[0];
    if (!m) throw new UserError("That message no longer exists.");
    const access = await conversationAccess(me, m.conversationId);
    if (!access?.read) throw new AuthError();
    if (!(await rateLimit(`report:${me.id}`, 10, 3600))) throw new UserError("You've sent a lot of reports. An administrator will review them.");
    await notify(await adminIds(), {
      type: "chat_report", title: `${me.name} reported a message`, body: (reason || "No reason given").slice(0, 200),
      href: `/messages/${m.conversationId}?highlight=${m.id}`, excludeUserId: me.id,
    });
    await audit(me.id, "chat.report", "message", m.id, { reason: reason.slice(0, 500), conversationId: m.conversationId });
    return { ok: true, message: "Thanks. An administrator will take a look." };
  });
}

export async function startDmAction(otherUserId: string): Promise<ActionResult<{ id: string }>> {
  return safe(async () => {
    const me = await actionUser();
    const other = uuid.parse(otherUserId);
    if (other === me.id) throw new UserError("Pick someone else to message.");
    if (!(await activeUsers([other])).length) throw new UserError("That person isn't active on the team.");
    const key = dmKeyFor(me.id, other);
    let conv = (await db.select().from(conversations).where(eq(conversations.dmKey, key)).limit(1))[0];
    if (!conv) {
      [conv] = await db.insert(conversations).values({ kind: "dm", dmKey: key, createdById: me.id }).onConflictDoNothing().returning();
      conv ??= (await db.select().from(conversations).where(eq(conversations.dmKey, key)).limit(1))[0];
      await db.insert(conversationMembers).values([{ conversationId: conv.id, userId: me.id }, { conversationId: conv.id, userId: other }]).onConflictDoNothing();
    }
    return { ok: true, data: { id: conv.id }, redirectTo: `/messages/${conv.id}` };
  });
}

export async function createGroupAction(_: unknown, fd: FormData): Promise<ActionResult<{ id: string }>> {
  return safe(async () => {
    const me = await actionUser();
    const ids = [...new Set(all(fd, "members").filter((x) => uuid.safeParse(x).success && x !== me.id))];
    if (!ids.length) throw new UserError("Pick at least one person.");
    if (ids.length === 1) return startDmAction(ids[0]);
    const people = await activeUsers(ids);
    if (people.length !== ids.length) throw new UserError("Someone you picked isn't active on the team.");
    const title = str(fd, "title").slice(0, 80) || null;
    const [conv] = await db.insert(conversations).values({ kind: "group", title, createdById: me.id, lastMessageAt: new Date() }).returning();
    await db.insert(conversationMembers).values([me.id, ...ids].map((userId) => ({ conversationId: conv.id, userId })));
    await addSystemMessage(conv.id, `${me.name} started the chat${title ? ` “${title}”` : ""}`);
    return { ok: true, data: { id: conv.id }, redirectTo: `/messages/${conv.id}` };
  });
}

export async function renameConversationAction(conversationId: string, title: string): Promise<ActionResult> {
  return safe(async () => {
    const me = await actionUser();
    const access = await conversationAccess(me, uuid.parse(conversationId));
    if (!access?.manage) throw new AuthError("Only the chat's creator or an administrator can rename it.");
    const t = title.trim().slice(0, 80);
    if (access.conv.kind === "workgroup" && !t) throw new UserError("Work groups need a name.");
    await db.update(conversations).set({ title: t || null }).where(eq(conversations.id, conversationId));
    await addSystemMessage(conversationId, `${me.name} renamed the chat to “${t || "untitled"}”`);
    return { ok: true, message: "Renamed." };
  });
}

export async function addMembersAction(conversationId: string, userIds: string[]): Promise<ActionResult> {
  return safe(async () => {
    const me = await actionUser();
    const access = await conversationAccess(me, uuid.parse(conversationId));
    if (!access?.manage) throw new AuthError("Only the chat's creator or an administrator can add people.");
    const people = await activeUsers(userIds.filter((x) => uuid.safeParse(x).success));
    if (!people.length) throw new UserError("Pick someone to add.");
    await db.insert(conversationMembers).values(people.map((p) => ({ conversationId, userId: p.id }))).onConflictDoNothing();
    await addSystemMessage(conversationId, `${me.name} added ${people.map((p) => p.name).join(", ")}`);
    if (access.conv.kind === "workgroup") await audit(me.id, "workgroup.members_added", "conversation", conversationId, { added: people.map((p) => p.id) });
    return { ok: true, message: "Added." };
  });
}

export async function removeMemberAction(conversationId: string, userId: string): Promise<ActionResult> {
  return safe(async () => {
    const me = await actionUser();
    const access = await conversationAccess(me, uuid.parse(conversationId));
    if (!access?.manage) throw new AuthError("Only the chat's creator or an administrator can remove people.");
    const u = (await activeUsers([uuid.parse(userId)]))[0] ?? (await db.select({ id: users.id, name: users.name }).from(users).where(eq(users.id, userId)).limit(1))[0];
    await db.delete(conversationMembers).where(and(eq(conversationMembers.conversationId, conversationId), eq(conversationMembers.userId, userId)));
    await addSystemMessage(conversationId, `${me.name} removed ${u?.name ?? "a member"}`);
    if (access.conv.kind === "workgroup") await audit(me.id, "workgroup.member_removed", "conversation", conversationId, { removed: userId });
    return { ok: true, message: "Removed." };
  });
}

export async function leaveConversationAction(conversationId: string): Promise<ActionResult> {
  return safe(async () => {
    const me = await actionUser();
    const access = await conversationAccess(me, uuid.parse(conversationId));
    if (!access?.member) throw new UserError("You're not in this chat.");
    if (access.conv.kind === "team") throw new UserError("Everyone stays in the team chat. You can mute it instead.");
    if (access.conv.kind === "workgroup") throw new UserError("Ask an administrator to change work groups.");
    if (access.conv.kind === "dm") throw new UserError("You can mute a direct message instead of leaving it.");
    await db.delete(conversationMembers).where(and(eq(conversationMembers.conversationId, conversationId), eq(conversationMembers.userId, me.id)));
    await addSystemMessage(conversationId, `${me.name} left the chat`);
    return { ok: true, message: "You left the chat.", redirectTo: "/messages" };
  });
}

export async function toggleMuteAction(conversationId: string, muted: boolean): Promise<ActionResult> {
  return safe(async () => {
    const me = await actionUser();
    await db.update(conversationMembers).set({ muted }).where(and(eq(conversationMembers.conversationId, uuid.parse(conversationId)), eq(conversationMembers.userId, me.id)));
    return { ok: true, message: muted ? "Muted. You won't get phone alerts for this chat." : "Unmuted." };
  });
}

/* ───────── Work groups (admin) ───────── */

export async function saveWorkGroupAction(_: unknown, fd: FormData): Promise<ActionResult<{ id: string }>> {
  return safe(async () => {
    const me = await actionAdmin();
    const id = str(fd, "id");
    const title = str(fd, "title").slice(0, 80);
    const description = str(fd, "description").slice(0, 500);
    const ids = [...new Set(all(fd, "members").filter((x) => uuid.safeParse(x).success))];
    if (!title) throw new UserError("Give the work group a name, like “Sponsor outreach”.");
    if (ids.length < 2) throw new UserError("A work group needs at least 2 people.");
    const people = await activeUsers(ids);
    if (people.length !== ids.length) throw new UserError("Someone you picked isn't active on the team.");
    if (id) {
      const access = await conversationAccess(me, uuid.parse(id));
      if (!access || access.conv.kind !== "workgroup") throw new UserError("That work group doesn't exist.");
      await db.update(conversations).set({ title, description }).where(eq(conversations.id, id));
      const current = (await db.select({ userId: conversationMembers.userId }).from(conversationMembers).where(eq(conversationMembers.conversationId, id))).map((r) => r.userId);
      const add = ids.filter((x) => !current.includes(x));
      const remove = current.filter((x) => !ids.includes(x));
      if (add.length) await db.insert(conversationMembers).values(add.map((userId) => ({ conversationId: id, userId }))).onConflictDoNothing();
      if (remove.length) await db.delete(conversationMembers).where(and(eq(conversationMembers.conversationId, id), inArray(conversationMembers.userId, remove)));
      if (add.length || remove.length) await addSystemMessage(id, `${me.name} updated who's in this work group`);
      await audit(me.id, "workgroup.update", "conversation", id, { title, add, remove });
      return { ok: true, message: "Work group saved.", data: { id } };
    }
    const [conv] = await db.insert(conversations).values({ kind: "workgroup", title, description, createdById: me.id, lastMessageAt: new Date() }).returning();
    // Only the people picked are members. Admins can still read it (oversight) and can add themselves to post.
    await db.insert(conversationMembers).values(ids.map((userId) => ({ conversationId: conv.id, userId })));
    await addSystemMessage(conv.id, `${me.name} created the work group “${title}”${description ? `: ${description}` : ""}`);
    await notify(ids, { type: "task_updated", title: `You're in a new work group: ${title}`, body: `With ${people.map((p) => p.name.split(" ")[0]).join(", ")}`, href: `/messages/${conv.id}`, excludeUserId: me.id });
    await audit(me.id, "workgroup.create", "conversation", conv.id, { title, members: ids });
    return { ok: true, message: "Work group created.", data: { id: conv.id }, redirectTo: `/messages/${conv.id}` };
  });
}

export async function archiveWorkGroupAction(conversationId: string, archived: boolean): Promise<ActionResult> {
  return safe(async () => {
    const me = await actionAdmin();
    await db.update(conversations).set({ archived }).where(and(eq(conversations.id, uuid.parse(conversationId)), eq(conversations.kind, "workgroup")));
    await audit(me.id, archived ? "workgroup.archive" : "workgroup.restore", "conversation", conversationId);
    return { ok: true, message: archived ? "Work group archived. Its chat is now read-only." : "Work group restored." };
  });
}

export async function ensureTeamChatAction(): Promise<ActionResult> {
  return safe(async () => { await actionUser(); await ensureTeamConversation(); return { ok: true }; });
}
