import Link from "next/link";
import { Plus, ShieldCheck, CalendarClock } from "lucide-react";
import { requireAdmin } from "@/server/auth";
import { getSettings } from "@/server/settings";
import { getPeople } from "@/server/queries";
import { audit } from "@/server/audit";
import { accountabilityList, todayIn, type AccountabilityFilters } from "@/server/admin";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Select } from "@/components/ui/form";
import { buttonClass } from "@/components/ui/button";
import { AccountabilityDialog, PrivateNotice } from "@/components/admin/accountability-dialog";
import { AccountabilityList } from "@/components/admin/accountability-list";
import { ACC_STATUSES, ACC_STATUS_LABEL, ACC_TYPES, ACC_TYPE_LABEL, type AccStatus, type AccType } from "@/components/admin/labels";

export const metadata = { title: "Accountability" };

export default async function AccountabilityPage({ searchParams }: { searchParams: Promise<{ status?: string; type?: string; member?: string }> }) {
  const me = await requireAdmin();
  const sp = await searchParams;
  const s = await getSettings();
  const people = await getPeople({ includeInactive: true });
  const f: AccountabilityFilters = {
    status: ACC_STATUSES.includes(sp.status as AccStatus) ? (sp.status as AccStatus) : undefined,
    type: ACC_TYPES.includes(sp.type as AccType) ? (sp.type as AccType) : undefined,
    memberId: people.some((p) => p.id === sp.member) ? sp.member : undefined,
  };
  const rows = await accountabilityList(f);
  await audit(me.id, "accountability.view", "accountability", undefined, { page: "list", filters: f });
  const today = todayIn(s.timezone);
  const followUps = rows.filter((r) => r.status !== "resolved" && r.followUpDate && r.followUpDate <= today).length;
  const filtered = !!(f.status || f.type || f.memberId);
  const activePeople = people.filter((p) => p.status === "active").map((p) => ({ id: p.id, name: p.name }));

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Executive" title="Accountability"
        description="Private coaching notes, follow-ups and plans. Use them to support people — and to keep promises about following up."
        actions={<AccountabilityDialog members={activePeople} triggerVariant="primary" triggerSize="md" trigger={<><Plus className="h-4 w-4" aria-hidden />New record</>} />} />

      <PrivateNotice />

      {followUps > 0 && (
        <p className="flex items-center gap-2 rounded-[14px] border border-warn/25 bg-warn-soft px-4 py-3 text-sm text-fg-2">
          <CalendarClock className="h-4 w-4 shrink-0 text-warn" aria-hidden />
          {followUps === 1 ? "One follow-up date has arrived." : `${followUps} follow-up dates have arrived.`} They&apos;re highlighted below.
        </p>
      )}

      <Card>
        <form method="get" className="grid gap-3 border-b border-line p-4 sm:grid-cols-[1fr_1fr_1fr_auto] sm:items-end sm:px-5">
          <div>
            <label htmlFor="f-status" className="label">Status</label>
            <Select id="f-status" name="status" defaultValue={f.status ?? ""}>
              <option value="">Any status</option>
              {ACC_STATUSES.map((x) => <option key={x} value={x}>{ACC_STATUS_LABEL[x]}</option>)}
            </Select>
          </div>
          <div>
            <label htmlFor="f-type" className="label">Type</label>
            <Select id="f-type" name="type" defaultValue={f.type ?? ""}>
              <option value="">Any type</option>
              {ACC_TYPES.map((x) => <option key={x} value={x}>{ACC_TYPE_LABEL[x]}</option>)}
            </Select>
          </div>
          <div>
            <label htmlFor="f-member" className="label">Member</label>
            <Select id="f-member" name="member" defaultValue={f.memberId ?? ""}>
              <option value="">Everyone</option>
              {people.map((p) => <option key={p.id} value={p.id}>{p.name}{p.status === "deactivated" ? " (deactivated)" : ""}</option>)}
            </Select>
          </div>
          <div className="flex gap-2">
            <button type="submit" className={buttonClass("secondary", "md", "flex-1 sm:flex-none")}>Apply</button>
            {filtered && <Link href="/admin/accountability" className={buttonClass("ghost", "md")}>Clear</Link>}
          </div>
        </form>
        {rows.length === 0 ? (
          <EmptyState icon={ShieldCheck} title={filtered ? "No records match these filters" : "No accountability records"}>
            {filtered ? "Try a different filter." : "When a check-in needs to be documented, add a record here or from a member's profile."}
          </EmptyState>
        ) : (
          <>
            <p className="px-4 pt-3 text-xs text-muted sm:px-5">{rows.length} record{rows.length === 1 ? "" : "s"} · open items first, soonest follow-up first</p>
            <AccountabilityList rows={rows} today={today} tz={me.timezone} showMember />
          </>
        )}
      </Card>
    </div>
  );
}
