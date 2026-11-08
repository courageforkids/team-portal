"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { LogOut, UserRound, ChevronsUpDown } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { ThemeToggle } from "./theme-toggle";
import { signOutAction } from "@/app/(auth)/actions";

export function UserMenu({ name, title, avatarFileId, compact }: { name: string; title: string; avatarFileId: string | null; compact?: boolean }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", h); document.addEventListener("keydown", k);
    return () => { document.removeEventListener("mousedown", h); document.removeEventListener("keydown", k); };
  }, []);
  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen((o) => !o)} aria-haspopup="menu" aria-expanded={open}
        className="focus-ring flex w-full items-center gap-2.5 rounded-lg p-1.5 text-left hover:bg-surface-2">
        <Avatar name={name} fileId={avatarFileId} size={compact ? 32 : 34} />
        {!compact && (<>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-semibold text-fg">{name}</span>
            <span className="block truncate text-xs text-muted">{title || "Team member"}</span>
          </span>
          <ChevronsUpDown className="h-4 w-4 text-faint" />
        </>)}
      </button>
      {open && (
        <div role="menu" className={`animate-pop absolute z-50 w-60 rounded-xl border border-line bg-surface p-1.5 shadow-pop ${compact ? "right-0 top-11" : "bottom-14 left-0"}`}>
          <div className="px-2.5 py-2"><div className="truncate text-sm font-semibold">{name}</div><div className="truncate text-xs text-muted">{title}</div></div>
          <div className="px-2.5 pb-2"><ThemeToggle /></div>
          <Link role="menuitem" href="/profile" onClick={() => setOpen(false)} className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-fg-2 hover:bg-surface-2"><UserRound className="h-4 w-4" />Profile & preferences</Link>
          <form action={signOutAction} onSubmit={() => { try { void caches.keys().then((ks) => ks.forEach((k) => caches.delete(k))); } catch { /* ignore */ } }}>
            <button role="menuitem" className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-fg-2 hover:bg-surface-2"><LogOut className="h-4 w-4" />Sign out</button>
          </form>
        </div>
      )}
    </div>
  );
}
