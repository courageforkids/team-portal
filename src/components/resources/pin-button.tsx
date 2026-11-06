"use client";
import { Loader2, Pin, PinOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { setResourcePinned } from "@/app/(app)/resources/actions";
import { useRunAction } from "@/components/projects/use-run";

export function PinButton({ id, title, pinned, withLabel, className }: { id: string; title: string; pinned: boolean; withLabel?: boolean; className?: string }) {
  const { pending, run } = useRunAction();
  const Icon = pending ? Loader2 : pinned ? PinOff : Pin;
  return (
    <Button type="button" variant={withLabel ? "secondary" : "ghost"} size={withLabel ? "md" : "icon"} disabled={pending} className={className}
      aria-label={withLabel ? undefined : pinned ? `Unpin "${title}"` : `Pin "${title}"`}
      onClick={() => run(() => setResourcePinned(id, !pinned))}>
      <Icon className={pending ? "h-4 w-4 animate-spin" : "h-4 w-4"} aria-hidden />
      {withLabel && (pinned ? "Unpin" : "Pin")}
    </Button>
  );
}
