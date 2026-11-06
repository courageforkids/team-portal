import Link from "next/link";
import { CalendarClock, Megaphone, Plus, Search, X } from "lucide-react";
import { requireUser } from "@/server/auth";
import { listAnnouncements } from "@/server/announcements";
import { getDepartments } from "@/server/queries";
import { PageHeader } from "@/components/ui/page-header";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { AnnouncementCard } from "@/components/announcements/announcement-card";
import { ANNOUNCEMENT_CATEGORIES, CATEGORY_LABEL, asCategory, audienceLabel } from "@/components/announcements/meta";
import { cn } from "@/lib/cn";

export const metadata = { title: "Announcements" };

type SP = Promise<Record<string, string | string[] | undefined>>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

export default async function AnnouncementsPage({ searchParams }: { searchParams: SP }) {
  const me = await requireUser();
  const sp = await searchParams;
  const category = asCategory(one(sp.category));
  const q = one(sp.q).trim().slice(0, 100);
  const isAdmin = me.role === "admin";
  const [{ published, scheduled }, depts] = await Promise.all([listAnnouncements(me, { category, q }), isAdmin ? getDepartments(true) : []]);
  const deptNames = new Map(depts.map((d) => [d.id, d.name]));
  const unread = published.filter((a) => !a.readAt).length;
  const filtered = !!category || !!q;

  const href = (c: string | null) => {
    const p = new URLSearchParams();
    if (c) p.set("category", c);
    if (q) p.set("q", q);
    const s = p.toString();
    return s ? `/announcements?${s}` : "/announcements";
  };

  return (
    <div>
      <PageHeader
        title="Announcements"
        description={unread > 0 ? `${unread} new since you last checked.` : "News, reminders and updates from the team."}
        actions={isAdmin && <ButtonLink href="/announcements/new"><Plus className="h-4 w-4" aria-hidden />New announcement</ButtonLink>}
      />

      <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <nav aria-label="Filter by category" className="scrollbar-thin -mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1 lg:mx-0 lg:px-0 lg:pb-0">
          {[null, ...ANNOUNCEMENT_CATEGORIES].map((c) => {
            const active = (c ?? null) === category;
            return (
              <Link key={c ?? "all"} href={href(c)} aria-current={active ? "page" : undefined}
                className={cn("focus-ring inline-flex h-10 shrink-0 items-center rounded-full border px-3.5 text-[13px] font-semibold transition sm:h-8",
                  active ? "border-brand bg-brand text-brand-fg" : "border-line bg-surface text-fg-2 hover:border-line-strong hover:text-fg")}>
                {c ? CATEGORY_LABEL[c] : "All"}
              </Link>
            );
          })}
        </nav>
        <form method="get" action="/announcements" role="search" className="relative w-full lg:w-72">
          {category && <input type="hidden" name="category" value={category} />}
          <label htmlFor="ann-q" className="sr-only">Search announcements</label>
          <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-faint" aria-hidden />
          <input id="ann-q" name="q" type="search" defaultValue={q} placeholder="Search announcements" className="input pl-9" />
        </form>
      </div>

      {isAdmin && scheduled.length > 0 && (
        <section className="mb-8" aria-labelledby="scheduled-h">
          <h2 id="scheduled-h" className="eyebrow mb-3 flex items-center gap-1.5"><CalendarClock className="h-3.5 w-3.5" aria-hidden />Scheduled · {scheduled.length}</h2>
          <div className="space-y-3">
            {scheduled.map((a) => <AnnouncementCard key={a.id} a={a} viewerId={me.id} scheduled tz={me.timezone} audience={audienceLabel(a.audience, deptNames)} />)}
          </div>
        </section>
      )}

      <section aria-labelledby="published-h">
        {isAdmin && scheduled.length > 0 && <h2 id="published-h" className="eyebrow mb-3">Published</h2>}
        {!(isAdmin && scheduled.length > 0) && <h2 id="published-h" className="sr-only">Published announcements</h2>}
        {published.length === 0 ? (
          <div className="card">
            {filtered ? (
              <EmptyState icon={Search} title="No matching announcements" action={<ButtonLink href="/announcements" variant="secondary"><X className="h-4 w-4" aria-hidden />Clear filters</ButtonLink>}>
                Try a different word or category.
              </EmptyState>
            ) : (
              <EmptyState icon={Megaphone} title="No announcements yet"
                action={isAdmin ? <ButtonLink href="/announcements/new"><Plus className="h-4 w-4" aria-hidden />Write the first one</ButtonLink> : undefined}>
                {isAdmin ? "Share news, reminders and policies with the whole team or specific groups." : "When the team shares news or reminders, they'll show up here."}
              </EmptyState>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {published.map((a) => (
              <AnnouncementCard key={a.id} a={a} viewerId={me.id} tz={me.timezone} audience={isAdmin ? audienceLabel(a.audience, deptNames) : undefined} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
