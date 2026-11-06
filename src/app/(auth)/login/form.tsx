"use client";
import { ActionForm, Field, Input, SubmitButton } from "@/components/ui/form";
import { signInAction } from "../actions";

export function LoginForm({ next }: { next: string }) {
  return (
    <ActionForm action={signInAction} className="space-y-4">
      <input type="hidden" name="next" value={next} />
      <Field label="Email" htmlFor="email"><Input id="email" name="email" type="email" autoComplete="email" inputMode="email" required autoFocus /></Field>
      <Field label="Password" htmlFor="password"><Input id="password" name="password" type="password" autoComplete="current-password" required /></Field>
      <SubmitButton className="w-full" size="lg" pendingText="Signing in…">Sign in</SubmitButton>
    </ActionForm>
  );
}
