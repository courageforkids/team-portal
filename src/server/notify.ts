import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { notifications, users, type NotificationPrefs } from "@/db/schema";
import { appUrl, sendEmail } from "./email";

export type NotifyType =
  | "task_assigned" | "deadline_soon" | "deadline_changed" | "submission_approved" | "revision_requested"
  | "announcement" | "task_submitted" | "deadline_missed" | "extension_requested" | "extension_decided"
  | "task_blocked" | "task_comment" | "task_updated";

/** Nonessential types members can switch off (in-app). Everything else is always delivered in-app. */
const OPTIONAL_INAPP: Partial<Record<NotifyType, keyof NotificationPrefs>> = {
  announcement: "announcements",
  deadline_soon: "deadlineReminders",
};
/** Which email preference governs each type (email only goes out when org email is enabled). */
const EMAIL_PREF: Partial<Record<NotifyType, keyof NotificationPrefs>> = {
  task_assigned: "emailAssignments",
  deadline_soon: "emailReminders",
  deadline_missed: "emailReminders",
  announcement: "emailAnnouncements",
  submission_approved: "emailReviews",
  revision_requested: "emailReviews",
};
const EMAIL_DEFAULTS: NotificationPrefs = { emailAssignments: true, emailReminders: true, emailAnnouncements: false, emailReviews: true };

export async function notify(
  userIds: string[],
  n: { type: NotifyType; title: string; body?: string; href?: string; dedupeKey?: string; excludeUserId?: string },
) {
  const ids = [...new Set(userIds)].filter((id) => id && id !== n.excludeUserId);
  if (!ids.length) return 0;
  const recipients = await db
    .select({ id: users.id, email: users.email, prefs: users.notificationPrefs })
    .from(users)
    .where(and(inArray(users.id, ids), eq(users.status, "active")));
  let created = 0;
  for (const r of recipients) {
    const prefs = r.prefs ?? {};
    const optKey = OPTIONAL_INAPP[n.type];
    if (optKey && prefs[optKey] === false) continue;
    const inserted = await db
      .insert(notifications)
      .values({ userId: r.id, type: n.type, title: n.title, body: n.body ?? "", href: n.href, dedupeKey: n.dedupeKey })
      .onConflictDoNothing()
      .returning({ id: notifications.id });
    if (!inserted.length) continue; // duplicate suppressed
    created++;
    const emailKey = EMAIL_PREF[n.type];
    if (emailKey && (prefs[emailKey] ?? EMAIL_DEFAULTS[emailKey])) {
      await sendEmail(r.email, n.title, `${n.body ?? ""}\n\n${n.href ? appUrl(n.href) : appUrl("/")}\n\n— Courage for Kids Team Portal`);
    }
  }
  return created;
}

export async function adminIds() {
  const rows = await db.select({ id: users.id }).from(users).where(and(eq(users.role, "admin"), eq(users.status, "active")));
  return rows.map((r) => r.id);
}
