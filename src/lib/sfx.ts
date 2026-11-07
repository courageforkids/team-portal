"use client";
/**
 * Tiny synthesized sound effects (no audio files). Phones only allow sound after a tap,
 * so the first tap anywhere unlocks audio; anything before that plays silently.
 */
let ctx: AudioContext | null = null;
const KEY = "cfk-sound";

export const soundOn = () => { try { return localStorage.getItem(KEY) !== "off"; } catch { return true; } };
export const setSound = (on: boolean) => { try { localStorage.setItem(KEY, on ? "on" : "off"); } catch { /* ignore */ } };

function ac(): AudioContext | null {
  if (typeof window === "undefined" || !soundOn()) return null;
  try {
    if (!ctx) ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    if (ctx.state === "suspended") void ctx.resume();
    return ctx.state === "running" ? ctx : null;
  } catch { return null; }
}

export function unlockAudio() {
  if (typeof window === "undefined") return;
  const go = () => { ac(); window.removeEventListener("pointerdown", go); window.removeEventListener("keydown", go); };
  window.addEventListener("pointerdown", go, { once: false });
  window.addEventListener("keydown", go, { once: false });
}

function tone(c: AudioContext, freq: number, at: number, dur: number, type: OscillatorType = "sine", vol = 0.18, endFreq?: number) {
  const o = c.createOscillator(), g = c.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, at);
  if (endFreq) o.frequency.exponentialRampToValueAtTime(endFreq, at + dur);
  g.gain.setValueAtTime(0.0001, at); g.gain.exponentialRampToValueAtTime(vol, at + 0.012); g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  o.connect(g).connect(c.destination); o.start(at); o.stop(at + dur + 0.05);
}
function noise(c: AudioContext, at: number, dur: number, vol = 0.2, filter?: { type: BiquadFilterType; from: number; to?: number; q?: number }) {
  const len = Math.max(1, Math.floor(c.sampleRate * dur));
  const buf = c.createBuffer(1, len, c.sampleRate), d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  const src = c.createBufferSource(); src.buffer = buf;
  const g = c.createGain(); g.gain.setValueAtTime(0.0001, at); g.gain.exponentialRampToValueAtTime(vol, at + Math.min(0.05, dur / 3)); g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  let node: AudioNode = src;
  if (filter) {
    const f = c.createBiquadFilter(); f.type = filter.type; f.Q.value = filter.q ?? 1; f.frequency.setValueAtTime(filter.from, at);
    if (filter.to) f.frequency.exponentialRampToValueAtTime(filter.to, at + dur);
    node.connect(f); node = f;
  }
  node.connect(g).connect(c.destination); src.start(at); src.stop(at + dur + 0.05);
}
const chord = (c: AudioContext, notes: number[], at: number, gap: number, dur: number, type: OscillatorType = "triangle", vol = 0.14) => notes.forEach((n, i) => tone(c, n, at + i * gap, dur, type, vol));

export const sfx = {
  /** Drumroll that builds for about 1.8 seconds. */
  drumroll() { const c = ac(); if (!c) return; const t = c.currentTime; for (let i = 0; i < 36; i++) noise(c, t + i * 0.05, 0.06, 0.05 + (i / 36) * 0.22, { type: "bandpass", from: 180 + i * 4, q: 0.8 }); },
  /** Magical reveal: shimmer + rising chord. */
  reveal() { const c = ac(); if (!c) return; const t = c.currentTime; noise(c, t, 0.9, 0.08, { type: "highpass", from: 5000 }); chord(c, [523.25, 659.25, 783.99, 1046.5, 1318.5], t, 0.07, 1.4, "triangle", 0.13); tone(c, 130.8, t, 1.2, "sine", 0.18); },
  tick() { const c = ac(); if (!c) return; tone(c, 880, c.currentTime, 0.06, "square", 0.05); },
  whoosh() { const c = ac(); if (!c) return; noise(c, c.currentTime, 0.7, 0.25, { type: "bandpass", from: 400, to: 3000, q: 1.2 }); },
  unfold() { const c = ac(); if (!c) return; const t = c.currentTime; for (let i = 0; i < 5; i++) noise(c, t + i * 0.06 + Math.random() * 0.02, 0.05, 0.12, { type: "highpass", from: 2500 }); chord(c, [783.99, 1174.66], t + 0.3, 0.09, 0.5, "sine", 0.1); },
  points() { const c = ac(); if (!c) return; const t = c.currentTime; tone(c, 987.77, t, 0.12, "square", 0.06); tone(c, 1318.5, t + 0.09, 0.35, "square", 0.06); },
  levelUp() { const c = ac(); if (!c) return; const t = c.currentTime; chord(c, [392, 523.25, 659.25, 783.99], t, 0.11, 0.35, "square", 0.07); chord(c, [523.25, 659.25, 783.99, 1046.5], t + 0.5, 0, 1.1, "triangle", 0.12); },
  fanfare() { const c = ac(); if (!c) return; const t = c.currentTime; [[523.25, 0], [523.25, 0.15], [523.25, 0.3], [659.25, 0.45], [587.33, 0.75], [659.25, 0.9], [783.99, 1.05]].forEach(([f, d]) => tone(c, f, t + d, d === 1.05 ? 1.2 : 0.2, "square", 0.07)); chord(c, [261.6, 329.6, 392], t + 1.05, 0, 1.3, "triangle", 0.1); },
  pop() { const c = ac(); if (!c) return; const t = c.currentTime; for (let i = 0; i < 6; i++) tone(c, 600 + Math.random() * 900, t + i * 0.04, 0.08, "sine", 0.08, 200); },
  sparkle() { const c = ac(); if (!c) return; const t = c.currentTime; for (let i = 0; i < 8; i++) tone(c, 1500 + Math.random() * 1500, t + i * 0.06, 0.25, "sine", 0.05); },
  cheer() { const c = ac(); if (!c) return; const t = c.currentTime; for (let i = 0; i < 24; i++) noise(c, t + Math.random() * 1.2, 0.03, 0.12, { type: "bandpass", from: 1200 + Math.random() * 1500, q: 2 }); },
};
