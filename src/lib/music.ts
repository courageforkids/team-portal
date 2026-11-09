"use client";
/**
 * Courage Academy music + sound effects, all synthesized with the Web Audio API (no audio files).
 *
 * Every melody here is original. Style target: whimsical "magic school" orchestra — a 3/4 waltz,
 * celesta / music-box tune over soft strings, minor key with chromatic turns, bells, a little brass,
 * and a choir "ahh" for big moments.
 *
 * Drop-in superset of `src/lib/sfx.ts`: same `soundOn` / `setSound` / `unlockAudio` / `sfx.*` names.
 * - Call `unlockAudio()` once on mount (phones only allow audio after a tap; the first tap/keypress resumes audio
 *   and starts any music that was requested before that).
 * - Nothing here ever throws; with no Web Audio (or during SSR) every call silently does nothing.
 * - `sfx.*` methods don't use `this`, so they can be passed around unbound (`onClick={sfx.pop}`).
 *
 * Graph: voices → (track gain → music bus → duck) | (sfx bus) → master → compressor → speakers,
 *        with a shared convolution "hall" reverb on sends from the music and sfx buses.
 */

export type MusicTrack = "academy" | "navy" | "gold" | "ember" | "evergreen" | "trivia" | "winter";
type Cape = "navy" | "gold" | "ember" | "evergreen";

/* ───────────────────────── settings ───────────────────────── */

const SFX_KEY = "cfk-sound";
const MUSIC_KEY = "cfk-music";
const MUSIC_VOL = 0.42; // background level
const SFX_VOL = 0.85;
const LOOKAHEAD = 0.12; // seconds of notes scheduled ahead
const TICK_MS = 25;
const XFADE = 1.5;
const MUSIC_VOICE_CAP = 44; // music skips accompaniment notes above this many live voices
const HARD_VOICE_CAP = 90; // nothing new above this (protects slow phones)

const memo: Record<string, string> = {}; // fallback when localStorage is unavailable (private mode, sandboxed frames)
function readKey(k: string): string | null { try { return window.localStorage.getItem(k) ?? memo[k] ?? null; } catch { return memo[k] ?? null; } }
function writeKey(k: string, v: string) { memo[k] = v; try { window.localStorage.setItem(k, v); } catch { /* private mode etc. */ } }

/** Sound effects switch (persists in localStorage "cfk-sound"). */
export const soundOn = (): boolean => readKey(SFX_KEY) !== "off";
export const setSound = (on: boolean): void => { writeKey(SFX_KEY, on ? "on" : "off"); };

/** Background music switch (persists in localStorage "cfk-music", default on). */
export const musicOn = (): boolean => readKey(MUSIC_KEY) !== "off";
/** Turning music off stops it at once; turning it back on resumes the last track that was asked for. */
export const setMusic = (on: boolean): void => {
  try {
    writeKey(MUSIC_KEY, on ? "on" : "off");
    if (!on) { const keep = wanted; stopInternal(0.05); wanted = keep; }
    else if (wanted) playMusic(wanted);
  } catch { /* never throw */ }
};

/* ───────────────────────── context + graph ───────────────────────── */

interface Graph {
  master: GainNode;
  music: GainNode;
  duck: GainNode;
  sfx: GainNode;
  dry: GainNode;
  noise: AudioBuffer;
}

let ctx: AudioContext | null = null;
let graph: Graph | null = null;
let live = 0; // voices currently scheduled/playing
let collector: AudioScheduledSourceNode[] | null = null; // when set, new sources are registered here (for stoppable groups)
const noiseOffsets = new WeakMap<AudioScheduledSourceNode, number>();

function hasActivation(): boolean {
  try {
    const ua = (navigator as Navigator & { userActivation?: { hasBeenActive: boolean } }).userActivation;
    return ua ? ua.hasBeenActive : true;
  } catch { return true; }
}

function makeIR(c: AudioContext, seconds = 2.5): AudioBuffer {
  const sr = c.sampleRate, len = Math.floor(sr * seconds), pre = Math.floor(sr * 0.015);
  const buf = c.createBuffer(2, len, sr);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    let y = 0;
    for (let i = pre; i < len; i++) {
      const t = (i - pre) / sr;
      const a = 0.65 - 0.5 * (t / seconds); // tail gets darker
      y += a * ((Math.random() * 2 - 1) - y);
      d[i] = y * Math.exp((-6.9 * t) / seconds) * (1 - (i / len) ** 4);
    }
  }
  return buf;
}

function build(c: AudioContext): Graph {
  const master = c.createGain(); master.gain.value = 0.9;
  const comp = c.createDynamicsCompressor();
  comp.threshold.value = -12; comp.knee.value = 8; comp.ratio.value = 8; comp.attack.value = 0.002; comp.release.value = 0.2;
  master.connect(comp); comp.connect(c.destination);

  const verbIn = c.createGain();
  const conv = c.createConvolver(); conv.buffer = makeIR(c);
  const verbOut = c.createGain(); verbOut.gain.value = 0.6;
  verbIn.connect(conv); conv.connect(verbOut); verbOut.connect(master);

  const music = c.createGain(); music.gain.value = MUSIC_VOL;
  const duck = c.createGain();
  music.connect(duck); duck.connect(master);
  const mSend = c.createGain(); mSend.gain.value = 0.5; duck.connect(mSend); mSend.connect(verbIn);

  const sfx = c.createGain(); sfx.gain.value = SFX_VOL;
  sfx.connect(master);
  const sSend = c.createGain(); sSend.gain.value = 0.35; sfx.connect(sSend); sSend.connect(verbIn);
  const dry = c.createGain(); dry.gain.value = SFX_VOL; dry.connect(master);

  const nlen = c.sampleRate * 2;
  const noise = c.createBuffer(1, nlen, c.sampleRate);
  const nd = noise.getChannelData(0);
  for (let i = 0; i < nlen; i++) nd[i] = Math.random() * 2 - 1;
  return { master, music, duck, sfx, dry, noise };
}

function getCtx(create: boolean): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (ctx && ctx.state === "closed") { ctx = null; graph = null; }
  if (ctx) return ctx;
  if (!create) return null;
  const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return null;
  const c = new AC({ latencyHint: "interactive" });
  graph = build(c);
  ctx = c;
  c.onstatechange = () => { if (c.state === "running") onRunning(); };
  return c;
}

/** The running context, or null (and a resume attempt) if audio isn't available yet. */
function runningCtx(): AudioContext | null {
  const c = getCtx(hasActivation());
  if (!c || !graph) return null;
  if (c.state !== "running") { try { void c.resume().catch(() => undefined); } catch { /* ignore */ } return null; }
  return c;
}

let unlockInstalled = false;
/** Install once (e.g. in a top-level client component's useEffect). Safe to call many times. */
export function unlockAudio(): void {
  try {
    if (typeof window === "undefined" || unlockInstalled) return;
    unlockInstalled = true;
    const go = () => {
      try {
        if (!soundOn() && !musicOn()) return;
        const c = getCtx(true);
        if (!c) return;
        if (c.state !== "running") {
          // iOS: playing a silent buffer inside the gesture unlocks output
          const s = c.createBufferSource(); s.buffer = c.createBuffer(1, 1, c.sampleRate); s.connect(c.destination); s.start(0);
          void c.resume().then(onRunning).catch(() => undefined);
        } else onRunning();
      } catch { /* ignore */ }
    };
    for (const ev of ["pointerdown", "keydown", "touchend", "click"]) window.addEventListener(ev, go, { capture: true, passive: true });
    document.addEventListener("visibilitychange", () => {
      try {
        if (!ctx) return;
        // Background tabs throttle timers, which would make the music stutter: pause audio while hidden.
        if (document.hidden) { if (ctx.state === "running" && playing) void ctx.suspend().catch(() => undefined); }
        else if (ctx.state !== "running") void ctx.resume().catch(() => undefined);
      } catch { /* ignore */ }
    });
  } catch { /* never throw */ }
}

function onRunning() {
  try { if (pendingStart && wanted && musicOn()) { pendingStart = false; startTrack(wanted); } } catch { /* ignore */ }
}

/* ───────────────────────── low-level helpers ───────────────────────── */

const mtof = (m: number) => 440 * Math.pow(2, (m - 69) / 12);
function disc(n: AudioNode) { try { n.disconnect(); } catch { /* ignore */ } }

