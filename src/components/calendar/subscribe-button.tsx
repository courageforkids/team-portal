"use client";
import { useState } from "react";
import { Download, Rss } from "lucide-react";
import { Button, buttonClass } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { CalendarFeedCard } from "./feed-card";

export function SubscribeButton({ feedUrl }: { feedUrl: string | null }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button type="button" variant="secondary" onClick={() => setOpen(true)} aria-haspopup="dialog"><Rss className="h-4 w-4" aria-hidden />Subscribe</Button>
      <Dialog open={open} onClose={() => setOpen(false)} title="Take your calendar with you" size="lg">
        <CalendarFeedCard initialUrl={feedUrl} embedded />
        <div className="mt-5 flex flex-col gap-3 border-t border-line pt-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold text-fg">One-time download</p>
            <p className="text-[13px] text-muted">An .ics file of the next 6 months. It won&apos;t update on its own.</p>
          </div>
          <a href="/api/calendar/export" download className={buttonClass("secondary", "md", "shrink-0")}><Download className="h-4 w-4" aria-hidden />Download .ics</a>
        </div>
      </Dialog>
    </>
  );
}
