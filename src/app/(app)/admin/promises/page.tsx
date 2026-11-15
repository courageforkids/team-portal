import { asc, desc, eq } from "drizzle-orm";
import { Lock, HandHeart } from "lucide-react";
import { db } from "@/db";
import { promises } from "@/db/schema";
import { requireAdmin } from "@/server/auth";
import { getSettings } from "@/server/settings";
import { todayIn } from "@/server/admin";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { AddPromiseForm, PromiseItem, type PromiseRow } from "@/components/admin/promises";

export const metadata = { title: "What we promised" };

const label = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

export default async function PromisesPage() {
  const me = await requireAdmin();
  const s = await getSettings();
  const today = todayIn(s.timezone);
  // Only the promises this admin wrote, ever.
  const rows = await db.select().from(promises).where(eq(promises.ownerId, me.id))
    .orderBy(asc(promises.dueDate), desc(promises.createdAt));
  const toRow = (r: typeof rows[number]): PromiseRow => ({
    id: r.id, who: r.who, what: r.what, dueDate: r.dueDate, dueLabel: r.dueDate ? label(r.dueDate) : null,
    overdue: !!r.dueDate && r.dueDate < today, done: !!r.doneAt,
  });
  const open = rows.filter((r) => !r.doneAt).map(toRow);
  const done = rows.filter((r) => r.doneAt).sort((a, b) => +b.doneAt! - +a.doneAt!).map(toRow);

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Executive" title="What we promised"
        description="What you told brands and donors you'd do in return, so nothing slips." />
      <p className="flex items-center gap-2 text-sm text-muted"><Lock className="h-4 w-4" aria-hidden />Only you can see this page. Not even other admins can see your list.</p>

      <Card><AddPromiseForm /></Card>

      <Card>
        <CardHeader title={`Still to do${open.length ? ` (${open.length})` : ""}`} />
        {open.length === 0
          ? <EmptyState compact icon={HandHeart} title="You're all caught up">When a brand says yes, add what you promised them above.</EmptyState>
          : <ul className="divide-y divide-line">{open.map((p) => <PromiseItem key={p.id} p={p} />)}</ul>}
      </Card>

      {done.length > 0 && (
        <Card>
          <CardHeader title={`Done (${done.length})`} />
          <ul className="divide-y divide-line">{done.map((p) => <PromiseItem key={p.id} p={p} />)}</ul>
        </Card>
      )}
    </div>
  );
}
