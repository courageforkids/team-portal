"use client";
import { useState } from "react";
import { Plus } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { ActionForm, Checkbox, Field, Input, Select, SubmitButton, Textarea } from "@/components/ui/form";
import { buttonClass } from "@/components/ui/button";
import { saveGiftAction } from "@/server/donation-actions";
import { DONOR_KIND_LABEL, GIFT_METHODS } from "@/lib/money";

export type GiftForm = {
  id: string; donorId: string; receivedOn: string; type: "cash" | "in_kind" | "other"; amount: string; method: string; description: string;
  goodsProvided: boolean; goodsDescription: string; goodsValue: string; eventId: string | null; notes: string; receiptNumber: string;
};

export function GiftDialog({ donors, events, gift, defaultDonorId, trigger, today }: {
  donors: { id: string; name: string }[]; events: { id: string; title: string }[]; gift?: GiftForm; defaultDonorId?: string; trigger?: React.ReactNode; today: string;
}) {
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<GiftForm["type"]>(gift?.type ?? "cash");
  const [donor, setDonor] = useState(gift?.donorId ?? defaultDonorId ?? "");
  const [goods, setGoods] = useState(gift?.goodsProvided ?? false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={trigger ? "contents" : buttonClass("primary")}>{trigger ?? <><Plus className="h-4 w-4" />Log a gift</>}</button>
      <Dialog open={open} onClose={() => setOpen(false)} title={gift ? `Edit gift ${gift.receiptNumber}` : "Log a gift"} description={gift ? undefined : "A receipt number is assigned when you save."}>
        <ActionForm action={saveGiftAction} onSuccess={() => setOpen(false)} className="space-y-4">
          {gift && <input type="hidden" name="id" value={gift.id} />}
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Donor" htmlFor="g-donor">
              <Select id="g-donor" name="donorId" value={donor} onChange={(e) => setDonor(e.target.value)}>
                <option value="">+ New donor</option>
                {donors.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </Select>
            </Field>
            <Field label="Date received" htmlFor="g-date"><Input id="g-date" name="receivedOn" type="date" required max={today} defaultValue={gift?.receivedOn ?? today} /></Field>
          </div>
          {!donor && (
            <div className="grid gap-3 rounded-xl bg-surface-2 p-3 sm:grid-cols-[1fr_160px]">
              <Field label="New donor's name" htmlFor="g-newname"><Input id="g-newname" name="newDonorName" maxLength={140} placeholder="e.g. Smith Family or Main St. Bakery" /></Field>
              <Field label="Type" htmlFor="g-newkind"><Select id="g-newkind" name="newDonorKind" defaultValue="individual">{Object.entries(DONOR_KIND_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></Field>
            </div>
          )}
          <fieldset>
            <legend className="label">What was given</legend>
            <div className="flex flex-wrap gap-2">
              {([["cash", "Money"], ["in_kind", "Donated items"], ["other", "Something else"]] as const).map(([k, l]) => (
                <label key={k} className={`cursor-pointer rounded-lg border px-3 py-1.5 text-sm font-medium ${type === k ? "border-brand bg-brand-soft text-brand" : "border-line text-fg-2"}`}>
                  <input type="radio" name="type" value={k} checked={type === k} onChange={() => setType(k)} className="sr-only" />{l}
                </label>
              ))}
            </div>
          </fieldset>
          {type === "cash" && (
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Amount" htmlFor="g-amount"><Input id="g-amount" name="amount" inputMode="decimal" placeholder="$50" defaultValue={gift?.amount} /></Field>
              <Field label="How they paid" htmlFor="g-method"><Select id="g-method" name="method" defaultValue={gift?.method || "Cash"}>{GIFT_METHODS.map((m) => <option key={m}>{m}</option>)}</Select></Field>
            </div>
          )}
          {type === "in_kind" && <Field label="Describe the items" htmlFor="g-desc" hint="Describe them only. Receipts never put a dollar value on donated items."><Textarea id="g-desc" name="description" rows={2} defaultValue={gift?.description} placeholder="e.g. 40 coloring books, 3 boxes of crayons" /></Field>}
          {type === "other" && <>
            <Field label="Describe the gift" htmlFor="g-desc" hint="Stock, a donor-advised fund grant, a vehicle, services or crypto."><Textarea id="g-desc" name="description" rows={2} defaultValue={gift?.description} /></Field>
            <Field label="Amount (optional)" htmlFor="g-amount"><Input id="g-amount" name="amount" inputMode="decimal" defaultValue={gift?.amount} /></Field>
            <p className="rounded-lg bg-warn-soft px-3 py-2 text-xs text-fg-2">These get a simple acknowledgment with no tax wording. Check with an accountant on how to handle them.</p>
          </>}
          {type === "cash" && <Field label="Note (optional)" htmlFor="g-desc"><Input id="g-desc" name="description" maxLength={300} defaultValue={gift?.description} placeholder="e.g. Dickens s'mores stand" /></Field>}
          {type !== "other" && (
            <div className="rounded-xl border border-line p-3">
              <Checkbox name="goodsProvided" checked={goods} onChange={(e) => setGoods(e.target.checked)} label="They got something back" description="e.g. a ticket, meal, T-shirt or s'more. Required on the receipt if so." />
              {goods && <div className="mt-2 grid gap-3 sm:grid-cols-[1fr_140px]">
                <Field label="What they received" htmlFor="g-goods"><Input id="g-goods" name="goodsDescription" maxLength={300} defaultValue={gift?.goodsDescription} placeholder="e.g. 2 event tickets" /></Field>
                <Field label="Its fair value" htmlFor="g-goodsval" hint="What it would cost to buy"><Input id="g-goodsval" name="goodsValue" inputMode="decimal" defaultValue={gift?.goodsValue} placeholder="$10" /></Field>
              </div>}
            </div>
          )}
          {events.length > 0 && <Field label="Linked event (optional)" htmlFor="g-event"><Select id="g-event" name="eventId" defaultValue={gift?.eventId ?? ""}><option value="">None</option>{events.map((e) => <option key={e.id} value={e.id}>{e.title}</option>)}</Select></Field>}
          <Field label="Private notes (optional)" htmlFor="g-notes" hint="Only people with donations access see these."><Textarea id="g-notes" name="notes" rows={2} defaultValue={gift?.notes} /></Field>
          <div className="flex justify-end"><SubmitButton>{gift ? "Save changes" : "Save gift"}</SubmitButton></div>
        </ActionForm>
      </Dialog>
    </>
  );
}
