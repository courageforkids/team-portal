import { cn } from "@/lib/cn";
import type { ComponentProps, ReactNode } from "react";

export function Card({ className, ...p }: ComponentProps<"div">) {
  return <div {...p} className={cn("card", className)} />;
}

export function CardHeader({ title, description, action, className }: { title: ReactNode; description?: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-wrap items-start justify-between gap-x-3 gap-y-2 px-5 pt-4 pb-3", className)}>
      <div className="min-w-[min(100%,14rem)] flex-1">
        <h2 className="text-[15px] font-semibold text-fg">{title}</h2>
        {description && <p className="mt-0.5 text-[13px] text-muted">{description}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}
