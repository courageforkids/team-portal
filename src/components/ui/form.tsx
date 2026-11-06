"use client";
import { createContext, startTransition, useActionState, useContext, useEffect, useRef, type ReactNode, type ComponentProps } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import type { ActionResult } from "@/lib/action";
import { buttonClass } from "./button";
import { useToast } from "./toaster";
import { cn } from "@/lib/cn";

type Action = (prev: ActionResult<unknown> | null, fd: FormData) => Promise<ActionResult<unknown>>;

/** Pending state shared with SubmitButton (we submit via onSubmit so React doesn't wipe fields on errors). */
const PendingCtx = createContext<boolean | null>(null);

/**
 * A form bound to a server action. Shows a toast on success/error, displays field errors,
 * and optionally resets or navigates afterwards.
 */
export function ActionForm({
  action, children, className, resetOnSuccess, onSuccess, id, showErrorInline = true,
}: {
  action: Action; children: ReactNode | ((state: ActionResult<unknown> | null) => ReactNode); className?: string;
  resetOnSuccess?: boolean; onSuccess?: (r: ActionResult<unknown>) => void; id?: string; showErrorInline?: boolean;
}) {
  const [state, formAction, pending] = useActionState(action, null);
  const toast = useToast();
  const router = useRouter();
  const ref = useRef<HTMLFormElement>(null);
  const last = useRef<unknown>(null);
  useEffect(() => {
    if (!state || state === last.current) return;
    last.current = state;
    if (state.ok) {
      if (state.message) toast.push("success", state.message);
      if (resetOnSuccess) ref.current?.reset();
      onSuccess?.(state);
      if (state.redirectTo) router.push(state.redirectTo);
      else router.refresh();
    } else {
      toast.push("error", state.error);
    }
  }, [state, toast, router, resetOnSuccess, onSuccess]);
  return (
    <form ref={ref} className={className} id={id} aria-busy={pending}
      onSubmit={(e) => {
        e.preventDefault();
        if (pending) return;
        const submitter = (e.nativeEvent as SubmitEvent).submitter as HTMLElement | null;
        const fd = new FormData(e.currentTarget, submitter && "form" in submitter ? (submitter as HTMLButtonElement) : undefined);
        startTransition(() => formAction(fd));
      }}>
      <PendingCtx.Provider value={pending}>{typeof children === "function" ? children(state) : children}</PendingCtx.Provider>
      {showErrorInline && state && !state.ok && (
        <p role="alert" className="mt-3 rounded-lg bg-bad-soft px-3 py-2 text-sm text-bad">{state.error}</p>
      )}
    </form>
  );
}

export function SubmitButton({ children, pendingText, variant = "primary", size = "md", className, ...p }:
  ComponentProps<"button"> & { pendingText?: string; variant?: Parameters<typeof buttonClass>[0]; size?: Parameters<typeof buttonClass>[1] }) {
  const status = useFormStatus();
  const ctx = useContext(PendingCtx);
  const pending = ctx ?? status.pending;
  return (
    <button {...p} type="submit" disabled={pending || p.disabled} aria-busy={pending} className={buttonClass(variant, size, className)}>
      {pending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
      {pending ? pendingText ?? children : children}
    </button>
  );
}

export function Field({ label, htmlFor, hint, error, children, className, required }: {
  label: ReactNode; htmlFor?: string; hint?: ReactNode; error?: string; children: ReactNode; className?: string; required?: boolean;
}) {
  return (
    <div className={className}>
      <label htmlFor={htmlFor} className="label">{label}{required && <span className="text-bad"> *</span>}</label>
      {children}
      {error ? <p className="mt-1.5 text-xs text-bad">{error}</p> : hint ? <p className="hint">{hint}</p> : null}
    </div>
  );
}

export function Input(p: ComponentProps<"input">) { return <input {...p} className={cn("input", p.className)} />; }
export function Textarea(p: ComponentProps<"textarea">) { return <textarea rows={4} {...p} className={cn("input resize-y", p.className)} />; }
export function Select(p: ComponentProps<"select">) {
  return <select {...p} className={cn("input appearance-none bg-[length:16px] bg-[right_10px_center] bg-no-repeat pr-9", p.className)}
    style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%236b7280' stroke-width='2'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")", ...p.style }} />;
}
export function Checkbox({ label, description, ...p }: ComponentProps<"input"> & { label: ReactNode; description?: ReactNode }) {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-lg py-1">
      <input type="checkbox" {...p} className="mt-0.5 h-[18px] w-[18px] shrink-0 cursor-pointer rounded accent-[var(--brand)]" />
      <span className="text-sm">
        <span className="font-medium text-fg">{label}</span>
        {description && <span className="block text-xs text-muted">{description}</span>}
      </span>
    </label>
  );
}
