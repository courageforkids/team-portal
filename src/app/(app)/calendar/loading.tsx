import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Loading calendar">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-2"><Skeleton className="h-8 w-40" /><Skeleton className="h-4 w-72 max-w-full" /></div>
        <div className="flex gap-2"><Skeleton className="h-10 w-28" /><Skeleton className="h-10 w-32" /></div>
      </div>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2"><Skeleton className="h-9 w-16" /><Skeleton className="h-9 w-9" /><Skeleton className="h-9 w-9" /><Skeleton className="h-6 w-36" /></div>
        <Skeleton className="hidden h-9 w-52 sm:block" />
      </div>
      <div className="flex gap-1.5 overflow-hidden">{[0, 1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-8 w-28 shrink-0 rounded-full" />)}</div>
      <div className="card overflow-hidden">
        <div className="grid grid-cols-7 gap-px bg-line">
          {Array.from({ length: 35 }, (_, i) => (
            <div key={i} className="min-h-[56px] bg-surface p-1.5 md:min-h-[118px]">
              <Skeleton className="h-5 w-5 rounded-full" />
              {i % 3 === 0 && <Skeleton className="mt-2 hidden h-4 w-full md:block" />}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
