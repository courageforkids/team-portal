import Link from "next/link";
import { Bell } from "lucide-react";

export function NotificationBell({ count }: { count: number }) {
  return (
    <Link href="/notifications" aria-label={count ? `Notifications, ${count} unread` : "Notifications"}
      className="focus-ring relative grid h-9 w-9 place-items-center rounded-lg text-fg-2 hover:bg-surface-2 hover:text-fg">
      <Bell className="h-[19px] w-[19px]" />
      {count > 0 && <span className="absolute right-1 top-1 min-w-[17px] rounded-full bg-accent px-1 text-center text-[10px] font-bold leading-[17px] text-[#1a1a1a] ring-2 ring-bg">{count > 99 ? "99+" : count}</span>}
    </Link>
  );
}
