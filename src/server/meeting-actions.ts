"use server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { events, meetingAttendance, meetings, users } from "@/db/schema";
import { actionAdmin, actionUser, AuthError } from "./auth";
import { safe, str, UserError } from "./safe-action";
import { audienceMatches, visibilityAllowed } from "./policy";
import { createTasks } from "./tasks";
import { notify } from "./notify";
import { audit } from "./audit";
import { parseLocalInput, DEFAULT_TZ } from "@/lib/dates";
import type { ActionResult } from "@/lib/action";

const uuid = z.string().uuid();
const canEdit = (role: string) => role === "admin" || role === "leader";

export async function createMeetingAction(_: unknown, fd: FormData): Promise<ActionResult<{ id: string }>> {
  return safe(async () => {
    const me = await actionUser();
    if (!canEdit(me.role)) throw new AuthError("Only leaders and administrators can create meeting pages.");
    const title = str(fd, "title").slice(0, 120);
    if (!title) throw new UserError("Give the meeting a name.");
    const startsAt = parseLocalInput(str(fd, "startsAt"), DEFAULT_TZ);
    if (!startsAt) throw new UserError("Pick when the meeting is.");
    const visibility = z.enum(["everyone", "leadership", "admin"]).parse(str(fd, "visibility") || "everyone");
    if (!visibilityAllowed(me.role, visibility)) throw new AuthError();
    const [m] = await db.insert(meetings).values({ title, startsAt, visibility, agenda: str(fd, "agenda").slice(0, 20000), createdById: me.id, updatedById: me.id }).returning();
    return { ok: true, data: { id: m.id }, redirectTo: `/meetings/${m.id}` };
  });
}

/** Opens (or creates) the meeting page for a calendar event. */
export async function meetingForEventAction(eventId: string): Promise<ActionResult<{ id: string }>> {
  return safe(async () => {
    const me = await actionUser();
    const ev = (await db.select().from(events).where(eq(events.id, uuid.parse(eventId))).limit(1))[0];
    if (!ev || !visibilityAllowed(me.role, ev.visibility)) throw new UserError("That event isn't available.");
    let m = (await db.select().from(meetings).where(eq(meetings.eventId, ev.id)).limit(1))[0];
    if (!m) {
      if (!canEdit(me.role)) throw new UserError("No notes have been started for this meeting yet.");
      [m] = await db.insert(meetings).values({ eventId: ev.id, title: ev.title, startsAt: ev.startsAt, visibility: ev.visibility, createdById: me.id, updatedById: me.id }).onConflictDoNothing().returning();
      m ??= (await db.select().from(meetings).where(eq(meetings.eventId, ev.id)).limit(1))[0];
    }
    return { ok: true, data: { id: m.id }, redirectTo: `/meetings/${m.id}` };
  });
}

/** Saves agenda or notes. Refuses if someone else saved since you opened it, so nobody's work is overwritten. */
export async function saveMeetingTextAction(meetingId: string, field: "agenda" | "notes", value: string, lastSeen: string): Promise<ActionResult<{ updatedAt: string }>> {
  return safe(async () => {
    const me = await actionUser();
    if (!canEdit(me.role)) throw new AuthError("Only leaders and administrators can edit meeting notes.");
    const m = (await db.select().from(meetings).where(eq(meetings.id, uuid.parse(meetingId))).limit(1))[0];
    if (!m || !visibilityAllowed(me.role, m.visibility)) throw new UserError("That meeting isn't available.");
    if (m.updatedAt.toISOString() !== lastSeen && m.updatedById !== me.id) {
      const who = m.updatedById ? (await db.select({ name: users.name }).from(users).where(eq(users.id, m.updatedById)).limit(1))[0]?.name : "Someone";
      throw new UserError(`${who ?? "Someone"} just edited this page. Copy your text, reload, and add it again so nothing is lost.`);
    }
    const now = new Date();
    await db.update(meetings).set({ [field]: String(value).slice(0, 50000), updatedAt: now, updatedById: me.id }).where(eq(meetings.id, m.id));
    return { ok: true, data: { updatedAt: now.toISOString() } };
  });
}

