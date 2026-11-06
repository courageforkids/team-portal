import {
  Home, CheckSquare, CalendarDays, Megaphone, FolderKanban, Users, BookOpen, LayoutDashboard, ListChecks, Inbox,
  BarChart3, ShieldCheck, Settings, Building2, type LucideIcon,
} from "lucide-react";

export type NavItem = { href: string; label: string; icon: LucideIcon; badgeKey?: "reviews" | "notifications" };
export type NavGroups = { main: NavItem[]; admin: NavItem[] };

export function navFor(role: "admin" | "leader" | "volunteer", canReview: boolean): NavGroups {
  const main: NavItem[] = [
    { href: "/", label: "Home", icon: Home },
    { href: "/tasks", label: "My tasks", icon: CheckSquare },
    { href: "/calendar", label: "Calendar", icon: CalendarDays },
    { href: "/announcements", label: "Announcements", icon: Megaphone },
  ];
  if (role !== "volunteer") main.push({ href: "/projects", label: "Projects", icon: FolderKanban }, { href: "/departments", label: "Departments", icon: Building2 });
  main.push({ href: "/team", label: "Team", icon: Users }, { href: "/resources", label: "Resources", icon: BookOpen });
  const admin: NavItem[] = [];
  if (role === "admin") {
    admin.push(
      { href: "/admin", label: "Command center", icon: LayoutDashboard },
      { href: "/tasks/all", label: "All tasks", icon: ListChecks },
      { href: "/review", label: "Review center", icon: Inbox, badgeKey: "reviews" },
      { href: "/admin/performance", label: "Performance", icon: BarChart3 },
      { href: "/admin/accountability", label: "Accountability", icon: ShieldCheck },
      { href: "/settings", label: "Settings", icon: Settings },
    );
  } else if (canReview) {
    admin.push({ href: "/review", label: "Review center", icon: Inbox, badgeKey: "reviews" });
  }
  return { main, admin };
}
