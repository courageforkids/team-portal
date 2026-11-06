import Link from "next/link";
import { cn } from "@/lib/cn";

/** Link-based tabs (keeps state in the URL so views are shareable and work without JS). */
export function Tabs({ items, active, className }: { items: { key: string; label: string; href: string; count?: number }[]; active: string; className?: string }) {
  return (
    <nav className={cn("flex gap-1 overflow-x-auto scrollbar-thin rounded-xl bg-surface-2 p-1", className)} aria-label="Views">
      {items.map((t) => (
        <Link key={t.key} href={t.href} aria-current={t.key === active ? "page" : undefined}
          className={cn("focus-ring flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-[13px] font-semibold transition",
            t.key === active ? "bg-surface text-fg shadow-soft" : "text-muted hover:text-fg")}>
          {t.label}
          {t.count !== undefined && <span className={cn("rounded-full px-1.5 text-[11px]", t.key === active ? "bg-brand-soft text-brand-ink" : "bg-surface-3 text-muted")}>{t.count}</span>}
        </Link>
      ))}
    </nav>
  );
}
