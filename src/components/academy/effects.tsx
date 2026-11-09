"use client";
import { useEffect } from "react";
import { sfx, unlockAudio } from "@/lib/music";
import type { Effect } from "@/lib/academy";

/** Fire a screen effect from anywhere: fireEffect("confetti"). */
export function fireEffect(effect: Effect, opts: { sound?: boolean } = {}) {
  window.dispatchEvent(new CustomEvent("cfk-effect", { detail: { effect, ...opts } }));
}

const reduced = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const COLORS = ["#FED438", "#004F81", "#8cc4ec", "#f0643c", "#2f9e6e", "#ffffff"];

function layer() {
  const el = document.createElement("div");
  el.setAttribute("aria-hidden", "true");
  el.style.cssText = "position:fixed;inset:0;pointer-events:none;z-index:200;overflow:hidden";
  document.body.appendChild(el);
  return el;
}
const done = (el: HTMLElement, ms: number) => setTimeout(() => el.remove(), ms);

function confetti() {
  const L = layer(), W = innerWidth, H = innerHeight, n = reduced() ? 20 : 110;
  for (let i = 0; i < n; i++) {
    const p = document.createElement("div"), s = 6 + Math.random() * 8;
    p.style.cssText = `position:absolute;left:${W / 2}px;top:${H * 0.35}px;width:${s}px;height:${s * (Math.random() < 0.5 ? 0.45 : 1)}px;background:${COLORS[i % COLORS.length]};border-radius:${Math.random() < 0.3 ? "50%" : "2px"}`;
    L.appendChild(p);
    const dx = (Math.random() - 0.5) * W * 1.1, up = -H * (0.2 + Math.random() * 0.35), rot = Math.random() * 900;
    p.animate([{ transform: "translate(0,0) rotate(0)", opacity: 1 }, { transform: `translate(${dx * 0.6}px,${up}px) rotate(${rot / 2}deg)`, opacity: 1, offset: 0.35 }, { transform: `translate(${dx}px,${H * 0.75}px) rotate(${rot}deg)`, opacity: 0 }],
      { duration: 2200 + Math.random() * 1200, easing: "cubic-bezier(.2,.6,.4,1)", fill: "forwards" });
  }
  done(L, 3600);
}

function cape() {
  const L = layer(), W = innerWidth, H = innerHeight;
  const c = document.createElement("div");
  c.innerHTML = `<svg width="180" height="150" viewBox="0 0 180 150"><path d="M20 20 Q90 0 160 20 L175 120 Q130 100 110 140 Q90 105 70 140 Q50 100 5 120 Z" fill="#004F81" stroke="#FED438" stroke-width="6"/><path d="M60 30 Q90 20 120 30" stroke="#FED438" stroke-width="4" fill="none"/></svg>`;
  c.style.cssText = `position:absolute;left:-220px;top:${H * 0.3}px;filter:drop-shadow(0 12px 18px rgba(0,0,0,.25))`;
  L.appendChild(c);
  c.animate([{ transform: "translate(0,0) rotate(-12deg) scaleX(1)" }, { transform: `translate(${W * 0.5}px,-${H * 0.15}px) rotate(6deg) scaleX(.9)` }, { transform: `translate(${W + 260}px,${H * 0.05}px) rotate(-8deg) scaleX(1)` }],
    { duration: reduced() ? 600 : 1600, easing: "cubic-bezier(.4,.1,.3,1)", fill: "forwards" });
  done(L, 1800);
}

function lumos() {
  const L = layer();
  const g = document.createElement("div");
  g.style.cssText = "position:absolute;inset:-20%;background:radial-gradient(circle at 50% 45%,rgba(254,212,56,.55),rgba(254,212,56,.18) 35%,transparent 65%)";
  L.appendChild(g);
  g.animate([{ opacity: 0, transform: "scale(.6)" }, { opacity: 1, transform: "scale(1)", offset: 0.3 }, { opacity: 0, transform: "scale(1.15)" }], { duration: 1400, easing: "ease-out", fill: "forwards" });
  done(L, 1500);
}

function cheer() {
  const L = layer(), W = innerWidth, H = innerHeight, icons = ["👏", "🎉", "🙌", "⭐", "💛", "🦸"];
  for (let i = 0; i < (reduced() ? 6 : 26); i++) {
    const e = document.createElement("div");
    e.textContent = icons[i % icons.length];
    e.style.cssText = `position:absolute;left:${Math.random() * W}px;top:${H + 20}px;font-size:${24 + Math.random() * 22}px`;
    L.appendChild(e);
    e.animate([{ transform: "translateY(0) scale(.6)", opacity: 0 }, { opacity: 1, offset: 0.2 }, { transform: `translateY(-${H * (0.5 + Math.random() * 0.4)}px) scale(1.1)`, opacity: 0 }], { duration: 1600 + Math.random() * 900, delay: Math.random() * 400, easing: "ease-out", fill: "forwards" });
  }
  done(L, 3000);
}

function snow() {
  const L = layer(), W = innerWidth, H = innerHeight;
  for (let i = 0; i < (reduced() ? 15 : 70); i++) {
    const f = document.createElement("div"), size = 4 + Math.random() * 7;
    f.style.cssText = `position:absolute;left:${Math.random() * W}px;top:-12px;width:${size}px;height:${size}px;border-radius:50%;background:#fff;box-shadow:0 0 6px rgba(140,196,236,.9);opacity:.9`;
    L.appendChild(f);
    const drift = (Math.random() - 0.5) * 120;
    f.animate([{ transform: "translate(0,0)" }, { transform: `translate(${drift}px,${H + 30}px)` }], { duration: 2600 + Math.random() * 2200, delay: Math.random() * 1200, easing: "linear", fill: "forwards" });
  }
  done(L, 5200);
}

const SOUND: Partial<Record<Effect, () => void>> = { confetti: sfx.pop, cape: sfx.whoosh, lumos: sfx.sparkle, cheer: sfx.cheer, snow: sfx.sparkle, fanfare: sfx.fanfare };

/** Mounted once in the app shell. */
export function EffectsLayer() {
  useEffect(() => {
    unlockAudio();
    const on = (e: Event) => {
      const { effect, sound = true } = (e as CustomEvent).detail as { effect: Effect; sound?: boolean };
      if (sound) SOUND[effect]?.();
      if (effect === "confetti" || effect === "fanfare") confetti();
      else if (effect === "cape") cape();
      else if (effect === "lumos") lumos();
      else if (effect === "cheer") cheer();
      else if (effect === "snow") snow();
    };
    window.addEventListener("cfk-effect", on);
    return () => window.removeEventListener("cfk-effect", on);
  }, []);
  return null;
}
