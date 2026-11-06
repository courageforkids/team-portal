"use client";
import { useState } from "react";
import { ActionForm, Checkbox, Field, Select, SubmitButton } from "@/components/ui/form";
import { saveRemindersAction } from "@/app/(app)/settings/actions";
import { REMINDER_OPTIONS } from "./palette";

const hourLabel = (h: number) => new Date(Date.UTC(2000, 0, 1, h)).toLocaleTimeString("en-US", { hour: "numeric", timeZone: "UTC" });
const beforeLabel = (h: number) => (h >= 24 && h % 24 === 0 ? `${h / 24} day${h === 24 ? "" : "s"} before` : `${h} hours before`);

export function RemindersForm({ initial, timezones }: {
  initial: { reminderHours: number[]; overdueReminders: boolean; quietOn: boolean; quietHoursStart: number; quietHoursEnd: number; timezone: string };
  timezones: string[];
}) {
  const [quietOn, setQuietOn] = useState(initial.quietOn);
  return (
    <ActionForm action={saveRemindersAction} className="space-y-6">
      <fieldset>
        <legend className="label">Send “due soon” reminders</legend>
        <p className="hint mt-0 mb-2">Pick any combination. Members get each reminder once per deadline.</p>
        <div className="grid gap-1 sm:grid-cols-2">
          {REMINDER_OPTIONS.map((h) => (
            <Checkbox key={h} name="reminderHours" value={h} defaultChecked={initial.reminderHours.includes(h)} label={beforeLabel(h)} />
          ))}
        </div>
      </fieldset>

      <Checkbox name="overdueReminders" defaultChecked={initial.overdueReminders} label="Gentle past-due notice"
        description="One friendly note to the member when a deadline passes (and a heads-up to admins). Never repeated for the same deadline." />

      <div className="space-y-3">
        <Checkbox name="quietOn" checked={quietOn} onChange={(e) => setQuietOn(e.target.checked)} label="Quiet hours"
          description="Reminders wait until quiet hours end — nobody gets pinged late at night." />
        {quietOn && (
          <div className="grid gap-4 pl-7 sm:grid-cols-2 sm:max-w-md">
            <Field label="From" htmlFor="qh-start">
              <Select id="qh-start" name="quietHoursStart" defaultValue={String(initial.quietHoursStart)}>
                {Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{hourLabel(h)}</option>)}
              </Select>
            </Field>
            <Field label="Until" htmlFor="qh-end">
              <Select id="qh-end" name="quietHoursEnd" defaultValue={String(initial.quietHoursEnd)}>
                {Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{hourLabel(h)}</option>)}
              </Select>
            </Field>
          </div>
        )}
      </div>

      <Field label="Organization time zone" htmlFor="org-tz" hint="Used for quiet hours, weekly and monthly reports." className="sm:max-w-xs">
        <Select id="org-tz" name="timezone" defaultValue={initial.timezone}>
          {timezones.map((t) => <option key={t} value={t}>{t.replace("_", " ")}</option>)}
        </Select>
      </Field>

      <div className="flex justify-end"><SubmitButton pendingText="Saving…">Save reminder settings</SubmitButton></div>
    </ActionForm>
  );
}
