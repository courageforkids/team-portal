import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/cn";

export function StatCard({ label, value, icon: Icon, hint, href, tone = "brand" }: {
  label: string; value: number | string; icon: LucideIcon; hint?: string; href?: string; tone?: "brand" | "accent" | "violet" | "warn" | "ok";
}) {
  const toneCls = { brand: "bg-brand-soft text-brand-ink", accent: "bg-accent-soft text-accent-ink", violet: "bg-violet-soft text-violet", warn: "bg-warn-soft text-warn", ok: "bg-ok-soft text-ok" }[tone];
  const body = (
    <div className="card h-full p-4 transition hover:shadow-card hover:border-line-strong">
      <div className="flex items-center justify-between">
        <span className="text-[13px] font-medium text-muted">{label}</span>
        <span className={cn("grid h-8 w-8 place-items-center rounded-lg", toneCls)}><Icon className="h-4 w-4" aria-hidden /></span>
      </div>
      <div className="mt-2 text-[28px] font-bold leading-none tracking-tight text-fg tabular-nums">{value}</div>
      {hint && <div className="mt-1.5 text-xs text-muted">{hint}</div>}
    </div>
  );
  return href ? <Link href={href} className="focus-ring block rounded-[14px]">{body}</Link> : body;
}
