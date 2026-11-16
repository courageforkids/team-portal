"use client";
import { useBadges } from "./badges";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";
import type { NavGroups, NavItem } from "./nav-config";
import { navFor } from "./nav-config";

export function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  if (href === "/tasks") return pathname === "/tasks" || (pathname.startsWith("/tasks/") && !pathname.startsWith("/tasks/all") && pathname !== "/tasks/new");
  if (href === "/tasks/all") return pathname.startsWith("/tasks/all") || pathname === "/tasks/new";
  if (href === "/admin") return pathname === "/admin" || pathname.startsWith("/admin/members");
  if (href === "/admin/reports") return pathname.startsWith("/admin/reports");
  return pathname === href || pathname.startsWith(href + "/");
}

function NavLink({ item, badges, onNavigate }: { item: NavItem; badges: Record<string, number>; onNavigate?: () => void }) {
  const pathname = usePathname();
  const active = isActive(pathname, item.href);
  const Icon = item.icon;
  const count = item.badgeKey ? badges[item.badgeKey] ?? 0 : 0;
  return (
    <Link href={item.href} onClick={onNavigate} aria-current={active ? "page" : undefined}
      className={cn("focus-ring group flex items-center gap-3 rounded-lg px-3 py-2 text-[14px] font-medium transition",
        active ? "bg-brand-soft text-brand-ink" : "text-fg-2 hover:bg-surface-2 hover:text-fg")}>
      <Icon className={cn("h-[18px] w-[18px] shrink-0", active ? "text-brand-ink" : "text-muted group-hover:text-fg-2")} aria-hidden />
      <span className="flex-1 truncate">{item.label}</span>
      {count > 0 && <span className="rounded-full bg-accent px-1.5 py-px text-[11px] font-bold text-[#1a1a1a]">{count}</span>}
    </Link>
  );
}

export function Brand({ orgName }: { orgName: string }) {
  return (
    <Link href="/" className="focus-ring flex items-center gap-2.5 rounded-lg px-1">
      <span className="grid h-9 w-9 place-items-center rounded-xl bg-white shadow-soft ring-1 ring-line">
        <Image src="/logo.png" alt="" width={24} height={22} priority />
      </span>
      <span className="leading-tight">
        <span className="block text-[15px] font-bold tracking-tight text-fg">{orgName}</span>
        <span className="block text-[11px] font-semibold text-muted">Team Portal</span>
      </span>
    </Link>
  );
}

export function NavList({ role, canReview, canDonations = false, academy = false, badges, onNavigate }: { role: "admin" | "leader" | "volunteer"; canReview: boolean; canDonations?: boolean; academy?: boolean; badges: Record<string, number>; onNavigate?: () => void }) {
  const live = useBadges();
  if (Object.keys(live).length) badges = live;
  const groups: NavGroups = navFor(role, canReview, canDonations, academy);
  return (
    <nav aria-label="Main" className="flex flex-col gap-6">
      <div className="flex flex-col gap-0.5">{groups.main.map((i) => <NavLink key={i.href} item={i} badges={badges} onNavigate={onNavigate} />)}</div>
      {groups.admin.length > 0 && (
        <div>
          <div className="eyebrow mb-2 px-3">{role === "admin" ? "Executive" : "Reviewing"}</div>
          <div className="flex flex-col gap-0.5">{groups.admin.map((i) => <NavLink key={i.href} item={i} badges={badges} onNavigate={onNavigate} />)}</div>
        </div>
      )}
    </nav>
  );
}
