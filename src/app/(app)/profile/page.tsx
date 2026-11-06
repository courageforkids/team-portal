import { eq } from "drizzle-orm";
import { db } from "@/db";
import { departments, users } from "@/db/schema";
import { requireUser } from "@/server/auth";
import { getSettings } from "@/server/settings";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AvatarForm, PasswordForm, PrefsForm, ProfileForm } from "@/components/home/profile-forms";
import { CalendarFeedCard } from "@/components/calendar/feed-card";
import { ROLE_LABEL } from "@/lib/task-meta";
import { appUrl } from "@/server/email";

export const metadata = { title: "Profile & preferences" };

export default async function ProfilePage() {
  const me = await requireUser();
  const u = (await db.select({
    name: users.name, email: users.email, avatarFileId: users.avatarFileId, role: users.role, title: users.title, departmentId: users.departmentId,
    timezone: users.timezone, showEmail: users.showEmail, notificationPrefs: users.notificationPrefs, calendarToken: users.calendarToken,
  }).from(users).where(eq(users.id, me.id)).limit(1))[0];
  const dept = u.departmentId ? (await db.select({ name: departments.name }).from(departments).where(eq(departments.id, u.departmentId)).limit(1))[0] : null;
  const s = await getSettings();
  const p = u.notificationPrefs ?? {};
  return (
    <>
      <PageHeader title="Profile & preferences" description="How you appear to the team and how the portal keeps you posted." />
      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="space-y-6">
          <Card>
            <CardHeader title="Your profile" description="Your title, department and responsibilities are set by an administrator." />
            <div className="space-y-5 px-5 pb-5">
              <AvatarForm name={u.name} fileId={u.avatarFileId} />
              <div className="flex flex-wrap gap-2 text-sm">
                <Badge tone="brand">{ROLE_LABEL[u.role]}</Badge>{u.title && <Badge tone="neutral">{u.title}</Badge>}{dept && <Badge tone="neutral">{dept.name}</Badge>}
              </div>
              <ProfileForm name={u.name} email={u.email} timezone={u.timezone} showEmail={u.showEmail} />
            </div>
          </Card>
          <Card id="notifications">
            <CardHeader title="Notifications" description="Important updates (new assignments, reviews, deadline changes) always appear in the portal." />
            <div className="px-5 pb-5"><PrefsForm emailEnabled={s.emailEnabled} prefs={{
              announcements: p.announcements !== false, deadlineReminders: p.deadlineReminders !== false,
              emailAssignments: p.emailAssignments ?? true, emailReminders: p.emailReminders ?? true, emailAnnouncements: p.emailAnnouncements ?? false, emailReviews: p.emailReviews ?? true,
            }} /></div>
          </Card>
        </div>
        <div className="space-y-6">
          <Card><CardHeader title="Password" /><div className="px-5 pb-5"><PasswordForm /></div></Card>
          <Card><CardHeader title="Calendar subscription" description="See your deadlines and team events in Google or Apple Calendar." /><div className="px-5 pb-5">
            <CalendarFeedCard initialUrl={u.calendarToken ? appUrl(`/api/calendar/feed/${u.calendarToken}`) : null} />
          </div></Card>
        </div>
      </div>
    </>
  );
}
