"use client";
import { useState } from "react";
import { Send } from "lucide-react";
import { ActionForm, Field, Input, Select, SubmitButton } from "@/components/ui/form";
import { Dialog } from "@/components/ui/dialog";
import { inviteAction } from "@/app/(app)/settings/actions";
import { ROLE_LABEL } from "@/lib/task-meta";
import { OneTimeLink } from "./link-action";

export function InviteForm({ departments }: { departments: { id: string; name: string }[] }) {
  const [created, setCreated] = useState<{ link: string; email: string } | null>(null);
  return (
    <>
      <ActionForm action={inviteAction} resetOnSuccess className="space-y-4"
        onSuccess={(r) => { if (r.ok && r.data) setCreated(r.data as { link: string; email: string }); }}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Email" htmlFor="inv-email" required>
            <Input id="inv-email" name="email" type="email" required autoComplete="off" placeholder="name@example.com" maxLength={200} />
          </Field>
          <Field label="Name" htmlFor="inv-name" required>
            <Input id="inv-name" name="name" required autoComplete="off" maxLength={120} placeholder="First and last name" />
          </Field>
          <Field label="Title" htmlFor="inv-title" hint="Optional, e.g. “Media Team Volunteer”.">
            <Input id="inv-title" name="title" maxLength={120} />
          </Field>
          <Field label="Role" htmlFor="inv-role">
            <Select id="inv-role" name="role" defaultValue="volunteer">
              {(["volunteer", "leader", "admin"] as const).map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
            </Select>
          </Field>
          <Field label="Department" htmlFor="inv-dept" className="sm:col-span-2 sm:max-w-[calc(50%-0.5rem)]">
            <Select id="inv-dept" name="departmentId" defaultValue="">
              <option value="">No department</option>
              {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </Select>
          </Field>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-muted">Invitation links expire after 7 days and work once.</p>
          <SubmitButton pendingText="Creating…"><Send className="h-4 w-4" aria-hidden />Create invitation</SubmitButton>
        </div>
      </ActionForm>
      <Dialog open={!!created} onClose={() => setCreated(null)} title="Invitation ready">
        <OneTimeLink link={created?.link ?? ""} onDone={() => setCreated(null)}
          description={<>Send this link to <b>{created?.email}</b> so they can create their account. We also queued it as an email — delivery depends on your email settings.</>} />
      </Dialog>
    </>
  );
}
