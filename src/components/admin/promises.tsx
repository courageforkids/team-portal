"use client";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, RotateCcw, Trash2 } from "lucide-react";
import { ActionForm, Field, Input, Textarea, SubmitButton } from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { ConfirmAction } from "@/components/ui/confirm";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toaster";
import { addPromiseAction, deletePromiseAction, setPromiseDoneAction } from "@/server/promise-actions";

export type PromiseRow = { id: string; who: string; what: string; dueDate: string | null; dueLabel: string | null; overdue: boolean; done: boolean };

export function AddPromiseForm() {
  return (
    <ActionForm action={addPromiseAction} resetOnSuccess className="grid gap-3 p-4 sm:grid-cols-[1fr_2fr_auto_auto] sm:items-end sm:px-5">
      <Field label="Who" htmlFor="p-who" required><Input id="p-who" name="who" placeholder="Yaber" maxLength={120} required /></Field>
      <Field label="What we promised" htmlFor="p-what" required><Textarea id="p-what" name="what" rows={1} placeholder="Unboxing reel + tag them in posts" maxLength={500} required /></Field>
      <Field label="By (optional)" htmlFor="p-due"><Input id="p-due" name="due" type="date" /></Field>
      <SubmitButton className="max-md:h-10">Add</SubmitButton>
    </ActionForm>
  );
}

export function PromiseItem({ p }: { p: PromiseRow }) {
  const [busy, start] = useTransition();
  const toast = useToast();
  const router = useRouter();
  const toggle = () => start(async () => {
    const r = await setPromiseDoneAction(p.id, !p.done);
    toast.push(r.ok ? "success" : "error", r.ok ? r.message ?? "" : r.error);
    router.refresh();
  });
  return (
    <li className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:px-5">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className={p.done ? "font-medium text-muted line-through" : "font-medium text-fg"}>{p.who}</span>
          {!p.done && p.dueLabel && <Badge tone={p.overdue ? "amber" : "neutral"}>{p.overdue ? `Was due ${p.dueLabel}` : `By ${p.dueLabel}`}</Badge>}
        </div>
        <p className={p.done ? "mt-0.5 text-sm text-muted line-through" : "mt-0.5 text-sm text-fg-2"}>{p.what}</p>
      </div>
      <div className="flex gap-2">
        <Button type="button" variant={p.done ? "ghost" : "secondary"} size="sm" className="h-10 sm:h-9" disabled={busy} onClick={toggle}>
          {p.done ? <><RotateCcw className="h-4 w-4" aria-hidden />Reopen</> : <><Check className="h-4 w-4" aria-hidden />Done</>}
        </Button>
        <ConfirmAction trigger={<><Trash2 className="h-4 w-4" aria-hidden /><span className="sr-only">Delete</span></>} triggerVariant="ghost"
          title={`Delete this promise to ${p.who}?`} confirmLabel="Delete" description="This can't be undone."
          action={deletePromiseAction.bind(null, p.id)} />
      </div>
    </li>
  );
}
