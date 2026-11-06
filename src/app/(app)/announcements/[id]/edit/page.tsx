import { notFound } from "next/navigation";
import { requireAdmin } from "@/server/auth";
import { getAnnouncementForViewer } from "@/server/announcements";
import { getDepartments } from "@/server/queries";
import { getSettings } from "@/server/settings";
import { ACCEPT_ATTR } from "@/server/storage";
import { PageHeader } from "@/components/ui/page-header";
import { AnnouncementForm } from "@/components/announcements/announcement-form";
import { fmtDateTime, toLocalInput } from "@/lib/dates";
import { tzLabel } from "@/components/calendar/date-utils";

export const metadata = { title: "Edit announcement" };

export default async function EditAnnouncementPage({ params }: { params: Promise<{ id: string }> }) {
  const me = await requireAdmin();
  const { id } = await params;
  const a = await getAnnouncementForViewer(me, id);
  if (!a) notFound();
  const [allDepts, s] = await Promise.all([getDepartments(true), getSettings()]);
  // Keep departments that are archived but still targeted, so saving doesn't silently drop them.
  const shown = allDepts.filter((d) => !d.archived || a.audience.departmentIds?.includes(d.id));
  return (
    <div>
      <PageHeader eyebrow="Announcements" title="Edit announcement" description={a.title} />
      <AnnouncementForm
        departments={shown.map((d) => ({ id: d.id, name: d.archived ? `${d.name} (archived)` : d.name, color: d.color }))}
        accept={ACCEPT_ATTR} tzLabel={tzLabel(s.timezone)} minLocal={toLocalInput(new Date(), s.timezone)}
        initial={{
          id: a.id, title: a.title, body: a.body, category: a.category, pinned: a.pinned, requireAck: a.requireAck,
          roles: a.audience.roles ?? [], departmentIds: a.audience.departmentIds ?? [], published: a.published,
          publishAtLocal: a.published ? "" : toLocalInput(a.publishAt, s.timezone), publishedLabel: fmtDateTime(a.publishAt, me.timezone),
          attachments: a.attachments.map((f) => ({ id: f.id, filename: f.filename, size: f.size })),
        }}
      />
    </div>
  );
}
