import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/cn";

export function EmptyState({ icon: Icon, title, children, action, className, compact }: {
  icon?: LucideIcon; title: string; children?: ReactNode; action?: ReactNode; className?: string; compact?: boolean;
}) {
  return (
    <div className={cn("flex flex-col items-center justify-center text-center", compact ? "px-4 py-8" : "px-6 py-14", className)}>
      {Icon && (
        <div className="mb-3 grid h-11 w-11 place-items-center rounded-xl bg-brand-soft text-brand-ink">
          <Icon className="h-5 w-5" aria-hidden />
        </div>
      )}
      <p className="text-[15px] font-semibold text-fg">{title}</p>
      {children && <div className="mt-1 max-w-sm text-sm text-muted">{children}</div>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
