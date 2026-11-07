"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, Pencil, Plus, Trash2, BellRing } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { ActionForm, Checkbox, Field, Input, Select, SubmitButton } from "@/components/ui/form";
import { useToast } from "@/components/ui/toaster";
import { deleteOnboardingStepAction, moveOnboardingStepAction, nudgeOnboardingAction, saveOnboardingStepAction } from "@/server/onboarding-actions";

type Step = { id: string; title: string; description: string; kind: string; resourceId: string | null; url: string | null; roles: string[]; active: boolean };

export function StepDialog({ step, resources, trigger }: { step?: Step; resources: { id: string; title: string }[]; trigger: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState(step?.kind ?? "manual");
  return (
    <>
      <span onClick={() => setOpen(true)}>{trigger}</span>
      <Dialog open={open} onClose={() => setOpen(false)} title={step ? "Edit step" : "Add a step"} size="sm">
        <ActionForm action={saveOnboardingStepAction} onSuccess={() => setOpen(false)} className="space-y-4">
          {step && <input type="hidden" name="id" value={step.id} />}
          <Field label="Title" htmlFor="os-title"><Input id="os-title" name="title" defaultValue={step?.title} required maxLength={140} placeholder="e.g. Sign the Team Member Agreement" /></Field>
          <Field label="Details" htmlFor="os-desc" hint="Optional"><Input id="os-desc" name="description" defaultValue={step?.description} maxLength={500} /></Field>
          <Field label="How it's completed" htmlFor="os-kind">
            <Select id="os-kind" name="kind" value={kind} onChange={(e) => setKind(e.target.value)}>
              <option value="manual">Member ticks it</option><option value="resource">Read a resource, then tick</option>
              <option value="photo">Automatic: adds a profile photo</option><option value="notifications">Automatic: turns on phone notifications</option><option value="chat_intro">Automatic: posts in the team chat</option>
            </Select>
          </Field>
          {kind === "resource" && (
            <Field label="Resource" htmlFor="os-res" hint={resources.length ? undefined : "Add the document in Resources first."}>
              <Select id="os-res" name="resourceId" defaultValue={step?.resourceId ?? ""} required><option value="" disabled>Choose</option>{resources.map((r) => <option key={r.id} value={r.id}>{r.title}</option>)}</Select>
            </Field>
          )}
          {kind === "manual" && <Field label="Link" htmlFor="os-url" hint="Optional, e.g. a Google Form"><Input id="os-url" name="url" type="url" defaultValue={step?.url ?? ""} /></Field>}
          <fieldset><legend className="label">Who it's for</legend>
            <div className="flex flex-wrap gap-x-4">{(["leader", "volunteer", "admin"] as const).map((r) => <Checkbox key={r} name="roles" value={r} defaultChecked={step?.roles.includes(r)} label={r === "leader" ? "Leadership" : r === "volunteer" ? "Volunteers" : "Admins"} />)}</div>
            <p className="hint">Leave all unchecked for everyone.</p>
          </fieldset>
          {step && <Checkbox name="inactive" defaultChecked={!step.active} label="Hide this step" />}
          <div className="flex justify-end"><SubmitButton>{step ? "Save" : "Add step"}</SubmitButton></div>
        </ActionForm>
      </Dialog>
    </>
  );
}

export function StepRowActions({ step, resources, first, last }: { step: Step; resources: { id: string; title: string }[]; first: boolean; last: boolean }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  const toast = useToast();
  const run = (fn: () => Promise<{ ok: boolean; message?: string; error?: string }>) => start(async () => { const r = await fn(); if (!r.ok) toast.push("error", r.error ?? ""); else if (r.message) toast.push("success", r.message); router.refresh(); });
  const ic = "rounded-lg p-1.5 text-faint hover:bg-surface-2 hover:text-fg disabled:opacity-30";
  return (
    <div className="flex shrink-0 items-center">
      <button className={ic} aria-label="Move up" disabled={first || pending} onClick={() => run(() => moveOnboardingStepAction(step.id, -1))}><ArrowUp className="h-4 w-4" /></button>
      <button className={ic} aria-label="Move down" disabled={last || pending} onClick={() => run(() => moveOnboardingStepAction(step.id, 1))}><ArrowDown className="h-4 w-4" /></button>
      <StepDialog step={step} resources={resources} trigger={<span className={ic + " inline-block cursor-pointer"} aria-label="Edit"><Pencil className="h-4 w-4" /></span>} />
      <button className={ic + " hover:text-bad"} aria-label="Delete" disabled={pending} onClick={() => { if (window.confirm(`Remove “${step.title}”?`)) run(() => deleteOnboardingStepAction(step.id)); }}><Trash2 className="h-4 w-4" /></button>
    </div>
  );
}


export function NudgeButton({ userId }: { userId: string }) {
  const [pending, start] = useTransition();
  const toast = useToast();
  return <Button size="sm" variant="ghost" disabled={pending} onClick={() => start(async () => { const r = await nudgeOnboardingAction(userId); toast.push(r.ok ? "success" : "error", r.ok ? r.message ?? "" : r.error); })}><BellRing className="h-3.5 w-3.5" />Remind</Button>;
}

export function AddStepButton({ resources }: { resources: { id: string; title: string }[] }) {
  return <StepDialog resources={resources} trigger={<span className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-[10px] bg-brand px-3 text-sm font-semibold text-brand-fg hover:bg-brand-hover"><Plus className="h-4 w-4" />Add step</span>} />;
}
