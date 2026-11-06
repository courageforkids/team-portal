"use client";
import { useId, useRef, useState } from "react";
import { Check, Copy } from "lucide-react";
import { buttonClass } from "@/components/ui/button";

/** Read-only value with a Copy button. Falls back to selecting the text if the clipboard API is unavailable. */
export function CopyField({ value, label = "Link" }: { value: string; label?: string }) {
  const id = useId();
  const ref = useRef<HTMLInputElement>(null);
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      ref.current?.select();
    }
  }
  return (
    <div>
      <label htmlFor={id} className="label">{label}</label>
      <div className="flex gap-2">
        <input ref={ref} id={id} readOnly value={value} onFocus={(e) => e.currentTarget.select()} className="input min-w-0 flex-1 font-mono text-[13px]" data-testid="copy-value" />
        <button type="button" onClick={copy} className={buttonClass(copied ? "secondary" : "primary", "md", "shrink-0")} aria-live="polite">
          {copied ? <><Check className="h-4 w-4" aria-hidden />Copied</> : <><Copy className="h-4 w-4" aria-hidden />Copy</>}
        </button>
      </div>
    </div>
  );
}
