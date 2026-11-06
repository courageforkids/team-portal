"use client";
import { useState } from "react";
import { Pencil } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { buttonClass } from "@/components/ui/button";
import { ActionForm, Field, Input, Select, SubmitButton, Textarea } from "@/components/ui/form";
import { updateMemberAction } from "@/app/(app)/settings/actions";
import { ROLE_LABEL } from "@/lib/task-meta";

export type EditableMember = {
  id: string; name: string; email: string; role: "admin" | "leader" | "volunteer"; title: string; departmentId: string | null; responsibilities: string;
};

export function EditMemberDialog({ member, departments, isSelf }: { member: EditableMember; departments: { id: string; name: string }[]; isSelf: boolean }) {
  const [open, setOpen] = useState(false);
  const p = `m-${member.id}`;
  return (
    <>
      <button type="button" className={buttonClass("secondary", "sm", "max-md:h-10")} onClick={() => setOpen(true)} aria-label={`Edit ${member.name}`}>
        <Pencil className="h-3.5 w-3.5" aria-hidden />Edit
      </button>
      <Dialog open={open} onClose={() => setOpen(false)} title={`Edit ${member.name}`} description={member.email}>
        <ActionForm action={updateMemberAction} onSuccess={() => setOpen(false)} className="space-y-4">
          <input type="hidden" name="id" value={member.id} />
          <Field label="Role" htmlFor={`${p}-role`} hint={isSelf ? "You can't change your own role." : "Admins can manage everything. Leaders can review work they're assigned to."}>
            {isSelf && <input type="hidden" name="role" value={member.role} />}
            <Select id={`${p}-role`} name={isSelf ? undefined : "role"} defaultValue={member.role} disabled={isSelf}>
              {(["admin", "leader", "volunteer"] as const).map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
            </Select>
          </Field>
          <Field label="Title" htmlFor={`${p}-title`} hint="Shown under their name, e.g. “Director of Media”.">
            <Input id={`${p}-title`} name="title" maxLength={120} defaultValue={member.title} />
          </Field>
          <Field label="Department" htmlFor={`${p}-dept`}>
            <Select id={`${p}-dept`} name="departmentId" defaultValue={member.departmentId ?? ""}>
              <option value="">No department</option>
              {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </Select>
          </Field>
          <Field label="Responsibilities" htmlFor={`${p}-resp`} hint="Optional. What they're responsible for on the team.">
            <Textarea id={`${p}-resp`} name="responsibilities" rows={3} maxLength={2000} defaultValue={member.responsibilities} />
          </Field>
          <div className="flex justify-end gap-2">
            <button type="button" className={buttonClass("secondary")} onClick={() => setOpen(false)}>Cancel</button>
            <SubmitButton pendingText="Saving…">Save changes</SubmitButton>
          </div>
        </ActionForm>
      </Dialog>
    </>
  );
}
