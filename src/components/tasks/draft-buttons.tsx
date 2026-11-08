"use client";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Send, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toaster";
import { deleteDraftAction, publishDraftsAction } from "@/server/task-draft-actions";

function useRun() {
  const [pending, start] = useTransition();
  const toast = useToast();
  const router = useRouter();
  const run = (fn: () => Promise<{ ok: boolean; message?: string; error?: string }>) => start(async () => {
    const r = await fn();
    toast.push(r.ok ? "success" : "error", r.ok ? r.message ?? "Done." : r.error ?? "");
    router.refresh();
  });
  return { pending, run };
}

export function PublishDraftsButton({ ids, label, confirmText, size = "sm", variant = "primary" }: { ids: string[]; label: string; confirmText: string; size?: "sm" | "md"; variant?: "primary" | "secondary" }) {
  const { pending, run } = useRun();
  return (
    <Button size={size} variant={variant} disabled={pending || !ids.length} onClick={() => { if (window.confirm(confirmText)) run(() => publishDraftsAction(ids)); }}>
      <Send className="h-3.5 w-3.5" />{pending ? "Publishing…" : label}
    </Button>
  );
}

export function DeleteDraftButton({ id, title }: { id: string; title: string }) {
  const { pending, run } = useRun();
  return (
    <Button size="sm" variant="ghost" disabled={pending} aria-label={`Delete draft ${title}`} onClick={() => { if (window.confirm(`Delete the draft “${title}”?`)) run(() => deleteDraftAction(id)); }}>
      <Trash2 className="h-3.5 w-3.5" />
    </Button>
  );
}
