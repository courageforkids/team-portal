"use client";
import { useState } from "react";
import { KeyRound } from "lucide-react";
import { ActionForm, Field, Input, Select, SubmitButton } from "@/components/ui/form";
import { CopyField } from "./copy-field";
import { createApiKeyAction } from "@/server/api-key-actions";

export function ApiKeyForm() {
  const [key, setKey] = useState<string | null>(null);
  if (key) return (
    <div className="space-y-3">
      <CopyField value={key} label="Your new key" />
      <div className="rounded-lg bg-warn-soft px-3 py-2 text-sm text-warn"><b>Copy it now. It won't be shown again.</b> Store it as a secret named <code className="font-mono">PORTAL_API_KEY</code> in the Claude app's environment settings. Never paste it into a chat.</div>
      <button onClick={() => setKey(null)} className="text-sm font-semibold text-brand-ink hover:underline">Done</button>
    </div>
  );
  return (
    <ActionForm action={createApiKeyAction} onSuccess={(r) => { const d = (r as { data?: { key?: string } }).data; if (d?.key) setKey(d.key); }} className="space-y-4">
      <Field label="Name" htmlFor="ak-name" hint="So you can tell keys apart."><Input id="ak-name" name="name" defaultValue="Claude" maxLength={60} /></Field>
      <Field label="Expires" htmlFor="ak-exp">
        <Select id="ak-exp" name="expiresInDays" defaultValue="365"><option value="30">In 30 days</option><option value="90">In 90 days</option><option value="365">In 1 year</option><option value="0">Never</option></Select>
      </Field>
      <SubmitButton><KeyRound className="h-4 w-4" />Create key</SubmitButton>
    </ActionForm>
  );
}
