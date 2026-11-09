"use client";
import { useEffect, useState } from "react";

const COLORS = ["#FED438", "#ff5a5a", "#ffffff", "#3ccf8e", "#8cc4ec"];
const FX_KEY = "cfk-holiday-fx";

/** Twinkling string lights along the bottom edge of the top bar. */
export function HolidayLights() {
  return (
    <div aria-hidden className="cfk-lights pointer-events-none absolute inset-x-0 -bottom-[11px] z-10 h-[16px] overflow-hidden">
      <div className="absolute inset-x-0 top-0 h-[8px]" style={{ background: "radial-gradient(circle at 50% -10px, transparent 13px, rgba(30,40,55,.55) 13px, rgba(30,40,55,.55) 14.5px, transparent 15px) 0 0 / 44px 8px repeat-x" }} />
      <div className="flex" style={{ paddingLeft: 16 }}>
        {Array.from({ length: 48 }, (_, i) => (
          <span key={i} className="cfk-bulb mt-[5px] shrink-0" style={{ marginRight: 34, width: 10, height: 10, borderRadius: "50% 50% 45% 45%", background: COLORS[i % COLORS.length], boxShadow: `0 0 8px 2px ${COLORS[i % COLORS.length]}99`, animationDelay: `${(i * 0.37) % 2.4}s` }} />
        ))}
      </div>
    </div>
  );
}

/** Applies each person's "snow & lights off" choice. */
export function HolidayFx() {
  useEffect(() => {
    try { if (localStorage.getItem(FX_KEY) === "off") document.documentElement.dataset.nofx = "1"; } catch { /* ignore */ }
    return () => { delete document.documentElement.dataset.nofx; };
  }, []);
  return null;
}

export function HolidayFxToggle() {
  const [off, setOff] = useState(false);
  useEffect(() => { try { setOff(localStorage.getItem(FX_KEY) === "off"); } catch { /* ignore */ } }, []);
  const flip = () => {
    const next = !off; setOff(next);
    try { localStorage.setItem(FX_KEY, next ? "off" : "on"); } catch { /* ignore */ }
    if (next) document.documentElement.dataset.nofx = "1"; else delete document.documentElement.dataset.nofx;
  };
  return <button type="button" onClick={flip} aria-pressed={!off} className="rounded-full bg-white/15 px-3 py-1.5 text-xs font-semibold text-white hover:bg-white/25">{off ? "❄️ Turn snow & lights on" : "Turn off snow & lights"}</button>;
}
