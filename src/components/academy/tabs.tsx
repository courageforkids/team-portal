"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";

/** Sections of Courage Academy. */
export function AcademyTabs({ myCape, admin }: { myCape: string | null; admin: boolean }) {
  const pathname = usePathname();
  const tabs = [
    { href: "/academy", label: "🏰 Academy", exact: true },
    { href: "/academy/hero", label: "🦸 My hero" },
    ...(myCape ? [{ href: `/academy/capes/${myCape}`, label: "🛋️ Common room" }] : []),
    { href: "/academy/trivia", label: "🧠 Trivia" },
    { href: "/academy/scrapbook", label: "📖 Scrapbook" },
    ...(admin ? [{ href: "/academy/admin", label: "⚙️ Admin" }] : []),
  ];
  return (
    <nav aria-label="Courage Academy" className="scrollbar-thin -mx-4 mb-5 flex gap-1.5 overflow-x-auto px-4 pb-1 md:mx-0 md:px-0">
      {tabs.map((t) => {
        const on = t.exact ? pathname === t.href : pathname.startsWith(t.href);
        return <Link key={t.href} href={t.href} aria-current={on ? "page" : undefined}
          className={cn("shrink-0 rounded-full px-3.5 py-2 text-sm font-semibold transition", on ? "bg-brand text-brand-fg shadow-soft" : "bg-surface-2 text-fg-2 hover:bg-surface-3")}>{t.label}</Link>;
      })}
    </nav>
  );
}