function mkOsc(c: AudioContext, type: OscillatorType, f: number, t: number): OscillatorNode {
  const o = c.createOscillator(); o.type = type; o.frequency.setValueAtTime(f, t); return o;
}
function mkGain(c: AudioContext, v = 0): GainNode { const g = c.createGain(); g.gain.value = v; return g; }
function mkFilter(c: AudioContext, type: BiquadFilterType, f: number, q = 0.8): BiquadFilterNode {
  const b = c.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q; return b;
}
function mkNoise(c: AudioContext, g: Graph): AudioBufferSourceNode {
  const s = c.createBufferSource(); s.buffer = g.noise; s.loop = true; noiseOffsets.set(s, Math.random() * 1.8); return s;
}
/** Percussive envelope: quick attack to `peak`, exponential decay to silence at `end`. */
function perc(gp: AudioParam, t: number, atk: number, peak: number, end: number) {
  gp.setValueAtTime(0.0001, t);
  gp.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t + atk);
  gp.exponentialRampToValueAtTime(0.0001, Math.max(end, t + atk + 0.01));
}
/** Sustained envelope: linear attack, hold, smooth release; silent by `t+dur+rel*4`. */
function sus(gp: AudioParam, t: number, atk: number, peak: number, dur: number, rel: number) {
  gp.setValueAtTime(0, t);
  gp.linearRampToValueAtTime(peak, t + atk);
  gp.setValueAtTime(peak, t + Math.max(atk, dur));
  gp.setTargetAtTime(0, t + Math.max(atk, dur), rel);
}
/** Start/stop sources and free every node when the voice ends. */
function fin(srcs: AudioScheduledSourceNode[], nodes: AudioNode[], t0: number, t1: number) {
  live++;
  let done = false;
  const end = () => {
    if (done) return; done = true; live--;
    for (const s of srcs) disc(s);
    for (const n of nodes) disc(n);
  };
  for (const s of srcs) {
    const off = noiseOffsets.get(s);
    if (off !== undefined) (s as AudioBufferSourceNode).start(t0, off); else s.start(t0);
    s.stop(t1);
    if (collector) collector.push(s);
  }
  srcs[0].onended = end;
}
function vibrato(c: AudioContext, t: number, rate: number, cents: number, delay: number, targets: AudioParam[]): AudioNode[] {
  const lfo = mkOsc(c, "sine", rate, t), lg = mkGain(c, 0);
  lg.gain.setValueAtTime(0, t); lg.gain.linearRampToValueAtTime(cents, t + delay + 0.25);
  lfo.connect(lg); for (const p of targets) lg.connect(p);
  return [lfo, lg];
}

/* ───────────────────────── instruments ───────────────────────── */
// Each takes (ctx, graph, destination, start time, midi note(s), duration seconds, peak level, ...).

/** Celesta / music box: sine + bright inharmonic partials, instant attack, ringing decay. */
function celesta(c: AudioContext, out: AudioNode, t: number, m: number, dur: number, v: number) {
  const f = mtof(m);
  const len = Math.min(2.4, Math.max(0.7, dur + 0.9)) * (f > 1600 ? 0.65 : 1);
  const parts: [number, number, number][] = [[1, 1, len], [4.01, 0.16, len * 0.28], [6.79, 0.05, 0.07], [2.0, 0.08, len * 0.5]];
  const srcs: OscillatorNode[] = [], nodes: AudioNode[] = [];
  for (const [r, a, l] of parts) {
    if (f * r > 15000) continue;
    const o = mkOsc(c, "sine", f * r, t), g = mkGain(c);
    perc(g.gain, t, 0.003, v * a, t + l);
    o.connect(g); g.connect(out); srcs.push(o); nodes.push(g);
  }
  fin(srcs, nodes, t, t + len + 0.05);
}

/** Church/tubular bell: hum, prime, tierce (minor third), fifth-ish and nominal partials. */
function bell(c: AudioContext, out: AudioNode, t: number, m: number, v: number, len = 3) {
  const f = mtof(m);
  const parts: [number, number, number][] = [[0.5, 0.3, 1], [1, 1, 0.75], [1.19, 0.35, 0.45], [2, 0.32, 0.35], [2.74, 0.12, 0.18]];
  const srcs: OscillatorNode[] = [], nodes: AudioNode[] = [];
  for (const [r, a, l] of parts) {
    if (f * r > 15000) continue;
    const o = mkOsc(c, "sine", f * r, t), g = mkGain(c);
    perc(g.gain, t, 0.004, v * a, t + len * l);
    o.connect(g); g.connect(out); srcs.push(o); nodes.push(g);
  }
  fin(srcs, nodes, t, t + len + 0.05);
}

/** Pizzicato string (saw through a closing lowpass) or harp (triangle, longer ring). */
function pluck(c: AudioContext, out: AudioNode, t: number, m: number, v: number, harp = false) {
  const f = mtof(m);
  const len = harp ? 1.6 : m < 55 ? 0.75 : 0.42;
  const o = mkOsc(c, harp ? "triangle" : "sawtooth", f, t);
  const lp = mkFilter(c, "lowpass", Math.min(f * (harp ? 6 : 9), 7000), harp ? 0.7 : 2.5);
  lp.frequency.setValueAtTime(Math.min(f * (harp ? 6 : 9), 7000), t);
  lp.frequency.exponentialRampToValueAtTime(Math.max(f * (harp ? 2.5 : 1.4), 150), t + (harp ? 0.6 : 0.16));
  const g = mkGain(c);
  perc(g.gain, t, 0.003, v, t + len);
  o.connect(lp); lp.connect(g); g.connect(out);
  fin([o], [lp, g], t, t + len + 0.05);
}

/** String pad: two detuned saws per note through one lowpass, slow attack. */
function pad(c: AudioContext, out: AudioNode, t: number, ms: number[], dur: number, v: number, cutoff = 1200, atk = 0.4) {
  const lp = mkFilter(c, "lowpass", cutoff, 0.6), g = mkGain(c);
  const peak = v / Math.sqrt(ms.length * 2);
  sus(g.gain, t, atk, peak, dur, 0.22);
  const srcs: OscillatorNode[] = [];
  for (const m of ms) for (const dt of [-8, 7]) {
    const o = mkOsc(c, "sawtooth", mtof(m), t); o.detune.value = dt; o.connect(lp); srcs.push(o);
  }
  lp.connect(g); g.connect(out);
  fin(srcs, [lp, g], t, t + dur + 1.1);
}

/** Solo strings (violin/cello line): detuned saws, gentle filter, delayed vibrato. */
function strings(c: AudioContext, out: AudioNode, t: number, m: number, dur: number, v: number, cutoff = 2600) {
  const f = mtof(m);
  const a = mkOsc(c, "sawtooth", f, t), b = mkOsc(c, "sawtooth", f, t);
  a.detune.value = -6; b.detune.value = 6;
  const lp = mkFilter(c, "lowpass", cutoff, 0.5), g = mkGain(c);
  sus(g.gain, t, Math.min(0.09, dur * 0.4), v * 0.5, dur, 0.09);
  const vib = vibrato(c, t, 5.3, 10, 0.18, [a.detune, b.detune]);
  a.connect(lp); b.connect(lp); lp.connect(g); g.connect(out);
  fin([a, b, vib[0] as OscillatorNode], [lp, g, vib[1]], t, t + dur + 0.5);
}

/** Choir "ahh": saws through three vowel formant bandpasses (~800/1150/2900 Hz) with vibrato. */
function choir(c: AudioContext, out: AudioNode, t: number, ms: number[], dur: number, v: number, atk = 0.5) {
  const mix = mkGain(c, 1 / Math.sqrt(ms.length * 2));
  const srcs: OscillatorNode[] = [], params: AudioParam[] = [];
  for (const m of ms) for (const dt of [-10, 9]) {
    const o = mkOsc(c, "sawtooth", mtof(m), t); o.detune.value = dt; o.connect(mix); srcs.push(o); params.push(o.detune);
  }
  const vib = vibrato(c, t, 4.8, 14, 0.1, params);
  const env = mkGain(c);
  sus(env.gain, t, atk, v * 3.2, dur, 0.3);
  const nodes: AudioNode[] = [mix, env, vib[1]];
  for (const [f, q, a] of [[800, 5, 1], [1150, 6, 0.55], [2900, 8, 0.28]] as const) {
    const bp = mkFilter(c, "bandpass", f, q), fg = mkGain(c, a);
    mix.connect(bp); bp.connect(fg); fg.connect(env); nodes.push(bp, fg);
  }
  env.connect(out);
  srcs.push(vib[0] as OscillatorNode);
  fin(srcs, nodes, t, t + dur + 1.4);
}

/** Brass: saws with a "blat" filter envelope and a small pitch scoop. */
function brass(c: AudioContext, out: AudioNode, t: number, m: number, dur: number, v: number, bright = 1) {
  const f = mtof(m);
  const a = mkOsc(c, "sawtooth", f, t), b = mkOsc(c, "sawtooth", f, t);
  for (const [o, d] of [[a, -5], [b, 5]] as const) { o.detune.setValueAtTime(d - 35, t); o.detune.linearRampToValueAtTime(d, t + 0.06); }
  const lp = mkFilter(c, "lowpass", f * 1.2, 1.4);
  lp.frequency.setValueAtTime(f * 1.2, t);
  lp.frequency.exponentialRampToValueAtTime(Math.min(f * 7 * bright, 7000), t + 0.06);
  lp.frequency.setTargetAtTime(Math.min(f * 3.5 * bright, 5000), t + 0.08, 0.15);
  const g = mkGain(c);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(v * 0.5, t + 0.025);
  g.gain.setTargetAtTime(v * 0.38, t + 0.03, 0.12);
  g.gain.setValueAtTime(v * 0.38, t + Math.max(0.05, dur));
  g.gain.setTargetAtTime(0, t + Math.max(0.05, dur), 0.07);
  a.connect(lp); b.connect(lp); lp.connect(g); g.connect(out);
  fin([a, b], [lp, g], t, t + dur + 0.5);
}

