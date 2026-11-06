"use client";
import { ActionForm, Field, Input, SubmitButton } from "@/components/ui/form";
import { acceptInviteAction } from "../../actions";
export function InviteForm({ token, name }: { token: string; name: string }) {
  return (
    <ActionForm action={acceptInviteAction} className="space-y-4">
      <input type="hidden" name="token" value={token} />
      <Field label="Your name" htmlFor="name"><Input id="name" name="name" defaultValue={name} autoComplete="name" required /></Field>
      <Field label="Create a password" htmlFor="password" hint="At least 10 characters, with a number or symbol."><Input id="password" name="password" type="password" autoComplete="new-password" required minLength={10} /></Field>
      <Field label="Confirm password" htmlFor="confirm"><Input id="confirm" name="confirm" type="password" autoComplete="new-password" required /></Field>
      <SubmitButton className="w-full" size="lg" pendingText="Creating your account…">Create account</SubmitButton>
    </ActionForm>
  );
}
