import { Skeleton } from "@/components/ui/skeleton";
export default function Loading() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Loading">
      <div className="space-y-2"><Skeleton className="h-7 w-48" /><Skeleton className="h-4 w-96 max-w-full" /></div>
      <div className="flex justify-between"><Skeleton className="h-9 w-44" /><Skeleton className="h-10 w-64" /></div>
      <Skeleton className="h-96" />
      <div className="grid gap-6 lg:grid-cols-2"><Skeleton className="h-64" /><Skeleton className="h-64" /></div>
    </div>
  );
}
