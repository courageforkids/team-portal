import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="mx-auto max-w-3xl space-y-4" aria-busy="true" aria-label="Loading announcement">
      <Skeleton className="h-5 w-36" />
      <div className="card space-y-4 p-5 sm:p-8">
        <Skeleton className="h-5 w-20 rounded-full" />
        <Skeleton className="h-8 w-3/4" />
        <div className="flex items-center gap-3"><Skeleton className="h-9 w-9 rounded-full" /><Skeleton className="h-4 w-48" /></div>
        <div className="space-y-2.5 pt-4">{[0, 1, 2, 3, 4].map((i) => <Skeleton key={i} className={i === 4 ? "h-4 w-2/3" : "h-4 w-full"} />)}</div>
      </div>
    </div>
  );
}
