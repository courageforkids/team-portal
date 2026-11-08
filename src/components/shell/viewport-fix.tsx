"use client";
import { useEffect } from "react";

/**
 * Makes the portal feel like a native app on phones:
 * - blocks pinch-zoom (iPhone ignores the viewport setting for that, so we stop the gesture),
 * - tracks the visible area when the keyboard is open, so screens marked data-kb-fit (like chat)
 *   shrink to fit above the keyboard instead of the whole page sliding up.
 */
export function ViewportFix() {
  useEffect(() => {
    const stop = (e: Event) => e.preventDefault();
    document.addEventListener("gesturestart", stop, { passive: false });
    document.addEventListener("gesturechange", stop, { passive: false });
    // Two-finger zoom on browsers that report it as a multi-touch move.
    const pinch = (e: TouchEvent) => { if (e.touches.length > 1) e.preventDefault(); };
    document.addEventListener("touchmove", pinch, { passive: false });

    const vv = window.visualViewport;
    const root = document.documentElement;
    const update = () => {
      if (!vv) return;
      const open = vv.height < window.innerHeight * 0.8;
      root.classList.toggle("kb-open", open);
      root.style.setProperty("--vvh", `${vv.height}px`);
      root.style.setProperty("--vvtop", `${vv.offsetTop}px`);
    };
    vv?.addEventListener("resize", update);
    vv?.addEventListener("scroll", update);
    update();
    return () => {
      document.removeEventListener("gesturestart", stop);
      document.removeEventListener("gesturechange", stop);
      document.removeEventListener("touchmove", pinch);
      vv?.removeEventListener("resize", update);
      vv?.removeEventListener("scroll", update);
    };
  }, []);
  return null;
}
