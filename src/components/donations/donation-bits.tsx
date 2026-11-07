"use client";
import { useState } from "react";
import { Pencil, Trash2 } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { ActionForm, Checkbox, Field, Input, Select, SubmitButton, Textarea } from "@/components/ui/form";
import { buttonClass } from "@/components/ui/button";
import { ConfirmAction } from "@/components/ui/confirm";
import { deleteDonorAction, deleteGiftAction, saveDonorAction, saveReceiptSettingsAction } from "@/server/donation-actions";
import { DONOR_KIND_LABEL } from "@/lib/money";

export function DonorEditButton({ d }: { d: { id: string; name: string; kind: string; email: string; phone: string; address: string; notes: string } }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className={buttonClass("secondary", "sm")} onClick={() => setOpen(true)}><Pencil className="h-3.5 w-3.5" />Edit donor</button>
      <Dialog open={open} onClose={() => setOpen(false)} title="Edit donor" size="sm">
        <ActionForm action={saveDonorAction} onSuccess={() => setOpen(false)} className="space-y-4">
          <input type="hidden" name="id" value={d.id} />
          <Field label="Name" htmlFor="d-name" hint="As it should appear on receipts"><Input id="d-name" name="name" required maxLength={140} defaultValue={d.name} /></Field>
          <Field label="Type" htmlFor="d-kind"><Select id="d-kind" name="kind" defaultValue={d.kind}>{Object.entries(DONOR_KIND_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Email" htmlFor="d-email"><Input id="d-email" name="email" type="email" defaultValue={d.email} /></Field>
            <Field label="Phone" htmlFor="d-phone"><Input id="d-phone" name="phone" defaultValue={d.phone} /></Field>
          </div>
          <Field label="Mailing address" htmlFor="d-addr" hint="Printed on receipts. Optional."><Textarea id="d-addr" name="address" rows={2} defaultValue={d.address} /></Field>
          <Field label="Private notes" htmlFor="d-notes"><Textarea id="d-notes" name="notes" rows={2} defaultValue={d.notes} /></Field>
          <div className="flex justify-end"><SubmitButton>Save</SubmitButton></div>
        </ActionForm>
      </Dialog>
    </>
  );
}

export function DeleteGiftButton({ id, number }: { id: string; number: string }) {
  return <ConfirmAction trigger={<><Trash2 className="h-3.5 w-3.5" /><span className="sr-only">Delete gift {number}</span></>} triggerVariant="ghost" title={`Delete gift ${number}?`}
    description="Only do this if it was logged by mistake. If a receipt was already sent, keep the gift and fix it instead." confirmLabel="Delete" action={() => deleteGiftAction(id)} />;
}

export function DeleteDonorButton({ id }: { id: string }) {
  return <ConfirmAction trigger={<><Trash2 className="h-3.5 w-3.5" />Remove donor</>} triggerVariant="ghost" title="Remove this donor?" description="Only donors with no gifts logged can be removed." confirmLabel="Remove" action={() => deleteDonorAction(id)} />;
}

export function ReceiptSettingsForm({ s, people }: { s: { address: string; signerName: string; signerTitle: string; managerIds: string[] }; people: { id: string; name: string; title: string; role: string }[] }) {
  return (
    <ActionForm action={saveReceiptSettingsAction} className="space-y-4">
      <Field label="Mailing address on receipts" htmlFor="rs-addr" hint="Optional. A P.O. box is fine."><Textarea id="rs-addr" name="address" rows={2} defaultValue={s.address} /></Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Signed by" htmlFor="rs-name"><Input id="rs-name" name="signerName" defaultValue={s.signerName} /></Field>
        <Field label="Their title" htmlFor="rs-title"><Input id="rs-title" name="signerTitle" defaultValue={s.signerTitle} /></Field>
      </div>
      <fieldset>
        <legend className="label">Who else can log gifts and make receipts</legend>
        <p className="mb-1 text-xs text-muted">Admins always can. Gift amounts are private, so only add people who need them.</p>
        {people.filter((p) => p.role !== "admin").map((p) => <Checkbox key={p.id} name="managers" value={p.id} defaultChecked={s.managerIds.includes(p.id)} label={p.name} description={p.title} />)}
      </fieldset>
      <SubmitButton>Save receipt settings</SubmitButton>
    </ActionForm>
  );
}
