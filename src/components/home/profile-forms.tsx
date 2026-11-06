"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Camera, Trash2 } from "lucide-react";
import { ActionForm, Checkbox, Field, Input, Select, SubmitButton } from "@/components/ui/form";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toaster";
import { changePasswordAction, removeAvatarAction, updateAvatarAction, updatePrefsAction, updateProfileAction } from "@/server/profile-actions";
import { TIMEZONES } from "@/lib/dates";

export function AvatarForm({ name, fileId }: { name: string; fileId: string | null }) {
  const [, start] = useTransition();
  const router = useRouter();
  const toast = useToast();
  return (
    <div className="flex items-center gap-4">
      <Avatar name={name} fileId={fileId} size={64} />
      <ActionForm action={updateAvatarAction} showErrorInline={false}>
        {() => (
          <div className="flex flex-wrap gap-2">
            <label className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-[10px] border border-line-strong bg-surface px-3 text-sm font-semibold hover:bg-surface-2">
              <Camera className="h-4 w-4" />{fileId ? "Change photo" : "Add photo"}
              <input type="file" name="avatar" accept="image/png,image/jpeg,image/webp,image/gif" className="sr-only"
                onChange={(e) => { if (e.target.files?.length) e.currentTarget.form?.requestSubmit(); }} />
            </label>
            {fileId && <Button type="button" variant="ghost" size="sm" className="h-9" onClick={() => start(async () => { const r = await removeAvatarAction(); toast.push(r.ok ? "success" : "error", r.ok ? r.message ?? "" : r.error); router.refresh(); })}><Trash2 className="h-4 w-4" />Remove</Button>}
          </div>
        )}
      </ActionForm>
    </div>
  );
}

export function ProfileForm({ name, email, timezone, showEmail }: { name: string; email: string; timezone: string; showEmail: boolean }) {
  return (
    <ActionForm action={updateProfileAction} className="grid gap-4 sm:grid-cols-2">
      <Field label="Name" htmlFor="pname"><Input id="pname" name="name" defaultValue={name} required autoComplete="name" /></Field>
      <Field label="Email" htmlFor="pemail" hint="Ask an administrator to change your sign-in email."><Input id="pemail" value={email} disabled readOnly /></Field>
      <Field label="Time zone" htmlFor="ptz"><Select id="ptz" name="timezone" defaultValue={timezone}>{TIMEZONES.map((z) => <option key={z} value={z}>{z.replace("America/", "").replace("_", " ")}</option>)}</Select></Field>
      <div className="sm:pt-6"><Checkbox name="showEmail" defaultChecked={showEmail} label="Show my email in the team directory" description="Only signed-in team members can see the directory." /></div>
      <div className="sm:col-span-2"><SubmitButton>Save profile</SubmitButton></div>
    </ActionForm>
  );
}

export function PasswordForm() {
  return (
    <ActionForm action={changePasswordAction} resetOnSuccess className="space-y-3">
      <Field label="Current password" htmlFor="cur"><Input id="cur" name="current" type="password" autoComplete="current-password" required /></Field>
      <Field label="New password" htmlFor="np" hint="At least 10 characters, with a number or symbol."><Input id="np" name="password" type="password" autoComplete="new-password" required minLength={10} /></Field>
      <Field label="Confirm new password" htmlFor="cp"><Input id="cp" name="confirm" type="password" autoComplete="new-password" required /></Field>
      <SubmitButton variant="secondary">Change password</SubmitButton>
    </ActionForm>
  );
}

type Prefs = { announcements: boolean; deadlineReminders: boolean; emailAssignments: boolean; emailReminders: boolean; emailAnnouncements: boolean; emailReviews: boolean };
export function PrefsForm({ prefs, emailEnabled }: { prefs: Prefs; emailEnabled: boolean }) {
  const [p] = useState(prefs);
  return (
    <ActionForm action={updatePrefsAction} className="space-y-5">
      <fieldset>
        <legend className="eyebrow mb-2">In the portal</legend>
        <Checkbox name="announcements" defaultChecked={p.announcements} label="New announcements" />
        <Checkbox name="deadlineReminders" defaultChecked={p.deadlineReminders} label="Deadline reminders" description="A heads-up before something is due." />
      </fieldset>
      <fieldset>
        <legend className="eyebrow mb-1">By email</legend>
        {!emailEnabled && <p className="mb-2 text-xs text-muted">Email delivery is currently turned off for the organization. Your choices are saved for when it's turned on.</p>}
        <Checkbox name="emailAssignments" defaultChecked={p.emailAssignments} label="New assignments" />
        <Checkbox name="emailReviews" defaultChecked={p.emailReviews} label="Reviews of my work" />
        <Checkbox name="emailReminders" defaultChecked={p.emailReminders} label="Deadline reminders" />
        <Checkbox name="emailAnnouncements" defaultChecked={p.emailAnnouncements} label="Announcements" />
      </fieldset>
      <SubmitButton variant="secondary">Save preferences</SubmitButton>
    </ActionForm>
  );
}
