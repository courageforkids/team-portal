import Link from "next/link";
import { and, desc, eq, isNull, lt } from "drizzle-orm";
import { Bell, CheckCheck } from "lucide-react";
import { db } from "@/db";
import { notifications } from "@/db/schema";
import { requireUser } from "@/server/auth";
import { PageHeader } from "@/components/ui/page-header";
import { Tabs } from "@/components/ui/tabs";
import { EmptyState } from "@/components/ui/empty-state";
import { ButtonLink } from "@/components/ui/button";
import { NotificationItem, MarkAllRead } from "@/components/home/notification-item";

export const metadata = { title: "Notifications" };

export default async function NotificationsPage({ searchParams }: { searchParams: Promise<{ filter?: string; before?: string }> }) {
  const me = await requireUser();
  const sp = await searchParams;
  const unreadOnly = sp.filter === "unread";
  const before = sp.before && !isNaN(Date.parse(sp.before)) ? new Date(sp.before) : null;
  const rows = await db.select().from(notifications)
    .where(and(eq(notifications.userId, me.id), unreadOnly ? isNull(notifications.readAt) : undefined, before ? lt(notifications.createdAt, before) : undefined))
    .orderBy(desc(notifications.createdAt)).limit(51);
  const more = rows.length > 50;
  const list = rows.slice(0, 50);
  const unread = list.filter((n) => !n.readAt).length;
  return (
    <>
      <PageHeader title="Notifications" description="Assignments, reviews, deadlines and announcements."
        actions={<><MarkAllRead disabled={!unread && !unreadOnly} /><ButtonLink href="/profile#notifications" variant="ghost">Preferences</ButtonLink></>} />
      <Tabs className="mb-4" active={unreadOnly ? "unread" : "all"} items={[{ key: "all", label: "All", href: "/notifications" }, { key: "unread", label: "Unread", href: "/notifications?filter=unread" }]} />
      <div className="card overflow-hidden">
        {list.length ? <ul className="divide-y divide-line">{list.map((n) => <NotificationItem key={n.id} n={{ id: n.id, type: n.type, title: n.title, body: n.body, href: n.href, readAt: n.readAt?.toISOString() ?? null, createdAt: n.createdAt.toISOString() }} />)}</ul>
          : <EmptyState icon={unreadOnly ? CheckCheck : Bell} title={unreadOnly ? "You're all caught up" : "No notifications yet"}>{unreadOnly ? "Nothing unread." : "When something needs your attention, it'll show up here."}</EmptyState>}
      </div>
      {more && <div className="mt-4 text-center"><Link className="text-sm font-semibold text-brand-ink hover:underline" href={`/notifications?${unreadOnly ? "filter=unread&" : ""}before=${encodeURIComponent(list.at(-1)!.createdAt.toISOString())}`}>Load older</Link></div>}
    </>
  );
}
