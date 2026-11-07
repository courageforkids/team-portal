"use client";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { NotebookPen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toaster";
import { meetingForEventAction } from "@/server/meeting-actions";

export function StartNotesButton({ eventId, label = "Start notes", className }: { eventId: string; label?: string; className?: string }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  const toast = useToast();
  return (
    <Button size="sm" variant="secondary" className={className} disabled={pending}
      onClick={() => start(async () => { const r = await meetingForEventAction(eventId); if (r.ok && r.redirectTo) router.push(r.redirectTo); else if (!r.ok) toast.push("error", r.error); })}>
      <NotebookPen className="h-4 w-4" />{label}
    </Button>
  );
}
