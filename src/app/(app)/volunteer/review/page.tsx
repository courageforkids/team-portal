import { formatInTimeZone } from "date-fns-tz";
import { CheckCircle2, Download } from "lucide-react";
import { requireAdmin } from "@/server/auth";
import { fmtHours, hoursReviewData } from "@/server/volunteer";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardHeader } from "@/components/ui/card";
import { Avatar } from "@/components/ui/avatar";
import { EmptyState } from "@/components/ui/empty-state";
import { LogHoursForm, ReviewHoursButtons } from "@/components/volunteer/volunteer-bits";
import { fmtDate } from "@/lib/dates";
import { VolunteerTabs } from "../tabs";

export const metadata = { title: "Review hours" };

export default async function ReviewHoursPage() {
  await requireAdmin();
  const { pending, totals } = await hoursReviewData();
  const today = formatInTimeZone(new Date(), "America/New_York", "yyyy-MM-dd");
  return (
    <>
      <PageHeader title="Volunteer" description="Approve logged hours, add hours for members, and download anyone's certificate." />
      <VolunteerTabs active="review" isAdmin pending={pending.length} />
      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="space-y-6">
          <Card>
            <CardHeader title="Waiting for approval" description={pending.length ? `${pending.length} ${pending.length === 1 ? "entry" : "entries"}` : undefined} />
            {pending.length === 0 ? <EmptyState compact icon={CheckCircle2} title="All caught up">New hours members log will show up here.</EmptyState> : (
              <ul className="divide-y divide-line border-t border-line">
                {pending.map(({ h, name, avatar }) => (
                  <li key={h.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                    <Avatar name={name} fileId={avatar} size={32} />
                    <div className="min-w-0 flex-1">
                      <div className="text-sm"><b>{name}</b> · {(h.minutes / 60).toFixed(2).replace(/\.?0+$/, "")} h on {fmtDate(h.date + "T12:00:00Z", "UTC", "MMM d")}</div>
                      <div className="text-sm text-fg-2">{h.activity}</div>
                      {h.description && <p className="text-xs text-muted">{h.description}</p>}
                    </div>
                    <ReviewHoursButtons id={h.id} />
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card>
            <CardHeader title="Hours by member" description="Approved hours. Alphabetical. Not a ranking." />
            <div className="overflow-x-auto border-t border-line">
              <table className="w-full text-sm">
                <thead><tr className="text-left text-xs text-muted"><th className="px-5 py-2 font-semibold">Member</th><th className="px-3 py-2 text-right font-semibold">This school year</th><th className="px-3 py-2 text-right font-semibold">All time</th><th className="px-3 py-2 text-right font-semibold">Pending</th><th className="px-5 py-2" /></tr></thead>
                <tbody className="divide-y divide-line">
                  {totals.map((u) => (
                    <tr key={u.id}>
                      <td className="px-5 py-2.5"><div className="flex items-center gap-2"><Avatar name={u.name} fileId={u.avatar_file_id} size={26} /><span className="font-medium">{u.name}</span></div></td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{fmtHours(u.year)}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{fmtHours(u.total)}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-muted">{u.pending ? fmtHours(u.pending) : "—"}</td>
                      <td className="px-5 py-2.5 text-right"><a href={`/api/hours/certificate?user=${u.id}&period=year`} target="_blank" rel="noopener" className="inline-flex items-center gap-1 text-xs font-semibold text-brand-ink hover:underline"><Download className="h-3.5 w-3.5" />Certificate</a></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
        <aside><Card><CardHeader title="Add hours for a member" description="Approved right away. Use when someone helped but didn't log it." /><div className="px-5 pb-5"><LogHoursForm today={today} members={totals.map((t) => ({ id: t.id, name: t.name }))} /></div></Card></aside>
      </div>
    </>
  );
}
