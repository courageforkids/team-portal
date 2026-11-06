import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Loading announcements">
      <div className="space-y-2"><Skeleton className="h-8 w-56" /><Skeleton className="h-4 w-72 max-w-full" /></div>
      <div className="flex gap-1.5 overflow-hidden">{[0, 1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-8 w-20 shrink-0 rounded-full" />)}</div>
      <div className="space-y-3">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="card space-y-2.5 p-5">
            <Skeleton className="h-5 w-24 rounded-full" />
            <Skeleton className="h-5 w-2/3" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-40" />
          </div>
        ))}
      </div>
    </div>
  );
}
