"use client";
import { useState, type ReactNode } from "react";
import { Dialog } from "@/components/ui/dialog";
import { buttonClass } from "@/components/ui/button";
import { ActionForm, Field, Input, SubmitButton } from "@/components/ui/form";
import { saveCategoryAction } from "@/app/(app)/settings/actions";
import { ColorPicker } from "./color-picker";

export function CategoryDialog({ cat, trigger, triggerVariant = "secondary", triggerSize = "sm" }: {
  cat?: { id: string; name: string; color: string }; trigger: ReactNode; triggerVariant?: "primary" | "secondary"; triggerSize?: "sm" | "md";
}) {
  const [open, setOpen] = useState(false);
  const p = `c-${cat?.id ?? "new"}`;
  return (
    <>
      <button type="button" className={buttonClass(triggerVariant, triggerSize, "max-md:h-10")} onClick={() => setOpen(true)}>{trigger}</button>
      <Dialog open={open} onClose={() => setOpen(false)} title={cat ? "Edit category" : "New category"} size="sm">
        <ActionForm action={saveCategoryAction} onSuccess={() => setOpen(false)} className="space-y-4">
          {cat && <input type="hidden" name="id" value={cat.id} />}
          <Field label="Name" htmlFor={`${p}-name`} required>
            <Input id={`${p}-name`} name="name" required maxLength={60} defaultValue={cat?.name} placeholder="e.g. Social media" />
          </Field>
          <ColorPicker name="color" defaultValue={cat?.color} />
          <div className="flex justify-end gap-2">
            <button type="button" className={buttonClass("secondary")} onClick={() => setOpen(false)}>Cancel</button>
            <SubmitButton pendingText="Saving…">{cat ? "Save" : "Add category"}</SubmitButton>
          </div>
        </ActionForm>
      </Dialog>
    </>
  );
}
