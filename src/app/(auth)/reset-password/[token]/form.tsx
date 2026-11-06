"use client";
import { ActionForm, Field, Input, SubmitButton } from "@/components/ui/form";
import { resetPasswordAction } from "../../actions";
export function ResetForm({ token }: { token: string }) {
  return (
    <ActionForm action={resetPasswordAction} className="space-y-4">
      <input type="hidden" name="token" value={token} />
      <Field label="New password" htmlFor="password" hint="At least 10 characters, with a number or symbol."><Input id="password" name="password" type="password" autoComplete="new-password" required minLength={10} /></Field>
      <Field label="Confirm password" htmlFor="confirm"><Input id="confirm" name="confirm" type="password" autoComplete="new-password" required /></Field>
      <SubmitButton className="w-full" size="lg" pendingText="Saving…">Update password</SubmitButton>
    </ActionForm>
  );
}
