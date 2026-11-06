import "server-only";
import { and, asc, count, desc, eq, ilike, inArray, lte, or, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { announcementReads, announcements, files, users, type Audience } from "@/db/schema";
import type { CurrentUser } from "./auth";
import { audienceMatches } from "./policy";
import type { AnnouncementCategory } from "@/components/announcements/meta";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (v: string) => UUID_RE.test(v);

const escapeLike = (s: string) => s.replace(/[\\%_]/g, (c) => "\\" + c);

export type AnnouncementListItem = {
  id: string; title: string; body: string; category: string; pinned: boolean; requireAck: boolean; audience: Audience;
  publishAt: Date; authorId: string | null; authorName: string | null; authorAvatarFileId: string | null;
  readAt: Date | null; acknowledgedAt: Date | null; attachments: number;
};

/**
 * Announcements the viewer may see. Members get published ones whose audience matches them;
 * admins also get scheduled ones (returned separately).
 */
export async function listAnnouncements(viewer: CurrentUser, f: { category?: AnnouncementCategory | null; q?: string } = {}) {
  const now = new Date();
  const conds: (SQL | undefined)[] = [];
  if (viewer.role !== "admin") conds.push(lte(announcements.publishAt, now));
  if (f.category) conds.push(eq(announcements.category, f.category));
  if (f.q) {
    const like = `%${escapeLike(f.q)}%`;
    conds.push(or(ilike(announcements.title, like), ilike(announcements.body, like)));
  }
  const rows = await db.select({
    a: announcements, authorName: users.name, authorAvatarFileId: users.avatarFileId,
    readAt: announcementReads.readAt, acknowledgedAt: announcementReads.acknowledgedAt,
  }).from(announcements)
    .leftJoin(users, eq(users.id, announcements.authorId))
    .leftJoin(announcementReads, and(eq(announcementReads.announcementId, announcements.id), eq(announcementReads.userId, viewer.id)))
    .where(and(...conds))
    .orderBy(desc(announcements.pinned), desc(announcements.publishAt))
    .limit(300);
  const visible = rows.filter((r) => audienceMatches(r.a.audience, viewer));
  const ids = visible.map((r) => r.a.id);
  const counts = ids.length
    ? await db.select({ id: files.ownerId, n: count() }).from(files)
      .where(and(eq(files.ownerType, "announcement"), inArray(files.ownerId, ids))).groupBy(files.ownerId)
    : [];
  const attach = new Map(counts.map((c) => [c.id, c.n]));
  const items: AnnouncementListItem[] = visible.map((r) => ({
    id: r.a.id, title: r.a.title, body: r.a.body, category: r.a.category, pinned: r.a.pinned, requireAck: r.a.requireAck,
    audience: r.a.audience, publishAt: r.a.publishAt, authorId: r.a.authorId, authorName: r.authorName, authorAvatarFileId: r.authorAvatarFileId,
    readAt: r.readAt, acknowledgedAt: r.acknowledgedAt, attachments: attach.get(r.a.id) ?? 0,
  }));
  const published = items.filter((i) => i.publishAt <= now);
  const scheduled = items.filter((i) => i.publishAt > now).sort((a, b) => a.publishAt.getTime() - b.publishAt.getTime());
  return { published, scheduled };
}

/** One announcement, or null when it doesn't exist or the viewer may not see it. */
export async function getAnnouncementForViewer(viewer: CurrentUser, id: string) {
  if (!isUuid(id)) return null;
  const row = (await db.select({ a: announcements, authorName: users.name, authorAvatarFileId: users.avatarFileId, authorTitle: users.title })
    .from(announcements).leftJoin(users, eq(users.id, announcements.authorId)).where(eq(announcements.id, id)).limit(1))[0];
  if (!row) return null;
  const published = row.a.publishAt <= new Date();
  if (viewer.role !== "admin" && (!published || !audienceMatches(row.a.audience, viewer))) return null;
  const attachments = await db.select({ id: files.id, filename: files.filename, mimeType: files.mimeType, size: files.size })
    .from(files).where(and(eq(files.ownerType, "announcement"), eq(files.ownerId, id))).orderBy(asc(files.createdAt));
  const mine = (await db.select().from(announcementReads)
    .where(and(eq(announcementReads.announcementId, id), eq(announcementReads.userId, viewer.id))).limit(1))[0] ?? null;
  return { ...row.a, authorName: row.authorName, authorAvatarFileId: row.authorAvatarFileId, authorTitle: row.authorTitle, published, attachments, mine };
}

/** Records that the viewer opened a published announcement (idempotent). */
export async function markAnnouncementRead(userId: string, announcementId: string) {
  await db.insert(announcementReads).values({ announcementId, userId }).onConflictDoNothing();
}

/** Read / acknowledgment progress across the announcement's audience (active members, excluding the author). */
export async function announcementProgress(a: { id: string; audience: Audience; authorId: string | null }) {
  const members = await db.select({ id: users.id, name: users.name, avatarFileId: users.avatarFileId, role: users.role, departmentId: users.departmentId })
    .from(users).where(eq(users.status, "active")).orderBy(asc(users.name));
  const audience = members.filter((m) => m.id !== a.authorId && audienceMatches(a.audience, m));
  const reads = await db.select().from(announcementReads).where(eq(announcementReads.announcementId, a.id));
  const byUser = new Map(reads.map((r) => [r.userId, r]));
  const people = audience.map((m) => ({ ...m, readAt: byUser.get(m.id)?.readAt ?? null, acknowledgedAt: byUser.get(m.id)?.acknowledgedAt ?? null }));
  return {
    total: people.length,
    read: people.filter((p) => p.readAt).length,
    acknowledged: people.filter((p) => p.acknowledgedAt).length,
    people,
  };
}

export async function announcementAttachmentIds(id: string) {
  return db.select({ id: files.id, storageKey: files.storageKey }).from(files).where(and(eq(files.ownerType, "announcement"), eq(files.ownerId, id)));
}
