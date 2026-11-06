"use client";
import { useState } from "react";
import { Eye } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { buttonClass } from "@/components/ui/button";
import { CopyField } from "./copy-field";

export type OutboxMessage = { id: string; toEmail: string; subject: string; body: string; status: string; error: string | null; created: string; sent: string | null };
const TONE = { held: "neutral", sent: "green", failed: "red", skipped: "muted" } as const;
const LABEL: Record<string, string> = { held: "Held", sent: "Sent", failed: "Failed", skipped: "Skipped" };

export function OutboxStatus({ status }: { status: string }) {
  return <Badge tone={TONE[status as keyof typeof TONE] ?? "neutral"} dot>{LABEL[status] ?? status}</Badge>;
}

export function OutboxDialog({ msg }: { msg: OutboxMessage }) {
  const [open, setOpen] = useState(false);
  const links = [...new Set(msg.body.match(/https?:\/\/[^\s)>\]]+/g) ?? [])];
  return (
    <>
      <button type="button" className={buttonClass("secondary", "sm", "max-md:h-10")} onClick={() => setOpen(true)} aria-label={`View email to ${msg.toEmail}: ${msg.subject}`}>
        <Eye className="h-3.5 w-3.5" aria-hidden />View
      </button>
      <Dialog open={open} onClose={() => setOpen(false)} title={msg.subject} size="lg">
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
          <dt className="text-muted">To</dt><dd className="break-all text-fg">{msg.toEmail}</dd>
          <dt className="text-muted">Status</dt><dd><OutboxStatus status={msg.status} />{msg.error && <span className="ml-2 text-xs text-bad">{msg.error}</span>}</dd>
          <dt className="text-muted">Queued</dt><dd className="text-fg-2">{msg.created}</dd>
          {msg.sent && <><dt className="text-muted">Sent</dt><dd className="text-fg-2">{msg.sent}</dd></>}
        </dl>
        <pre className="prose-body mt-4 max-h-[40vh] overflow-y-auto rounded-xl border border-line bg-surface-2 p-4 font-sans text-sm text-fg-2">{msg.body}</pre>
        {links.length > 0 && (
          <div className="mt-4 space-y-3">
            {links.map((l, i) => <CopyField key={l} value={l} label={links.length > 1 ? `Link ${i + 1}` : "Link in this message"} />)}
            <p className="text-xs text-muted">Invitation and reset links may have expired or been replaced since this was queued.</p>
          </div>
        )}
      </Dialog>
    </>
  );
}
