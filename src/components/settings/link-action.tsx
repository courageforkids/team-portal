"use client";
import { useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import type { ActionResult } from "@/lib/action";
import { Dialog } from "@/components/ui/dialog";
import { buttonClass } from "@/components/ui/button";
import { useToast } from "@/components/ui/toaster";
import { CopyField } from "./copy-field";

/** Runs a server action that returns a one-time link, then shows it once with a Copy button. */
export function LinkActionButton({ action, trigger, title, description, triggerVariant = "secondary" }: {
  action: () => Promise<ActionResult<{ link: string }>>; trigger: ReactNode; title: string; description: ReactNode;
  triggerVariant?: "secondary" | "ghost" | "subtle";
}) {
  const [link, setLink] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const toast = useToast();
  const router = useRouter();
  return (
    <>
      <button type="button" disabled={pending} className={buttonClass(triggerVariant, "sm", "max-md:h-10")}
        onClick={() => start(async () => {
          const r = await action();
          if (r.ok && r.data) { setLink(r.data.link); router.refresh(); }
          else if (!r.ok) toast.push("error", r.error);
        })}>
        {pending && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />}{trigger}
      </button>
      <Dialog open={!!link} onClose={() => setLink(null)} title={title} size="md">
        <OneTimeLink link={link ?? ""} description={description} onDone={() => setLink(null)} />
      </Dialog>
    </>
  );
}

export function OneTimeLink({ link, description, onDone }: { link: string; description: ReactNode; onDone?: () => void }) {
  return (
    <div className="space-y-4">
      <div className="text-sm text-fg-2">{description}</div>
      <CopyField value={link} />
      <p className="rounded-lg bg-accent-soft px-3 py-2 text-xs text-fg-2">
        <b className="font-semibold text-fg">Shown once.</b> Copy it now and share it privately (text or DM). Anyone with this link can use it. A copy is also kept in Settings → Email → Outbox.
      </p>
      {onDone && <div className="flex justify-end"><button type="button" className={buttonClass("secondary")} onClick={onDone}>Done</button></div>}
    </div>
  );
}
