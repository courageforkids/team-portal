"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { Users, MailPlus, Building2, Tags, BellRing, Repeat, Palette, Mail, ScrollText, Download } from "lucide-react";
import { Tabs } from "@/components/ui/tabs";
import { cn } from "@/lib/cn";

export const SETTINGS_SECTIONS = [
  { href: "/settings/members", label: "Members", icon: Users },
  { href: "/settings/invitations", label: "Invitations", icon: MailPlus },
  { href: "/settings/departments", label: "Departments", icon: Building2 },
  { href: "/settings/categories", label: "Task categories", icon: Tags },
  { href: "/settings/reminders", label: "Reminders", icon: BellRing },
  { href: "/settings/recurring", label: "Recurring tasks", icon: Repeat },
  { href: "/settings/branding", label: "Branding", icon: Palette },
  { href: "/settings/email", label: "Email", icon: Mail },
  { href: "/settings/activity", label: "Activity log", icon: ScrollText },
  { href: "/settings/export", label: "Data export", icon: Download },
] as const;

export function SettingsNav() {
  const pathname = usePathname();
  const active = SETTINGS_SECTIONS.find((s) => pathname === s.href || pathname.startsWith(s.href + "/"))?.href ?? "";
  const mobileRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    // Keep the current section visible in the horizontally scrolling mobile tabs.
    const el = mobileRef.current?.querySelector<HTMLElement>("[aria-current=page]");
    const strip = el?.parentElement;
    if (el && strip) strip.scrollLeft += el.getBoundingClientRect().left - strip.getBoundingClientRect().left - (strip.clientWidth - el.clientWidth) / 2;
  }, [active]);
  return (
    <>
      <nav aria-label="Settings" className="hidden md:block">
        <ul className="sticky top-24 flex flex-col gap-0.5">
          {SETTINGS_SECTIONS.map((s) => {
            const on = s.href === active;
            return (
              <li key={s.href}>
                <Link href={s.href} aria-current={on ? "page" : undefined}
                  className={cn("focus-ring flex items-center gap-2.5 rounded-lg px-3 py-2 text-[14px] font-medium transition",
                    on ? "bg-surface text-fg shadow-soft ring-1 ring-line" : "text-fg-2 hover:bg-surface-2 hover:text-fg")}>
                  <s.icon className={cn("h-4 w-4 shrink-0", on ? "text-brand-ink" : "text-muted")} aria-hidden />{s.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
      <div ref={mobileRef} className="md:hidden">
        <Tabs active={active} className="[&>a]:min-h-10" items={SETTINGS_SECTIONS.map((s) => ({ key: s.href, label: s.label, href: s.href }))} />
      </div>
    </>
  );
}
