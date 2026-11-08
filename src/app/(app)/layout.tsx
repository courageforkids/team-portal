import { canManageDonations } from "@/server/donations";
import { count, eq } from "drizzle-orm";
import { db } from "@/db";
import { tasks } from "@/db/schema";
import { requireUser } from "@/server/auth";
import { getSettings } from "@/server/settings";
import { runMaintenanceIfDue } from "@/server/maintenance";
import { Brand, NavList } from "@/components/shell/sidebar";
import { MobileNav } from "@/components/shell/mobile-nav";
import { UserMenu } from "@/components/shell/user-menu";
import { NotificationBell } from "@/components/shell/notification-bell";
import { computeBadges } from "@/server/badges";
import { BadgesProvider } from "@/components/shell/badges";
import { AppGestures, BackButton, PageTransition } from "@/components/shell/app-gestures";


export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  // Usually a no-op: the 5-minute heartbeat runs reminders and cleanup, so page loads rarely wait on it.
  await runMaintenanceIfDue();
  const [s, [isReviewer], canDonations, badges] = await Promise.all([
    getSettings(),
    user.role === "admin" ? Promise.resolve([{ n: 1 }]) : db.select({ n: count() }).from(tasks).where(eq(tasks.reviewerId, user.id)),
    canManageDonations(user),
    computeBadges(user),
  ]);
  const canReview = user.role !== "volunteer" && isReviewer.n > 0;

  return (
    <BadgesProvider initial={badges}>
    <div className="min-h-dvh">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[70] focus:rounded-lg focus:bg-surface focus:px-3 focus:py-2 focus:shadow-pop">Skip to content</a>
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[248px] flex-col border-r border-line bg-surface md:flex">
        <div className="flex h-16 items-center px-4"><Brand orgName={s.orgName} /></div>
        <div className="scrollbar-thin flex-1 overflow-y-auto px-3 py-3"><NavList role={user.role} canReview={canReview} canDonations={canDonations} badges={badges} /></div>
        <div className="border-t border-line p-3"><UserMenu name={user.name} title={user.title} avatarFileId={user.avatarFileId} /></div>
      </aside>

      <div className="md:pl-[248px]">
        {/* Top bar */}
        <header className="sticky top-0 z-20 flex h-14 items-center justify-between gap-3 border-b border-line bg-bg/85 px-4 backdrop-blur md:h-16 md:px-8">
          <div className="flex items-center md:hidden"><BackButton /><Brand orgName={s.orgName} /></div>
          <div className="hidden text-sm text-muted md:block"><span className="italic">{s.tagline}</span></div>
          <div className="flex items-center gap-1.5">
            <NotificationBell count={badges.notifications} />
            <div className="md:hidden"><UserMenu name={user.name} title={user.title} avatarFileId={user.avatarFileId} compact /></div>
          </div>
        </header>
        <main id="main" className="mx-auto w-full max-w-[1240px] px-4 pt-6 pb-28 md:px-8 md:pt-8 md:pb-12"><PageTransition>{children}</PageTransition></main>
        <AppGestures />
      </div>
      <MobileNav role={user.role} canReview={canReview} canDonations={canDonations} badges={badges} orgName={s.orgName} />
    </div>
    </BadgesProvider>
  );
}
