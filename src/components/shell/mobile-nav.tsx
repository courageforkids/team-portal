"use client";
import { useBadges } from "./badges";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Home, CheckSquare, MessagesSquare, Bell, Menu, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { isActive, NavList, Brand } from "./sidebar";
import { ThemeToggle } from "./theme-toggle";

export function MobileNav({ role, canReview, canDonations = false, badges, orgName }: { role: "admin" | "leader" | "volunteer"; canReview: boolean; canDonations?: boolean; badges: Record<string, number>; orgName: string }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => { try { sessionStorage.removeItem("cfk-reloaded"); } catch {} }, []);
  useEffect(() => { document.body.style.overflow = open ? "hidden" : ""; }, [open]);
  const live = useBadges();
  if (Object.keys(live).length) badges = live;
  const tabs = [
    { href: "/", label: "Home", icon: Home },
    { href: "/tasks", label: "Tasks", icon: CheckSquare, count: badges.tasks },
    { href: "/messages", label: "Chat", icon: MessagesSquare, count: badges.messages },
    { href: "/notifications", label: "Inbox", icon: Bell, count: badges.notifications },
  ];
  return (
    <>
      <nav aria-label="Primary" className="pb-safe fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface/95 backdrop-blur md:hidden">
        <div className="grid grid-cols-5">
          {tabs.map((t) => {
            const active = isActive(pathname, t.href);
            return (
              <Link key={t.href} href={t.href} aria-current={active ? "page" : undefined}
                className={cn("relative flex min-h-[58px] flex-col items-center justify-center gap-0.5 text-[11px] font-semibold", active ? "text-brand-ink" : "text-muted")}>
                <t.icon className="h-[22px] w-[22px]" aria-hidden />
                {t.label}
                {!!t.count && <span className="absolute top-2 left-1/2 ml-2 min-w-4 rounded-full bg-accent px-1 text-center text-[10px] font-bold text-[#1a1a1a]">{t.count > 9 ? "9+" : t.count}</span>}
              </Link>
            );
          })}
          <button onClick={() => setOpen(true)} aria-expanded={open} className="flex min-h-[58px] flex-col items-center justify-center gap-0.5 text-[11px] font-semibold text-muted">
            <Menu className="h-[22px] w-[22px]" aria-hidden />More
          </button>
        </div>
      </nav>
      {open && (
        <div className="fixed inset-0 z-50 md:hidden" role="dialog" aria-modal="true" aria-label="Menu">
          <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />
          <div className="animate-in pb-safe absolute inset-x-0 bottom-0 max-h-[88dvh] overflow-y-auto rounded-t-2xl border-t border-line bg-surface p-4">
            <div className="mb-4 flex items-center justify-between"><Brand orgName={orgName} />
              <button onClick={() => setOpen(false)} aria-label="Close menu" className="rounded-lg p-2 text-muted hover:bg-surface-2"><X className="h-5 w-5" /></button></div>
            <NavList role={role} canReview={canReview} canDonations={canDonations} badges={badges} onNavigate={() => setOpen(false)} />
            <div className="mt-5 border-t border-line pt-4"><div className="eyebrow mb-2">Appearance</div><ThemeToggle /></div>
          </div>
        </div>
      )}
    </>
  );
}
