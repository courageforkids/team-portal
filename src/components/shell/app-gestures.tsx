"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ArrowLeft, ChevronLeft, Loader2, WifiOff } from "lucide-react";

const TAB_ROOTS = ["/", "/tasks", "/messages", "/notifications"];
const parentOf = (p: string) => (p.split("/").slice(0, -1).join("/") || "/");

/** Phone-app behaviour for the whole portal: pull down to refresh, swipe from the left edge to go back, offline banner, and the offline-capable service worker. */
export function AppGestures({ holiday = false }: { holiday?: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [edge, setEdge] = useState(0);
  const [online, setOnline] = useState(true);
  const s = useRef<{ x: number; y: number; mode: "pull" | "edge" | null } | null>(null);
  const goBack = () => { if (window.history.length > 1) router.back(); else router.push(parentOf(pathname)); };

  useEffect(() => {
    // Register the service worker for everyone (offline pages + notifications).
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});
    setOnline(navigator.onLine);
    const up = () => { setOnline(true); router.refresh(); };
    const down = () => setOnline(false);
    window.addEventListener("online", up); window.addEventListener("offline", down);
    return () => { window.removeEventListener("online", up); window.removeEventListener("offline", down); };
  }, [router]);

  useEffect(() => {
    const start = (e: TouchEvent) => {
      if (e.touches.length !== 1) { s.current = null; return; }
      const t = e.touches[0];
      const target = e.target as HTMLElement;
      if (target.closest("[role=dialog], input, textarea, [contenteditable=true], [data-no-gestures]")) { s.current = null; return; }
      const canGoBack = !TAB_ROOTS.includes(pathname);
      if (canGoBack && t.clientX < 24) s.current = { x: t.clientX, y: t.clientY, mode: "edge" };
      else if (window.scrollY <= 0 && !target.closest("[data-no-ptr]")) s.current = { x: t.clientX, y: t.clientY, mode: "pull" };
      else s.current = null;
    };
    const move = (e: TouchEvent) => {
      const c = s.current; if (!c) return;
      const t = e.touches[0]; const dx = t.clientX - c.x, dy = t.clientY - c.y;
      if (c.mode === "edge") { if (Math.abs(dy) > 60) { s.current = null; setEdge(0); return; } setEdge(Math.max(0, Math.min(120, dx))); }
      else if (c.mode === "pull") { if (window.scrollY > 0 || dy < 0 || Math.abs(dx) > Math.abs(dy)) { setPull(0); return; } setPull(Math.min(110, dy * 0.5)); }
    };
    const end = () => {
      const c = s.current; s.current = null;
      if (c?.mode === "edge" && edge > 80) goBack();
      if (c?.mode === "pull" && pull > 65 && !refreshing) {
        setRefreshing(true);
        router.refresh();
        window.dispatchEvent(new Event("cfk-badges-refresh"));
        setTimeout(() => setRefreshing(false), 900);
      }
      setPull(0); setEdge(0);
    };
    document.addEventListener("touchstart", start, { passive: true });
    document.addEventListener("touchmove", move, { passive: true });
    document.addEventListener("touchend", end);
    return () => { document.removeEventListener("touchstart", start); document.removeEventListener("touchmove", move); document.removeEventListener("touchend", end); };
  });

  return (
    <>
      {(pull > 0 || refreshing) && (
        <div className="pointer-events-none fixed inset-x-0 top-[calc(env(safe-area-inset-top)+60px)] z-50 flex justify-center" aria-hidden>
          <div className="grid h-9 w-9 place-items-center rounded-full bg-surface shadow-pop ring-1 ring-line" style={{ transform: `translateY(${refreshing ? 8 : pull * 0.4}px)`, opacity: refreshing ? 1 : Math.min(1, pull / 65) }}>
            {holiday ? <span className={refreshing ? "animate-spin text-lg leading-none" : "text-lg leading-none"} style={refreshing ? undefined : { transform: `rotate(${pull * 4}deg)` }}>❄️</span>
              : <Loader2 className={refreshing ? "h-4 w-4 animate-spin text-brand" : "h-4 w-4 text-brand"} style={refreshing ? undefined : { transform: `rotate(${pull * 4}deg)` }} />}
          </div>
        </div>
      )}
      {edge > 0 && (
        <div className="pointer-events-none fixed left-0 top-1/2 z-50 -translate-y-1/2" style={{ transform: `translate(${edge * 0.4 - 20}px, -50%)`, opacity: Math.min(1, edge / 80) }} aria-hidden>
          <div className="grid h-10 w-10 place-items-center rounded-full bg-surface shadow-pop ring-1 ring-line"><ChevronLeft className="h-5 w-5 text-brand" /></div>
        </div>
      )}
      {!online && (
        <div role="status" className="fixed inset-x-0 top-[calc(env(safe-area-inset-top)+56px)] z-40 mx-auto flex w-fit items-center gap-2 rounded-full bg-fg px-3 py-1.5 text-xs font-semibold text-bg shadow-pop md:top-20">
          <WifiOff className="h-3.5 w-3.5" />Offline · showing saved info
        </div>
      )}
    </>
  );
}

/** Back arrow in the phone top bar on inner pages. */
export function BackButton() {
  const router = useRouter();
  const pathname = usePathname();
  if (TAB_ROOTS.includes(pathname) || pathname.startsWith("/messages/")) return null;
  return (
    <button onClick={() => { if (window.history.length > 1) router.back(); else router.push(parentOf(pathname)); }} aria-label="Back"
      className="-ml-1.5 mr-0.5 grid h-9 w-9 place-items-center rounded-full text-fg-2 hover:bg-surface-2 md:hidden"><ArrowLeft className="h-5 w-5" /></button>
  );
}

/** Each page fades and slides in slightly, like moving between screens in an app. */
export function PageTransition({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  return <div key={pathname} className="page-enter">{children}</div>;
}
