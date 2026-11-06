import { requireAdmin } from "@/server/auth";
import { getDepartments } from "@/server/queries";
import { getSettings } from "@/server/settings";
import { ACCEPT_ATTR } from "@/server/storage";
import { PageHeader } from "@/components/ui/page-header";
import { AnnouncementForm } from "@/components/announcements/announcement-form";
import { toLocalInput } from "@/lib/dates";
import { tzLabel } from "@/components/calendar/date-utils";

export const metadata = { title: "New announcement" };

export default async function NewAnnouncementPage() {
  await requireAdmin();
  const [depts, s] = await Promise.all([getDepartments(), getSettings()]);
  return (
    <div>
      <PageHeader eyebrow="Announcements" title="New announcement" description="Share news, reminders or policies with the whole team or specific groups." />
      <AnnouncementForm departments={depts.map((d) => ({ id: d.id, name: d.name, color: d.color }))} accept={ACCEPT_ATTR}
        tzLabel={tzLabel(s.timezone)} minLocal={toLocalInput(new Date(), s.timezone)} />
    </div>
  );
}
