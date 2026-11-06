"use client";
import { useState, type ReactNode } from "react";
import { Dialog } from "@/components/ui/dialog";
import { buttonClass } from "@/components/ui/button";
import { ActionForm, Field, Input, Select, SubmitButton, Textarea } from "@/components/ui/form";
import { saveDepartmentAction } from "@/app/(app)/settings/actions";
import { ColorPicker } from "./color-picker";

export type DeptValues = { id: string; name: string; slug: string; description: string; color: string; leadId: string | null };

export function DepartmentDialog({ dept, people, trigger, triggerVariant = "secondary", triggerSize = "sm" }: {
  dept?: DeptValues; people: { id: string; name: string }[]; trigger: ReactNode; triggerVariant?: "primary" | "secondary"; triggerSize?: "sm" | "md";
}) {
  const [open, setOpen] = useState(false);
  const p = `d-${dept?.id ?? "new"}`;
  return (
    <>
      <button type="button" className={buttonClass(triggerVariant, triggerSize, "max-md:h-10")} onClick={() => setOpen(true)}>{trigger}</button>
      <Dialog open={open} onClose={() => setOpen(false)} title={dept ? `Edit ${dept.name}` : "New department"}>
        <ActionForm action={saveDepartmentAction} onSuccess={() => setOpen(false)} className="space-y-4">
          {dept && <input type="hidden" name="id" value={dept.id} />}
          <Field label="Name" htmlFor={`${p}-name`} required hint={dept ? `Link name: ${dept.slug} (updates automatically if you rename it).` : "A short link name is created from the name automatically."}>
            <Input id={`${p}-name`} name="name" required maxLength={80} defaultValue={dept?.name} />
          </Field>
          <Field label="Description" htmlFor={`${p}-desc`}>
            <Textarea id={`${p}-desc`} name="description" rows={3} maxLength={500} defaultValue={dept?.description} />
          </Field>
          <Field label="Department lead" htmlFor={`${p}-lead`} hint="Leads can see and follow the department's tasks.">
            <Select id={`${p}-lead`} name="leadId" defaultValue={dept?.leadId ?? ""}>
              <option value="">No lead</option>
              {people.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </Select>
          </Field>
          <ColorPicker name="color" defaultValue={dept?.color} />
          <div className="flex justify-end gap-2">
            <button type="button" className={buttonClass("secondary")} onClick={() => setOpen(false)}>Cancel</button>
            <SubmitButton pendingText="Saving…">{dept ? "Save changes" : "Create department"}</SubmitButton>
          </div>
        </ActionForm>
      </Dialog>
    </>
  );
}
