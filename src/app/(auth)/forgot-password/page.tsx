"use client";
import Link from "next/link";
import { ActionForm, Field, Input, SubmitButton } from "@/components/ui/form";
import { requestResetAction } from "../actions";

export default function ForgotPage() {
  return (
    <>
      <h1 className="text-lg font-bold">Reset your password</h1>
      <p className="mb-5 text-sm text-muted">Enter the email your invitation was sent to.</p>
      <ActionForm action={requestResetAction} className="space-y-4">
        {(s) => s?.ok ? (
          <p role="status" className="rounded-lg bg-ok-soft px-3 py-3 text-sm text-ok">{s.message}</p>
        ) : (<>
          <Field label="Email" htmlFor="email"><Input id="email" name="email" type="email" autoComplete="email" required autoFocus /></Field>
          <SubmitButton className="w-full" size="lg" pendingText="Sending…">Send reset link</SubmitButton>
        </>)}
      </ActionForm>
      <div className="mt-5 text-center text-sm"><Link href="/login" className="font-semibold text-brand-ink hover:underline">Back to sign in</Link></div>
    </>
  );
}
