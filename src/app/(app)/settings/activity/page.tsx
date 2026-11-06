import Link from "next/link";
import { count, desc, eq, inArray, like, sql } from "drizzle-orm";
import { ChevronLeft, ChevronRight, ScrollText } from "lucide-react";
import { db } from "@/db";
import { auditLog, departments, invitations, taskCategories, tasks, users } from "@/db/schema";
import { requireAdmin } from "@/server/auth";
import { Card, CardHeader } from "@/components/ui/card";
import { Avatar } from "@/components/ui/avatar";
import { EmptyState } from "@/components/ui/empty-state";
import { Select } from "@/components/ui/form";
import { buttonClass } from "@/components/ui/button";
import { fmtDateTime } from "@/lib/dates";

export const metadata = { title: "Activity log · Settings" };
const PER_PAGE = 40;
const isUuid = (s: string) => /^[0-9a-f-]{36}$/i.test(s);

export default async function ActivityLogPage({ searchParams }: { searchParams: Promise<{ page?: string; action?: string }> }) {
  const me = await requireAdmin();
  const sp = await searchParams;
  const prefixes = (await db.selectDistinct({ p: sql<string>`split_part(${auditLog.action}, '.', 1)` }).from(auditLog)).map((r) => r.p).sort();
  const prefix = sp.action && prefixes.includes(sp.action) ? sp.action : undefined;
  const where = prefix ? like(auditLog.action, `${prefix}.%`) : undefined;
  const [{ n: total }] = await db.select({ n: count() }).from(auditLog).where(where);
  const pages = Math.max(1, Math.ceil(total / PER_PAGE));
  const page = Math.min(pages, Math.max(1, Math.trunc(Number(sp.page) || 1)));
  const rows = await db.select({
    id: auditLog.id, action: auditLog.action, targetType: auditLog.targetType, targetId: auditLog.targetId, detail: auditLog.detail, ip: auditLog.ip,
    createdAt: auditLog.createdAt, actor: users.name, actorAvatar: users.avatarFileId,
  }).from(auditLog).leftJoin(users, eq(users.id, auditLog.actorId)).where(where).orderBy(desc(auditLog.createdAt)).limit(PER_PAGE).offset((page - 1) * PER_PAGE);

  // Resolve target names in a few batched lookups.
  const ids = (type: string) => [...new Set(rows.filter((r) => r.targetType === type && r.targetId).map((r) => r.targetId!.split(",")[0]).filter(isUuid))];
  const [u, t, d, c, inv] = await Promise.all([
    ids("user").length ? db.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, ids("user"))) : [],
    ids("task").length ? db.select({ id: tasks.id, name: tasks.title }).from(tasks).where(inArray(tasks.id, ids("task"))) : [],
    ids("department").length ? db.select({ id: departments.id, name: departments.name }).from(departments).where(inArray(departments.id, ids("department"))) : [],
    ids("category").length ? db.select({ id: taskCategories.id, name: taskCategories.name }).from(taskCategories).where(inArray(taskCategories.id, ids("category"))) : [],
    ids("invitation").length ? db.select({ id: invitations.id, name: invitations.email }).from(invitations).where(inArray(invitations.id, ids("invitation"))) : [],
  ]);
  const names = new Map([...u, ...t, ...d, ...c, ...inv].map((x) => [x.id, x.name]));
  const targetLabel = (r: (typeof rows)[number]) => {
    if (!r.targetType) return null;
    const first = r.targetId?.split(",")[0] ?? "";
    const detailName = typeof r.detail?.name === "string" ? r.detail.name : typeof r.detail?.title === "string" ? r.detail.title : typeof r.detail?.email === "string" ? r.detail.email : null;
    const name = names.get(first) ?? detailName;
    const href = r.targetType === "task" && names.has(first) ? `/tasks/${first}` : r.targetType === "user" && names.has(first) ? `/admin/members/${first}` : null;
    const extra = r.targetId && r.targetId.includes(",") ? ` +${r.targetId.split(",").length - 1} more` : "";
    return { type: r.targetType, name: name ? `${name}${extra}` : r.targetId ? `#${first.slice(0, 8)}` : null, href };
  };
  const href = (p: { page?: number }) => `?${new URLSearchParams(Object.entries({ action: prefix ?? "", page: "1", ...p }).filter(([, v]) => v !== "").map(([k, v]) => [k, String(v)]))}`;

  return (
    <Card>
      <CardHeader title="Activity log" description="A permanent record of sign-ins and administrative changes." />
      <form method="get" className="flex flex-col gap-2 border-t border-line px-4 py-3 sm:flex-row sm:items-end sm:px-5">
        <div className="sm:w-64">
          <label htmlFor="log-action" className="label">Type of activity</label>
          <Select id="log-action" name="action" defaultValue={prefix ?? ""}>
            <option value="">Everything</option>
            {prefixes.map((p) => <option key={p} value={p}>{p}.*</option>)}
          </Select>
        </div>
        <div className="flex gap-2">
          <button type="submit" className={buttonClass("secondary")}>Filter</button>
          {prefix && <Link href="?" className={buttonClass("ghost")}>Clear</Link>}
        </div>
      </form>
      {rows.length === 0 ? (
        <EmptyState compact icon={ScrollText} title="No activity recorded" />
      ) : (
        <>
          <ul className="divide-y divide-line border-t border-line">
            {rows.map((r) => {
              const target = targetLabel(r);
              const hasDetail = r.detail && Object.keys(r.detail).length > 0;
              return (
                <li key={r.id} className="flex gap-3 px-4 py-3 sm:px-5">
                  <Avatar name={r.actor ?? "System"} fileId={r.actorAvatar} size={30} />
                  <div className="min-w-0 flex-1 text-sm">
                    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                      <span className="font-semibold text-fg">{r.actor ?? "System"}</span>
                      <code className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-[12px] text-fg-2">{r.action}</code>
                      {target?.name && (
                        <span className="min-w-0 text-fg-2">
                          <span className="text-muted">{target.type}:</span>{" "}
                          {target.href ? <Link href={target.href} className="focus-ring rounded hover:text-brand-ink hover:underline">{target.name}</Link> : <span className="break-all">{target.name}</span>}
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 text-xs text-muted">
                      <time dateTime={r.createdAt.toISOString()}>{fmtDateTime(r.createdAt, me.timezone)}</time>{r.ip ? ` · IP ${r.ip}` : ""}
                    </p>
                    {hasDetail && (
                      <details className="mt-1 text-xs">
                        <summary className="cursor-pointer text-muted hover:text-fg">Details</summary>
                        <pre className="mt-1 max-w-full overflow-x-auto rounded-lg bg-surface-2 p-2 font-mono text-[11px] text-fg-2">{JSON.stringify(r.detail, null, 2)}</pre>
                      </details>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
          <nav aria-label="Activity log pages" className="flex items-center justify-between border-t border-line px-4 py-3 text-sm sm:px-5">
            <span className="text-muted">Page {page} of {pages}</span>
            <span className="flex gap-2">
              {page > 1 && <Link href={href({ page: page - 1 })} className={buttonClass("secondary", "sm", "max-md:h-10")}><ChevronLeft className="h-4 w-4" aria-hidden />Newer</Link>}
              {page < pages && <Link href={href({ page: page + 1 })} className={buttonClass("secondary", "sm", "max-md:h-10")}>Older<ChevronRight className="h-4 w-4" aria-hidden /></Link>}
            </span>
          </nav>
        </>
      )}
    </Card>
  );
}