/** Timpani: sine with pitch drop + second mode + soft mallet noise. */
function timp(c: AudioContext, gr: Graph, out: AudioNode, t: number, m: number, v: number) {
  const f = mtof(m);
  const o1 = mkOsc(c, "sine", f * 1.5, t); o1.frequency.exponentialRampToValueAtTime(f, t + 0.05);
  const o2 = mkOsc(c, "sine", f * 1.51, t);
  const g1 = mkGain(c), g2 = mkGain(c);
  perc(g1.gain, t, 0.004, v, t + 1.6); perc(g2.gain, t, 0.004, v * 0.3, t + 0.5);
  const n = mkNoise(c, gr), lp = mkFilter(c, "lowpass", 320, 1), gn = mkGain(c);
  perc(gn.gain, t, 0.002, v * 0.7, t + 0.08);
  o1.connect(g1); o2.connect(g2); n.connect(lp); lp.connect(gn);
  g1.connect(out); g2.connect(out); gn.connect(out);
  fin([o1, o2, n], [g1, g2, lp, gn], t, t + 1.7);
}

/** Cymbal: filtered noise. `swell` = reverse-cymbal style build to the end. */
function cymbal(c: AudioContext, gr: Graph, out: AudioNode, t: number, dur: number, v: number, swell = false, hp = 6000) {
  const n = mkNoise(c, gr), f = mkFilter(c, "highpass", hp, 0.5), g = mkGain(c);
  if (swell) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(v, t + dur);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.35);
  } else perc(g.gain, t, 0.004, v, t + dur);
  n.connect(f); f.connect(g); g.connect(out);
  fin([n], [f, g], t, t + dur + (swell ? 0.4 : 0.05));
}

/** Drum roll: noise amplitude-modulated by a fast LFO. Snare (bright) or timpani (low sine + dark noise). */
function roll(c: AudioContext, gr: Graph, out: AudioNode, t: number, dur: number, v0: number, v1: number, kind: "snare" | "timp", m = 45) {
  const srcs: AudioScheduledSourceNode[] = [], nodes: AudioNode[] = [];
  const am = mkGain(c, 0.55), lfo = mkOsc(c, "square", kind === "snare" ? 15 : 11, t), lg = mkGain(c, 0.45);
  lfo.frequency.linearRampToValueAtTime(kind === "snare" ? 23 : 14, t + dur);
  lfo.connect(lg); lg.connect(am.gain);
  const n = mkNoise(c, gr);
  const f = kind === "snare" ? mkFilter(c, "bandpass", 2400, 0.6) : mkFilter(c, "lowpass", 260, 0.8);
  n.connect(f); f.connect(am);
  srcs.push(n, lfo); nodes.push(am, lg, f);
  if (kind === "timp") {
    const o = mkOsc(c, "sine", mtof(m), t), og = mkGain(c, 1.6);
    o.connect(og); og.connect(am); srcs.push(o); nodes.push(og);
  }
  const env = mkGain(c);
  env.gain.setValueAtTime(Math.max(v0, 0.0002), t);
  env.gain.exponentialRampToValueAtTime(Math.max(v1, 0.0002), t + dur);
  env.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.12);
  am.connect(env); env.connect(out); nodes.push(env);
  fin(srcs, nodes, t, t + dur + 0.15);
}

/** Sleigh-bell shake: three tiny bandpassed noise bursts. */
function sleigh(c: AudioContext, gr: Graph, out: AudioNode, t: number, v: number) {
  const n = mkNoise(c, gr), bp = mkFilter(c, "bandpass", 7800, 2.5), g = mkGain(c);
  g.gain.setValueAtTime(0.0001, t);
  for (let i = 0; i < 3; i++) {
    const s = t + i * 0.034;
    g.gain.exponentialRampToValueAtTime(v * (1 - i * 0.2), s + 0.003);
    g.gain.exponentialRampToValueAtTime(v * 0.15, s + 0.03);
  }
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.26);
  n.connect(bp); bp.connect(g); g.connect(out);
  fin([n], [bp, g], t, t + 0.28);
}

/** Clarinet-ish reed: square (odd harmonics) through a lowpass, light vibrato. */
function reed(c: AudioContext, out: AudioNode, t: number, m: number, dur: number, v: number) {
  const f = mtof(m);
  const o = mkOsc(c, "square", f, t), lp = mkFilter(c, "lowpass", Math.min(f * 3.5, 3800), 0.7), g = mkGain(c);
  sus(g.gain, t, 0.035, v * 0.3, dur, 0.05);
  const vib = vibrato(c, t, 4.8, 7, 0.25, [o.detune]);
  o.connect(lp); lp.connect(g); g.connect(out);
  fin([o, vib[0] as OscillatorNode], [lp, g, vib[1]], t, t + dur + 0.35);
}

/** Flute-ish: triangle + soft octave, breathy attack, vibrato. */
function flute(c: AudioContext, out: AudioNode, t: number, m: number, dur: number, v: number) {
  const f = mtof(m);
  const a = mkOsc(c, "triangle", f, t), b = mkOsc(c, "sine", f * 2, t), bg = mkGain(c, 0.12), g = mkGain(c);
  sus(g.gain, t, 0.06, v * 0.7, dur, 0.06);
  const vib = vibrato(c, t, 5, 12, 0.2, [a.detune, b.detune]);
  a.connect(g); b.connect(bg); bg.connect(g); g.connect(out);
  fin([a, b, vib[0] as OscillatorNode], [bg, g, vib[1]], t, t + dur + 0.4);
}

/** Wood-block / clock tick. */
function wood(c: AudioContext, out: AudioNode, t: number, v: number, f = 1500) {
  const o = mkOsc(c, "sine", f * 1.25, t), g = mkGain(c);
  o.frequency.exponentialRampToValueAtTime(f, t + 0.012);
  perc(g.gain, t, 0.001, v, t + 0.06);
  const o2 = mkOsc(c, "triangle", f * 2.7, t), g2 = mkGain(c);
  perc(g2.gain, t, 0.001, v * 0.3, t + 0.02);
  o.connect(g); o2.connect(g2); g.connect(out); g2.connect(out);
  fin([o, o2], [g, g2], t, t + 0.08);
}

/** Deep cinematic boom. */
function boom(c: AudioContext, gr: Graph, out: AudioNode, t: number, v: number) {
  const o = mkOsc(c, "sine", 75, t), g = mkGain(c);
  o.frequency.exponentialRampToValueAtTime(34, t + 0.7);
  perc(g.gain, t, 0.005, v, t + 1.8);
  const o2 = mkOsc(c, "sine", 150, t), g2 = mkGain(c); // octave so phones can hear it
  o2.frequency.exponentialRampToValueAtTime(70, t + 0.5);
  perc(g2.gain, t, 0.005, v * 0.4, t + 0.6);
  const n = mkNoise(c, gr), lp = mkFilter(c, "lowpass", 180, 0.7), gn = mkGain(c);
  perc(gn.gain, t, 0.003, v * 0.8, t + 0.45);
  o.connect(g); o2.connect(g2); n.connect(lp); lp.connect(gn);
  g.connect(out); g2.connect(out); gn.connect(out);
  fin([o, o2, n], [g, g2, lp, gn], t, t + 1.9);
}

