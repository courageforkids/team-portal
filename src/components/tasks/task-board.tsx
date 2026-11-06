import Link from "next/link";
import { AvatarStack } from "@/components/ui/avatar";
import { BOARD_COLUMNS } from "@/lib/task-meta";
import type { TaskListItem } from "@/server/queries";
import { DueChip, PriorityBadge, StatusBadge } from "./task-bits";

export function TaskBoard({ tasks }: { tasks: TaskListItem[] }) {
  return (
    <div className="-mx-4 overflow-x-auto px-4 pb-2 md:mx-0 md:px-0">
      <div className="grid min-w-[880px] grid-cols-5 gap-3">
        {BOARD_COLUMNS.map((col) => {
          const items = tasks.filter((t) => col.statuses.includes(t.status));
          return (
            <section key={col.key} aria-label={col.label} className="flex min-h-[200px] flex-col rounded-xl bg-surface-2 p-2">
              <h3 className="flex items-center justify-between px-2 py-1.5 text-[13px] font-semibold text-fg-2">
                {col.label}<span className="rounded-full bg-surface px-2 text-xs text-muted">{items.length}</span>
              </h3>
              <div className="flex flex-col gap-2">
                {items.map((t) => (
                  <Link key={t.id} href={`/tasks/${t.id}`} className="focus-ring block rounded-lg border border-line bg-surface p-3 shadow-soft transition hover:border-line-strong hover:shadow-card">
                    <div className="mb-1 text-sm font-semibold leading-snug">{t.title}</div>
                    <DueChip status={t.status} dueAt={t.dueAt} tz={t.timezone} />
                    <div className="mt-2 flex items-center justify-between gap-2">
                      <span className="flex gap-1">{t.status === "blocked" && <StatusBadge status="blocked" />}<PriorityBadge priority={t.priority} quiet /></span>
                      <AvatarStack people={t.assignees} size={22} />
                    </div>
                  </Link>
                ))}
                {!items.length && <p className="px-2 py-6 text-center text-xs text-faint">Nothing here</p>}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
