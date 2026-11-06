import { Skeleton } from "@/components/ui/skeleton";

function Header({ action }: { action?: boolean }) {
  return (
    <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="space-y-2"><Skeleton className="h-7 w-48" /><Skeleton className="h-4 w-80 max-w-full" /></div>
      {action && <Skeleton className="h-10 w-36" />}
    </div>
  );
}

/** Index pages: header, filter bar, grid of cards. */
export function GridSkeleton({ filters = true, action = false, cardHeight = "h-52", cols = "md:grid-cols-2 xl:grid-cols-3" }: {
  filters?: boolean; action?: boolean; cardHeight?: string; cols?: string;
}) {
  return (
    <div aria-busy="true" aria-label="Loading">
      <Header action={action} />
      {filters && <div className="mb-5 flex flex-col gap-3 sm:flex-row"><Skeleton className="h-10 flex-1" /><Skeleton className="h-10 sm:w-56" /></div>}
      <div className={`grid gap-4 ${cols}`}>{[0, 1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className={cardHeight} />)}</div>
    </div>
  );
}

/** Detail pages: back link, header, 2/3 + 1/3 columns. */
export function DetailSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading">
      <Skeleton className="mb-4 h-5 w-28" />
      <Header action />
      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2"><Skeleton className="h-72" /><Skeleton className="h-80" /></div>
        <div className="space-y-5"><Skeleton className="h-56" /><Skeleton className="h-40" /><Skeleton className="h-40" /></div>
      </div>
    </div>
  );
}

/** Narrow single-card pages (forms, profiles, notes). */
export function NarrowSkeleton({ tall = false }: { tall?: boolean }) {
  return (
    <div className="mx-auto max-w-3xl" aria-busy="true" aria-label="Loading">
      <Skeleton className="mb-4 h-5 w-28" />
      <div className="card space-y-4 p-6">
        <Skeleton className="h-16 w-16 rounded-full" />
        <Skeleton className="h-7 w-64 max-w-full" />
        <Skeleton className="h-4 w-48" />
        <Skeleton className={tall ? "h-80" : "h-40"} />
      </div>
    </div>
  );
}
