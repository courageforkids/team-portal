"use client";
import { CircleCheck } from "lucide-react";
import { ActionForm, SubmitButton } from "@/components/ui/form";
import { acknowledgeAnnouncementAction } from "@/app/(app)/announcements/actions";

export function AcknowledgeForm({ id }: { id: string }) {
  return (
    <ActionForm action={acknowledgeAnnouncementAction}>
      <input type="hidden" name="id" value={id} />
      <SubmitButton pendingText="Saving…" className="w-full sm:w-auto"><CircleCheck className="h-4 w-4" aria-hidden />I&apos;ve read this</SubmitButton>
    </ActionForm>
  );
}
