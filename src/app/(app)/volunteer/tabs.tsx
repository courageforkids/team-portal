import { Tabs } from "@/components/ui/tabs";
export function VolunteerTabs({ active, isAdmin, pending }: { active: "signups" | "hours" | "review"; isAdmin: boolean; pending?: number }) {
  const items = [
    { key: "signups", label: "Sign-ups", href: "/volunteer" },
    { key: "hours", label: "My hours", href: "/volunteer/hours" },
    ...(isAdmin ? [{ key: "review", label: "Review hours", href: "/volunteer/review", count: pending }] : []),
  ];
  return <Tabs className="mb-5" active={active} items={items} />;
}
