"use client";
import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/cn";
import { ReviewPanel } from "./task-panels";

/** Collapsible review card so many submissions can be processed on one page. */
export function ReviewItem({ id, header, children, defaultOpen }: { id: string; header: React.ReactNode; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(!!defaultOpen);
  const [done, setDone] = useState(false);
  if (done) return null;
  return (
    <li id={`review-${id}`} className={cn("card overflow-hidden transition", open && "shadow-card ring-1 ring-brand/20")}>
      <button onClick={() => setOpen((o) => !o)} aria-expanded={open} className="focus-ring flex w-full items-center gap-3 px-4 py-3.5 text-left hover:bg-surface-2 sm:px-5">
        <div className="min-w-0 flex-1">{header}</div>
        <ChevronDown className={cn("h-5 w-5 shrink-0 text-muted transition", open && "rotate-180")} />
      </button>
      {open && (
        <div className="animate-in border-t border-line px-4 py-4 sm:px-5">
          {children}
          <div className="mt-4 border-t border-line pt-4"><ReviewPanel taskId={id} compact onDone={() => setDone(true)} /></div>
        </div>
      )}
    </li>
  );
}
