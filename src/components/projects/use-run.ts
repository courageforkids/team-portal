"use client";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui/toaster";
import type { ActionResult } from "@/lib/action";

/** Runs a server action from a button: shows a toast and refreshes the page. */
export function useRunAction() {
  const [pending, start] = useTransition();
  const toast = useToast();
  const router = useRouter();
  const run = (fn: () => Promise<ActionResult<unknown>>, after?: () => void) =>
    start(async () => {
      const r = await fn();
      if (r.ok) { if (r.message) toast.push("success", r.message); after?.(); if (r.redirectTo) router.push(r.redirectTo); else router.refresh(); }
      else toast.push("error", r.error);
    });
  return { pending, run };
}
