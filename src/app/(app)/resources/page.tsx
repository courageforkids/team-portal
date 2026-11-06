import Link from "next/link";
import { BookOpen, Pin, Plus, Search, X } from "lucide-react";
import { requireUser } from "@/server/auth";
import { allResourceCategories, listResources, resourceCategories, type ResourceItem } from "@/server/resources";
import { ACCEPT_ATTR } from "@/server/storage";
import { PageHeader } from "@/components/ui/page-header";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ResourceCard, type ResourceCardData } from "@/components/resources/resource-card";
import { ResourceFormDialog } from "@/components/resources/resource-form";
import { cn } from "@/lib/cn";

export const metadata = { title: "Resources" };

export default async function ResourcesPage({ searchParams }: { searchParams: Promise<{ q?: string; category?: string }> }) {
  const me = await requireUser();
  const admin = me.role === "admin";
  const sp = await searchParams;
  const q = (sp.q ?? "").trim().slice(0, 100);
  const cats = await resourceCategories(me);
  const category = cats.includes(sp.category ?? "") ? sp.category! : "";
  const [items, everything, formCats] = await Promise.all([
    listResources(me, { q: q || undefined, category: category || undefined }),
    q || category ? listResources(me) : Promise.resolve(null),
    admin ? allResourceCategories() : Promise.resolve([] as string[]),
  ]);
  const all = everything ?? items;
  const countBy = new Map<string, number>();
  for (const r of all) countBy.set(r.category, (countBy.get(r.category) ?? 0) + 1);
  // Show defaults that have content (admins see all so they know where things can go), plus any custom ones.
  const chips = cats.filter((c) => admin || countBy.get(c));
  const filtered = !!(q || category);

  const pinned = filtered ? [] : items.filter((r) => r.pinned);
  const rest = filtered ? items : items.filter((r) => !r.pinned);
  const groups = cats.map((c) => ({ c, list: rest.filter((r) => r.category === c) })).filter((g) => g.list.length);

  const link = (c: string) => {
    const p = new URLSearchParams();
    if (q) p.set("q", q);
    if (c) p.set("category", c);
    const s = p.toString();
    return s ? `/resources?${s}` : "/resources";
  };
  const card = (r: ResourceItem) => <ResourceCard r={r as ResourceCardData} admin={admin} categories={formCats} accept={ACCEPT_ATTR} />;

  return (
    <>
      <PageHeader title="Resources" description="Handbooks, guides, templates and everything else you need to do great work."
        actions={admin && <ResourceFormDialog categories={formCats} accept={ACCEPT_ATTR} defaultCategory={category || undefined}
          trigger={<><Plus className="h-4 w-4" aria-hidden />Add resource</>} />} />

      <form role="search" action="/resources" className="relative mb-4">
        {category && <input type="hidden" name="category" value={category} />}
        <label htmlFor="res-q" className="sr-only">Search resources</label>
        <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" aria-hidden />
        <input id="res-q" name="q" type="search" defaultValue={q} placeholder="Search resources" className="input h-12 pl-10 pr-24" />
        <button type="submit" className="focus-ring absolute right-1.5 top-1/2 h-9 -translate-y-1/2 rounded-lg bg-brand px-3.5 text-sm font-semibold text-brand-fg hover:bg-brand-hover">Search</button>
      </form>

      <nav aria-label="Categories" className="-mx-4 mb-6 overflow-x-auto px-4 scrollbar-thin md:mx-0 md:px-0">
        <ul className="flex gap-2 pb-1 md:flex-wrap">
          {[{ c: "", label: "All" }, ...chips.map((c) => ({ c, label: c }))].map(({ c, label }) => {
            const active = c === category;
            const n = c ? countBy.get(c) ?? 0 : all.length;
            return (
              <li key={label} className="shrink-0">
                <Link href={link(c)} aria-current={active ? "page" : undefined}
                  className={cn("focus-ring inline-flex h-10 items-center gap-1.5 rounded-full border px-4 text-[13px] font-semibold transition",
                    active ? "border-brand bg-brand text-brand-fg" : "border-line-strong bg-surface text-fg-2 hover:bg-surface-2")}>
                  {label}
                  <span className={cn("rounded-full px-1.5 text-[11px] tabular-nums", active ? "bg-white/20" : "bg-surface-2 text-muted")}>{n}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {filtered && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2 text-sm text-muted" aria-live="polite">
          <span>
            {items.length} result{items.length === 1 ? "" : "s"}{q && <> for &ldquo;<span className="font-medium text-fg">{q}</span>&rdquo;</>}{category && <> in <span className="font-medium text-fg">{category}</span></>}
          </span>
          <Link href="/resources" className="focus-ring inline-flex h-10 items-center gap-1 rounded-lg px-2 font-medium text-brand-ink hover:bg-surface-2"><X className="h-4 w-4" aria-hidden />Clear</Link>
        </div>
      )}

      {items.length === 0 ? (
        <div className="card">
          {filtered ? (
            <EmptyState icon={Search} title="Nothing matches yet" action={<ButtonLink href="/resources" variant="secondary">Show all resources</ButtonLink>}>
              Try a shorter search or another category.{!admin && " If something's missing, ask an administrator to add it."}
            </EmptyState>
          ) : (
            <EmptyState icon={BookOpen} title="No resources yet"
              action={admin && <ResourceFormDialog categories={formCats} accept={ACCEPT_ATTR} trigger={<><Plus className="h-4 w-4" aria-hidden />Add the first resource</>} />}>
              {admin ? "Start with the team handbook, a code of conduct or your brand kit." : "Handbooks, guides and templates will show up here once an administrator adds them."}
            </EmptyState>
          )}
        </div>
      ) : (
        <div className="space-y-8">
          {pinned.length > 0 && (
            <section aria-labelledby="pinned-h">
              <h2 id="pinned-h" className="mb-3 flex items-center gap-1.5 text-sm font-semibold text-fg"><Pin className="h-4 w-4 text-accent-ink" aria-hidden />Pinned</h2>
              <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{pinned.map((r) => <li key={r.id}>{card(r)}</li>)}</ul>
            </section>
          )}
          {groups.map((g) => (
            <section key={g.c} aria-labelledby={`cat-${slug(g.c)}`}>
              <h2 id={`cat-${slug(g.c)}`} className="mb-3 flex items-baseline gap-2 text-sm font-semibold text-fg">
                {g.c}<span className="text-xs font-medium text-muted">{g.list.length}</span>
              </h2>
              <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{g.list.map((r) => <li key={r.id}>{card(r)}</li>)}</ul>
            </section>
          ))}
        </div>
      )}
    </>
  );
}

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-");
