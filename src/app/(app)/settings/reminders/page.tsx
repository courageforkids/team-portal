import { ShieldCheck } from "lucide-react";
import { requireAdmin } from "@/server/auth";
import { getSettings } from "@/server/settings";
import { Card, CardHeader } from "@/components/ui/card";
import { RemindersForm } from "@/components/settings/reminders-form";
import { TIMEZONES } from "@/lib/dates";

export const metadata = { title: "Reminders · Settings" };

export default async function RemindersSettingsPage() {
  await requireAdmin();
  const s = await getSettings();
  const qs = s.quietHoursStart ?? 21, qe = s.quietHoursEnd ?? 7;
  const quietOn = s.quietHoursStart !== undefined && s.quietHoursEnd !== undefined && qs !== qe;
  const tzs = TIMEZONES.includes(s.timezone) ? TIMEZONES : [s.timezone, ...TIMEZONES];
  return (
    <>
      <Card>
        <CardHeader title="Deadline reminders" description="Friendly nudges in the portal (and by email, if email is turned on)." />
        <div className="border-t border-line px-4 py-5 sm:px-5">
          <RemindersForm timezones={tzs} initial={{
            reminderHours: s.reminderHours, overdueReminders: s.overdueReminders, quietOn,
            quietHoursStart: quietOn ? qs : 21, quietHoursEnd: quietOn ? qe : 7, timezone: s.timezone,
          }} />
        </div>
      </Card>
      <div className="flex gap-3 rounded-[14px] border border-line bg-surface-2 px-4 py-3.5 text-sm sm:px-5">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-brand-ink" aria-hidden />
        <div className="text-fg-2">
          <p className="font-semibold text-fg">No duplicate reminders</p>
          <p className="mt-0.5">Each member gets at most one reminder per window for a deadline (for example, one at 48 hours and one at 24 hours), plus at most one past-due notice. If a deadline changes — say an extension is approved — reminders re-arm once for the new date. Work that&apos;s already submitted never gets reminders.</p>
        </div>
      </div>
    </>
  );
}
