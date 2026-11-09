"use client";
/**
 * Courage Academy music + sound effects, all synthesized with the Web Audio API (no audio files).
 *
 * Style target: a fantasy-film orchestra — E minor 3/4, a solo celesta in a big hall, then legato strings,
 * harp glissandos, soft French horns, glockenspiel, timpani rolls; chromatic-mediant harmony (Em→Cm, Em→G♯m,
 * Em→B♭, Em→A♭), augmented and diminished passing chords, Picardy (major) cadences.
 * Every melody and progression here is ORIGINAL — nothing is copied from any film score.
 *
 * Drop-in superset of the old `sfx.ts`: same `soundOn` / `setSound` / `unlockAudio` / `sfx.*` names.
 * - Call `unlockAudio()` once on mount (phones only allow audio after a tap; the first tap/keypress resumes audio
 *   and starts any music that was requested before that).
 * - Nothing here ever throws; with no Web Audio (or during SSR) every call silently does nothing.
 * - `sfx.*` methods don't use `this`, so they can be passed around unbound (`onClick={sfx.pop}`).
 *
 * Graph: voices → (track gain → music bus → duck) | (sfx bus) → master → compressor → speakers,
 *        with a shared convolution "great hall" reverb on sends from the music and sfx buses.
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
const MUSIC_VOICE_CAP = 48; // music skips accompaniment notes above this many live voices
const HARD_VOICE_CAP = 96; // nothing new above this (protects slow phones)

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

/** "Great hall" impulse response: pre-delay, a few early reflections, then a long darkening tail. */
function makeIR(c: AudioContext, seconds = 3.4): AudioBuffer {
  const sr = c.sampleRate, len = Math.floor(sr * seconds), pre = Math.floor(sr * 0.028);
  const buf = c.createBuffer(2, len, sr);
  const early = [0.011, 0.019, 0.027, 0.041, 0.053, 0.067];
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    let y = 0;
    for (let i = pre; i < len; i++) {
      const t = (i - pre) / sr;
      const a = 0.6 - 0.48 * (t / seconds); // tail gets darker
      y += a * ((Math.random() * 2 - 1) - y);
      const swell = Math.min(1, t / 0.06); // diffuse tail builds in over 60ms
      d[i] = y * swell * Math.exp((-6.9 * t) / (seconds * 0.92)) * (1 - (i / len) ** 4);
    }
    for (const e of early) { const k = pre + Math.floor((e + ch * 0.003) * sr); if (k < len) d[k] += (ch ? -0.5 : 0.5) * (1 - e * 6); }
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
  const verbOut = c.createGain(); verbOut.gain.value = 0.7;
  verbIn.connect(conv); conv.connect(verbOut); verbOut.connect(master);

  const music = c.createGain(); music.gain.value = MUSIC_VOL;
  const duck = c.createGain();
  music.connect(duck); duck.connect(master);
  const mSend = c.createGain(); mSend.gain.value = 0.62; duck.connect(mSend); mSend.connect(verbIn);

  const sfx = c.createGain(); sfx.gain.value = SFX_VOL;
  sfx.connect(master);
  const sSend = c.createGain(); sSend.gain.value = 0.4; sfx.connect(sSend); sSend.connect(verbIn);
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
function vibrato(c: AudioContext, t: number, rate: number, cents: number, delay: number, targets: AudioParam[]): [OscillatorNode, GainNode] {
  const lfo = mkOsc(c, "sine", rate, t), lg = mkGain(c, 0);
  lg.gain.setValueAtTime(0, t); lg.gain.linearRampToValueAtTime(cents, t + delay + 0.25);
  lfo.connect(lg); for (const p of targets) lg.connect(p);
  return [lfo, lg];
}

/* ───────────────────────── instruments ───────────────────────── */
// Each takes (ctx, [graph,] destination, start time, midi note(s), duration seconds, peak level, ...).

/** Celesta / music box: bright sine with octave + inharmonic "hammer" partials, ringing decay. */
function celesta(c: AudioContext, out: AudioNode, t: number, m: number, dur: number, v: number) {
  const f = mtof(m);
  const len = Math.min(2.6, Math.max(0.8, dur + 1.1)) * (f > 1600 ? 0.65 : 1);
  const parts: [number, number, number][] = [[1, 1, len], [2.0, 0.14, len * 0.5], [4.01, 0.2, len * 0.25], [6.79, 0.06, 0.06]];
  const srcs: OscillatorNode[] = [], nodes: AudioNode[] = [];
  for (const [r, a, l] of parts) {
    if (f * r > 15000) continue;
    const o = mkOsc(c, "sine", f * r, t), g = mkGain(c);
    perc(g.gain, t, 0.003, v * a, t + l);
    o.connect(g); g.connect(out); srcs.push(o); nodes.push(g);
  }
  fin(srcs, nodes, t, t + len + 0.05);
}

/** Glockenspiel: very bright, metallic bar partials (1, 2.76, 5.4). */
function glock(c: AudioContext, out: AudioNode, t: number, m: number, v: number) {
  const f = mtof(m), srcs: OscillatorNode[] = [], nodes: AudioNode[] = [];
  for (const [r, a, l] of [[1, 1, 1.3], [2.76, 0.28, 0.35], [5.4, 0.1, 0.1]] as const) {
    if (f * r > 15000) continue;
    const o = mkOsc(c, "sine", f * r, t), g = mkGain(c);
    perc(g.gain, t, 0.002, v * a, t + l);
    o.connect(g); g.connect(out); srcs.push(o); nodes.push(g);
  }
  fin(srcs, nodes, t, t + 1.35);
}

/** Church/tubular bell: hum, prime, tierce (minor third), nominal and upper partials. */
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

/** Harp glissando: a fast run of harp plucks spread over `span` seconds. */
function gliss(c: AudioContext, out: AudioNode, t: number, ms: number[], span: number, v: number) {
  const n = ms.length;
  ms.forEach((m, k) => pluck(c, out, t + (k * span) / n, m, v * (0.65 + (0.35 * k) / n), true));
}

/** String-section pad: two detuned saws per note through one lowpass, slow legato attack. */
function pad(c: AudioContext, out: AudioNode, t: number, ms: number[], dur: number, v: number, cutoff = 1200, atk = 0.5) {
  const lp = mkFilter(c, "lowpass", cutoff, 0.6), g = mkGain(c);
  const peak = v / Math.sqrt(ms.length * 2);
  sus(g.gain, t, atk, peak, dur, 0.3);
  const srcs: OscillatorNode[] = [];
  for (const m of ms) for (const dt of [-9, 8]) {
    const o = mkOsc(c, "sawtooth", mtof(m), t); o.detune.value = dt; o.connect(lp); srcs.push(o);
  }
  lp.connect(g); g.connect(out);
  fin(srcs, [lp, g], t, t + dur + 1.4);
}

/** Tremolo strings: chord with fast amplitude flutter and a crescendo/diminuendo from v0 to v1. */
function trem(c: AudioContext, out: AudioNode, t: number, ms: number[], dur: number, v0: number, v1: number, cutoff = 1800) {
  const norm = Math.sqrt(ms.length * 2);
  const lp = mkFilter(c, "lowpass", cutoff, 0.6), am = mkGain(c, 0.6), env = mkGain(c);
  const lfo = mkOsc(c, "triangle", 12.5, t), lg = mkGain(c, 0.4);
  lfo.connect(lg); lg.connect(am.gain);
  env.gain.setValueAtTime(0.0001, t);
  env.gain.exponentialRampToValueAtTime(Math.max(v0 / norm, 0.0002), t + 0.06);
  env.gain.exponentialRampToValueAtTime(Math.max(v1 / norm, 0.0002), t + Math.max(0.1, dur));
  env.gain.setTargetAtTime(0, t + Math.max(0.1, dur), 0.18);
  const srcs: OscillatorNode[] = [lfo];
  for (const m of ms) for (const dt of [-7, 7]) {
    const o = mkOsc(c, "sawtooth", mtof(m), t); o.detune.value = dt; o.connect(lp); srcs.push(o);
  }
  lp.connect(am); am.connect(env); env.connect(out);
  fin(srcs, [lp, am, lg, env], t, t + dur + 1);
}

/** Legato string section line (violins / cellos): three detuned saws, warm filter, delayed vibrato. */
function section(c: AudioContext, out: AudioNode, t: number, m: number, dur: number, v: number, cutoff = 2200) {
  const f = mtof(m), lp = mkFilter(c, "lowpass", cutoff, 0.5), g = mkGain(c);
  const oscs = [-11, 0, 10].map((dt) => { const o = mkOsc(c, "sawtooth", f, t); o.detune.value = dt; o.connect(lp); return o; });
  sus(g.gain, t, Math.min(0.14, dur * 0.5), v * 0.4, dur, 0.14);
  const [lfo, lg] = vibrato(c, t, 5.2, 9, 0.15, oscs.map((o) => o.detune));
  lp.connect(g); g.connect(out);
  fin([...oscs, lfo], [lp, g, lg], t, t + dur + 0.75);
}

/** French horn: round, soft-edged brass (saw + triangle, gently opening filter, light vibrato). */
function horn(c: AudioContext, out: AudioNode, t: number, m: number, dur: number, v: number) {
  const f = mtof(m);
  const a = mkOsc(c, "sawtooth", f, t), b = mkOsc(c, "triangle", f, t); b.detune.value = 5;
  const lp = mkFilter(c, "lowpass", f * 1.5, 0.9);
  lp.frequency.setValueAtTime(f * 1.5, t);
  lp.frequency.linearRampToValueAtTime(Math.min(f * 3.2, 2600), t + 0.18);
  const g = mkGain(c);
  sus(g.gain, t, Math.min(0.1, dur * 0.4), v * 0.5, dur, 0.12);
  const [lfo, lg] = vibrato(c, t, 4.6, 6, 0.3, [a.detune, b.detune]);
  a.connect(lp); b.connect(lp); lp.connect(g); g.connect(out);
  fin([a, b, lfo], [lp, g, lg], t, t + dur + 0.6);
}

/** Choir "ahh": saws through three vowel formant bandpasses (~800/1150/2900 Hz) with vibrato. */
function choir(c: AudioContext, out: AudioNode, t: number, ms: number[], dur: number, v: number, atk = 0.5) {
  const mix = mkGain(c, 1 / Math.sqrt(ms.length * 2));
  const srcs: OscillatorNode[] = [], params: AudioParam[] = [];
  for (const m of ms) for (const dt of [-10, 9]) {
    const o = mkOsc(c, "sawtooth", mtof(m), t); o.detune.value = dt; o.connect(mix); srcs.push(o); params.push(o.detune);
  }
  const [lfo, lg] = vibrato(c, t, 4.8, 14, 0.1, params);
  const env = mkGain(c);
  sus(env.gain, t, atk, v * 3.2, dur, 0.3);
  const nodes: AudioNode[] = [mix, env, lg];
  for (const [f, q, a] of [[800, 5, 1], [1150, 6, 0.55], [2900, 8, 0.28]] as const) {
    const bp = mkFilter(c, "bandpass", f, q), fg = mkGain(c, a);
    mix.connect(bp); bp.connect(fg); fg.connect(env); nodes.push(bp, fg);
  }
  env.connect(out);
  srcs.push(lfo);
  fin(srcs, nodes, t, t + dur + 1.4);
}

/** Bright brass (trumpets/trombones): saws with a "blat" filter envelope and a small pitch scoop. */
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

/** Cymbal: filtered noise. `swell` = suspended-cymbal roll building to the end. */
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
  const [lfo, lg] = vibrato(c, t, 4.8, 7, 0.25, [o.detune]);
  o.connect(lp); lp.connect(g); g.connect(out);
  fin([o, lfo], [lp, g, lg], t, t + dur + 0.35);
}

