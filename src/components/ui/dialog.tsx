"use client";
import { useEffect, useRef, type ReactNode } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/cn";

/** Accessible modal built on <dialog> (focus trap + Esc handled by the browser). */
export function Dialog({ open, onClose, title, description, children, size = "md" }: {
  open: boolean; onClose: () => void; title: ReactNode; description?: ReactNode; children: ReactNode; size?: "sm" | "md" | "lg";
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog ref={ref} onClose={onClose} onClick={(e) => { if (e.target === ref.current) onClose(); }}
      className={cn("m-auto w-[calc(100%-2rem)] rounded-2xl border border-line bg-surface p-0 text-fg shadow-pop backdrop:bg-black/40 backdrop:backdrop-blur-[2px]",
        size === "sm" && "max-w-md", size === "md" && "max-w-lg", size === "lg" && "max-w-2xl")}>
      {open && (
        <div className="animate-pop max-h-[85vh] overflow-y-auto">
          <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
            <div>
              <h2 className="text-base font-semibold">{title}</h2>
              {description && <p className="mt-0.5 text-sm text-muted">{description}</p>}
            </div>
            <button onClick={onClose} className="rounded-lg p-1 text-muted hover:bg-surface-2 hover:text-fg" aria-label="Close"><X className="h-5 w-5" /></button>
          </div>
          <div className="px-5 py-4">{children}</div>
        </div>
      )}
    </dialog>
  );
}