/** Noise swish with a bandpass sweep (whoosh, page turn) and optional stereo sweep. */
function swish(c: AudioContext, gr: Graph, out: AudioNode, t: number, dur: number, v: number, f0: number, f1: number, f2: number, q = 1, panFrom = 0, panTo = 0) {
  const n = mkNoise(c, gr), bp = mkFilter(c, "bandpass", f0, q), g = mkGain(c);
  bp.frequency.setValueAtTime(f0, t);
  bp.frequency.exponentialRampToValueAtTime(f1, t + dur * 0.55);
  bp.frequency.exponentialRampToValueAtTime(f2, t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(v, t + dur * 0.45);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  n.connect(bp); bp.connect(g);
  const nodes: AudioNode[] = [bp, g];
  if ((panFrom || panTo) && typeof c.createStereoPanner === "function") {
    const p = c.createStereoPanner();
    p.pan.setValueAtTime(panFrom, t); p.pan.linearRampToValueAtTime(panTo, t + dur);
    g.connect(p); p.connect(out); nodes.push(p);
  } else g.connect(out);
  fin([n], nodes, t, t + dur + 0.05);
}

/** Short filtered noise click (paper crinkle, clap). */
function click(c: AudioContext, gr: Graph, out: AudioNode, t: number, v: number, f: number, q: number, len: number, type: BiquadFilterType = "bandpass") {
  const n = mkNoise(c, gr), bp = mkFilter(c, type, f, q), g = mkGain(c);
  perc(g.gain, t, 0.001, v, t + len);
  n.connect(bp); bp.connect(g); g.connect(out);
  fin([n], [bp, g], t, t + len + 0.03);
}

/* ───────────────────────── music data ───────────────────────── */

type Inst = "cel" | "bell" | "pizz" | "harp" | "pad" | "str" | "choir" | "brass" | "timp" | "cym" | "swell" | "troll" | "sleigh" | "reed" | "flute" | "wood";
type Pan = "c" | "l" | "r";
interface Ev { b: number; d: number; i: Inst; n: number[]; v: number; p?: number; pan?: Pan; mel?: boolean }
interface Arr { bpm: number; bpb: number; bars: number; ev: Ev[] }
interface Harm { root: number; pcs: number[] }
interface Note { p: number; d: number; m: number }
interface Bar { h: Harm; mel: Note[]; idx: number }

const PC: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
function parseNote(s: string): number {
  const mm = /^([A-G])(#|b)?(-?\d)$/.exec(s);
  if (!mm) return -1;
  return 12 * (Number(mm[3]) + 1) + PC[mm[1]] + (mm[2] === "#" ? 1 : mm[2] === "b" ? -1 : 0);
}
function parseLine(line: string): Note[] {
  const out: Note[] = [];
  let p = 0;
  for (const tok of line.trim().split(/\s+/)) {
    const [name, dur] = tok.split(":");
    const d = Number(dur);
    if (name !== "r") out.push({ p, d, m: parseNote(name) });
    p += d;
  }
  return out;
}

// chord name → [root pc, chord-tone pcs]
const CH: Record<string, [number, number[]]> = {
  Dm: [2, [2, 5, 9]], D: [2, [2, 6, 9]], Bb: [10, [10, 2, 5]], Bm: [11, [11, 2, 6]], A7: [9, [9, 1, 4, 7]],
  Gm: [7, [7, 10, 2]], G: [7, [7, 11, 2]], G7: [7, [7, 11, 2, 5]], Em7b5: [4, [4, 7, 10, 2]], Em7: [4, [4, 7, 11, 2]],
  F: [5, [5, 9, 0]], C: [0, [0, 4, 7]], Bbm: [10, [10, 1, 5]], Eb: [3, [3, 7, 10]],
  Am: [9, [9, 0, 4]], E7: [4, [4, 8, 11, 2]], Dm6: [2, [2, 5, 9, 11]],
};

/**
 * Main theme (original), D minor, 3/4 waltz, 32 bars: A (1–8) A' (9–16) B in F major (17–24) A'' (25–32)
 * with "magic" chromatic chords in A'': B♭ minor (borrowed iv of F) and E♭ major (Neapolitan).
 */
const THEME: [string, string][] = [
  ["Dm", "D5:0.5 E5:0.5 F5:1 A5:1"],
  ["Dm", "D6:1.5 C6:0.5 A5:1"],
  ["Bb", "Bb5:1 F5:1 D5:1"],
  ["A7", "C#5:1 E5:0.5 G5:0.5 A5:1"],
  ["Dm", "D6:1.5 C#6:0.5 D6:0.5 A5:0.5"],
  ["Gm", "G5:1 Bb5:1 D6:1"],
  ["Em7b5", "Bb5:1.5 A5:0.5 G5:1"],
  ["A7", "E5:2 C#5:1"],

  ["Dm", "D5:0.5 E5:0.5 F5:1 A5:1"],
  ["Dm", "D6:1.5 C6:0.5 A5:1"],
  ["Bb", "Bb5:1 D6:0.5 C6:0.5 Bb5:1"],
  ["Gm", "G5:1.5 A5:0.5 Bb5:1"],
  ["Dm", "A5:1.5 G#5:0.5 A5:0.5 F5:0.5"],
  ["Em7b5", "E5:1 G5:1 Bb5:1"],
  ["A7", "A5:1 G5:0.5 E5:0.5 C#5:1"],
  ["Dm", "D5:3"],

  ["F", "F5:0.5 G5:0.5 A5:1 C6:1"],
  ["C", "E6:1.5 D6:0.5 C6:1"],
  ["Dm", "D6:1 A5:1 F5:1"],
  ["C", "E5:1 G5:1 C6:1"],
  ["Bb", "D6:1.5 C6:0.5 Bb5:1"],
  ["F", "A5:1 C6:0.5 Bb5:0.5 A5:1"],
  ["Gm", "Bb5:1 G5:1 D5:1"],
  ["A7", "C#6:1 A5:1 E5:1"],

  ["Dm", "D5:0.5 E5:0.5 F5:1 A5:1"],
  ["Dm", "D6:1.5 C6:0.5 A5:1"],
  ["Bbm", "Bb5:1 F5:1 Db5:1"],
  ["A7", "C#5:1 E5:0.5 G5:0.5 A5:1"],
  ["Dm", "D6:1.5 C#6:0.5 D6:0.5 A5:0.5"],
  ["Eb", "G5:1 Bb5:1 Eb6:1"],
  ["A7", "E6:1 C#6:1 A5:1"],
  ["Dm", "D6:2 r:1"],
];
const B_SECTION = (i: number) => i >= 16 && i < 24;
const KEEP_CHROMATIC = new Set([26, 29]);

type Mode = "minor" | "major" | "dorian";
const MODE_CHORDS: Record<Exclude<Mode, "minor">, Record<string, string>> = {
  major: { Dm: "D", Bb: "Bm", Gm: "G", Em7b5: "Em7" },
  dorian: { Bb: "G7", Gm: "G", Em7b5: "Em7" },
};
// pitch classes raised by a semitone when moving D natural minor → D major / D dorian
const MODE_RAISE: Record<Exclude<Mode, "minor">, number[]> = { major: [5, 10, 0], dorian: [10] };

function harm(name: string, tr: number): Harm {
  const [r, pcs] = CH[name];
  return { root: (r + tr + 120) % 12, pcs: pcs.map((p) => (p + tr + 120) % 12) };
}

function themeBars(mode: Mode, tr: number): Bar[] {
  return THEME.map(([ch, line], idx) => {
    let name = ch, mel = parseLine(line);
    if (mode !== "minor" && !B_SECTION(idx) && !KEEP_CHROMATIC.has(idx)) {
      name = MODE_CHORDS[mode][ch] ?? ch;
      const up = MODE_RAISE[mode];
      mel = mel.map((n) => (up.includes(n.m % 12) ? { ...n, m: n.m + 1 } : n));
    }
    if (mode === "major" && idx === 26) { name = "Gm"; mel = parseLine("Bb5:1 G5:1 D5:1"); } // minor iv in D major
    return { h: harm(name, tr), mel: mel.map((n) => ({ ...n, m: n.m + tr })), idx };
  });
}

/** Chord tones at or above `low`, ascending. */
function voicing(h: Harm, low: number, max = 4): number[] {
  return h.pcs.slice(0, max).map((pc) => low + ((pc - low) % 12 + 12) % 12).sort((a, b) => a - b);
}
const bassNote = (h: Harm, low = 41) => low + ((h.root - low) % 12 + 12) % 12;
const sameHarm = (a: Harm, b: Harm) => a.root === b.root && a.pcs.join() === b.pcs.join();

function addMelody(ev: Ev[], bars: Bar[], bpb: number, inst: Inst, oct: number, v: number, when: (i: number) => boolean = () => true, pan?: Pan, legato = 1) {
  for (const bar of bars) {
    if (!when(bar.idx)) continue;
    for (const n of bar.mel) ev.push({ b: bar.idx * bpb + n.p, d: n.d * legato, i: inst, n: [n.m + oct], v, pan, mel: true });
  }
}
/** Sustained chords, merging repeated harmonies into one longer chord. */
function addSustain(ev: Ev[], bars: Bar[], bpb: number, inst: Inst, low: number, v: number, p?: number, when: (i: number) => boolean = () => true) {
  let i = 0;
  while (i < bars.length) {
    if (!when(i)) { i++; continue; }
    let j = i + 1;
    while (j < bars.length && when(j) && sameHarm(bars[j].h, bars[i].h) && j - i < 2) j++;
    ev.push({ b: i * bpb, d: (j - i) * bpb, i: inst, n: voicing(bars[i].h, low), v, p });
    i = j;
  }
}
function arpUp(h: Harm, low: number, count: number): number[] {
  const tones = voicing(h, low, 3), out: number[] = [];
  for (let k = 0; out.length < count; k++) out.push(tones[k % tones.length] + 12 * Math.floor(k / tones.length));
  return out;
}

const ARR: Partial<Record<MusicTrack, Arr>> = {};

function arrangement(track: MusicTrack): Arr {
  const cached = ARR[track];
  if (cached) return cached;
  const a = track === "trivia" ? triviaArr() : themeArr(track);
  a.ev.sort((x, y) => x.b - y.b);
  ARR[track] = a;
  return a;
}

function themeArr(track: Exclude<MusicTrack, "trivia">): Arr {
  const ev: Ev[] = [];
  const B = 3;
  const all = () => true;
  const Ap = (i: number) => (i >= 8 && i < 16) || i >= 24;
  const lastBar = (i: number) => i === 15 || i === 23 || i === 31;
  const phraseStart = (i: number) => i % 8 === 0;

  if (track === "academy") {
    const bars = themeBars("minor", 0);
    addMelody(ev, bars, B, "cel", 0, 0.16);
    addMelody(ev, bars, B, "cel", 12, 0.045, Ap, "r"); // octave sparkle in the repeats
    addMelody(ev, bars, B, "str", -12, 0.06, B_SECTION, "l"); // warm strings under the B section
    addSustain(ev, bars, B, "pad", 55, 0.11, 1100);
    for (const bar of bars) {
      const s = bar.idx * B;
      ev.push({ b: s, d: 1, i: "pizz", n: [bassNote(bar.h)], v: 0.14 });
      const ch = voicing(bar.h, 57, 3);
      ev.push({ b: s + 1, d: 0.5, i: "pizz", n: ch, v: 0.035, pan: "l" }, { b: s + 2, d: 0.5, i: "pizz", n: ch, v: 0.03, pan: "l" });
      if (phraseStart(bar.idx)) ev.push({ b: s, d: 3, i: "bell", n: [bassNote(bar.h, 62)], v: 0.05 });
      if (lastBar(bar.idx)) arpUp(bar.h, 74, 4).forEach((m, k) => ev.push({ b: s + 1 + k * 0.5, d: 0.5, i: "harp", n: [m], v: 0.05, pan: "r" }));
    }
    return { bpm: 126, bpb: B, bars: 32, ev };
  }

  if (track === "navy") {
    // C minor, slower, lower: violin/cello melody, harp, warm dark pad
    const bars = themeBars("minor", -2);
    addMelody(ev, bars, B, "str", -12, 0.13, all, "c");
    addMelody(ev, bars, B, "cel", 0, 0.05, Ap, "r");
    addSustain(ev, bars, B, "pad", 50, 0.13, 750, all);
    for (const bar of bars) {
      const s = bar.idx * B, h = bar.h;
      ev.push({ b: s, d: 3, i: "str", n: [bassNote(h, 36)], v: 0.07, p: 900, pan: "l" });
      ev.push({ b: s, d: 1, i: "pizz", n: [bassNote(h)], v: 0.07 });
      const tones = voicing(h, 55, 3);
      ev.push({ b: s + 1, d: 1, i: "harp", n: [tones[1]], v: 0.045, pan: "r" }, { b: s + 2, d: 1, i: "harp", n: [tones[2]], v: 0.04, pan: "r" });
      if (bar.idx === 0 || bar.idx === 16) ev.push({ b: s, d: 3, i: "bell", n: [bassNote(h, 60)], v: 0.04 });
    }
    return { bpm: 108, bpb: B, bars: 32, ev };
  }

  if (track === "gold") {
    // D major-leaning, brighter, sparkly: doubled celesta, rippling harp, bells, cymbal swells
    const bars = themeBars("major", 0);
    addMelody(ev, bars, B, "cel", 0, 0.15);
    addMelody(ev, bars, B, "cel", 12, 0.06, all, "r");
    addSustain(ev, bars, B, "pad", 57, 0.1, 1800);
    for (const bar of bars) {
      const s = bar.idx * B, h = bar.h;
      ev.push({ b: s, d: 1, i: "pizz", n: [bassNote(h)], v: 0.13 });
      const ch = voicing(h, 57, 3);
      ev.push({ b: s + 1, d: 0.5, i: "pizz", n: ch, v: 0.03, pan: "l" }, { b: s + 2, d: 0.5, i: "pizz", n: ch, v: 0.028, pan: "l" });
      arpUp(h, 62, 6).forEach((m, k) => ev.push({ b: s + k * 0.5, d: 0.5, i: "harp", n: [m], v: 0.03, pan: "r" }));
      if (bar.idx % 4 === 0) ev.push({ b: s, d: 3, i: "bell", n: [bassNote(h, 74)], v: 0.04 });
      if (lastBar(bar.idx)) ev.push({ b: s, d: 3, i: "swell", n: [], v: 0.025 });
    }
    return { bpm: 132, bpb: B, bars: 32, ev };
  }

  if (track === "ember") {
    // E minor, faster and bolder: horn melody, timpani on the downbeats, marcato strings
    const bars = themeBars("minor", 2);
    const notB = (i: number) => !B_SECTION(i);
    addMelody(ev, bars, B, "brass", -12, 0.11, notB, "c", 0.9);
    addMelody(ev, bars, B, "cel", 0, 0.08, notB, "r");
    addMelody(ev, bars, B, "cel", 0, 0.15, B_SECTION);
    addMelody(ev, bars, B, "str", -12, 0.08, B_SECTION, "l");
    addSustain(ev, bars, B, "pad", 55, 0.09, 1400);
    for (const bar of bars) {
      const s = bar.idx * B, h = bar.h;
      ev.push({ b: s, d: 1, i: "timp", n: [bassNote(h, 38)], v: 0.2 });
      if (bar.idx % 2 === 1 && !lastBar(bar.idx)) ev.push({ b: s + 2.5, d: 0.5, i: "timp", n: [bassNote(h, 38)], v: 0.1 });
      ev.push({ b: s, d: 1, i: "pizz", n: [bassNote(h)], v: 0.12 });
      const ch = voicing(h, 57, 3);
      ev.push({ b: s + 1, d: 0.5, i: "pizz", n: ch, v: 0.05, pan: "l" }, { b: s + 2, d: 0.5, i: "pizz", n: ch, v: 0.045, pan: "l" });
      if (bar.idx === 0 || bar.idx === 16) ev.push({ b: s, d: 2.5, i: "cym", n: [], v: 0.035 });
      if (lastBar(bar.idx)) ev.push({ b: s, d: 2.8, i: "troll", n: [bassNote(h, 38)], v: 0.1 });
    }
    return { bpm: 150, bpb: B, bars: 32, ev };
  }

  if (track === "evergreen") {
    // G dorian, gentle and folky: flute tune, clarinet counter-line, rippling harp, open-fifth drone
    const bars = themeBars("dorian", -7);
    addMelody(ev, bars, B, "flute", 0, 0.14);
    for (const bar of bars) {
      const s = bar.idx * B, h = bar.h, r = bassNote(h);
      ev.push({ b: s, d: 3, i: "pad", n: [r - 12 < 36 ? r : r - 12, (r - 12 < 36 ? r : r - 12) + 7], v: 0.08, p: 700 });
      const v3 = voicing(h, 55, 3);
      [r, v3[0], v3[1], v3[2], v3[1], v3[0]].forEach((m, k) => ev.push({ b: s + k * 0.5, d: 0.5, i: "harp", n: [m], v: k === 0 ? 0.07 : 0.04, pan: k === 0 ? "c" : "r" }));
      if (Ap(bar.idx) && !lastBar(bar.idx)) {
        const third = h.pcs[1];
        ev.push({ b: s, d: 2.8, i: "reed", n: [53 + ((third - 53) % 12 + 12) % 12], v: 0.06, pan: "l" });
      }
      if (bar.idx === 16) ev.push({ b: s, d: 3, i: "bell", n: [bassNote(h, 72)], v: 0.03 });
    }
    return { bpm: 112, bpb: B, bars: 32, ev };
  }

  // winter: D minor, slower, frosty celesta + glockenspiel octave, sleigh bells, airy pad, soft choir in B
  const bars = themeBars("minor", 0);
  addMelody(ev, bars, B, "cel", 0, 0.15);
  addMelody(ev, bars, B, "cel", 12, 0.06, all, "r");
  addSustain(ev, bars, B, "pad", 62, 0.07, 2200);
  addSustain(ev, bars, B, "choir", 57, 0.05, undefined, B_SECTION);
  for (const bar of bars) {
    const s = bar.idx * B, h = bar.h;
    ev.push({ b: s, d: 3, i: "pad", n: [bassNote(h, 38)], v: 0.06, p: 500 });
    ev.push({ b: s, d: 1, i: "pizz", n: [bassNote(h)], v: 0.06 });
    const t3 = voicing(h, 67, 3);
    ev.push({ b: s + 1, d: 1, i: "harp", n: [t3[2]], v: 0.03, pan: "l" }, { b: s + 2, d: 1, i: "harp", n: [t3[1]], v: 0.025, pan: "l" });
    const sleighBeats = bar.idx < 8 ? [0] : [0, 1, 2];
    for (const k of sleighBeats) ev.push({ b: s + k, d: 0.5, i: "sleigh", n: [], v: k === 0 ? 0.05 : 0.025 });
    if (phraseStart(bar.idx)) ev.push({ b: s, d: 3, i: "bell", n: [bassNote(h, 74)], v: 0.04 });
  }
  return { bpm: 104, bpb: B, bars: 32, ev };
}

/** Trivia "thinking" music (original): A minor, 6/8 (counted in eighths), tiptoeing pizzicato scherzo. */
const TRIVIA: [string, string][] = [
  ["Am", "E5:1 r:1 A5:1 C6:1 r:1 B5:1"],
  ["E7", "G#5:1 r:1 E5:1 B5:2 r:1"],
  ["Am", "A5:1 r:1 C6:1 E6:1 D6:1 C6:1"],
  ["E7", "B5:1 A5:1 G#5:1 E5:2 r:1"],
  ["F", "A5:1 r:1 C6:1 F6:1 E6:1 r:1"],
  ["C", "E6:1 D6:1 C6:1 G5:2 r:1"],
  ["Dm6", "F5:1 G#5:1 A5:1 D6:1 C6:1 B5:1"],
  ["E7", "G#5:1 r:1 B5:1 E5:2 r:1"],
  ["Am", "E5:1 r:1 A5:1 C6:1 r:1 B5:1"],
  ["E7", "G#5:1 r:1 E5:1 B5:2 r:1"],
  ["Am", "A5:1 r:1 C6:1 E6:1 D6:1 C6:1"],
  ["A7", "E6:1 C#6:1 A5:1 G5:2 r:1"],
  ["Dm", "F5:1 E5:1 F5:1 A5:1 r:1 D6:1"],
  ["F", "C6:1 B5:1 C6:1 A5:2 r:1"],
  ["E7", "B5:1 A5:1 G#5:1 D6:1 C6:1 B5:1"],
  ["Am", "A5:2 r:1 A4:1 r:2"],
];

function triviaArr(): Arr {
  const ev: Ev[] = [], B = 6;
  TRIVIA.forEach(([ch, line], idx) => {
    const h = harm(ch, 0), s = idx * B;
    for (const n of parseLine(line)) {
      if (idx < 8) ev.push({ b: s + n.p, d: n.d * 0.8, i: "cel", n: [n.m], v: 0.14, mel: true });
      else {
        ev.push({ b: s + n.p, d: n.d * 0.55, i: "reed", n: [n.m - 12], v: 0.12, mel: true, pan: "c" });
        ev.push({ b: s + n.p, d: n.d, i: "pizz", n: [n.m], v: 0.04, pan: "r" });
      }
    }
    const r = bassNote(h);
    const stab = voicing(h, 57, 4).slice(-3);
    ev.push({ b: s, d: 1, i: "pizz", n: [r], v: 0.14 }, { b: s + 3, d: 1, i: "pizz", n: [r + 7 > 52 ? r - 5 : r + 7], v: 0.11 });
    ev.push({ b: s + 2, d: 0.5, i: "pizz", n: stab, v: 0.03, pan: "l" }, { b: s + 5, d: 0.5, i: "pizz", n: stab, v: 0.03, pan: "l" });
    ev.push({ b: s, d: 0.5, i: "wood", n: [], v: 0.025, p: 1300 }, { b: s + 3, d: 0.5, i: "wood", n: [], v: 0.02, p: 1000 });
    if (idx === 7 || idx === 15) arpUp(h, 76, 4).forEach((m, k) => ev.push({ b: s + 2 + k, d: 1, i: "cel", n: [m], v: 0.04, pan: "r" }));
  });
  return { bpm: 216, bpb: B, bars: 16, ev };
}

/* ───────────────────────── music playback ───────────────────────── */

interface Outs { c: AudioNode; l: AudioNode; r: AudioNode }
interface Playing { track: MusicTrack; arr: Arr; gain: GainNode; outs: Outs; extra: AudioNode[]; loopStart: number; idx: number }

let playing: Playing | null = null;
let wanted: MusicTrack | null = null; // track asked for (playing, or waiting for unlock)
let pendingStart = false;
let timer: ReturnType<typeof setInterval> | null = null;

const DEFAULT_PAN: Record<Inst, Pan> = {
  cel: "c", bell: "r", pizz: "c", harp: "r", pad: "c", str: "l", choir: "c", brass: "c", timp: "c",
  cym: "r", swell: "r", troll: "c", sleigh: "r", reed: "l", flute: "c", wood: "l",
};

function playEv(c: AudioContext, gr: Graph, e: Ev, at: number, spb: number, o: Outs) {
  const dest = o[e.pan ?? DEFAULT_PAN[e.i]], d = e.d * spb;
  switch (e.i) {
    case "cel": for (const m of e.n) celesta(c, dest, at, m, d, e.v); break;
    case "bell": for (const m of e.n) bell(c, dest, at, m, e.v); break;
    case "pizz": for (const m of e.n) pluck(c, dest, at, m, e.v); break;
    case "harp": for (const m of e.n) pluck(c, dest, at, m, e.v, true); break;
    case "pad": pad(c, dest, at, e.n, d, e.v, e.p ?? 1200); break;
    case "choir": choir(c, dest, at, e.n, d, e.v, 0.6); break;
    case "str": for (const m of e.n) strings(c, dest, at, m, d, e.v, e.p ?? 2600); break;
    case "brass": for (const m of e.n) brass(c, dest, at, m, d, e.v, 0.8); break;
    case "timp": for (const m of e.n) timp(c, gr, dest, at, m, e.v); break;
    case "cym": cymbal(c, gr, dest, at, d, e.v); break;
    case "swell": cymbal(c, gr, dest, at, d, e.v, true, 7000); break;
    case "troll": roll(c, gr, dest, at, d, e.v * 0.15, e.v, "timp", e.n[0]); break;
    case "sleigh": sleigh(c, gr, dest, at, e.v); break;
    case "reed": for (const m of e.n) reed(c, dest, at, m, d, e.v); break;
    case "flute": for (const m of e.n) flute(c, dest, at, m, d, e.v); break;
    case "wood": wood(c, dest, at, e.v, e.p ?? 1400); break;
  }
}

function schedule() {
  try {
    const c = ctx, gr = graph, p = playing;
    if (!c || !gr || !p) { stopTimer(); return; }
    if (c.state !== "running") return;
    const { arr } = p, spb = 60 / arr.bpm, loopLen = arr.bars * arr.bpb * spb;
    const now = c.currentTime, horizon = now + LOOKAHEAD;
    while (p.loopStart + loopLen < now) { p.loopStart += loopLen; p.idx = 0; } // fell far behind (e.g. long stall)
    for (let guard = 0; guard < 400; guard++) {
      if (p.idx >= arr.ev.length) { p.loopStart += loopLen; p.idx = 0; }
      const e = arr.ev[p.idx], at = p.loopStart + e.b * spb;
      if (at > horizon) break;
      p.idx++;
      if (at < now - 0.03) continue; // late (timer stalled): skip rather than pile up
      if (live > HARD_VOICE_CAP || (live > MUSIC_VOICE_CAP && !e.mel)) continue;
      playEv(c, gr, e, Math.max(at, now), spb, p.outs);
    }
  } catch { /* never throw */ }
}
function stopTimer() { if (timer) { clearInterval(timer); timer = null; } }

function fadeOut(p: Playing, secs: number) {
  const c = ctx;
  if (!c) return;
  const now = c.currentTime, g = p.gain.gain;
  try {
    g.cancelScheduledValues(now);
    g.setValueAtTime(g.value, now);
    g.linearRampToValueAtTime(0, now + Math.max(0.02, secs));
  } catch { /* ignore */ }
  setTimeout(() => { disc(p.gain); for (const n of p.extra) disc(n); }, (secs + 0.3) * 1000);
}

function startTrack(track: MusicTrack) {
  const c = ctx, gr = graph;
  if (!c || !gr || c.state !== "running") { pendingStart = true; return; }
  if (playing && playing.track === track) return;
  const fade = playing ? XFADE : 0.8;
  if (playing) fadeOut(playing, XFADE);
  const gain = mkGain(c, 0);
  gain.connect(gr.music);
  const now = c.currentTime;
  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(1, now + fade);
  const extra: AudioNode[] = [];
  const pan = (x: number): AudioNode => {
    if (typeof c.createStereoPanner !== "function") return gain;
    const sp = c.createStereoPanner(); sp.pan.value = x; sp.connect(gain); extra.push(sp); return sp;
  };
  playing = { track, arr: arrangement(track), gain, outs: { c: gain, l: pan(-0.35), r: pan(0.35) }, extra, loopStart: now + 0.06, idx: 0 };
  if (!timer) timer = setInterval(schedule, TICK_MS);
  schedule();
}

function stopInternal(fade: number) {
  wanted = null;
  pendingStart = false;
  if (playing) { fadeOut(playing, fade); playing = null; }
  stopTimer();
}

/** Loop a music track (crossfades from the current one). No-op when music is switched off. */
export function playMusic(track: MusicTrack): void {
  try {
    if (!musicOn()) return;
    wanted = track;
    const c = getCtx(hasActivation());
    if (!c || c.state !== "running") {
      pendingStart = true;
      if (c) void c.resume().catch(() => undefined);
      return;
    }
    startTrack(track);
  } catch { /* never throw */ }
}

/** Fade the music out (default 1s). */
export function stopMusic(fadeSeconds = 1): void {
  try { stopInternal(Math.max(0, fadeSeconds)); } catch { /* never throw */ }
}

/** The track playing (or queued to start on the first tap), else null. */
export function currentTrack(): MusicTrack | null {
  return musicOn() ? wanted : null;
}

/** Debug info: live voice count, context state, current track. */
export function audioStats(): { voices: number; state: string; track: MusicTrack | null } {
  return { voices: live, state: ctx ? ctx.state : "none", track: playing ? playing.track : null };
}

/* ───────────────────────── sound effects ───────────────────────── */

interface S { c: AudioContext; g: Graph; t: number; out: AudioNode; dry: AudioNode }
function S0(): S | null {
  try {
    if (!soundOn()) return null;
    const c = runningCtx();
    if (!c || !graph || live > HARD_VOICE_CAP) return null;
    return { c, g: graph, t: c.currentTime + 0.01, out: graph.sfx, dry: graph.dry };
  } catch { return null; }
}
/** Run an effect, swallowing any error. */
function fx(fn: (s: S) => void) { const s = S0(); if (!s) return; try { fn(s); } catch { /* never throw */ } }

let duckN = 0;
function duck(hold: number | null, level = 0.4): () => void {
  const g = graph, c = ctx;
  if (!g || !c) return () => undefined;
  duckN++;
  const p = g.duck.gain, now = c.currentTime;
  try { p.cancelScheduledValues(now); p.setValueAtTime(p.value, now); p.linearRampToValueAtTime(level, now + 0.15); } catch { /* ignore */ }
  let released = false;
  const release = () => {
    if (released) return; released = true;
    duckN = Math.max(0, duckN - 1);
    if (duckN === 0 && ctx) {
      const t = ctx.currentTime;
      try { p.cancelScheduledValues(t); p.setValueAtTime(p.value, t); p.linearRampToValueAtTime(1, t + 1.2); } catch { /* ignore */ }
    }
  };
  if (hold !== null) setTimeout(release, hold * 1000);
  return release;
}

interface Group { out: GainNode; srcs: AudioScheduledSourceNode[]; stop(fade?: number): void }
function group(s: S): Group {
  const out = mkGain(s.c, 1); out.connect(s.out);
  const srcs: AudioScheduledSourceNode[] = [];
  let stopped = false;
  return {
    out, srcs,
    stop(fade = 0.25) {
      if (stopped) return; stopped = true;
      try {
        const now = s.c.currentTime;
        out.gain.cancelScheduledValues(now); out.gain.setValueAtTime(out.gain.value, now); out.gain.linearRampToValueAtTime(0, now + fade);
        for (const src of srcs) { try { src.stop(now + fade + 0.02); } catch { /* ignore */ } }
        srcs.length = 0;
        setTimeout(() => disc(out), (fade + 0.3) * 1000);
      } catch { /* ignore */ }
    },
  };
}
function into(grp: Group, fn: () => void) { const prev = collector; collector = grp.srcs; try { fn(); } finally { collector = prev; } }

let cinematic: Group | null = null;
const NOOP_HANDLE = { stop() { /* nothing playing */ } };

const CAPE: Record<Cape, { brass: number[]; choir: number[]; bells: number[]; bright: number; boom: number; cym: number }> = {
  navy: { brass: [46, 53, 58, 62, 65], choir: [62, 65, 70, 74], bells: [70, 74, 77, 82], bright: 0.7, boom: 0.5, cym: 0.05 }, // B♭ major, deep and warm
  gold: { brass: [50, 57, 62, 66, 69], choir: [66, 69, 74, 78], bells: [86, 90, 93, 98], bright: 1.2, boom: 0.4, cym: 0.07 }, // D major, bright and high
  ember: { brass: [40, 47, 52, 56, 59, 64], choir: [64, 68, 71, 76], bells: [76, 80, 83, 88], bright: 1.3, boom: 0.6, cym: 0.09 }, // E major, bold
  evergreen: { brass: [43, 50, 55, 59, 62], choir: [67, 69, 71, 74], bells: [79, 83, 86, 91], bright: 0.8, boom: 0.4, cym: 0.045 }, // G add9, gentle
};

export const sfx = {
  /** Drumroll that builds for about 1.8 seconds. */
  drumroll(): void {
    fx(({ c, g, t, out }) => {
      roll(c, g, out, t, 1.8, 0.01, 0.13, "snare");
      roll(c, g, out, t, 1.8, 0.02, 0.12, "timp", 45);
    });
  },
  /** Magical reveal hit: shimmer, celesta arpeggio, warm D-major chord, timpani. Ends any sorting cinematic. */
  reveal(): void {
    if (cinematic) { cinematic.stop(0.12); cinematic = null; }
    fx(({ c, g, t, out }) => {
      duck(1.6);
      cymbal(c, g, out, t, 1.6, 0.05, false, 7000);
      timp(c, g, out, t, 38, 0.28);
      pad(c, out, t, [50, 57, 62, 66, 69], 1.0, 0.16, 2200, 0.02);
      [74, 78, 81, 86, 90].forEach((m, i) => celesta(c, out, t + i * 0.06, m, 0.6, 0.12));
      bell(c, out, t, 74, 0.06, 2.5);
    });
  },
  /** Clock tick. */
  tick(): void { fx(({ c, t, dry }) => wood(c, dry, t, 0.12, 1500)); },
  /** Airy whoosh that sweeps across the stereo field. */
  whoosh(): void { fx(({ c, g, t, out }) => swish(c, g, out, t, 0.7, 0.24, 350, 2800, 900, 1.2, -0.7, 0.7)); },
  /** Paper note unfolding: crinkles + two soft chimes. */
  unfold(): void {
    fx(({ c, g, t, out, dry }) => {
      for (let i = 0; i < 5; i++) click(c, g, dry, t + i * 0.055 + Math.random() * 0.02, 0.1, 3500 + Math.random() * 2500, 1.5, 0.04);
      celesta(c, out, t + 0.3, 79, 0.4, 0.09); celesta(c, out, t + 0.39, 86, 0.6, 0.08);
    });
  },
  /** Points earned: bright two-note chime. */
  points(): void {
    fx(({ c, t, out }) => { celesta(c, out, t, 83, 0.2, 0.13); celesta(c, out, t + 0.08, 88, 0.6, 0.13); celesta(c, out, t + 0.16, 95, 0.4, 0.04); });
  },
  /** Level up: rising arpeggio into a brass + bell chord. */
  levelUp(): void {
    fx(({ c, g, t, out }) => {
      [67, 72, 76, 79].forEach((m, i) => celesta(c, out, t + i * 0.09, m, 0.4, 0.11));
      for (const m of [60, 64, 67, 72]) brass(c, out, t + 0.45, m, 0.9, 0.06);
      celesta(c, out, t + 0.45, 84, 1, 0.1); bell(c, out, t + 0.45, 72, 0.05, 2);
      cymbal(c, g, out, t + 0.45, 1.2, 0.03, false, 8000);
    });
  },
  /** Short brass fanfare with timpani. */
  fanfare(): void {
    fx(({ c, g, t, out }) => {
      duck(2.2);
      const line: [number, number, number][] = [[67, 0, 0.1], [67, 0.12, 0.1], [72, 0.24, 0.1], [76, 0.36, 0.32], [74, 0.72, 0.1], [76, 0.84, 0.1], [79, 0.96, 1.1]];
      for (const [m, d, l] of line) brass(c, out, t + d, m, l, 0.1, 1.1);
      for (const m of [60, 64]) brass(c, out, t + 0.96, m, 1.1, 0.07);
      timp(c, g, out, t + 0.36, 43, 0.22); timp(c, g, out, t + 0.96, 48, 0.28);
      cymbal(c, g, out, t + 0.96, 1.6, 0.05);
    });
  },
  /** Bubbly pops (confetti). */
  pop(): void {
    fx(({ c, t, dry }) => {
      for (let i = 0; i < 5; i++) {
        const at = t + i * 0.045 + Math.random() * 0.02, f = 500 + Math.random() * 700;
        const o = mkOsc(c, "sine", f, at), gg = mkGain(c);
        o.frequency.exponentialRampToValueAtTime(f * 2.4, at + 0.05);
        perc(gg.gain, at, 0.002, 0.09, at + 0.07);
        o.connect(gg); gg.connect(dry); fin([o], [gg], at, at + 0.09);
      }
    });
  },
  /** Twinkly sparkle: pentatonic celesta notes + high shimmer. */
  sparkle(): void {
    fx(({ c, g, t, out }) => {
      const scale = [86, 88, 90, 93, 95, 98, 100];
      for (let i = 0; i < 7; i++) celesta(c, out, t + i * 0.055, scale[Math.floor(Math.random() * scale.length)], 0.3, 0.05 + Math.random() * 0.03);
      cymbal(c, g, out, t, 0.9, 0.022, false, 8500);
    });
  },
  /** Crowd cheer with applause. */
  cheer(): void {
    fx(({ c, g, t, out }) => {
      for (const [f, q, v] of [[450, 2, 0.1], [1100, 3, 0.08], [2400, 3, 0.05]] as const) {
        const n = mkNoise(c, g), bp = mkFilter(c, "bandpass", f, q), gg = mkGain(c);
        bp.frequency.setValueAtTime(f, t); bp.frequency.linearRampToValueAtTime(f * 1.15, t + 0.6); bp.frequency.linearRampToValueAtTime(f, t + 1.8);
        gg.gain.setValueAtTime(0.0001, t); gg.gain.exponentialRampToValueAtTime(v, t + 0.25);
        gg.gain.setValueAtTime(v, t + 1.0); gg.gain.exponentialRampToValueAtTime(0.0001, t + 1.9);
        n.connect(bp); bp.connect(gg); gg.connect(out); fin([n], [bp, gg], t, t + 1.95);
      }
      for (let i = 0; i < 16; i++) click(c, g, out, t + Math.random() * 1.4, 0.08 + Math.random() * 0.06, 1200 + Math.random() * 900, 1.2, 0.035);
      for (let i = 0; i < 2; i++) {
        const at = t + 0.1 + i * 0.35, o = mkOsc(c, "sine", 900, at), gg = mkGain(c);
        o.frequency.exponentialRampToValueAtTime(1500 + i * 200, at + 0.25); o.frequency.exponentialRampToValueAtTime(1100, at + 0.6);
        perc(gg.gain, at, 0.06, 0.018, at + 0.6);
        o.connect(gg); gg.connect(out); fin([o], [gg], at, at + 0.65);
      }
    });
  },

  /**
   * ~4s sorting build-up: rolls, climbing strings, choir swell, ending on a held dominant (A major) chord.
   * Call `reveal()` / `capeReveal()` after it — they cut it off automatically. `stop()` fades it out.
   */
  sortingCinematic(): { stop(): void } {
    const s = S0();
    if (!s) return NOOP_HANDLE;
    try {
      if (cinematic) cinematic.stop(0.1);
      const grp = group(s), { c, g, t } = s, o = grp.out;
      const release = duck(6.5, 0.3);
      into(grp, () => {
        roll(c, g, o, t, 4, 0.006, 0.12, "snare");
        roll(c, g, o, t, 4, 0.02, 0.14, "timp", 45);
        const chords: [number, number, number[]][] = [[0, 1.05, [50, 57, 62, 65]], [1, 1.05, [50, 58, 65, 70]], [2, 1.05, [50, 58, 67, 74]]];
        chords.forEach(([d, l, ms], k) => pad(c, o, t + d, ms, l, 0.12 + k * 0.04, 900 + k * 500, 0.3));
        pad(c, o, t + 3, [45, 57, 64, 69, 73, 76], 2.6, 0.24, 2600, 0.15);
        const line: [number, number][] = [[74, 0], [76, 0.5], [77, 1], [79, 1.5], [81, 2], [82, 2.5], [85, 3]];
        line.forEach(([m, d]) => strings(c, o, t + d, m - 12, 0.55, 0.12, 3000));
        strings(c, o, t + 3.5, 76, 2.1, 0.13, 3200);
        choir(c, o, t + 1.6, [62, 67, 70, 74], 1.3, 0.09, 0.9);
        choir(c, o, t + 3, [64, 69, 73, 76], 2.6, 0.13, 0.4);
        cymbal(c, g, o, t + 1.2, 2.8, 0.05, true, 6500);
      });
      cinematic = grp;
      const handle = { stop() { try { grp.stop(0.3); release(); if (cinematic === grp) cinematic = null; } catch { /* ignore */ } } };
      setTimeout(() => { if (cinematic === grp) cinematic = null; }, 6500);
      return handle;
    } catch { return NOOP_HANDLE; }
  },

  /** The big Cape reveal: boom + cymbal shimmer + choir & brass chord, colored per Cape. */
  capeReveal(cape: Cape): void {
    if (cinematic) { cinematic.stop(0.12); cinematic = null; }
    fx(({ c, g, t, out }) => {
      const k = CAPE[cape] ?? CAPE.navy;
      duck(3.5, 0.3);
      boom(c, g, out, t, k.boom);
      cymbal(c, g, out, t, 2.8, k.cym, false, 5500);
      for (const m of k.brass) brass(c, out, t + 0.02, m, 1.6, 0.075, k.bright);
      choir(c, out, t + 0.02, k.choir, 2.0, 0.12, 0.12);
      k.bells.forEach((m, i) => celesta(c, out, t + 0.1 + i * 0.07, m, 0.8, 0.09));
      bell(c, out, t, k.choir[0], 0.05, 3);
      if (cape === "ember") { timp(c, g, out, t, k.brass[0], 0.3); timp(c, g, out, t + 0.24, k.brass[0] + 7, 0.2); }
      if (cape === "gold") cymbal(c, g, out, t + 0.1, 1.5, 0.03, false, 9000);
      if (cape === "evergreen") [0, 2, 4, 7, 9, 12, 14].forEach((d, i) => pluck(c, out, t + 0.15 + i * 0.05, 67 + d, 0.05, true));
      if (cape === "navy") strings(c, out, t + 0.02, 34, 2, 0.12, 700);
    });
  },

  /** Right answer: bright rising major arpeggio. */
  correct(): void {
    fx(({ c, t, out }) => { [84, 88, 91].forEach((m, i) => celesta(c, out, t + i * 0.085, m, 0.5, 0.12)); bell(c, out, t + 0.17, 96, 0.035, 1.5); });
  },
  /** Wrong answer: gentle soft descending "boo-bwoo" (never harsh). */
  wrong(): void {
    fx(({ c, t, out }) => {
      for (const [m, d, l] of [[67, 0, 0.16], [63, 0.2, 0.42]] as const) {
        const at = t + d, f = mtof(m);
        const o = mkOsc(c, "triangle", f, at), lp = mkFilter(c, "lowpass", 1200, 0.5), gg = mkGain(c);
        if (d > 0) o.frequency.setTargetAtTime(f * 0.97, at + 0.2, 0.15);
        sus(gg.gain, at, 0.02, 0.12, l, 0.06);
        o.connect(lp); lp.connect(gg); gg.connect(out); fin([o], [lp, gg], at, at + l + 0.4);
      }
    });
  },

  /** Ticking-clock tension for a timed question; tenser in the last 3s; stops itself after `seconds`. */
  clockStart(seconds: number): { stop(): void } {
    const s = S0();
    if (!s) return NOOP_HANDLE;
    try {
      const secs = Math.min(120, Math.max(1, Number(seconds) || 10));
      const grp = group(s), { c, g } = s, o = grp.out;
      const t0 = s.t + 0.04, end = t0 + secs, tense = Math.max(t0, end - 3);
      const release = duck(null, 0.35);
      into(grp, () => {
        pad(c, o, t0, [45, 52], Math.max(0.1, tense - t0), 0.1, 500, 0.6); // low open fifth
        pad(c, o, tense, [46, 52, 58], end - tense - 0.05, 0.14, 1600, 0.3); // B♭ against E: tension
        if (end - tense > 0.5) strings(c, o, tense, 88, end - tense - 0.1, 0.05, 4000);
      });
      let next = t0, n = 0, stopped = false;
      const iv = setInterval(() => {
        try {
          if (stopped || !ctx) return;
          const horizon = ctx.currentTime + LOOKAHEAD;
          while (next < horizon && next < end - 0.01) {
            const late = next >= tense, at = Math.max(next, ctx.currentTime);
            into(grp, () => {
              wood(c, o, at, late ? 0.13 : 0.1, n % 2 ? (late ? 1500 : 1100) : late ? 1900 : 1500);
              if (!late && n % 2 === 0) pluck(c, o, at, [45, 52, 57, 52][(n / 2) % 4], 0.08);
              if (late && n % 2 === 0) timp(c, g, o, at, 45, 0.16);
            });
            next += late ? 0.25 : 0.5; n++;
          }
          if (ctx.currentTime >= end) handle.stop();
        } catch { /* ignore */ }
      }, TICK_MS);
      const handle = { stop() { if (stopped) return; stopped = true; clearInterval(iv); grp.stop(0.1); release(); } };
      return handle;
    } catch { return NOOP_HANDLE; }
  },

  /** Small "ting" for points. */
  coin(): void { fx(({ c, t, out }) => { celesta(c, out, t, 90, 0.1, 0.1); celesta(c, out, t + 0.07, 97, 0.5, 0.1); }); },
  /** Short welcome fanfare for a new Cape member. */
  welcome(): void {
    fx(({ c, t, out }) => {
      duck(1.8);
      [67, 72, 76].forEach((m, i) => brass(c, out, t + i * 0.12, m, 0.1, 0.08));
      for (const m of [60, 64, 67, 72]) brass(c, out, t + 0.36, m, 0.9, 0.06);
      [84, 88, 91, 96].forEach((m, i) => celesta(c, out, t + 0.36 + i * 0.06, m, 0.5, 0.07));
      bell(c, out, t + 0.36, 72, 0.05, 2);
    });
  },
  /** Scrapbook page flip. */
  pageTurn(): void {
    fx(({ c, g, t, out, dry }) => {
      swish(c, g, out, t, 0.36, 0.2, 1800, 5200, 2400, 0.9, 0.4, -0.4);
      click(c, g, dry, t + 0.05, 0.05, 4500, 1.5, 0.03);
      click(c, g, dry, t + 0.3, 0.12, 500, 0.7, 0.06, "lowpass");
    });
  },
  /** Trivia duel win: brass pickup into a big D-major chord, choir, celesta run, timpani + cymbal. */
  victory(): void {
    fx(({ c, g, t, out }) => {
      duck(2.8, 0.3);
      [69, 74, 78].forEach((m, i) => brass(c, out, t + i * 0.1, m, 0.08, 0.09, 1.1));
      for (const m of [50, 62, 66, 69, 74]) brass(c, out, t + 0.32, m, 1.4, 0.07, 1.1);
      timp(c, g, out, t + 0.2, 45, 0.18); timp(c, g, out, t + 0.32, 50, 0.3);
      cymbal(c, g, out, t + 0.32, 2, 0.06);
      choir(c, out, t + 0.32, [66, 69, 74, 78], 1.5, 0.1, 0.15);
      [74, 76, 78, 79, 81, 83, 85, 86].forEach((m, i) => celesta(c, out, t + 0.32 + i * 0.035, m + 12, 0.3, 0.06));
    });
  },
};
