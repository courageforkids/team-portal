"use client";
import { useState, type ReactNode } from "react";
import { Lock } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { buttonClass } from "@/components/ui/button";
import { ActionForm, Field, Input, Select, SubmitButton, Textarea } from "@/components/ui/form";
import { saveAccountabilityAction } from "@/app/(app)/admin/actions";
import { ACC_STATUSES, ACC_STATUS_LABEL, ACC_TYPES, ACC_TYPE_LABEL, type AccStatus, type AccType } from "./labels";

export type AccRecord = {
  id: string; memberId: string; type: AccType; title: string; details: string; followUpDate: string | null; status: AccStatus; resolution: string;
};

export function PrivateNotice({ className }: { className?: string }) {
  return (
    <p className={`flex items-start gap-2 rounded-lg bg-surface-2 px-3 py-2 text-xs text-muted ${className ?? ""}`}>
      <Lock className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden />
      <span><b className="font-semibold text-fg-2">Private</b> — visible only to Executive Administrators. Members never see these records.</span>
    </p>
  );
}

/** Opens a dialog to create or edit an accountability record. */
export function AccountabilityDialog({
  trigger, record, memberId, members, presetStatus, triggerVariant = "secondary", triggerSize = "sm", title,
}: {
  trigger: ReactNode; record?: AccRecord; memberId?: string; members?: { id: string; name: string }[]; presetStatus?: AccStatus;
  triggerVariant?: "primary" | "secondary" | "ghost" | "subtle"; triggerSize?: "sm" | "md"; title?: string;
}) {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<AccStatus>(presetStatus ?? record?.status ?? "open");
  const fixedMember = record?.memberId ?? memberId;
  const uid = record?.id ?? "new";
  return (
    <>
      <button type="button" className={buttonClass(triggerVariant, triggerSize, "max-md:h-10")} onClick={() => { setStatus(presetStatus ?? record?.status ?? "open"); setOpen(true); }}>
        {trigger}
      </button>
      <Dialog open={open} onClose={() => setOpen(false)} title={title ?? (record ? "Edit record" : "New accountability record")} size="lg">
        <ActionForm action={saveAccountabilityAction} onSuccess={() => setOpen(false)} className="space-y-4">
          <PrivateNotice />
          {record && <input type="hidden" name="id" value={record.id} />}
          {fixedMember ? (
            <input type="hidden" name="memberId" value={fixedMember} />
          ) : (
            <Field label="Team member" htmlFor={`acc-member-${uid}`} required>
              <Select id={`acc-member-${uid}`} name="memberId" required defaultValue="">
                <option value="" disabled>Choose a member…</option>
                {members?.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
              </Select>
            </Field>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Type" htmlFor={`acc-type-${uid}`} required>
              <Select id={`acc-type-${uid}`} name="type" defaultValue={record?.type ?? "coaching_note"}>
                {ACC_TYPES.map((t) => <option key={t} value={t}>{ACC_TYPE_LABEL[t]}</option>)}
              </Select>
            </Field>
            <Field label="Status" htmlFor={`acc-status-${uid}`}>
              <Select id={`acc-status-${uid}`} name="status" defaultValue={status}>
                {ACC_STATUSES.map((s) => <option key={s} value={s}>{ACC_STATUS_LABEL[s]}</option>)}
              </Select>
            </Field>
          </div>
          <Field label="Title" htmlFor={`acc-title-${uid}`} required>
            <Input id={`acc-title-${uid}`} name="title" required maxLength={160} defaultValue={record?.title} placeholder="e.g. Check in about the November newsletter" />
          </Field>
          <Field label="Details" htmlFor={`acc-details-${uid}`} hint="Facts and next steps. Keep it kind and specific.">
            <Textarea id={`acc-details-${uid}`} name="details" rows={4} maxLength={5000} defaultValue={record?.details} />
          </Field>
          <Field label="Follow-up date" htmlFor={`acc-follow-${uid}`} hint="Optional. Shown as a gentle reminder once it passes." className="sm:max-w-xs">
            <Input id={`acc-follow-${uid}`} type="date" name="followUpDate" defaultValue={record?.followUpDate ?? ""} />
          </Field>
          <Field label="Resolution" htmlFor={`acc-res-${uid}`} hint="Required when the status is Resolved — how this was wrapped up.">
            <Textarea id={`acc-res-${uid}`} name="resolution" rows={3} maxLength={5000} defaultValue={record?.resolution} />
          </Field>
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" className={buttonClass("secondary")} onClick={() => setOpen(false)}>Cancel</button>
            <SubmitButton pendingText="Saving…">{record ? "Save changes" : "Save record"}</SubmitButton>
          </div>
        </ActionForm>
      </Dialog>
    </>
  );
}
