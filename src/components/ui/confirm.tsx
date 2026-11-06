"use client";
import { useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import type { ActionResult } from "@/lib/action";
import { Dialog } from "./dialog";
import { buttonClass } from "./button";
import { useToast } from "./toaster";
import { Loader2 } from "lucide-react";

/** A button that asks for confirmation before running a (usually destructive) server action. */
export function ConfirmAction({
  trigger, title, description, confirmLabel = "Confirm", action, variant = "danger", triggerVariant = "secondary", triggerSize = "sm", requireText,
}: {
  trigger: ReactNode; title: string; description: ReactNode; confirmLabel?: string; action: () => Promise<ActionResult<unknown>>;
  variant?: "danger" | "primary"; triggerVariant?: "secondary" | "ghost" | "danger" | "subtle"; triggerSize?: "sm" | "md"; requireText?: string;
}) {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [pending, start] = useTransition();
  const toast = useToast();
  const router = useRouter();
  return (
    <>
      <button type="button" className={buttonClass(triggerVariant, triggerSize)} onClick={() => setOpen(true)}>{trigger}</button>
      <Dialog open={open} onClose={() => setOpen(false)} title={title} size="sm">
        <div className="text-sm text-fg-2">{description}</div>
        {requireText && (
          <div className="mt-4">
            <label className="label" htmlFor="confirm-text">Type <b>{requireText}</b> to confirm</label>
            <input id="confirm-text" className="input" value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" />
          </div>
        )}
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" className={buttonClass("secondary")} onClick={() => setOpen(false)}>Cancel</button>
          <button type="button" disabled={pending || (!!requireText && typed !== requireText)} className={buttonClass(variant)}
            onClick={() => start(async () => {
              const r = await action();
              if (r.ok) { if (r.message) toast.push("success", r.message); setOpen(false); if (r.redirectTo) router.push(r.redirectTo); else router.refresh(); }
              else toast.push("error", r.error);
            })}>
            {pending && <Loader2 className="h-4 w-4 animate-spin" />}{confirmLabel}
          </button>
        </div>
      </Dialog>
    </>
  );
}
