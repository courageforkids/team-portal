"use client";
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";

type Badges = Record<string, number>;
const Ctx = createContext<Badges>({});

/** Keeps the menu numbers fresh: on every page change, when the app comes back to the front, and every 20 seconds. */
export function BadgesProvider({ initial, children }: { initial: Badges; children: ReactNode }) {
  const [badges, setBadges] = useState(initial);
  const pathname = usePathname();
  const refresh = useCallback(async () => {
    try {
      const r = await fetch("/api/badges", { cache: "no-store" });
      if (r.ok) setBadges(await r.json());
    } catch { /* offline */ }
  }, []);
  // Numbers are fresh from the server on first load; re-check when moving to another page.
  const firstPath = useRef(pathname);
  useEffect(() => { if (pathname !== firstPath.current) { firstPath.current = pathname; void refresh(); } }, [pathname, refresh]);
  useEffect(() => {
    const t = setInterval(() => { if (document.visibilityState === "visible") void refresh(); }, 20000);
    const onVis = () => { if (document.visibilityState === "visible") void refresh(); };
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("cfk-badges-refresh", refresh);
    return () => { clearInterval(t); document.removeEventListener("visibilitychange", onVis); window.removeEventListener("cfk-badges-refresh", refresh); };
  }, [refresh]);
  // Number on the home screen app icon (where the phone supports it): unread chats + notifications.
  useEffect(() => {
    const total = (badges.messages ?? 0) + (badges.notifications ?? 0);
    const nav = navigator as Navigator & { setAppBadge?: (n?: number) => Promise<void>; clearAppBadge?: () => Promise<void> };
    try { if (total > 0) void nav.setAppBadge?.(total).catch(() => {}); else void nav.clearAppBadge?.().catch(() => {}); } catch { /* unsupported */ }
  }, [badges.messages, badges.notifications]);
  return <Ctx.Provider value={badges}>{children}</Ctx.Provider>;
}

export const useBadges = () => useContext(Ctx);
