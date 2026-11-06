import Link from "next/link";
import { CalendarClock, CircleCheck, Paperclip, Pin, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { cn } from "@/lib/cn";
import { ago, fmtDateTime } from "@/lib/dates";
import { asCategory, CATEGORY_LABEL, CATEGORY_TONE, excerpt } from "./meta";
import type { AnnouncementListItem } from "@/server/announcements";

export function CategoryBadge({ category }: { category: string }) {
  const c = asCategory(category) ?? "update";
  return <Badge tone={CATEGORY_TONE[c]}>{CATEGORY_LABEL[c]}</Badge>;
}

export function AckState({ requireAck, acknowledgedAt }: { requireAck: boolean; acknowledgedAt: Date | null }) {
  if (!requireAck) return null;
  return acknowledgedAt
    ? <span className="inline-flex items-center gap-1 text-xs font-medium text-ok"><CircleCheck className="h-3.5 w-3.5" aria-hidden />Acknowledged</span>
    : <Badge tone="amber">Acknowledgment requested</Badge>;
}

export function AnnouncementCard({ a, audience, scheduled, tz, viewerId }: {
  a: AnnouncementListItem; audience?: string; scheduled?: boolean; tz: string; viewerId: string;
}) {
  const mine = a.authorId === viewerId;
  const unread = !scheduled && !a.readAt;
  return (
    <Link href={`/announcements/${a.id}`}
      className={cn("focus-ring group relative block rounded-[14px] border bg-surface p-4 shadow-soft transition hover:border-line-strong hover:shadow-card sm:p-5",
        a.pinned && !scheduled ? "border-brand/25" : "border-line")}>
      <div className="flex items-start gap-3">
        <span aria-hidden className={cn("mt-2 h-2 w-2 shrink-0 rounded-full", unread ? "bg-brand" : "bg-transparent")} />
        <div className="min-w-0 flex-1">
          <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
            {a.pinned && <span className="inline-flex items-center gap-1 text-xs font-semibold text-brand-ink"><Pin className="h-3.5 w-3.5" aria-hidden />Pinned</span>}
            <CategoryBadge category={a.category} />
            {!scheduled && !mine && <AckState requireAck={a.requireAck} acknowledgedAt={a.acknowledgedAt} />}
            {!scheduled && mine && a.requireAck && <Badge tone="muted">Asks for acknowledgment</Badge>}
            {scheduled && a.requireAck && <Badge tone="muted">Asks for acknowledgment</Badge>}
            {unread && <span className="sr-only">Unread</span>}
          </div>
          <h3 className={cn("text-[15px] leading-snug text-fg group-hover:text-brand-ink sm:text-base", unread ? "font-bold" : "font-semibold")}>{a.title}</h3>
          <p className="mt-1 line-clamp-2 text-sm text-muted">{excerpt(a.body)}</p>
          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-muted">
            <span className="inline-flex items-center gap-1.5">
              <Avatar name={a.authorName ?? "Courage for Kids"} fileId={a.authorAvatarFileId} size={20} className="ring-0" />
              <span className="font-medium text-fg-2">{a.authorName ?? "Courage for Kids"}</span>
            </span>
            {scheduled
              ? <span className="inline-flex items-center gap-1 font-medium text-violet"><CalendarClock className="h-3.5 w-3.5" aria-hidden />Publishes {fmtDateTime(a.publishAt, tz)}</span>
              : <time dateTime={a.publishAt.toISOString()} title={fmtDateTime(a.publishAt, tz)}>{ago(a.publishAt)}</time>}
            {a.attachments > 0 && <span className="inline-flex items-center gap-1"><Paperclip className="h-3.5 w-3.5" aria-hidden />{a.attachments}<span className="sr-only"> attachment{a.attachments === 1 ? "" : "s"}</span></span>}
            {audience && <span className="inline-flex items-center gap-1"><Users className="h-3.5 w-3.5" aria-hidden />{audience}</span>}
          </div>
        </div>
      </div>
    </Link>
  );
}
