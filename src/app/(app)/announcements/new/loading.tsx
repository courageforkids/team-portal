import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Loading">
      <div className="space-y-2"><Skeleton className="h-3 w-24" /><Skeleton className="h-8 w-64" /><Skeleton className="h-4 w-80 max-w-full" /></div>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="card space-y-4 p-6"><Skeleton className="h-10 w-full" /><Skeleton className="h-56 w-full" /><Skeleton className="h-24 w-full" /></div>
        <div className="space-y-4"><Skeleton className="h-36" /><Skeleton className="h-32" /><Skeleton className="h-28" /></div>
      </div>
    </div>
  );
}
