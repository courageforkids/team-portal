import { requireAdmin } from "@/server/auth";
import { PageHeader } from "@/components/ui/page-header";
import { SettingsNav } from "@/components/settings/settings-nav";

export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin();
  return (
    <div>
      <PageHeader eyebrow="Executive" title="Settings" description="Manage who's on the team and how the portal works for everyone." />
      <div className="grid gap-5 md:grid-cols-[200px_minmax(0,1fr)] md:gap-8">
        <SettingsNav />
        <div className="min-w-0 space-y-6">{children}</div>
      </div>
    </div>
  );
}