/** Flute-ish: triangle + soft octave, breathy attack, vibrato. */
function flute(c: AudioContext, out: AudioNode, t: number, m: number, dur: number, v: number) {
  const f = mtof(m);
  const a = mkOsc(c, "triangle", f, t), b = mkOsc(c, "sine", f * 2, t), bg = mkGain(c, 0.12), g = mkGain(c);
  sus(g.gain, t, 0.06, v * 0.7, dur, 0.06);
  const [lfo, lg] = vibrato(c, t, 5, 12, 0.2, [a.detune, b.detune]);
  a.connect(g); b.connect(bg); bg.connect(g); g.connect(out);
  fin([a, b, lfo], [bg, g, lg], t, t + dur + 0.4);
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

type Inst =
  | "cel" | "glock" | "bell" | "pizz" | "harp" | "gliss" | "pad" | "trem" | "sect" | "horn" | "choir" | "brass"
  | "timp" | "cym" | "swell" | "troll" | "sleigh" | "reed" | "flute" | "wood";
type Pan = "c" | "l" | "r";
/** b = start beat, d = beats, n = midi notes, v = level (v2 = end level for tremolo swells), p = filter cutoff. */
interface Ev { b: number; d: number; i: Inst; n: number[]; v: number; v2?: number; p?: number; pan?: Pan; mel?: boolean }
interface Arr { bpm: number; bpb: number; bars: number; ev: Ev[] }
interface Harm { root: number; pcs: number[] }
interface Note { p: number; d: number; m: number; app?: boolean }
interface Bar { h: Harm; mel: Note[]; idx: number }

const PC: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
function parseNote(s: string): number {
  const mm = /^([A-G])(#|b)?(-?\d)$/.exec(s);
  if (!mm) return -1;
  return 12 * (Number(mm[3]) + 1) + PC[mm[1]] + (mm[2] === "#" ? 1 : mm[2] === "b" ? -1 : 0);
}
/** "E5:1 F#6~:1.5 r:0.5" → notes. `~` marks a deliberate on-beat appoggiatura (a "sigh" that resolves by step). */
function parseLine(line: string): Note[] {
  const out: Note[] = [];
  let p = 0;
  for (const tok of line.trim().split(/\s+/)) {
    const [raw, dur] = tok.split(":");
    const d = Number(dur), app = raw.endsWith("~"), name = app ? raw.slice(0, -1) : raw;
    if (name !== "r") out.push(app ? { p, d, m: parseNote(name), app } : { p, d, m: parseNote(name) });
    p += d;
  }
  return out;
}

// chord name → [root pc, chord-tone pcs]
const CH: Record<string, [number, number[]]> = {
  Em: [4, [4, 7, 11]], E: [4, [4, 8, 11]], C: [0, [0, 4, 7]], Cm: [0, [0, 3, 7]], "G#m": [8, [8, 11, 3]],
  Am: [9, [9, 0, 4]], A: [9, [9, 1, 4]], B7: [11, [11, 3, 6, 9]], Bb: [10, [10, 2, 5]], G: [7, [7, 11, 2]],
  "D#dim7": [3, [3, 6, 9, 0]], Baug: [11, [11, 3, 7]], Ab: [8, [8, 0, 3]],
  // trivia
  E7: [4, [4, 8, 11, 2]], F: [5, [5, 9, 0]], Dm: [2, [2, 5, 9]], Dm6: [2, [2, 5, 9, 11]], A7: [9, [9, 1, 4, 7]],
};

/**
 * Main theme (original). E minor, 3/4, 32 bars:
 *  A (1–8)   solo celesta: twinkling leaps (5ths, 6ths), chromatic neighbours; Em→C→Cm, Em→G♯m, half cadence on B7.
 *  A′ (9–16) strings, harp and horns join; Em→B♭ (tritone mediant), raised iv (A major), Picardy E major cadence.
 *  B (17–24) the climax: rising 6ths/octaves, C→G→Am→E, C→Cm, D♯°7 passing, B augmented.
 *  A″ (25–32) return, Em→A♭ chromatic mediant, B7 → E major (Picardy).
 */
const THEME: [string, string][] = [
  ["Em", "E5:1 B5:1.5 A#5:0.5"],
  ["Em", "B5:1 G5:1 E5:1"],
  ["C", "E5:1 C6:1.5 B5:0.5"],
  ["Cm", "G5:1 C6:0.5 D6:0.5 Eb6:1"],
  ["Em", "E6:1.5 D#6:0.5 B5:1"],
  ["G#m", "G#5:1.5 B5:0.5 D#6:1"],
  ["Am", "A5:1 E6:1 C6:1"],
  ["B7", "B5:1.5 A5:0.5 F#5:0.5 D#5:0.5"],

  ["Em", "E5:1 B5:1.5 A#5:0.5"],
  ["Em", "B5:1 F#6~:1.5 E6:0.5"],
  ["Bb", "D6:1 F6:1 Bb5:1"],
  ["Am", "A5:1 E6:1.5 D6:0.5"],
  ["C", "C6:1 G6:1 E6:1"],
  ["A", "C#6:1.5 D6:0.5 E6:1"],
  ["B7", "F#6:1 D#6:1 A5:1"],
  ["E", "B5:1 G#5:2"],

  ["C", "E5:1 G5:1 E6:1"],
  ["G", "D6:1.5 C6:0.5 B5:1"],
  ["Am", "C6:1 E6:1 A6:1"],
  ["E", "G#6:1.5 F#6:0.5 E6:1"],
  ["C", "E6:1 C6:1 G5:1"],
  ["Cm", "Eb6:1.5 D6:0.5 C6:1"],
  ["D#dim7", "C6:1 A5:1 F#5:1"],
  ["Baug", "D#5:1 G5:1 B5:1"],

  ["Em", "E5:1 B5:1.5 A#5:0.5"],
  ["Em", "B5:1 F#6~:1.5 E6:0.5"],
  ["C", "G5:1 E6:1.5 D6:0.5"],
  ["Cm", "Eb6:1 C6:1 G5:1"],
  ["Em", "E5:1 B5:1 E6:1"],
  ["Ab", "Eb6:1.5 C6:0.5 Ab5:1"],
  ["B7", "B5:1.5 A5:0.5 F#5:1"],
  ["E", "G#5:1 E5:2"],
];
const A1 = (i: number) => i < 8;
const A2 = (i: number) => i >= 8 && i < 16;
const BSEC = (i: number) => i >= 16 && i < 24;
const A3 = (i: number) => i >= 24;
const CLIMAX = (i: number) => (i >= 12 && i < 15) || (i >= 16 && i < 23) || (i >= 28 && i < 31);
const PHRASE_END = (i: number) => i === 7 || i === 15 || i === 23 || i === 31;

type Mode = "minor" | "major" | "dorian";
// Only the diatonic bars change mode; the chromatic-mediant bars (C, Cm, G♯m, B♭, A♭, D♯°7, B+) keep their colour.
const DIATONIC = new Set(["Em", "Am", "B7", "A", "E"]);
const MODE_CHORDS: Record<Exclude<Mode, "minor">, Record<string, string>> = { major: { Em: "E", Am: "A" }, dorian: { Am: "A" } };
// pitch classes raised a semitone: E minor → E major (G, C, D) / E dorian (C)
const MODE_RAISE: Record<Exclude<Mode, "minor">, number[]> = { major: [7, 0, 2], dorian: [0] };

function harm(name: string, tr: number): Harm {
  const [r, pcs] = CH[name];
  return { root: (r + tr + 120) % 12, pcs: pcs.map((p) => (p + tr + 120) % 12) };
}

function themeBars(mode: Mode, tr: number): Bar[] {
  return THEME.map(([ch, line], idx) => {
    let name = ch, mel = parseLine(line);
    if (mode !== "minor" && DIATONIC.has(ch)) {
      name = MODE_CHORDS[mode][ch] ?? ch;
      const up = MODE_RAISE[mode];
      mel = mel.map((n) => (up.includes(n.m % 12) ? { ...n, m: n.m + 1 } : n));
    }
    return { h: harm(name, tr), mel: mel.map((n) => ({ ...n, m: n.m + tr })), idx };
  });
}

/** Chord tones at or above `low`, ascending. */
function voicing(h: Harm, low: number, max = 4): number[] {
  return h.pcs.slice(0, max).map((pc) => low + ((pc - low) % 12 + 12) % 12).sort((a, b) => a - b);
}
const bassNote = (h: Harm, low = 40) => low + ((h.root - low) % 12 + 12) % 12;
const sameHarm = (a: Harm, b: Harm) => a.root === b.root && a.pcs.join() === b.pcs.join();
const always = () => true;

function addMelody(ev: Ev[], bars: Bar[], bpb: number, inst: Inst, oct: number, v: number, when: (i: number) => boolean = always, pan?: Pan, legato = 1) {
  for (const bar of bars) {
    if (!when(bar.idx)) continue;
    for (const n of bar.mel) ev.push({ b: bar.idx * bpb + n.p, d: n.d * legato, i: inst, n: [n.m + oct], v, pan, mel: true });
  }
}
/** Sustained chords, merging a repeated harmony into one longer chord. */
function addSustain(ev: Ev[], bars: Bar[], bpb: number, inst: Inst, low: number, v: number, p?: number, when: (i: number) => boolean = always) {
  let i = 0;
  while (i < bars.length) {
    if (!when(i)) { i++; continue; }
    let j = i + 1;
    while (j < bars.length && when(j) && sameHarm(bars[j].h, bars[i].h) && j - i < 2) j++;
    ev.push({ b: i * bpb, d: (j - i) * bpb, i: inst, n: voicing(bars[i].h, low), v, p });
    i = j;
  }
}
/** Ascending chord tones from `low` (wraps up by octaves). */
function arpUp(h: Harm, low: number, count: number): number[] {
  const tones = voicing(h, low, 4), out: number[] = [];
  for (let k = 0; out.length < count; k++) out.push(tones[k % tones.length] + 12 * Math.floor(k / tones.length));
  return out;
}

interface Film {
  from: number; // first bar with the orchestra (before it: solo melody)
  harp: "eighths" | "quarters";
  padCut: number; padV: number; padLow: number;
  cello: number; // level of the legato low-string root line
  horns: number; // level of soft horn chords at climaxes
  trem: number; // peak level of tremolo swells at climaxes
  timpRolls: boolean;
}
/** The shared film-score accompaniment: low strings, harp, string pad / tremolo swells, horns, glissandos, rolls. */
function filmAccomp(ev: Ev[], bars: Bar[], f: Film) {
  const B = 3;
  for (const bar of bars) {
    const i = bar.idx, s = i * B, h = bar.h;
    if (i >= f.from) {
      if (f.cello) ev.push({ b: s, d: 3, i: "sect", n: [bassNote(h)], v: f.cello, p: 900, pan: "l" });
      if (f.harp === "eighths") {
        const t = voicing(h, 52, 3), r = bassNote(h, 43);
        [r, t[0], t[1], t[2], t[0] + 12, t[1] + 12].forEach((m, k) => ev.push({ b: s + k * 0.5, d: 0.5, i: "harp", n: [m], v: k === 0 ? 0.045 : 0.03 }));
      } else {
        const t = voicing(h, 55, 3);
        ev.push({ b: s, d: 1, i: "harp", n: [bassNote(h, 43)], v: 0.045 }, { b: s + 1, d: 1, i: "harp", n: [t[1]], v: 0.035 }, { b: s + 2, d: 1, i: "harp", n: [t[2]], v: 0.03 });
      }
      if (CLIMAX(i) && f.trem) ev.push({ b: s, d: 3, i: "trem", n: voicing(h, f.padLow + 5), v: f.trem * 0.35, v2: f.trem, p: 2000 });
      if (CLIMAX(i) && f.horns) ev.push({ b: s, d: 3, i: "horn", n: voicing(h, 52, 3), v: f.horns, pan: "l" });
    }
    if (PHRASE_END(i)) {
      // harp glissando between phrases: up over the chord, or down (gently) into the solo restart
      const notes = i === 31 ? arpUp(h, 64, 10).reverse() : arpUp(h, 55, 11);
      ev.push({ b: s + 1, d: 1.6, i: "gliss", n: notes, v: i === 31 ? 0.03 : 0.04 });
    }
    if (f.timpRolls && (i === 23 || i === 29)) ev.push({ b: s, d: 2.9, i: "troll", n: [bassNote(h, 38)], v: 0.09 });
    if (f.timpRolls && (i === 16 || i === 24 || i === 31)) ev.push({ b: s, d: 1, i: "timp", n: [bassNote(h, 38)], v: 0.12 });
    if (i === 15) ev.push({ b: s, d: 3, i: "swell", n: [], v: 0.022 });
  }
  addSustain(ev, bars, B, "pad", f.padLow, f.padV, f.padCut, (i) => i >= f.from && !(CLIMAX(i) && f.trem));
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
  const hornLine = (i: number) => (i >= 12 && i < 15) || (i >= 16 && i < 23) || (i >= 28 && i < 31);

  if (track === "academy") {
    const bars = themeBars("minor", 0);
    addMelody(ev, bars, B, "cel", 0, 0.2, A1); // solo celesta, front and centre
    addMelody(ev, bars, B, "cel", 0, 0.15, (i) => !A1(i));
    addMelody(ev, bars, B, "sect", -12, 0.07, (i) => i >= 12, "l", 1.05); // violins doubling, legato
    addMelody(ev, bars, B, "horn", -12, 0.05, hornLine, "c");
    addMelody(ev, bars, B, "glock", 12, 0.035, (i) => (i >= 16 && i < 20) || i === 31, "r");
    filmAccomp(ev, bars, { from: 8, harp: "eighths", padCut: 1100, padV: 0.1, padLow: 55, cello: 0.06, horns: 0.03, trem: 0.1, timpRolls: true });
    return { bpm: 126, bpb: B, bars: 32, ev };
  }

  if (track === "winter") {
    const bars = themeBars("minor", 0);
    addMelody(ev, bars, B, "cel", 0, 0.2, A1);
    addMelody(ev, bars, B, "cel", 0, 0.15, (i) => !A1(i));
    addMelody(ev, bars, B, "glock", 12, 0.03, (i) => !A1(i), "r");
    addMelody(ev, bars, B, "sect", -12, 0.055, (i) => BSEC(i) || i >= 28, "l", 1.05);
    filmAccomp(ev, bars, { from: 8, harp: "quarters", padCut: 2200, padV: 0.07, padLow: 62, cello: 0.05, horns: 0.02, trem: 0.07, timpRolls: false });
    addSustain(ev, bars, B, "choir", 57, 0.045, undefined, BSEC);
    for (const bar of bars) {
      if (bar.idx < 8) continue;
      const s = bar.idx * B;
      for (const k of BSEC(bar.idx) || bar.idx >= 28 ? [0, 1, 2] : [0]) ev.push({ b: s + k, d: 0.5, i: "sleigh", n: [], v: k === 0 ? 0.045 : 0.022 });
      if (bar.idx % 8 === 0) ev.push({ b: s, d: 3, i: "bell", n: [bassNote(bar.h, 76)], v: 0.035 });
    }
    return { bpm: 120, bpb: B, bars: 32, ev };
  }

  if (track === "navy") {
    // D minor, slower, lower and warmer: the strings carry the theme, horns hold the harmony
    const bars = themeBars("minor", -2);
    addMelody(ev, bars, B, "sect", -12, 0.13, always, "c", 1.05);
    addMelody(ev, bars, B, "cel", 0, 0.06, (i) => !A1(i), "r");
    addMelody(ev, bars, B, "horn", -12, 0.04, hornLine, "l");
    filmAccomp(ev, bars, { from: 0, harp: "quarters", padCut: 800, padV: 0.11, padLow: 50, cello: 0.07, horns: 0.035, trem: 0.09, timpRolls: true });
    for (const bar of bars) if (!CLIMAX(bar.idx) && bar.idx >= 8) ev.push({ b: bar.idx * B, d: 3, i: "horn", n: voicing(bar.h, 50, 3), v: 0.02, pan: "l" });
    return { bpm: 112, bpb: B, bars: 32, ev };
  }

  if (track === "gold") {
    // E major-leaning, bright and sparkly: celesta + glockenspiel music box, shimmering high tremolo, rippling harp
    const bars = themeBars("major", 0);
    addMelody(ev, bars, B, "cel", 0, 0.18, A1);
    addMelody(ev, bars, B, "cel", 0, 0.14, (i) => !A1(i));
    addMelody(ev, bars, B, "glock", 12, 0.04, always, "r");
    addMelody(ev, bars, B, "sect", -12, 0.055, (i) => i >= 16, "l", 1.05);
    addMelody(ev, bars, B, "horn", -12, 0.04, hornLine, "c");
    filmAccomp(ev, bars, { from: 8, harp: "eighths", padCut: 1800, padV: 0.09, padLow: 57, cello: 0.05, horns: 0.03, trem: 0.08, timpRolls: true });
    ev.push({ b: 31 * B, d: 3, i: "swell", n: [], v: 0.02 });
    return { bpm: 132, bpb: B, bars: 32, ev };
  }

  if (track === "ember") {
    // E minor, faster and bolder: horns on the tune, timpani on every downbeat, marcato strings
    const bars = themeBars("minor", 0);
    addMelody(ev, bars, B, "cel", 0, 0.16, A1);
    addMelody(ev, bars, B, "horn", -12, 0.11, (i) => !A1(i) && !BSEC(i), "c", 0.95);
    addMelody(ev, bars, B, "cel", 0, 0.08, (i) => !A1(i), "r");
    addMelody(ev, bars, B, "sect", -12, 0.09, BSEC, "l", 1.05);
    addMelody(ev, bars, B, "horn", -24, 0.06, BSEC, "c");
    filmAccomp(ev, bars, { from: 8, harp: "quarters", padCut: 1400, padV: 0.07, padLow: 55, cello: 0.06, horns: 0, trem: 0.11, timpRolls: true });
    for (const bar of bars) {
      const s = bar.idx * B, h = bar.h;
      ev.push({ b: s, d: 1, i: "timp", n: [bassNote(h, 38)], v: 0.17 });
      if (bar.idx % 2 === 1 && !PHRASE_END(bar.idx)) ev.push({ b: s + 2.5, d: 0.5, i: "timp", n: [bassNote(h, 38)], v: 0.08 });
      ev.push({ b: s, d: 1, i: "pizz", n: [bassNote(h)], v: 0.11 });
      if (bar.idx >= 8) {
        const ch = voicing(h, 55, 3);
        ev.push({ b: s + 1, d: 0.4, i: "pad", n: ch, v: 0.07, p: 2200 }, { b: s + 2, d: 0.4, i: "pad", n: ch, v: 0.06, p: 2200 });
      }
      if (bar.idx === 8 || bar.idx === 16 || bar.idx === 24) ev.push({ b: s, d: 2.5, i: "cym", n: [], v: 0.03 });
      if (bar.idx === 7 || bar.idx === 15) ev.push({ b: s, d: 2.9, i: "troll", n: [bassNote(h, 38)], v: 0.09 });
    }
    return { bpm: 150, bpb: B, bars: 32, ev };
  }

  // evergreen — A dorian, gentle and folky: flute tune over harp, clarinet counter-line, warm low strings
  const bars = themeBars("dorian", -7);
  addMelody(ev, bars, B, "flute", 0, 0.14);
  addMelody(ev, bars, B, "glock", 12, 0.025, (i) => i >= 16 && i < 20, "r");
  addMelody(ev, bars, B, "sect", 0, 0.05, (i) => i >= 24, "l", 1.05);
  filmAccomp(ev, bars, { from: 0, harp: "eighths", padCut: 900, padV: 0.07, padLow: 50, cello: 0.05, horns: 0.025, trem: 0.06, timpRolls: false });
  for (const bar of bars) {
    const i = bar.idx, s = i * B, h = bar.h;
    if ((A2(i) || A3(i)) && !PHRASE_END(i)) {
      const third = h.pcs[1];
      ev.push({ b: s, d: 2.8, i: "reed", n: [53 + ((third - 53) % 12 + 12) % 12], v: 0.06, pan: "l" });
    }
  }
  return { bpm: 112, bpb: B, bars: 32, ev };
}

/** Trivia "thinking" music (original): A minor, 6/8 (counted in eighths), tiptoeing pizzicato scherzo. */
const TRIVIA: [string, string][] = [
  ["Am", "C6:1 r:1 A5:1 E5:1 r:1 B5:1"],
  ["E7", "G#5:1 r:1 E5:1 B5:2 r:1"],
  ["Am", "A5:1 r:1 C6:1 E6:1 D6:1 C6:1"],
  ["E7", "B5:1 A5:1 G#5:1 E5:2 r:1"],
  ["F", "A5:1 r:1 C6:1 F6:1 E6:1 r:1"],
  ["C", "E6:1 D6:1 C6:1 G5:2 r:1"],
  ["Dm6", "F5:1 G#5:1 A5:1 D6:1 C6:1 B5:1"],
  ["E7", "G#5:1 r:1 B5:1 E5:2 r:1"],
  ["Am", "C6:1 r:1 A5:1 E5:1 r:1 B5:1"],
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
    const r = bassNote(h, 41);
    const stab = voicing(h, 57, 4).slice(-3);
    ev.push({ b: s, d: 1, i: "pizz", n: [r], v: 0.14 }, { b: s + 3, d: 1, i: "pizz", n: [r + 7 > 52 ? r - 5 : r + 7], v: 0.11 });
    ev.push({ b: s + 2, d: 0.5, i: "pizz", n: stab, v: 0.03, pan: "l" }, { b: s + 5, d: 0.5, i: "pizz", n: stab, v: 0.03, pan: "l" });
    ev.push({ b: s, d: 0.5, i: "wood", n: [], v: 0.025, p: 1300 }, { b: s + 3, d: 0.5, i: "wood", n: [], v: 0.02, p: 1000 });
    if (idx === 7 || idx === 15) ev.push({ b: s + 2, d: 2.5, i: "gliss", n: arpUp(h, 64, 9), v: 0.035 });
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
  cel: "c", glock: "r", bell: "r", pizz: "c", harp: "r", gliss: "r", pad: "c", trem: "c", sect: "l", horn: "l", choir: "c",
  brass: "c", timp: "c", cym: "r", swell: "r", troll: "c", sleigh: "r", reed: "l", flute: "c", wood: "l",
};

function playEv(c: AudioContext, gr: Graph, e: Ev, at: number, spb: number, o: Outs) {
  const dest = o[e.pan ?? DEFAULT_PAN[e.i]], d = e.d * spb;
  switch (e.i) {
    case "cel": for (const m of e.n) celesta(c, dest, at, m, d, e.v); break;
    case "glock": for (const m of e.n) glock(c, dest, at, m, e.v); break;
    case "bell": for (const m of e.n) bell(c, dest, at, m, e.v); break;
    case "pizz": for (const m of e.n) pluck(c, dest, at, m, e.v); break;
    case "harp": for (const m of e.n) pluck(c, dest, at, m, e.v, true); break;
    case "gliss": gliss(c, dest, at, e.n, d, e.v); break;
    case "pad": pad(c, dest, at, e.n, d, e.v, e.p ?? 1200, d < 0.5 ? 0.02 : 0.5); break;
    case "trem": trem(c, dest, at, e.n, d, e.v, e.v2 ?? e.v, e.p ?? 1800); break;
    case "sect": for (const m of e.n) section(c, dest, at, m, d, e.v, e.p ?? 2200); break;
    case "horn": for (const m of e.n) horn(c, dest, at, m, d, e.v); break;
    case "choir": choir(c, dest, at, e.n, d, e.v, 0.6); break;
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
let cinematicRelease: (() => void) | null = null;
const NOOP_HANDLE = { stop() { /* nothing playing */ } };
function endCinematic(fade: number) {
  if (cinematic) { cinematic.stop(fade); cinematic = null; }
  if (cinematicRelease) { cinematicRelease(); cinematicRelease = null; }
}

/**
 * Cape reveal colours. The sorting build-up ends on B7, so each Cape "answers" it differently:
 * gold → E major (the expected, bright resolution), navy → C major (warm deceptive turn),
 * ember → A♭ major (bold chromatic-mediant leap), evergreen → G major add9 (gentle, open).
 */
const CAPE: Record<Cape, { chord: number[]; choir: number[]; sparkle: number[]; bright: number; boom: number; cym: number }> = {
  navy: { chord: [36, 48, 55, 60, 64, 67], choir: [60, 64, 67, 72], sparkle: [72, 76, 79, 84, 88], bright: 0.75, boom: 0.5, cym: 0.05 },
  gold: { chord: [40, 52, 59, 64, 68, 71], choir: [64, 68, 71, 76], sparkle: [83, 88, 92, 95, 100], bright: 1.2, boom: 0.4, cym: 0.07 },
  ember: { chord: [44, 56, 63, 68, 72, 75], choir: [63, 68, 72, 75], sparkle: [80, 84, 87, 92, 96], bright: 1.3, boom: 0.6, cym: 0.085 },
  evergreen: { chord: [43, 55, 62, 67, 69, 71], choir: [62, 67, 69, 74], sparkle: [79, 81, 83, 86, 91], bright: 0.8, boom: 0.4, cym: 0.045 },
};

export const sfx = {
  /** Drumroll that builds for about 1.8 seconds. */
  drumroll(): void {
    fx(({ c, g, t, out }) => {
      roll(c, g, out, t, 1.8, 0.01, 0.13, "snare");
      roll(c, g, out, t, 1.8, 0.02, 0.12, "timp", 47);
    });
  },
  /** Magical reveal hit: shimmer, celesta arpeggio, warm E-major chord, timpani. Ends any sorting cinematic. */
  reveal(): void {
    endCinematic(0.12);
    fx(({ c, g, t, out }) => {
      duck(1.8);
      cymbal(c, g, out, t, 1.8, 0.05, false, 7000);
      timp(c, g, out, t, 40, 0.28);
      trem(c, out, t, [52, 59, 64, 68, 71], 1.2, 0.2, 0.05, 2400);
      for (const m of [52, 59, 64]) horn(c, out, t, m, 1.1, 0.05);
      [76, 80, 83, 88, 92].forEach((m, i) => celesta(c, out, t + i * 0.06, m, 0.6, 0.12));
      glock(c, out, t + 0.3, 100, 0.05);
      bell(c, out, t, 76, 0.05, 2.5);
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
      celesta(c, out, t + 0.3, 83, 0.4, 0.09); celesta(c, out, t + 0.39, 88, 0.6, 0.08);
    });
  },
  /** Points earned: bright two-note chime. */
  points(): void {
    fx(({ c, t, out }) => { celesta(c, out, t, 83, 0.2, 0.13); celesta(c, out, t + 0.08, 88, 0.6, 0.13); glock(c, out, t + 0.16, 95, 0.04); });
  },
  /** Level up: rising harp + celesta arpeggio into a horn + bell chord. */
  levelUp(): void {
    fx(({ c, g, t, out }) => {
      gliss(c, out, t, [55, 59, 62, 67, 71, 74, 79], 0.35, 0.06);
      [67, 72, 76, 79].forEach((m, i) => celesta(c, out, t + i * 0.09, m, 0.4, 0.11));
      for (const m of [48, 55, 64]) horn(c, out, t + 0.45, m, 0.9, 0.07);
      for (const m of [60, 64, 67, 72]) brass(c, out, t + 0.45, m, 0.9, 0.04);
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
      for (const m of [48, 55, 64]) horn(c, out, t + 0.96, m, 1.1, 0.07);
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
  /** Twinkly sparkle: celesta/glockenspiel notes on an E-major pentatonic + high shimmer. */
  sparkle(): void {
    fx(({ c, g, t, out }) => {
      const scale = [88, 90, 92, 95, 97, 100];
      for (let i = 0; i < 7; i++) {
        const m = scale[Math.floor(Math.random() * scale.length)], at = t + i * 0.055, v = 0.05 + Math.random() * 0.03;
        if (i % 3 === 2) glock(c, out, at, m, v * 0.7); else celesta(c, out, at, m, 0.3, v);
      }
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
   * ~4s sorting build-up, film style: string tremolo crescendo over a chromatic-mediant climb (Em → C → A♭),
   * rising violins, timpani + snare rolls, suspended-cymbal swell and choir, arriving on a held B7 that keeps
   * trembling for a few more seconds (in case the answer is slow). `reveal()` / `capeReveal()` cut it off
   * automatically; `stop()` fades it out.
   */
  sortingCinematic(): { stop(): void } {
    const s = S0();
    if (!s) return NOOP_HANDLE;
    try {
      endCinematic(0.1);
      const grp = group(s), { c, g, t } = s, o = grp.out;
      const release = duck(9, 0.25);
      into(grp, () => {
        roll(c, g, o, t, 4, 0.004, 0.1, "snare");
        roll(c, g, o, t, 4, 0.02, 0.15, "timp", 47);
        roll(c, g, o, t + 4, 3.8, 0.07, 0.03, "timp", 47);
        trem(c, o, t, [40, 52, 55, 59, 64], 1.05, 0.05, 0.1, 1100); // Em
        trem(c, o, t + 1, [36, 48, 55, 60, 64], 1.05, 0.1, 0.15, 1500); // C
        trem(c, o, t + 2, [44, 56, 60, 63, 68], 1.05, 0.15, 0.2, 2000); // A♭
        trem(c, o, t + 3, [47, 54, 59, 63, 66, 69], 4.6, 0.26, 0.12, 2600); // B7, held
        const climb: [number, number][] = [[64, 0], [66, 0.5], [67, 1], [68, 1.5], [68, 2], [70, 2.5], [71, 3]];
        climb.forEach(([m, d]) => section(c, o, t + d, m, 0.55, 0.13, 3000));
        section(c, o, t + 3.5, 75, 4.1, 0.12, 3200);
        for (const m of [47, 54, 63]) horn(c, o, t + 3, m, 4.2, 0.045);
        choir(c, o, t + 1.6, [60, 63, 68, 72], 1.4, 0.08, 0.9);
        choir(c, o, t + 3, [59, 63, 66, 71], 4.4, 0.12, 0.4);
        cymbal(c, g, o, t + 1.4, 2.6, 0.05, true, 6500);
      });
      cinematic = grp;
      cinematicRelease = release;
      const handle = { stop() { try { if (cinematic === grp) endCinematic(0.3); else grp.stop(0.3); } catch { /* ignore */ } } };
      setTimeout(() => { if (cinematic === grp) { cinematic = null; cinematicRelease = null; } }, 8800);
      return handle;
    } catch { return NOOP_HANDLE; }
  },

  /** The big Cape reveal: an orchestral hit (boom, timpani, brass, horns, string sforzando-tremolo, choir, cymbal, harp + glock). */
  capeReveal(cape: Cape): void {
    endCinematic(0.08);
    fx(({ c, g, t, out }) => {
      const k = CAPE[cape] ?? CAPE.navy, root = k.chord[0], upper = k.chord.slice(1);
      duck(3.8, 0.25);
      boom(c, g, out, t, k.boom);
      timp(c, g, out, t, root + 12 > 52 ? root : root + 12, 0.3);
      cymbal(c, g, out, t, 3, k.cym, false, 5500);
      for (const m of upper) brass(c, out, t + 0.02, m, 1.5, 0.06, k.bright);
      for (const m of upper.slice(0, 3)) horn(c, out, t + 0.02, m, 2.2, 0.06);
      trem(c, out, t, [root, ...upper], 2.6, 0.3, 0.07, 2800);
      choir(c, out, t + 0.02, k.choir, 2.2, 0.12, 0.12);
      gliss(c, out, t + 0.05, arpUp({ root: upper[0] % 12, pcs: upper.map((m) => m % 12) }, upper[1], 10), 0.5, 0.05);
      k.sparkle.forEach((m, i) => (i % 2 ? glock(c, out, t + 0.5 + i * 0.07, m, 0.05) : celesta(c, out, t + 0.5 + i * 0.07, m, 0.8, 0.08)));
      bell(c, out, t, k.choir[0], 0.05, 3);
      if (cape === "ember") { timp(c, g, out, t + 0.24, root + 19 > 59 ? root + 7 : root + 19, 0.2); cymbal(c, g, out, t + 0.24, 1.2, 0.04); }
      if (cape === "gold") cymbal(c, g, out, t + 0.1, 1.5, 0.03, false, 9000);
      if (cape === "evergreen") [0, 2, 4, 7, 9, 12, 14].forEach((d, i) => flute(c, out, t + 0.6 + i * 0.07, 67 + d, 0.12, 0.05));
      if (cape === "navy") section(c, out, t + 0.02, 36, 2.2, 0.12, 700);
    });
  },

  /** Right answer: bright rising major arpeggio. */
  correct(): void {
    fx(({ c, t, out }) => { [84, 88, 91].forEach((m, i) => celesta(c, out, t + i * 0.085, m, 0.5, 0.12)); glock(c, out, t + 0.17, 96, 0.04); });
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
        if (end - tense > 0.2) trem(c, o, tense, [46, 52, 58], end - tense - 0.05, 0.06, 0.16, 1600); // B♭ against E: tension
        if (end - tense > 0.5) section(c, o, tense, 88, end - tense - 0.1, 0.05, 4000);
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
  coin(): void { fx(({ c, t, out }) => { celesta(c, out, t, 90, 0.1, 0.1); glock(c, out, t + 0.07, 97, 0.07); }); },
  /** Short welcome fanfare for a new Cape member. */
  welcome(): void {
    fx(({ c, t, out }) => {
      duck(1.8);
      [67, 72, 76].forEach((m, i) => brass(c, out, t + i * 0.12, m, 0.1, 0.08));
      for (const m of [48, 55, 64]) horn(c, out, t + 0.36, m, 0.9, 0.06);
      for (const m of [60, 67, 72]) brass(c, out, t + 0.36, m, 0.9, 0.05);
      gliss(c, out, t + 0.36, [60, 64, 67, 72, 76, 79, 84], 0.3, 0.05);
      [84, 88, 91, 96].forEach((m, i) => celesta(c, out, t + 0.5 + i * 0.06, m, 0.5, 0.07));
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
  /** Trivia duel win: brass pickup into a big E-major chord, choir, celesta run, timpani + cymbal. */
  victory(): void {
    fx(({ c, g, t, out }) => {
      duck(2.8, 0.3);
      [71, 76, 80].forEach((m, i) => brass(c, out, t + i * 0.1, m, 0.08, 0.09, 1.1));
      for (const m of [52, 64, 68, 71, 76]) brass(c, out, t + 0.32, m, 1.4, 0.065, 1.1);
      for (const m of [52, 59, 64]) horn(c, out, t + 0.32, m, 1.6, 0.06);
      timp(c, g, out, t + 0.2, 47, 0.18); timp(c, g, out, t + 0.32, 40, 0.3);
      cymbal(c, g, out, t + 0.32, 2, 0.06);
      choir(c, out, t + 0.32, [64, 68, 71, 76], 1.5, 0.1, 0.15);
      [76, 78, 80, 81, 83, 85, 87, 88].forEach((m, i) => celesta(c, out, t + 0.32 + i * 0.035, m + 12, 0.3, 0.06));
    });
  },
};
