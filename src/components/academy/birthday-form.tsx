"use client";
import { ActionForm, Field, Select, SubmitButton } from "@/components/ui/form";
import { saveBirthdayAction } from "@/server/academy-actions";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export function BirthdayForm({ value }: { value: string | null }) {
  const [m, d] = value ? value.split("-").map(Number) : [0, 0];
  return (
    <ActionForm action={saveBirthdayAction} className="flex flex-wrap items-end gap-3">
      <Field label="Month" htmlFor="bd-m"><Select id="bd-m" name="month" defaultValue={m ? String(m) : ""}><option value="">—</option>{MONTHS.map((x, i) => <option key={x} value={i + 1}>{x}</option>)}</Select></Field>
      <Field label="Day" htmlFor="bd-d"><Select id="bd-d" name="day" defaultValue={d ? String(d) : ""}><option value="">—</option>{Array.from({ length: 31 }, (_, i) => <option key={i} value={i + 1}>{i + 1}</option>)}</Select></Field>
      <SubmitButton variant="secondary">Save</SubmitButton>
    </ActionForm>
  );
}
