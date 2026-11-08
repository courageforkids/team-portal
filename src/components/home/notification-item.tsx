"use client";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Bell, CheckSquare, CheckCircle2, RotateCcw, CalendarClock, Clock3, AlertTriangle, Megaphone, Send, ShieldAlert, MessageSquare, CheckCheck, AtSign } from "lucide-react";
import { cn } from "@/lib/cn";
import { ago } from "@/lib/dates";
import { markAllReadAction, markNotificationReadAction } from "@/server/home-actions";
import { buttonClass } from "@/components/ui/button";
import { useToast } from "@/components/ui/toaster";

const ICON: Record<string, typeof Bell> = {
  task_assigned: CheckSquare, submission_approved: CheckCircle2, revision_requested: RotateCcw, deadline_changed: CalendarClock, deadline_soon: Clock3,
  deadline_missed: AlertTriangle, announcement: Megaphone, task_submitted: Send, extension_requested: CalendarClock, extension_decided: CalendarClock,
  task_blocked: ShieldAlert, task_comment: MessageSquare, chat_mention: AtSign,
};
const TONE: Record<string, string> = { submission_approved: "bg-ok-soft text-ok", revision_requested: "bg-warn-soft text-warn", deadline_missed: "bg-warn-soft text-warn", task_blocked: "bg-bad-soft text-bad", announcement: "bg-accent-soft text-accent-ink", task_submitted: "bg-violet-soft text-violet" };

export function NotificationItem({ n }: { n: { id: string; type: string; title: string; body: string; href: string | null; readAt: string | null; createdAt: string } }) {
  const router = useRouter();
  const [, start] = useTransition();
  const Icon = ICON[n.type] ?? Bell;
  const open = () => start(async () => { if (!n.readAt) await markNotificationReadAction(n.id); if (n.href) router.push(n.href); else router.refresh(); });
  return (
    <li>
      <button onClick={open} className={cn("focus-ring flex w-full gap-3 px-4 py-3.5 text-left transition hover:bg-surface-2 sm:px-5", !n.readAt && "bg-brand-soft/40")}>
        <span className={cn("grid h-9 w-9 shrink-0 place-items-center rounded-lg", TONE[n.type] ?? "bg-brand-soft text-brand-ink")}><Icon className="h-4 w-4" /></span>
        <span className="min-w-0 flex-1">
          <span className={cn("block text-sm", n.readAt ? "text-fg-2" : "font-semibold text-fg")}>{n.title}</span>
          {n.body && <span className="mt-0.5 block line-clamp-2 text-sm text-muted">{n.body}</span>}
          <span className="mt-0.5 block text-xs text-faint">{ago(n.createdAt)}</span>
        </span>
        {!n.readAt && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-brand" aria-label="Unread" />}
      </button>
    </li>
  );
}

export function MarkAllRead({ disabled }: { disabled?: boolean }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  const toast = useToast();
  return (
    <button disabled={disabled || pending} className={buttonClass("secondary")} onClick={() => start(async () => { const r = await markAllReadAction(); if (r.ok) toast.push("success", r.message ?? "Done"); router.refresh(); })}>
      <CheckCheck className="h-4 w-4" />Mark all read
    </button>
  );
}
