import Link from "next/link";
import { notFound } from "next/navigation";
import { desc, eq, gte } from "drizzle-orm";
import { ArrowLeft, Download } from "lucide-react";
import { db } from "@/db";
import { donors, events } from "@/db/schema";
import { listDonors, listGifts, requireDonations } from "@/server/donations";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardHeader } from "@/components/ui/card";
import { GiftDialog } from "@/components/donations/gift-dialog";
import { GiftRow } from "@/components/donations/gift-row";
import { DeleteDonorButton, DonorEditButton } from "@/components/donations/donation-bits";
import { DONOR_KIND_LABEL, fmtMoney } from "@/lib/money";

export const metadata = { title: "Donor" };

export default async function DonorPage({ params }: { params: Promise<{ id: string }> }) {
  const me = await requireDonations();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const d = (await db.select().from(donors).where(eq(donors.id, id)).limit(1))[0];
  if (!d) notFound();
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });
  const [gifts, all, evs] = await Promise.all([
    listGifts({ donorId: id }), listDonors(),
    db.select({ id: events.id, title: events.title }).from(events).where(gte(events.startsAt, new Date(Date.now() - 180 * 86400000))).orderBy(desc(events.startsAt)).limit(30),
  ]);
  const donorList = all.map((r) => ({ id: r.donor.id, name: r.donor.name }));
  const years = [...new Set(gifts.filter((g) => g.gift.type !== "other").map((g) => Number(g.gift.receivedOn.slice(0, 4))))].sort((a, b) => b - a);
  const total = gifts.reduce((s, g) => s + (g.gift.type === "cash" ? g.gift.amountCents ?? 0 : 0), 0);
  return (
    <>
      <Link href="/donations" className="mb-3 inline-flex items-center gap-1 text-sm text-muted hover:text-fg"><ArrowLeft className="h-4 w-4" />Donations</Link>
      <PageHeader eyebrow={DONOR_KIND_LABEL[d.kind]} title={d.name} description={`${gifts.length} gift${gifts.length === 1 ? "" : "s"}${total ? ` · ${fmtMoney(total)} given in total` : ""}`}
        actions={<div className="flex flex-wrap gap-2"><DonorEditButton d={d} /><GiftDialog donors={donorList} events={evs} today={today} defaultDonorId={d.id} /></div>} />
      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <Card>
          <CardHeader title="Gifts" />
          {gifts.length ? <ul className="divide-y divide-line border-t border-line">{gifts.map((r) => <GiftRow key={r.gift.id} g={r.gift} donorName={d.name} showDonor={false} donors={donorList} events={evs} isAdmin={me.role === "admin"} today={today} />)}</ul>
            : <p className="px-5 pb-5 text-sm text-muted">No gifts yet.</p>}
        </Card>
        <aside className="space-y-6">
          <Card>
            <CardHeader title="Year-end summary" description="One page listing every gift that year. Send it in January." />
            <div className="flex flex-wrap gap-2 px-5 pb-5">
              {years.length ? years.map((y) => <a key={y} href={`/api/donations/donors/${d.id}/summary?year=${y}`} target="_blank" rel="noopener" className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-line px-3 text-sm font-semibold text-brand hover:bg-surface-2"><Download className="h-4 w-4" />{y} summary</a>)
                : <p className="text-sm text-muted">Appears after their first gift.</p>}
            </div>
          </Card>
          <Card className="p-5 text-sm">
            <h3 className="eyebrow mb-2">Contact</h3>
            <p>{d.email || <span className="text-muted">No email</span>}</p>
            <p>{d.phone || <span className="text-muted">No phone</span>}</p>
            {d.address && <p className="mt-2 whitespace-pre-line text-fg-2">{d.address}</p>}
            {d.notes && <><h3 className="eyebrow mb-1 mt-4">Notes</h3><p className="whitespace-pre-line text-fg-2">{d.notes}</p></>}
            {me.role === "admin" && gifts.length === 0 && <div className="mt-4"><DeleteDonorButton id={d.id} /></div>}
          </Card>
        </aside>
      </div>
    </>
  );
}
