import { count } from "drizzle-orm";
import { Tags, Pencil, Plus, Trash2 } from "lucide-react";
import { db } from "@/db";
import { tasks } from "@/db/schema";
import { requireAdmin } from "@/server/auth";
import { getCategories } from "@/server/queries";
import { Card, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { ConfirmAction } from "@/components/ui/confirm";
import { CategoryDialog } from "@/components/settings/category-dialog";
import { deleteCategoryAction } from "../actions";

export const metadata = { title: "Task categories · Settings" };

export default async function CategoriesSettingsPage() {
  await requireAdmin();
  const [cats, usage] = await Promise.all([
    getCategories(),
    db.select({ id: tasks.categoryId, n: count() }).from(tasks).groupBy(tasks.categoryId),
  ]);
  const used = new Map(usage.map((u) => [u.id, u.n]));
  return (
    <Card>
      <CardHeader title="Task categories" description="Optional labels for the kind of work, like “Social media” or “Event prep”."
        action={<CategoryDialog triggerVariant="primary" trigger={<><Plus className="h-4 w-4" aria-hidden />New category</>} />} />
      {cats.length === 0 ? (
        <EmptyState compact icon={Tags} title="No categories yet">Add a few to make tasks easier to scan and filter.</EmptyState>
      ) : (
        <ul className="divide-y divide-line border-t border-line">
          {cats.map((c) => {
            const n = used.get(c.id) ?? 0;
            return (
              <li key={c.id} className="flex flex-wrap items-center gap-3 px-4 py-3 sm:px-5">
                <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: c.color }} aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-fg">{c.name}</p>
                  <p className="text-xs text-muted">{n ? `Used by ${n} task${n === 1 ? "" : "s"}` : "Not used yet"}</p>
                </div>
                <div className="flex gap-2 max-md:[&>button]:h-10">
                  <CategoryDialog cat={c} trigger={<><Pencil className="h-3.5 w-3.5" aria-hidden />Edit</>} />
                  <ConfirmAction trigger={<><Trash2 className="h-3.5 w-3.5" aria-hidden /><span className="sr-only sm:not-sr-only">Delete</span></>} triggerVariant="ghost"
                    title={`Delete “${c.name}”?`} confirmLabel="Delete"
                    description={n ? `${n} task${n === 1 ? "" : "s"} use this category. They'll keep everything else and simply have no category.` : "This category isn't used by any tasks."}
                    action={deleteCategoryAction.bind(null, c.id)} />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
