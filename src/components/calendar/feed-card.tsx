"use client";
import { useRef, useState, useTransition } from "react";
import { Check, Copy, Link2, Loader2, RotateCcw, Rss } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button, buttonClass } from "@/components/ui/button";
import { ConfirmAction } from "@/components/ui/confirm";
import { useToast } from "@/components/ui/toaster";
import { cn } from "@/lib/cn";
import { regenerateCalendarFeedAction } from "@/server/calendar";

/**
 * Private calendar subscription link (Google / Apple Calendar).
 * `embedded` drops the card chrome for use inside a dialog or another card.
 */
export function CalendarFeedCard({ initialUrl, embedded }: { initialUrl: string | null; embedded?: boolean }) {
  const [url, setUrl] = useState(initialUrl);
  const [copied, setCopied] = useState(false);
  const [pending, start] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);
  const toast = useToast();

  const create = () => start(async () => {
    const r = await regenerateCalendarFeedAction();
    if (r.ok && r.data) { setUrl(r.data.url); toast.push("success", r.message ?? "Link ready."); }
    else if (!r.ok) toast.push("error", r.error);
  });

  const copy = async () => {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      inputRef.current?.select();
      document.execCommand?.("copy");
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const webcal = url?.replace(/^https?:/, "webcal:");

  const body = (
    <div className="space-y-4">
      <div className="flex items-start gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-brand-soft text-brand-ink"><Rss className="h-4 w-4" aria-hidden /></span>
        <div className="min-w-0">
          <h3 className="text-[15px] font-semibold text-fg">Subscribe in your calendar app</h3>
          <p className="mt-0.5 text-[13px] text-muted">Team events and your task deadlines, kept up to date in Google or Apple Calendar.</p>
        </div>
      </div>

      {url ? (
        <>
          <div className="flex flex-col gap-2 sm:flex-row">
            <label htmlFor="cal-feed-url" className="sr-only">Your calendar link</label>
            <input id="cal-feed-url" ref={inputRef} readOnly value={url} onFocus={(e) => e.currentTarget.select()}
              className="input min-w-0 flex-1 font-mono text-[12.5px] text-fg-2" />
            <Button type="button" variant="primary" onClick={copy} className="sm:w-28" aria-live="polite">
              {copied ? <><Check className="h-4 w-4" aria-hidden />Copied</> : <><Copy className="h-4 w-4" aria-hidden />Copy</>}
            </Button>
          </div>
          <div className="grid gap-3 text-[13px] text-fg-2 sm:grid-cols-2">
            <div className="rounded-xl bg-surface-2 p-3">
              <p className="font-semibold text-fg">Google Calendar</p>
              <p className="mt-1 text-muted">On a computer, open Google Calendar → <b className="font-medium text-fg-2">Other calendars</b> <b className="font-medium text-fg-2">+</b> → <b className="font-medium text-fg-2">From URL</b>, paste the link, then <b className="font-medium text-fg-2">Add calendar</b>.</p>
            </div>
            <div className="rounded-xl bg-surface-2 p-3">
              <p className="font-semibold text-fg">Apple Calendar</p>
              <p className="mt-1 text-muted">
                On iPhone or Mac, <a href={webcal} className="font-medium text-brand-ink underline underline-offset-2">open the link in Calendar</a>. Or on iPhone: Settings → Apps → Calendar → Calendar Accounts → Add Account → Other → <b className="font-medium text-fg-2">Add Subscribed Calendar</b>.
              </p>
            </div>
          </div>
          <div className="flex flex-col gap-3 border-t border-line pt-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-muted">Keep this link private — anyone who has it can see your calendar. Apps refresh it every few hours.</p>
            <ConfirmAction
              trigger={<><RotateCcw className="h-4 w-4" aria-hidden />Reset link</>}
              triggerVariant="ghost"
              title="Reset your calendar link?"
              description="Calendars subscribed with the current link will stop updating. You'll get a new link to add again."
              confirmLabel="Reset link"
              action={async () => {
                const r = await regenerateCalendarFeedAction();
                if (r.ok && r.data) setUrl(r.data.url);
                return r;
              }}
            />
          </div>
        </>
      ) : (
        <div className="flex flex-col gap-3 rounded-xl border border-dashed border-line-strong p-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-muted">Create a private link to add your portal calendar to another app.</p>
          <button type="button" onClick={create} disabled={pending} className={cn(buttonClass("primary"), "shrink-0")}>
            {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Link2 className="h-4 w-4" aria-hidden />}Create link
          </button>
        </div>
      )}
    </div>
  );

  return embedded ? body : <Card className="p-5">{body}</Card>;
}
