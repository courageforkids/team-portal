import Link from "next/link";
import { asc, desc, eq, gte } from "drizzle-orm";
import { ChevronLeft, ChevronRight, HandCoins } from "lucide-react";
import { db } from "@/db";
import { events, users } from "@/db/schema";
import { listDonors, listGifts, receiptSettings, requireDonations, yearTotals } from "@/server/donations";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardHeader } from "@/components/ui/card";
import { buttonClass } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { GiftDialog } from "@/components/donations/gift-dialog";
import { GiftRow, shortDate } from "@/components/donations/gift-row";
import { ReceiptSettingsForm } from "@/components/donations/donation-bits";
import { DONOR_KIND_LABEL, fmtMoney } from "@/lib/money";

export const metadata = { title: "Donations" };

function Stat({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return <div className="rounded-xl border border-line bg-surface p-4"><div className="text-xs font-medium text-muted">{label}</div><div className="mt-1 text-2xl font-bold tabular-nums">{value}</div>{hint && <div className="mt-0.5 text-xs text-muted">{hint}</div>}</div>;
}

export default async function DonationsPage({ searchParams }: { searchParams: Promise<{ year?: string }> }) {
  const me = await requireDonations();
  const nowYear = Number(new Date().toLocaleString("en-US", { timeZone: "America/New_York", year: "numeric" }));
  const y = Number((await searchParams).year) || nowYear;
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });
  const [gifts, donorRows, totals, evs, settings, people] = await Promise.all([
    listGifts({ year: y }), listDonors(), yearTotals(y),
    db.select({ id: events.id, title: events.title }).from(events).where(gte(events.startsAt, new Date(Date.now() - 180 * 86400000))).orderBy(desc(events.startsAt)).limit(30),
    receiptSettings(),
    me.role === "admin" ? db.select({ id: users.id, name: users.name, title: users.title, role: users.role }).from(users).where(eq(users.status, "active")).orderBy(asc(users.name)) : Promise.resolve([]),
  ]);
  const donorList = donorRows.map((r) => ({ id: r.donor.id, name: r.donor.name }));
  return (
    <>
      <PageHeader eyebrow="Fundraising" title="Donations" description="Log every gift once. Each one gets a numbered receipt you can download and send, and every donor gets a year-end summary."
        actions={<GiftDialog donors={donorList} events={evs} today={today} />} />
      <div className="mb-5 flex items-center gap-2">
        <Link href={`/donations?year=${y - 1}`} className={buttonClass("secondary", "icon")} aria-label="Previous year"><ChevronLeft className="h-4 w-4" /></Link>
        <h2 className="min-w-20 text-center text-lg font-semibold">{y}</h2>
        {y < nowYear && <Link href={`/donations?year=${y + 1}`} className={buttonClass("secondary", "icon")} aria-label="Next year"><ChevronRight className="h-4 w-4" /></Link>}
      </div>
      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="Money given" value={fmtMoney(totals.cashCents)} />
            <Stat label="Gifts" value={totals.gifts} />
            <Stat label="Item donations" value={totals.inKind} hint="no dollar value" />
            <Stat label="Donors" value={totals.donors} />
          </div>
          <Card>
            <CardHeader title={`Gifts in ${y}`} />
            {gifts.length ? <ul className="divide-y divide-line border-t border-line">{gifts.map((r) => <GiftRow key={r.gift.id} g={r.gift} donorName={r.donorName} showDonor donors={donorList} events={evs} isAdmin={me.role === "admin"} today={today} />)}</ul>
              : <EmptyState icon={HandCoins} title="No gifts logged yet" compact>Tap “Log a gift” when money or items come in.</EmptyState>}
          </Card>
        </div>
        <aside className="space-y-6">
          <Card>
            <CardHeader title="Donors" description="Open one for their history and year-end summary." />
            {donorRows.length ? <ul className="divide-y divide-line border-t border-line">{donorRows.map((r) => (
              <li key={r.donor.id}><Link href={`/donations/donors/${r.donor.id}`} className="flex items-center justify-between gap-3 px-5 py-2.5 hover:bg-surface-2">
                <span className="min-w-0"><span className="block truncate text-sm font-semibold">{r.donor.name}</span><span className="text-xs text-muted">{DONOR_KIND_LABEL[r.donor.kind]} · {r.gifts} gift{r.gifts === 1 ? "" : "s"}{r.lastGift ? ` · last ${shortDate(r.lastGift)}` : ""}</span></span>
                <span className="text-sm font-semibold tabular-nums">{r.cashCents ? fmtMoney(r.cashCents) : ""}</span>
              </Link></li>))}</ul>
              : <p className="px-5 pb-5 text-sm text-muted">Donors are added when you log their first gift.</p>}
          </Card>
          {me.role === "admin" && <Card><CardHeader title="Receipt settings" /><div className="px-5 pb-5"><ReceiptSettingsForm s={settings} people={people} /></div></Card>}
          <p className="px-1 text-xs text-muted">Receipts follow common IRS guidance (gifts of $250 or more need one; say whether anything was given back). This isn’t legal or tax advice, so check with your advisor or an accountant if you’re unsure.</p>
        </aside>
      </div>
    </>
  );
}