export async function markMeetingAttendanceAction(meetingId: string, userId: string, status: "present" | "late" | "absent" | "excused" | null): Promise<ActionResult> {
  return safe(async () => {
    const me = await actionUser();
    if (!canEdit(me.role)) throw new AuthError();
    const mid = uuid.parse(meetingId), uid = uuid.parse(userId);
    if (status === null) await db.delete(meetingAttendance).where(and(eq(meetingAttendance.meetingId, mid), eq(meetingAttendance.userId, uid)));
    else await db.insert(meetingAttendance).values({ meetingId: mid, userId: uid, status: z.enum(["present", "late", "absent", "excused"]).parse(status) })
      .onConflictDoUpdate({ target: [meetingAttendance.meetingId, meetingAttendance.userId], set: { status, markedAt: new Date() } });
    return { ok: true };
  });
}

/** Admin: turn an action item into a real task linked to this meeting. */
export async function addActionItemAction(_: unknown, fd: FormData): Promise<ActionResult> {
  return safe(async () => {
    const me = await actionAdmin();
    const meetingId = uuid.parse(str(fd, "meetingId"));
    const m = (await db.select().from(meetings).where(eq(meetings.id, meetingId)).limit(1))[0];
    if (!m) throw new UserError("That meeting no longer exists.");
    const title = str(fd, "title").slice(0, 160);
    if (title.length < 3) throw new UserError("Say what needs to be done.");
    const assignee = uuid.parse(str(fd, "assignee"));
    const due = str(fd, "dueAt") ? parseLocalInput(str(fd, "dueAt"), DEFAULT_TZ) : null;
    await createTasks(me, {
      title, instructions: `From the meeting “${m.title}”.`, departmentId: null, categoryId: null, projectId: null, priority: "medium", dueAt: due, timezone: DEFAULT_TZ,
      deliverables: "", completionCriteria: "", submissionTypes: ["text"], checklist: [], links: [], requiresReview: false, reviewerId: null, internalNotes: "", meetingId,
    }, [assignee], { separate: false });
    return { ok: true, message: "Action item added as a task." };
  });
}

/** Sends a "notes are ready" notification to everyone who can see the meeting. */
export async function shareMeetingNotesAction(meetingId: string): Promise<ActionResult> {
  return safe(async () => {
    const me = await actionUser();
    if (!canEdit(me.role)) throw new AuthError();
    const m = (await db.select().from(meetings).where(eq(meetings.id, uuid.parse(meetingId))).limit(1))[0];
    if (!m) throw new UserError("That meeting no longer exists.");
    if (!m.notes.trim()) throw new UserError("Write some notes first.");
    const people = await db.select({ id: users.id, role: users.role, departmentId: users.departmentId }).from(users).where(eq(users.status, "active"));
    const ids = people.filter((p) => visibilityAllowed(p.role, m.visibility) && audienceMatches({}, p)).map((p) => p.id);
    await notify(ids, { type: "announcement", title: `Notes from ${m.title} are ready`, href: `/meetings/${m.id}`, dedupeKey: `meeting-notes:${m.id}`, excludeUserId: me.id });
    await db.update(meetings).set({ notesSharedAt: new Date() }).where(eq(meetings.id, m.id));
    await audit(me.id, "meeting.notes_shared", "meeting", m.id);
    return { ok: true, message: "Notes shared with the team." };
  });
}

export async function deleteMeetingAction(meetingId: string): Promise<ActionResult> {
  return safe(async () => {
    const me = await actionAdmin();
    await db.delete(meetings).where(eq(meetings.id, uuid.parse(meetingId)));
    await audit(me.id, "meeting.delete", "meeting", meetingId);
    return { ok: true, message: "Meeting page deleted.", redirectTo: "/meetings" };
  });
}
