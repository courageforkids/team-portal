"use client";
import { ActionForm, Field, Input, SubmitButton, Textarea } from "@/components/ui/form";
import { saveMonthlyReportAction } from "@/server/report-actions";

export function ReportForm({ month, v }: { month: string; v: { highlights: string; challenges: string; nextMonth: string; boxesDelivered: number | null; hospitalsServed: number | null; moneyRaised: string } | null }) {
  return (
    <ActionForm action={saveMonthlyReportAction} className="space-y-4">
      <input type="hidden" name="month" value={month} />
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Boxes delivered" htmlFor="r-boxes"><Input id="r-boxes" name="boxesDelivered" type="number" min={0} defaultValue={v?.boxesDelivered ?? ""} /></Field>
        <Field label="Hospitals served" htmlFor="r-hosp"><Input id="r-hosp" name="hospitalsServed" type="number" min={0} defaultValue={v?.hospitalsServed ?? ""} /></Field>
        <Field label="Money raised" htmlFor="r-money" hint="e.g. $450"><Input id="r-money" name="moneyRaised" defaultValue={v?.moneyRaised ?? ""} maxLength={60} /></Field>
      </div>
      <Field label="Highlights" htmlFor="r-hi" hint="Wins this month, one per line."><Textarea id="r-hi" name="highlights" rows={4} defaultValue={v?.highlights} /></Field>
      <Field label="Challenges" htmlFor="r-ch" hint="Optional"><Textarea id="r-ch" name="challenges" rows={3} defaultValue={v?.challenges} /></Field>
      <Field label="Next month" htmlFor="r-next" hint="What's coming up"><Textarea id="r-next" name="nextMonth" rows={3} defaultValue={v?.nextMonth} /></Field>
      <p className="text-xs text-muted">Never include the names, photos or medical details of kids or families we serve.</p>
      <SubmitButton>Save report</SubmitButton>
    </ActionForm>
  );
}
