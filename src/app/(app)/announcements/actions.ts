"use server";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { announcementReads, announcements, departments, files, type Audience } from "@/db/schema";
import { actionAdmin, actionUser } from "@/server/auth";
import { safe, all, bool, filesOf, str, UserError } from "@/server/safe-action";
import { audit } from "@/server/audit";
import { canViewAnnouncement } from "@/server/policy";
import { notifyAnnouncementAudience } from "@/server/maintenance";
import { deleteStored, MAX_FILES_PER_UPLOAD, saveUploads, UploadError, validateUpload } from "@/server/storage";
import { getSettings } from "@/server/settings";
import { announcementAttachmentIds, isUuid } from "@/server/announcements";
import { ANNOUNCEMENT_CATEGORIES } from "@/components/announcements/meta";
import { fmtDateTime, parseLocalInput } from "@/lib/dates";
import type { ActionResult } from "@/lib/action";

const schema = z.object({
  title: z.string().trim().min(1, "Add a title.").max(160, "Keep the title under 160 characters."),
  body: z.string().trim().min(1, "Write the announcement.").max(20000, "That message is too long."),
  category: z.enum(ANNOUNCEMENT_CATEGORIES, { message: "Pick a category." }),
});

const ROLES = ["admin", "leader", "volunteer"] as const;

async function readAudience(fd: FormData): Promise<Audience> {
  if (str(fd, "audienceMode") !== "groups") return {};
  const roles = all(fd, "roles").filter((r): r is (typeof ROLES)[number] => (ROLES as readonly string[]).includes(r));
  const wanted = all(fd, "departmentIds").filter(isUuid);
  const deptIds = wanted.length
    ? (await db.select({ id: departments.id }).from(departments).where(inArray(departments.id, wanted))).map((d) => d.id)
    : [];
  if (!roles.length && !deptIds.length) throw new UserError("Pick at least one role or department, or send it to everyone.");
  const a: Audience = {};
  if (roles.length) a.roles = [...new Set(roles)];
  if (deptIds.length) a.departmentIds = [...new Set(deptIds)];
  return a;
}

export async function saveAnnouncementAction(_prev: ActionResult<unknown> | null, fd: FormData): Promise<ActionResult> {
  return safe(async () => {
    const me = await actionAdmin();
    const id = str(fd, "id");
    const input = schema.parse({ title: str(fd, "title"), body: str(fd, "body"), category: str(fd, "category") });
    const audience = await readAudience(fd);
    const { timezone: tz } = await getSettings();
    const now = new Date();

    const existing = id
      ? (isUuid(id) ? (await db.select().from(announcements).where(eq(announcements.id, id)).limit(1))[0] : undefined)
      : undefined;
    if (id && !existing) throw new UserError("That announcement no longer exists.");
    const alreadyPublished = !!existing && existing.publishAt <= now;

    let publishAt = existing?.publishAt ?? now;
    if (!alreadyPublished) {
      if (str(fd, "publishMode") === "schedule") {
        const when = parseLocalInput(str(fd, "publishAt"), tz);
        if (!when) throw new UserError("Pick a date and time to publish.");
        if (when.getTime() <= now.getTime() + 30_000) throw new UserError("Pick a time in the future, or choose “Publish now”.");
        publishAt = when;
      } else {
        publishAt = now;
      }
    }

    // Validate files before writing anything so a bad upload doesn't leave a half-saved announcement.
    const uploads = filesOf(fd, "files");
    if (uploads.length > MAX_FILES_PER_UPLOAD) throw new UploadError(`Attach up to ${MAX_FILES_PER_UPLOAD} files at a time.`);
    uploads.forEach(validateUpload);

    const values = { ...input, pinned: bool(fd, "pinned"), requireAck: bool(fd, "requireAck"), audience, publishAt };
    let annId: string;
    if (existing) {
      await db.update(announcements).set({ ...values, updatedAt: now }).where(eq(announcements.id, existing.id));
      annId = existing.id;
    } else {
      const [row] = await db.insert(announcements).values({ ...values, authorId: me.id }).returning({ id: announcements.id });
      annId = row.id;
    }

    try {
      if (uploads.length) await saveUploads(uploads, { type: "announcement", id: annId }, me.id);
    } catch (e) {
      if (!existing) await db.delete(announcements).where(eq(announcements.id, annId));
      throw e;
    }

    // Remove attachments the admin unticked
    const remove = all(fd, "removeFileIds").filter(isUuid);
    if (existing && remove.length) {
      const gone = await db.delete(files)
        .where(and(eq(files.ownerType, "announcement"), eq(files.ownerId, annId), inArray(files.id, remove)))
        .returning({ storageKey: files.storageKey });
      await Promise.all(gone.map((g) => deleteStored(g.storageKey).catch(() => {})));
    }

    await audit(me.id, existing ? "announcement.update" : "announcement.create", "announcement", annId, {
      title: input.title, publishAt: publishAt.toISOString(), audience, requireAck: values.requireAck, pinned: values.pinned,
    });

    const live = publishAt <= new Date();
    if (live) await notifyAnnouncementAudience(annId);
    const message = existing
      ? "Announcement updated."
      : live ? "Announcement published." : `Scheduled for ${fmtDateTime(publishAt, tz)}.`;
    return { ok: true, message, redirectTo: `/announcements/${annId}` };
  });
}

export async function deleteAnnouncementAction(id: string): Promise<ActionResult> {
  return safe(async () => {
    const me = await actionAdmin();
    if (!isUuid(id)) throw new UserError("That announcement no longer exists.");
    const a = (await db.select({ id: announcements.id, title: announcements.title }).from(announcements).where(eq(announcements.id, id)).limit(1))[0];
    if (!a) throw new UserError("That announcement no longer exists.");
    const att = await announcementAttachmentIds(id);
    await db.delete(announcements).where(eq(announcements.id, id));
    if (att.length) {
      await db.delete(files).where(inArray(files.id, att.map((f) => f.id)));
      await Promise.all(att.map((f) => deleteStored(f.storageKey).catch(() => {})));
    }
    await audit(me.id, "announcement.delete", "announcement", id, { title: a.title });
    return { ok: true, message: "Announcement deleted.", redirectTo: "/announcements" };
  });
}

export async function acknowledgeAnnouncementAction(_prev: ActionResult<unknown> | null, fd: FormData): Promise<ActionResult> {
  return safe(async () => {
    const me = await actionUser();
    const id = str(fd, "id");
    if (!isUuid(id) || !(await canViewAnnouncement(me, id))) throw new UserError("That announcement isn't available.");
    const a = (await db.select({ requireAck: announcements.requireAck, publishAt: announcements.publishAt }).from(announcements).where(eq(announcements.id, id)).limit(1))[0];
    if (!a || a.publishAt > new Date()) throw new UserError("This announcement hasn't been published yet.");
    if (!a.requireAck) throw new UserError("This announcement doesn't need an acknowledgment.");
    const now = new Date();
    await db.insert(announcementReads).values({ announcementId: id, userId: me.id, readAt: now, acknowledgedAt: now }).onConflictDoNothing();
    await db.update(announcementReads).set({ acknowledgedAt: now })
      .where(and(eq(announcementReads.announcementId, id), eq(announcementReads.userId, me.id), isNull(announcementReads.acknowledgedAt)));
    return { ok: true, message: "Thanks — acknowledged." };
  });
}
