import Link from "next/link";
import { FileText, Pencil } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { GiftDialog } from "./gift-dialog";
import { DeleteGiftButton } from "./donation-bits";
import { fmtMoney } from "@/lib/money";
import type { Gift } from "@/server/donations";

const cents = (c: number | null) => (c === null ? "" : (c / 100).toFixed(2));
export const shortDate = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });

export function GiftRow({ g, donorName, showDonor, donors, events, isAdmin, today }: {
  g: Gift; donorName: string; showDonor: boolean; donors: { id: string; name: string }[]; events: { id: string; title: string }[]; isAdmin: boolean; today: string;
}) {
  const what = g.type === "cash" ? fmtMoney(g.amountCents) : g.description;
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1 px-5 py-3">
      <div className="min-w-0 flex-1 basis-60">
        <div className="flex flex-wrap items-center gap-2">
          {showDonor && <Link href={`/donations/donors/${g.donorId}`} className="font-semibold hover:underline">{donorName}</Link>}
          <span className={showDonor ? "text-sm text-fg-2" : "font-semibold"}>{what}</span>
          {g.type === "in_kind" && <Badge tone="violet">Items</Badge>}
          {g.type === "other" && <Badge tone="muted">Other</Badge>}
          {g.goodsProvided && g.goodsValueCents === null && <Badge tone="amber">Add value of what they got</Badge>}
        </div>
        <div className="text-xs text-muted">{shortDate(g.receivedOn)} · No. {g.receiptNumber}{g.method ? ` · ${g.method}` : ""}{g.type === "cash" && g.description ? ` · ${g.description}` : ""}</div>
      </div>
      <div className="flex items-center gap-1">
        <a href={`/api/donations/${g.id}/receipt`} target="_blank" rel="noopener" className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-line px-2.5 text-xs font-semibold text-brand hover:bg-surface-2"><FileText className="h-3.5 w-3.5" />Receipt</a>
        <GiftDialog donors={donors} events={events} today={today} trigger={<span className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg text-muted hover:bg-surface-2" aria-label={`Edit gift ${g.receiptNumber}`}><Pencil className="h-3.5 w-3.5" /></span>}
          gift={{ id: g.id, donorId: g.donorId, receivedOn: g.receivedOn, type: g.type, amount: cents(g.amountCents), method: g.method, description: g.description, goodsProvided: g.goodsProvided, goodsDescription: g.goodsDescription, goodsValue: cents(g.goodsValueCents), eventId: g.eventId, notes: g.notes, receiptNumber: g.receiptNumber }} />
        {isAdmin && <DeleteGiftButton id={g.id} number={g.receiptNumber} />}
      </div>
    </li>
  );
}
