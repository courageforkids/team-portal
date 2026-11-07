"use client";
import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { fireEffect } from "./effects";

/** Confetti once on your birthday, and a rare shooting star on ordinary days. */
export function HomeMagic({ myBirthday, year }: { myBirthday: boolean; year: number }) {
  useEffect(() => {
    try {
      const k = `cfk-bday-${year}`;
      if (myBirthday && !localStorage.getItem(k)) { localStorage.setItem(k, "1"); setTimeout(() => fireEffect("confetti"), 600); return; }
    } catch { /* ignore */ }
    if (Math.random() < 1 / 40) setTimeout(() => fireEffect("star"), 1500);
  }, [myBirthday, year]);
  return null;
}

/** Tap the logo 5 times quickly: the caped kid flies off and leaves a star that leads to the Hall of Legends. */
export function LogoTaps({ children }: { children: ReactNode }) {
  const [taps, setTaps] = useState<number[]>([]);
  const [star, setStar] = useState(false);
  return (
    <span className="relative"
      onClickCapture={(e) => {
        const now = Date.now();
        const list = [...taps.filter((t) => now - t < 2500), now];
        setTaps(list);
        if (list.length >= 5) {
          e.preventDefault(); e.stopPropagation(); setTaps([]);
          const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
          fireEffect("kid", { from: { x: r.left + 22, y: r.top + r.height / 2 } });
          setTimeout(() => { setStar(true); setTimeout(() => setStar(false), 7000); }, 2300);
        } else if (list.length > 1) e.preventDefault();
      }}>
      {children}
      {star && <Link href="/legends" aria-label="A golden star appeared" className="fixed right-6 top-6 z-[210] text-4xl" style={{ animation: "cfk-unfold .5s ease both" }}>⭐</Link>}
    </span>
  );
}
