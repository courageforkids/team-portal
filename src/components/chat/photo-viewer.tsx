"use client";
import { useEffect, useRef, useState } from "react";
import { Download, X } from "lucide-react";

/** Full-screen photo viewer: pinch or double-tap to zoom, drag to pan, swipe down (or ✕) to close. */
export function PhotoViewer({ src, alt, onClose }: { src: string; alt: string; onClose: () => void }) {
  const [scale, setScale] = useState(1);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [dragY, setDragY] = useState(0);
  const g = useRef<{ dist?: number; startScale?: number; last?: { x: number; y: number }; startY?: number; lastTap?: number }>({});

  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", k);
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", k); document.body.style.overflow = ""; };
  }, [onClose]);

  const distance = (t: React.TouchList) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
  const reset = () => { setScale(1); setPos({ x: 0, y: 0 }); };

  return (
    <div role="dialog" aria-modal="true" aria-label="Photo" className="fixed inset-0 z-[300] flex items-center justify-center bg-black/95"
      style={{ opacity: 1 - Math.min(0.6, Math.abs(dragY) / 400) }}
      onTouchStart={(e) => {
        if (e.touches.length === 2) { g.current.dist = distance(e.touches); g.current.startScale = scale; }
        else if (e.touches.length === 1) {
          const now = Date.now();
          if (g.current.lastTap && now - g.current.lastTap < 280) { if (scale > 1) reset(); else setScale(2.5); g.current.lastTap = 0; return; }
          g.current.lastTap = now;
          g.current.last = { x: e.touches[0].clientX, y: e.touches[0].clientY };
          g.current.startY = e.touches[0].clientY;
        }
      }}
      onTouchMove={(e) => {
        if (e.touches.length === 2 && g.current.dist) {
          setScale(Math.min(5, Math.max(1, (g.current.startScale ?? 1) * (distance(e.touches) / g.current.dist))));
        } else if (e.touches.length === 1 && g.current.last) {
          const t = e.touches[0];
          if (scale > 1) setPos((p) => ({ x: p.x + t.clientX - g.current.last!.x, y: p.y + t.clientY - g.current.last!.y }));
          else setDragY(t.clientY - (g.current.startY ?? t.clientY));
          g.current.last = { x: t.clientX, y: t.clientY };
        }
      }}
      onTouchEnd={() => {
        g.current.dist = undefined;
        if (scale <= 1.02) { setPos({ x: 0, y: 0 }); if (Math.abs(dragY) > 120) onClose(); }
        setDragY(0);
      }}
      onClick={(e) => { if (e.target === e.currentTarget && scale === 1) onClose(); }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt={alt} draggable={false} className="max-h-full max-w-full select-none object-contain transition-transform duration-75"
        onDoubleClick={() => (scale > 1 ? reset() : setScale(2.5))}
        style={{ transform: `translate(${pos.x}px, ${pos.y + dragY}px) scale(${scale})` }} />
      <div className="absolute right-3 top-[max(12px,env(safe-area-inset-top))] flex gap-2">
        <a href={src.replace("?inline=1", "")} className="grid h-10 w-10 place-items-center rounded-full bg-white/15 text-white" aria-label="Download photo"><Download className="h-5 w-5" /></a>
        <button onClick={onClose} className="grid h-10 w-10 place-items-center rounded-full bg-white/15 text-white" aria-label="Close photo"><X className="h-5 w-5" /></button>
      </div>
    </div>
  );
}
