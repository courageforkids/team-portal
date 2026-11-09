#!/usr/bin/env node
/**
 * Builds the real-instrument sample pack used by the Courage Academy music
 * (src/lib/music.ts) from public-domain (CC0) orchestral recordings.
 *
 * Output (committed): public/audio/orch/v1/**.mp3 and public/audio/orch/v1/manifest.json
 * Never commits WAV/FLAC: raw sources live in a cache directory OUTSIDE the repo.
 *
 * Sources (only these were license-checked; see THIRD_PARTY_AUDIO.md):
 *   - VSCO 2 Community Edition, Versilian Studios: CC0, pinned commit below
 *   - VCSL (Versilian Community Sample Library): CC0, pinned commit below
 *   - stamperadam's Celeste samples (Freesound pack 6166, CC0), from the unmodified
 *     mirror in the "Samples/Celeste" folder of peastman/sso at a pinned commit.
 *     Nothing else from the SSO repo may be used (it is under a different license);
 *     the allow-list below enforces that.
 *   Never add Philharmonia, other SSO folders, FluidR3/MusyngKite/FatBoy or tonejs-instruments.
 *
 * Usage:
 *   node scripts/build-orchestra-samples.mjs [--cache DIR] [--out DIR] [--budget-mb 6]
 *                                            [--only celesta,harp] [--dry-run] [--jobs 6]
 *   env: ORCH_CACHE_DIR (cache, default <os tmp>/cfk-orch-cache), FFMPEG, FFPROBE
 *
 * Needs: node >= 18, git, curl, ffmpeg + ffprobe with libmp3lame.
 *
 * What it does, per sample:
 *   1. downloads the file at the pinned commit from raw.githubusercontent.com and checks it
 *      against the git blob SHA-1 from the pinned tree (falls back to `git cat-file`),
 *   2. decodes to 44.1 kHz float and high-passes below the instrument's range (DC, rumble and the
 *      celesta's mechanism thump),
 *   3. finds the onset precisely (noise-floor aware) and trims leading silence, keeping a
 *      1.5 ms raised-cosine pre-roll so the note onset is at t ~= 1.5 ms,
 *   4. folds stereo to mono (time-aligning the spaced-pair channels first to avoid comb filtering),
 *   5. measures f0 (names are NOT trusted: VSCO violin/cello/horn/glock names are an octave low),
 *   6. sustains: finds a steady loop (level + spectral match, zero crossings, waveform
 *      correlation), bakes an equal-power crossfade into the loop end and appends a tail that
 *      continues from loopStart, so the file plays seamlessly whether it loops or not,
 *   7. one-shots: cuts at -60 dB or the max length with a fade; swells keep the peak,
 *   8. peak-normalizes to -1 dBFS and stores a per-zone gain that gives every zone the same
 *      body loudness (the recorded layer differences are kept in the manifest),
 *   9. encodes mono MP3 (LAME VBR) and reads the exact encoder delay/padding from the LAME tag,
 *  10. verifies every file: ffprobe, gapless decode length and onset, non-gapless decode offset,
 *      loop seams. The output is byte-for-byte reproducible.
 *
 * Why MP3: it is the only compressed format every browser's decodeAudioData handles, including
 * open-source Chromium builds (no AAC) and older Safari (no Opus). Its one weakness, the encoder
 * delay, is handled exactly: the LAME tag carries delay + padding, Chromium/Firefox trim it, and
 * manifest.format.detect tells the player how to recognise (from the decoded length) a decoder
 * that does not, and by how much to shift.
 */
import { spawnSync, execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execFileP = promisify(execFile);
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SR = 44100;
const PACK_VERSION = 1;

// ---------------------------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------------------------
function parseArgs(argv) {
  const a = { budgetMb: 6, jobs: 6, dryRun: false, only: null };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    const next = () => argv[++i];
    if (k === '--cache') a.cache = next();
    else if (k === '--out') a.out = next();
    else if (k === '--budget-mb') a.budgetMb = Number(next());
    else if (k === '--jobs') a.jobs = Number(next());
    else if (k === '--only') a.only = next().split(',');
    else if (k === '--dry-run') a.dryRun = true;
    else if (k === '-h' || k === '--help') {
      console.log(fs.readFileSync(fileURLToPath(import.meta.url), 'utf8').split('*/')[0]);
      process.exit(0);
    } else throw new Error(`unknown argument ${k}`);
  }
  return a;
}
const ARGS = parseArgs(process.argv.slice(2));
const CACHE = path.resolve(ARGS.cache || process.env.ORCH_CACHE_DIR || path.join(os.tmpdir(), 'cfk-orch-cache'));
const OUT = path.resolve(ARGS.out || path.join(REPO_ROOT, 'public/audio/orch/v1'));
if (CACHE === REPO_ROOT || CACHE.startsWith(REPO_ROOT + path.sep)) {
  throw new Error(`cache dir ${CACHE} must be outside the repo (raw WAV/FLAC must never be committed)`);
}
const pickBin = (env, abs, name) => process.env[env] || (fs.existsSync(abs) ? abs : name);
const FFMPEG = pickBin('FFMPEG', '/usr/bin/ffmpeg', 'ffmpeg');
const FFPROBE = pickBin('FFPROBE', '/usr/bin/ffprobe', 'ffprobe');

// ---------------------------------------------------------------------------------------------
// Sources (pinned) and the allow-list that keeps us inside the verified CC0 material
// ---------------------------------------------------------------------------------------------
const SOURCES = {
  vsco: {
    repo: 'sgossner/VSCO-2-CE',
    commit: '440300901dfe9275fd84e0b7763af1f8443ae62e',
    title: 'VSCO 2 Community Edition',
    author: 'Versilian Studios (Sam Gossner)',
    license: 'CC0-1.0',
    allow: /^(Percussion\/(Glock|Timpani)\/|Percussion\/cymbal-crash1_|Strings\/(Harp|Violin Section|Cello Section)\/|Brass\/F Horn\/sus\/)/,
  },
  vcsl: {
    repo: 'sgossner/VCSL',
    commit: 'c1ea7bcc3c7309650ab0da9d15c9cd1fbc4a4c7e',
    title: 'VCSL (Versilian Community Sample Library)',
    author: 'Versilian Studios LLC',
    license: 'CC0-1.0',
    allow: /^Idiophones\/Struck Idiophones\/(Suspended Cymbal 1|Mark Trees)\//,
  },
  sso: {
    repo: 'peastman/sso',
    commit: '4f570ce3b3896fb8a7c543f50b5d13f2ea5e58a1',
    title: 'Celeste samples by stamperadam (Freesound pack 6166), unmodified mirror in peastman/sso',
    author: 'stamperadam',
    license: 'CC0-1.0',
    // ONLY the CC0 celeste folder. The rest of SSO is Sampling Plus 1.0 with unverifiable sources.
    allow: /^Sonatina Symphonic Orchestra\/Samples\/Celeste\/celeste-[a-g]#?\d-(soft|hard)\.flac$/,
  },
};

// ---------------------------------------------------------------------------------------------
// Instrument selection
// ---------------------------------------------------------------------------------------------
const NOTE_PC = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 };
function nameToMidi(name) {
  const m = /^([a-gA-G])(#|b)?(-?\d)$/.exec(name);
  if (!m) throw new Error(`bad note name ${name}`);
  return 12 * (Number(m[3]) + 1) + NOTE_PC[m[1].toLowerCase()] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
}
const PC_NAMES = ['c', 'cs', 'd', 'ds', 'e', 'f', 'fs', 'g', 'gs', 'a', 'as', 'b'];
const midiToFileName = (m) => `${PC_NAMES[m % 12]}${Math.floor(m / 12) - 1}`; // no '#' in URLs
const PC_PRETTY = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const midiToPretty = (m) => `${PC_PRETTY[m % 12]}${Math.floor(m / 12) - 1}`;

const SSO_CELESTE = 'Sonatina Symphonic Orchestra/Samples/Celeste';
// VSCO violin/cello/horn/glock file names use the "C3 = middle C" convention, i.e. they sound
// one octave above the name (confirmed by the SFZ key centres and by measuring f0).
const OCT = 12;
// SFZ key centres of the five VSCO timpani (used only as the measurement prior).
const TIMPANI_KEY = { 1: 42, 2: 46, 3: 49, 4: 52, 5: 54 };

const INSTRUMENTS = [
  {
    key: 'celesta', label: 'Celesta', src: 'sso', kind: 'oneshot', pitch: 'peak', q: 2, hp: 150,
    maxLen: 4.0, release: 0.3, note: 'Spaced-pair KM-184 recording folded to mono.',
    zones: ['c4', 'e4', 'g#4', 'c5', 'e5', 'g#5', 'c6', 'e6', 'g#6', 'c7', 'e7', 'g#7'].flatMap((n) =>
      ['soft', 'hard'].map((layer) => ({ path: `${SSO_CELESTE}/celeste-${n}-${layer}.flac`, expect: nameToMidi(n), layer }))),
  },
  {
    key: 'glockenspiel', label: 'Glockenspiel', src: 'vsco', kind: 'oneshot', pitch: 'peak', q: 1, hp: 300,
    maxLen: 3.0, release: 0.3,
    zones: ['G4', 'C5', 'G5', 'C6', 'G6', 'C7'].map((n) => ({ path: `Percussion/Glock/glock_medium_${n}.wav`, expect: nameToMidi(n) + OCT, layer: 'hard' })),
  },
  {
    key: 'harp', label: 'Concert harp', src: 'vsco', kind: 'oneshot', pitch: 'harmonic', q: 2, hp: 30,
    maxLen: 4.0, maxLenHigh: 3.0, release: 0.4,
    zones: ['B1', 'D2', 'F2', 'A2', 'C3', 'E3', 'G3', 'B3', 'D4', 'F4', 'A4', 'C5', 'E5', 'G5', 'B5', 'D6', 'F6', 'A6']
      .map((n) => ({ path: `Strings/Harp/KSHarp_${n}_mf.wav`, expect: nameToMidi(n), layer: 'hard' })),
  },
  {
    key: 'violinSustain', label: 'Violin section, sustain (vibrato)', src: 'vsco', kind: 'sustain', pitch: 'harmonic', q: 2, hp: 90,
    release: 0.45,
    zones: ['G2', 'A2', 'B2', 'D3', 'F#3', 'A3', 'C4', 'E4', 'G4', 'B4', 'D5']
      .map((n) => ({ path: `Strings/Violin Section/susVib/VlnEns_susVib_${n}_v2.wav`, expect: nameToMidi(n) + OCT, layer: 'hard' })),
  },
  {
    key: 'violinTremolo', label: 'Violin section, tremolo', src: 'vsco', kind: 'sustain', pitch: 'harmonic', q: 2, hp: 90,
    release: 0.35,
    zones: ['G2', 'A2', 'B2', 'D3', 'F#3', 'A3', 'C4', 'E4', 'G4', 'B4', 'D5']
      .map((n) => ({ path: `Strings/Violin Section/Trem/VlnEns_Trem_${n}_v1.wav`, expect: nameToMidi(n) + OCT, layer: 'soft' })),
  },
  {
    key: 'celloSustain', label: 'Cello section, sustain (vibrato)', src: 'vsco', kind: 'sustain', pitch: 'harmonic', q: 2, hp: 35,
    release: 0.5,
    zones: ['C1', 'E1', 'G1', 'B1', 'D2', 'F2', 'A2', 'C3', 'E3', 'G3', 'B3', 'D4', 'F4']
      .map((n) => ({ path: `Strings/Cello Section/susvib/susvib_${n}_v3_1.wav`, expect: nameToMidi(n) + OCT, layer: 'hard' })),
  },
  {
    key: 'hornSustain', label: 'French horn, sustain', src: 'vsco', kind: 'sustain', pitch: 'harmonic', q: 2, hp: 30,
    release: 0.4, note: 'One horn; layer 2-3 voices on neighbouring zones (detuned 5-8 cents, offset 10-25 ms) for a section.',
    zones: [['A0', 'v1'], ['C1', 'v2'], ['D#1', 'v2'], ['G1', 'v2'], ['A#1', 'v2'], ['D2', 'v2'], ['F2', 'v2'], ['A2', 'v2'], ['C3', 'v2'], ['D4', 'v1'], ['F4', 'v1']]
      .map(([n, v]) => ({ path: `Brass/F Horn/sus/MOHorn_sus_${n}_${v}_1.wav`, expect: nameToMidi(n) + OCT, layer: 'hard' })),
  },
  {
    key: 'timpani', label: 'Timpani, single hits', src: 'vsco', kind: 'oneshot', pitch: 'peak', q: 2, hp: 30,
    maxLen: 4.0, release: 0.5,
    // v1 (pp) is recorded 50-60 dB down (peaks -51..-59 dBFS, gated tails), too noisy once normalized,
    // so the layers are v3 (mf, "soft") and v4 (ff, "hard"; drum 1 has no v4).
    pitchFromName: false,
    zones: [1, 2, 3, 4, 5].flatMap((d) => [['v3', 'soft'], ['v4', 'hard']].filter(([v]) => !(d === 1 && v === 'v4')).map(([v, layer]) =>
      ({ path: `Percussion/Timpani/Timpani${d}_Hit_${v}_rr1_Sum.wav`, expect: TIMPANI_KEY[d], layer, name: `drum${d}-${layer}` }))),
  },
  {
    key: 'timpaniRoll', label: 'Timpani, rolls (loopable)', src: 'vsco', kind: 'sustain', pitch: 'peak', q: 2, hp: 30,
    release: 0.6, pitchFromName: false,
    note: 'Pitch = the same drum\'s single hit: a roll excites many closely spaced modes, so its spectrum is too diffuse to measure on its own.',
    zones: [1, 2, 3, 4, 5].map((d) => ({ path: `Percussion/Timpani/Rolls/Timpani${d}_Roll_v3_rr1_Sum.wav`, expect: TIMPANI_KEY[d], layer: 'hard', name: `drum${d}`, pitchFrom: `timpani/drum${d}-soft` })),
  },
  {
    key: 'cymbalSwell', label: 'Suspended cymbal, mallet swells', src: 'vcsl', kind: 'swell', pitch: 'none', q: 2, hp: 80,
    tailAfterPeak: 2.2, release: 0.8,
    note: 'Schedule start = target time - peakTime so the swell peaks on the beat.',
    zones: ['2s', '4s', '7.5s'].map((v) => ({ path: `Idiophones/Struck Idiophones/Suspended Cymbal 1/susCymb1_cresc_${v}.wav`, layer: 'hard', variant: v })),
  },
  {
    key: 'cymbalCrash', label: 'Orchestral crash cymbals', src: 'vsco', kind: 'oneshot', pitch: 'none', q: 2, hp: 80,
    maxLen: 5.0, release: 0.8,
    zones: [['mf', 'soft'], ['ff', 'hard']].map(([v, layer]) => ({ path: `Percussion/cymbal-crash1_${v}_rr1.wav`, layer, variant: v })),
  },
  {
    key: 'markTree', label: 'Mark tree (bar chimes) glissandi', src: 'vcsl', kind: 'oneshot', pitch: 'none', q: 3, hp: 400,
    maxLen: 4.0, release: 0.8,
    zones: [['asc1', 'up'], ['desc1', 'down']].map(([v, variant]) => ({ path: `Idiophones/Struck Idiophones/Mark Trees/Legacy/windchimes_${v}.wav`, layer: 'hard', variant })),
  },
];

// ---------------------------------------------------------------------------------------------
// small utils
// ---------------------------------------------------------------------------------------------
const log = (...a) => console.log(...a);
const warnings = [];
const warn = (msg) => { warnings.push(msg); console.warn(`WARN ${msg}`); };
const db = (v) => 20 * Math.log10(Math.max(v, 1e-12));
const undb = (d) => 10 ** (d / 20);
const round = (v, n = 4) => Math.round(v * 10 ** n) / 10 ** n;
const mtof = (m) => 440 * 2 ** ((m - 69) / 12);
const ftom = (f) => 69 + 12 * Math.log2(f / 440);
const median = (arr) => { const s = [...arr].sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : NaN; };

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { maxBuffer: 1 << 30, ...opts });
  if (r.error) throw r.error;
  if (r.status !== 0) throw new Error(`${cmd} ${args.join(' ')} failed (${r.status}): ${String(r.stderr || '').slice(0, 2000)}`);
  return r.stdout;
}
const gitBlobSha = (buf) => createHash('sha1').update(`blob ${buf.length}\0`).update(buf).digest('hex');

async function pool(items, n, fn) {
  const out = new Array(items.length);
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (i < items.length) { const k = i++; out[k] = await fn(items[k], k); }
  }));
  return out;
}

// ---------------------------------------------------------------------------------------------
// 1. download (pinned commit, verified against the git tree)
// ---------------------------------------------------------------------------------------------
const GIT_ENV = { ...process.env, GIT_NO_LAZY_FETCH: '1', GIT_TERMINAL_PROMPT: '0' };
function ensureRepo(key) {
  const src = SOURCES[key];
  const dir = path.join(CACHE, 'repos', key);
  if (!fs.existsSync(path.join(dir, '.git'))) {
    log(`clone ${src.repo} (tree only, no blobs) -> ${dir}`);
    fs.mkdirSync(path.dirname(dir), { recursive: true });
    run('git', ['clone', '--quiet', '--filter=blob:none', '--no-checkout', `https://github.com/${src.repo}.git`, dir]);
  }
  const has = spawnSync('git', ['-C', dir, 'cat-file', '-e', `${src.commit}^{commit}`], { env: GIT_ENV });
  if (has.status !== 0) run('git', ['-C', dir, 'fetch', '--quiet', '--filter=blob:none', 'origin', src.commit]);
  return dir;
}
const treeCache = new Map();
function treeOf(key) {
  if (treeCache.has(key)) return treeCache.get(key);
  const dir = ensureRepo(key);
  const raw = run('git', ['-C', dir, 'ls-tree', '-r', '-z', SOURCES[key].commit], { env: GIT_ENV }).toString('utf8');
  const map = new Map();
  for (const ent of raw.split('\0')) {
    if (!ent) continue;
    const tab = ent.indexOf('\t');
    const [, type, sha] = ent.slice(0, tab).split(' ');
    if (type === 'blob') map.set(ent.slice(tab + 1), sha);
  }
  treeCache.set(key, map);
  return map;
}

async function fetchSource(key, p) {
  const src = SOURCES[key];
  if (!src.allow.test(p)) throw new Error(`${key}:${p} is outside the license-verified allow-list`);
  const sha = treeOf(key).get(p);
  if (!sha) throw new Error(`${key}:${p} not found at ${src.commit}`);
  const dest = path.join(CACHE, 'src', key, p);
  if (fs.existsSync(dest) && gitBlobSha(fs.readFileSync(dest)) === sha) return dest;
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  const tmp = `${dest}.part`;
  const url = `https://raw.githubusercontent.com/${src.repo}/${src.commit}/${p.split('/').map(encodeURIComponent).join('/')}`;
  try {
    await execFileP('curl', ['-fsSL', '--retry', '4', '--retry-delay', '2', '-o', tmp, url]);
  } catch (e) {
    log(`curl failed for ${p} (${e.message.split('\n')[0]}); trying git cat-file`);
    const dir = ensureRepo(key);
    fs.writeFileSync(tmp, run('git', ['-C', dir, 'cat-file', 'blob', sha]));
  }
  const got = gitBlobSha(fs.readFileSync(tmp));
  if (got !== sha) throw new Error(`${key}:${p} checksum mismatch (got ${got}, want ${sha})`);
  fs.renameSync(tmp, dest);
  return dest;
}

// ---------------------------------------------------------------------------------------------
// 2. audio I/O via ffmpeg
// ---------------------------------------------------------------------------------------------
function toF32(buf) {
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.length);
  return new Float32Array(ab);
}
/** Decode any file to 44.1 kHz float. Returns [L, R] (Float32Array each). */
function decodeStereo(file, hp = 20) {
  // two cascaded 2nd-order high-passes remove DC, rumble and mechanism thumps below the instrument;
  // soxr gives a clean resample if a source is not 44.1 kHz
  const x = toF32(run(FFMPEG, ['-v', 'error', '-nostdin', '-i', file, '-af', `highpass=f=${hp},highpass=f=${hp},aresample=${SR}:resampler=soxr`,
    '-f', 'f32le', '-acodec', 'pcm_f32le', '-ac', '2', '-ar', String(SR), '-']));
  const n = x.length / 2;
  const L = new Float32Array(n), R = new Float32Array(n);
  for (let i = 0; i < n; i++) { L[i] = x[2 * i]; R[i] = x[2 * i + 1]; }
  return [L, R];
}
/** Decode an MP3 the way ffmpeg does by default (honours the LAME gapless tag). Mono float. */
function decodeMono(file) {
  return toF32(run(FFMPEG, ['-v', 'error', '-nostdin', '-i', file, '-f', 'f32le', '-acodec', 'pcm_f32le', '-ac', '1', '-']));
}
function encodeMp3(pcm, out, q) {
  run(FFMPEG, ['-v', 'error', '-nostdin', '-y', '-f', 'f32le', '-ar', String(SR), '-ac', '1', '-i', '-',
    '-map_metadata', '-1', '-c:a', 'libmp3lame', '-q:a', String(q), '-compression_level', '0',
    '-id3v2_version', '0', '-write_id3v1', '0', '-write_xing', '1', '-fflags', '+bitexact', '-flags', '+bitexact', out],
  { input: Buffer.from(pcm.buffer, pcm.byteOffset, pcm.byteLength) });
}

// ---------------------------------------------------------------------------------------------
// 3. MP3 / LAME tag parsing (exact encoder delay + padding)
// ---------------------------------------------------------------------------------------------
const MP3_BITRATES = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320];
function parseMp3(buf) {
  let p = 0;
  if (buf.toString('latin1', 0, 3) === 'ID3') {
    p = 10 + (((buf[6] & 0x7f) << 21) | ((buf[7] & 0x7f) << 14) | ((buf[8] & 0x7f) << 7) | (buf[9] & 0x7f));
  }
  const frameAt = (q) => {
    if (q + 4 > buf.length || buf[q] !== 0xff || (buf[q + 1] & 0xe0) !== 0xe0) return null;
    const h = buf.readUInt32BE(q);
    const version = (h >>> 19) & 3; const layer = (h >>> 17) & 3;
    const bri = (h >>> 12) & 15; const sri = (h >>> 10) & 3; const pad = (h >>> 9) & 1; const mode = (h >>> 6) & 3;
    if (version !== 3 || layer !== 1 || bri === 0 || bri === 15 || sri !== 0) return null; // MPEG-1 L3 44.1k only
    return { len: Math.floor((144000 * MP3_BITRATES[bri]) / 44100) + pad, mono: mode === 3, kbps: MP3_BITRATES[bri] };
  };
  while (p < buf.length - 4 && !frameAt(p)) p++;
  const first = frameAt(p);
  if (!first) throw new Error('no MP3 frame');
  const tagOff = p + 4 + (first.mono ? 17 : 32);
  const tagId = buf.toString('latin1', tagOff, tagOff + 4);
  if (tagId !== 'Xing' && tagId !== 'Info') throw new Error('no Xing/Info tag');
  const flags = buf.readUInt32BE(tagOff + 4);
  let q = tagOff + 8;
  let tagFrames = null;
  if (flags & 1) { tagFrames = buf.readUInt32BE(q); q += 4; }
  if (flags & 2) q += 4;
  if (flags & 4) q += 100;
  if (flags & 8) q += 4;
  const encoder = buf.toString('latin1', q, q + 9).replace(/\0+$/, '');
  const d0 = buf[q + 21], d1 = buf[q + 22], d2 = buf[q + 23];
  const delay = (d0 << 4) | (d1 >> 4);
  const padding = ((d1 & 0x0f) << 8) | d2;
  // walk the audio frames
  let frames = 0; let r = p + first.len;
  while (r < buf.length) { const f = frameAt(r); if (!f) break; frames++; r += f.len; }
  return { infoFrameOffset: p, infoFrameLen: first.len, audioStart: p + first.len, tagId, tagFrames, frames, encoder, delay, padding, trailingBytes: buf.length - r };
}

// ---------------------------------------------------------------------------------------------
// 4. DSP helpers
// ---------------------------------------------------------------------------------------------
const twiddleCache = new Map();
function fft(re, im) {
  const n = re.length;
  let tw = twiddleCache.get(n);
  if (!tw) {
    tw = { c: new Float64Array(n / 2), s: new Float64Array(n / 2) };
    for (let k = 0; k < n / 2; k++) { tw.c[k] = Math.cos((-2 * Math.PI * k) / n); tw.s[k] = Math.sin((-2 * Math.PI * k) / n); }
    twiddleCache.set(n, tw);
  }
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { let t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const half = len >> 1; const step = n / len;
    for (let i = 0; i < n; i += len) {
      for (let k = 0; k < half; k++) {
        const wr = tw.c[k * step], wi = tw.s[k * step];
        const a = i + k, b = a + half;
        const br = re[b] * wr - im[b] * wi, bi = re[b] * wi + im[b] * wr;
        re[b] = re[a] - br; im[b] = im[a] - bi; re[a] += br; im[a] += bi;
      }
    }
  }
}
function magSpectrum(seg, nfft) {
  const re = new Float64Array(nfft), im = new Float64Array(nfft);
  const n = Math.min(seg.length, nfft);
  for (let i = 0; i < n; i++) re[i] = seg[i] * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (n - 1)));
  fft(re, im);
  const mag = new Float64Array(nfft / 2 + 1);
  for (let k = 0; k <= nfft / 2; k++) mag[k] = Math.hypot(re[k], im[k]);
  return mag;
}
function peakNear(mag, binHz, f, cents) {
  const lo = Math.max(1, Math.floor((f * 2 ** (-cents / 1200)) / binHz));
  const hi = Math.min(mag.length - 2, Math.ceil((f * 2 ** (cents / 1200)) / binHz));
  if (hi <= lo) return { f, m: 0, edge: true };
  let best = lo;
  for (let k = lo; k <= hi; k++) if (mag[k] > mag[best]) best = k;
  const a = Math.log(mag[best - 1] + 1e-20), b = Math.log(mag[best] + 1e-20), c = Math.log(mag[best + 1] + 1e-20);
  const den = a - 2 * b + c;
  let d = den < 0 ? (0.5 * (a - c)) / den : 0;
  d = Math.max(-0.5, Math.min(0.5, d));
  return { f: (best + d) * binHz, m: mag[best], edge: best === lo || best === hi };
}
/** FFT cross-correlation; returns lag (b relative to a) in [minLag, maxLag] maximizing sum a[n]*b[n+lag]. */
function xcorrLag(a, b, minLag, maxLag, len = 16384) {
  const need = len + Math.max(Math.abs(minLag), Math.abs(maxLag)) * 2;
  let n = 1; while (n < need * 2) n <<= 1;
  const ar = new Float64Array(n), ai = new Float64Array(n), br = new Float64Array(n), bi = new Float64Array(n);
  for (let i = 0; i < Math.min(len, a.length); i++) ar[i] = a[i];
  for (let i = 0; i < Math.min(len + maxLag, b.length); i++) br[i] = b[i];
  fft(ar, ai); fft(br, bi);
  // corr[lag] = IFFT(conj(A) * B)
  const cr = new Float64Array(n), ci = new Float64Array(n);
  for (let k = 0; k < n; k++) { cr[k] = ar[k] * br[k] + ai[k] * bi[k]; ci[k] = -(ar[k] * bi[k] - ai[k] * br[k]); }
  fft(cr, ci); // forward FFT of conj -> conj of inverse (scaled); real part is what we need
  let best = 0, bestV = -Infinity;
  for (let lag = minLag; lag <= maxLag; lag++) {
    const v = cr[(lag + n) % n];
    if (v > bestV) { bestV = v; best = lag; }
  }
  return best;
}
/** Lag in [center-radius, center+radius] maximizing sum a[n]*b[n+lag] over the first 1.5 s. */
function bestLagNear(a, b, center, radius) {
  let best = center, bestV = -Infinity;
  const n = Math.min(a.length, Math.round(1.5 * SR));
  for (let lag = center - radius; lag <= center + radius; lag++) {
    let s = 0; for (let i = Math.max(0, -lag); i < n && i + lag < b.length; i++) s += a[i] * b[i + lag];
    if (s > bestV) { bestV = s; best = lag; }
  }
  return best;
}
function rmsDbRange(x, a, b) {
  a = Math.max(0, Math.floor(a)); b = Math.min(x.length, Math.floor(b));
  let s = 0; for (let i = a; i < b; i++) s += x[i] * x[i];
  return db(Math.sqrt(s / Math.max(1, b - a)));
}
function corrAt(x, i0, y, j0, n) {
  let sxy = 0, sxx = 0, syy = 0;
  for (let k = 0; k < n; k++) { const a = x[i0 + k], b = y[j0 + k]; sxy += a * b; sxx += a * a; syy += b * b; }
  return sxy / Math.sqrt(sxx * syy + 1e-30);
}

/** Frame features: smoothed RMS (dB) and 24 log-spaced band levels (dB). hop 256, win 2048. */
function frameFeatures(x, hop = 256, win = 2048) {
  const nF = Math.max(0, Math.floor((x.length - win) / hop) + 1);
  const NB = 24; const edges = [];
  for (let b = 0; b <= NB; b++) edges.push(Math.round(((60 * (12000 / 60) ** (b / NB)) / SR) * win));
  const hann = new Float64Array(win); for (let i = 0; i < win; i++) hann[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (win - 1));
  const pow = new Float64Array(nF); const bands = [];
  const re = new Float64Array(win), im = new Float64Array(win);
  for (let f = 0; f < nF; f++) {
    const o = f * hop; let s = 0;
    for (let i = 0; i < win; i++) { const v = x[o + i]; s += v * v; re[i] = v * hann[i]; im[i] = 0; }
    pow[f] = s / win;
    fft(re, im);
    const bl = new Float64Array(NB);
    for (let b = 0; b < NB; b++) {
      let e = 0; for (let k = edges[b]; k < Math.max(edges[b] + 1, edges[b + 1]); k++) e += re[k] * re[k] + im[k] * im[k];
      bl[b] = 10 * Math.log10(e + 1e-12);
    }
    bands.push(bl);
  }
  const rms = new Float64Array(nF);
  for (let f = 0; f < nF; f++) {
    let s = 0, c = 0; for (let j = Math.max(0, f - 4); j <= Math.min(nF - 1, f + 4); j++) { s += pow[j]; c++; }
    rms[f] = 10 * Math.log10(s / c + 1e-24);
  }
  // floor each band at (frame max - 50 dB) so noise-only bands do not dominate distances
  for (const bl of bands) { let mx = -Infinity; for (const v of bl) mx = Math.max(mx, v); for (let b = 0; b < NB; b++) bl[b] = Math.max(bl[b], mx - 50); }
  return { hop, win, nF, rms, bands, t: (f) => (f * hop + win / 2) / SR, f: (t) => Math.max(0, Math.min(nF - 1, Math.round((t * SR - win / 2) / hop))) };
}

// ---------------------------------------------------------------------------------------------
// 5. analysis steps
// ---------------------------------------------------------------------------------------------
function findOnset(L, R) {
  const n = L.length; const hop = 32;
  const env = new Float32Array(Math.ceil(n / hop));
  for (let f = 0; f < env.length; f++) {
    let m = 0; for (let i = f * hop; i < Math.min(n, f * hop + 64); i++) m = Math.max(m, Math.abs(L[i]), Math.abs(R[i]));
    env[f] = m;
  }
  let peak = 0; for (const v of env) peak = Math.max(peak, v);
  let coarse = 0; while (coarse < env.length && env[coarse] < peak * undb(-30)) coarse++;
  // Noise floor = median level of the first 30 ms, if the file has at least ~6 ms of lead-in before the
  // sound gets within 30 dB of its peak (this also keeps the quiet start of a cymbal swell). Then walk
  // back from that point while the level stays 8 dB above the floor. Without a lead-in (sources cut
  // right at the attack) walk back while within 45 dB of the peak.
  const pre = env.subarray(0, Math.max(0, coarse - Math.round((0.005 * SR) / hop)));
  let thr, nf = null;
  if (pre.length >= 8) {
    const first = Array.from(pre.subarray(0, Math.min(pre.length, Math.round((0.03 * SR) / hop)))).sort((a, b) => a - b);
    nf = first[Math.floor(first.length / 2)];
    thr = Math.max(nf * undb(8), peak * undb(-60));
  } else thr = peak * undb(-45);
  let i = coarse; while (i > 0 && env[i - 1] > thr) i--;
  return { onset: i * hop, peak, noiseFloorDb: nf == null ? null : db(nf / peak) };
}
/** Stereo -> mono, compensating a spaced-pair inter-channel delay first (avoids comb filtering). */
function foldToMono(L, R, onset) {
  const a = onset + Math.round(0.01 * SR); const W = Math.min(Math.round(0.5 * SR), L.length - a - 256);
  let sLL = 0, sRR = 0, same = true;
  for (let i = a; i < a + W; i++) { sLL += L[i] * L[i]; sRR += R[i] * R[i]; if (same && L[i] !== R[i]) same = false; }
  if (same) return { mono: Float32Array.from(L), lag: 0, corr: 1 };
  const maxLag = Math.round(0.0025 * SR);
  let best = 0, bestC = -Infinity, c0 = 0;
  for (let lag = -maxLag; lag <= maxLag; lag++) {
    let s = 0; for (let i = a; i < a + W; i++) s += L[i] * (R[i + lag] || 0);
    const c = s / Math.sqrt(sLL * sRR + 1e-30);
    if (lag === 0) c0 = c;
    if (c > bestC) { bestC = c; best = lag; }
  }
  const useLag = bestC > 0.5 && bestC > c0 + 0.1 ? best : 0;
  const mono = new Float32Array(L.length);
  for (let i = 0; i < L.length; i++) mono[i] = 0.5 * (L[i] + (R[i + useLag] || 0));
  return { mono, lag: useLag, corr: useLag ? bestC : c0 };
}
function measurePitch(x, expectMidi, mode, t0, t1) {
  const a = Math.round(t0 * SR), b = Math.min(x.length, Math.round(t1 * SR));
  const nfft = 1 << 18; const binHz = SR / nfft;
  const mag = magSpectrum(x.subarray(a, b), nfft);
  const fe = mtof(expectMidi);
  let f0, notes = [];
  if (mode === 'peak') {
    const p = peakNear(mag, binHz, fe, 120);
    f0 = p.f;
    if (p.edge) notes.push('peak at search edge');
    const sub = peakNear(mag, binHz, f0 / 2, 30).m, up = peakNear(mag, binHz, f0 * 2, 30).m;
    if (sub > 0.5 * p.m) notes.push(`strong energy an octave below (${db(sub / p.m).toFixed(1)} dB)`);
    if (up > 3 * p.m) notes.push(`stronger peak an octave above (${db(up / p.m).toFixed(1)} dB)`);
    const wide = peakNear(mag, binHz, fe, 300);
    if (wide.m > 2 * p.m && Math.abs(ftom(wide.f) - ftom(f0)) > 0.7) notes.push(`stronger peak at ${ftom(wide.f).toFixed(2)} within +-3 semitones`);
  } else {
    // strongest of the first 4 harmonics locates f0; then a magnitude-weighted average of harmonics
    let best = null;
    for (let k = 1; k <= 4; k++) { const p = peakNear(mag, binHz, k * fe, 90); if (!best || p.m > best.p.m) best = { k, p }; }
    const est = best.p.f / best.k;
    let sw = 0, sf = 0, mx = 0; const hs = [];
    for (let k = 1; k <= 6; k++) { const p = peakNear(mag, binHz, k * est, 25); hs.push(p); mx = Math.max(mx, p.m); }
    hs.forEach((p, i) => { if (p.m >= 0.1 * mx) { sw += p.m; sf += p.m * (p.f / (i + 1)); } });
    f0 = sf / sw;
    const odd = [1, 3, 5].reduce((s, k) => s + peakNear(mag, binHz, k * f0, 25).m, 0);
    const even = [2, 4, 6].reduce((s, k) => s + peakNear(mag, binHz, k * f0, 25).m, 0);
    const half = [1, 3, 5].reduce((s, k) => s + peakNear(mag, binHz, (k * f0) / 2, 25).m, 0);
    if (odd < 0.15 * even) notes.push('odd harmonics missing: may sound an octave higher');
    if (half > 0.5 * (odd + even) / 2) notes.push('energy at half-integer harmonics: may sound an octave lower');
  }
  const midi = ftom(f0);
  return { f0, midi, notes };
}

/** Steady level, speak time and the end of the steady part of a sustained sample. */
function sustainShape(F) {
  const ref = median(Array.from(F.rms.subarray(F.f(0.8), F.f(3.0) + 1)));
  let speakF = 0; while (speakF < F.nF - 1 && F.rms[speakF] < ref - 3) speakF++;
  let end = F.nF - 1;
  const need = Math.round((0.15 * SR) / F.hop);
  for (let f = F.f(1.0); f < F.nF - need; f++) {
    let all = true; for (let j = 0; j < need; j++) if (F.rms[f + j] >= ref - 6) { all = false; break; }
    if (all) { end = f; break; }
  }
  return { ref, speak: F.t(speakF), steadyEnd: F.t(end) };
}

function findLoop(x, F, shape, o) {
  const { minLen, maxLen, xfade } = o;
  const minStart = Math.max(shape.speak + 0.15, 0.45, xfade + 0.05);
  const maxStart = minStart + 0.8;
  const lastEnd = Math.min(shape.steadyEnd, x.length / SR - 0.05);
  let lenHi = maxLen, lenLo = minLen;
  if (lastEnd - minStart < lenLo) { lenLo = Math.max(0.8, (lastEnd - minStart) * 0.7); lenHi = Math.max(lenLo, lastEnd - minStart); warn(`short steady region (${(lastEnd - minStart).toFixed(2)} s): loop length lowered to ${lenLo.toFixed(2)}`); }
  // prefix sums for level variance inside the loop
  const ps = new Float64Array(F.nF + 1), ps2 = new Float64Array(F.nF + 1);
  for (let f = 0; f < F.nF; f++) { ps[f + 1] = ps[f] + F.rms[f]; ps2[f + 1] = ps2[f] + F.rms[f] ** 2; }
  const xfF = Math.max(1, Math.round((xfade * SR) / F.hop));
  let best = null;
  for (let s = F.f(minStart); s <= F.f(maxStart); s += 2) {
    for (let e = F.f(F.t(s) + lenLo); e <= F.f(Math.min(F.t(s) + lenHi, lastEnd)); e += 2) {
      if (e - s < 4) continue;
      const lev = Math.abs(F.rms[s] - F.rms[e]);
      let spec = 0, cnt = 0;
      for (let j = -xfF; j <= 0; j += 4) {
        const bs = F.bands[Math.max(0, s + j)], be = F.bands[Math.max(0, e + j)];
        for (let b = 0; b < bs.length; b++) spec += Math.abs(bs[b] - be[b]);
        cnt += bs.length;
      }
      spec /= cnt;
      const n = e - s; const mean = (ps[e] - ps[s]) / n; const sd = Math.sqrt(Math.max(0, (ps2[e] - ps2[s]) / n - mean * mean));
      const cost = 1.5 * lev + spec + 0.5 * sd - 0.3 * (F.t(e) - F.t(s));
      if (!best || cost < best.cost) best = { s, e, cost, lev, spec, sd };
    }
  }
  if (!best) throw new Error('no loop candidate');
  // sample-level refinement: align the end with the start by waveform correlation, then zero crossings
  let s = Math.round(F.t(best.s) * SR), e = Math.round(F.t(best.e) * SR);
  const W = 2048; const maxD = Math.round(0.012 * SR);
  let bestD = 0, bestC = -Infinity;
  for (let d = -maxD; d <= maxD; d++) { const c = corrAt(x, e + d - W, x, s - W, W); if (c > bestC) { bestC = c; bestD = d; } }
  e += bestD;
  const rising = (i) => x[i - 1] < 0 && x[i] >= 0;
  const nearestRising = (i, r) => { for (let k = 0; k <= r; k++) { if (rising(i + k)) return i + k; if (rising(i - k)) return i - k; } return i; };
  const s2 = nearestRising(s, Math.round(0.003 * SR));
  e += s2 - s; s = s2;
  let eBest = e, cBest = -Infinity;
  for (let k = -Math.round(0.004 * SR); k <= Math.round(0.004 * SR); k++) {
    const ee = e + k; if (!rising(ee)) continue;
    const c = corrAt(x, ee - 1024, x, s - 1024, 1024);
    if (c > cBest) { cBest = c; eBest = ee; }
  }
  e = eBest;
  return { s, e, cost: best.cost, lev: best.lev, spec: best.spec, corr: cBest };
}
/** Bake an equal-power (correlation-compensated) crossfade before loopEnd and a seamless tail. */
function bakeLoop(x, s, e, xfadeSec, tailSec) {
  const X = Math.min(Math.round(xfadeSec * SR), s - 1, Math.floor((e - s) / 3));
  const T = Math.min(Math.round(tailSec * SR), x.length - s);
  const out = new Float32Array(e + T);
  out.set(x.subarray(0, e - X), 0);
  const r = Math.max(0, Math.min(1, corrAt(x, e - X, x, s - X, X)));
  for (let i = 0; i < X; i++) {
    const t = (i + 1) / X; const ga = Math.cos((t * Math.PI) / 2), gb = Math.sin((t * Math.PI) / 2);
    const g = 1 / Math.sqrt(ga * ga + gb * gb + 2 * ga * gb * r);
    out[e - X + i] = g * (ga * x[e - X + i] + gb * x[s - X + i]);
  }
  for (let i = 0; i < T; i++) out[e + i] = x[s + i] * 0.5 * (1 + Math.cos((Math.PI * i) / T));
  return { out, xfadeSamples: X, xfadeCorr: r };
}
function fadeOut(y, sec, shape = 'cos') {
  const n = Math.min(y.length, Math.round(sec * SR));
  for (let i = 0; i < n; i++) {
    const t = i / n; const g = shape === 'cos' ? 0.5 * (1 + Math.cos(Math.PI * t)) : (1 - t) ** 2;
    y[y.length - n + i] *= g;
  }
}

// ---------------------------------------------------------------------------------------------
// 6. per-zone processing
// ---------------------------------------------------------------------------------------------
const PREROLL = Math.round(0.0015 * SR);
function processZone(inst, z, file) {
  const [L0, R0] = decodeStereo(file, inst.hp);
  const on = findOnset(L0, R0);
  const start = Math.max(0, on.onset - PREROLL);
  const L = L0.subarray(start), R = R0.subarray(start);
  const { mono, lag, corr } = foldToMono(L, R, on.onset - start);
  // pre-roll fade-in (raised cosine). Some sources (the celesta) are already cut right at the attack,
  // so there is no silence to keep: still fade the first 0.5 ms so the file never starts with a step.
  const pre = on.onset - start;
  const fadeIn = Math.max(pre, Math.round(0.0005 * SR));
  for (let i = 0; i < fadeIn; i++) mono[i] *= 0.5 - 0.5 * Math.cos((Math.PI * i) / fadeIn);
  const info = { srcLen: L0.length / SR, onsetTrimMs: (start / SR) * 1000, preRollMs: (pre / SR) * 1000, noiseFloorDb: on.noiseFloorDb, stereoLag: lag, stereoCorr: corr };
  let y; let loop = null; let speak = null; let peakTime = null; let bodyWin;

  if (inst.kind === 'sustain') {
    const F = frameFeatures(mono);
    const shape = sustainShape(F);
    speak = shape.speak;
    const lp = findLoop(mono, F, shape, { minLen: 1.8, maxLen: 2.6, xfade: 0.25 });
    const baked = bakeLoop(mono, lp.s, lp.e, 0.25, 0.4);
    y = baked.out;
    loop = { start: lp.s, end: lp.e, cost: lp.cost, lev: lp.lev, spec: lp.spec, seamCorr: lp.corr, xfade: baked.xfadeSamples, xfadeCorr: baked.xfadeCorr };
    bodyWin = [lp.s, lp.e];
    Object.assign(info, { steadyEnd: shape.steadyEnd });
  } else if (inst.kind === 'swell') {
    const F = frameFeatures(mono);
    let pk = 0; for (let f = 0; f < F.nF; f++) if (F.rms[f] > F.rms[pk]) pk = f;
    peakTime = F.t(pk);
    const len = Math.min(mono.length, Math.round((peakTime + inst.tailAfterPeak) * SR));
    y = Float32Array.from(mono.subarray(0, len));
    fadeOut(y, 0.8);
    bodyWin = [Math.round((peakTime - 0.25) * SR), Math.round((peakTime + 0.25) * SR)];
  } else {
    let maxLen = inst.maxLen;
    if (inst.maxLenHigh && z.expect >= 79) maxLen = inst.maxLenHigh;
    // natural end: smoothed RMS 60 dB under its maximum
    const win = 1024; const nF = Math.floor(mono.length / win);
    let mx = -Infinity; const r = new Float64Array(nF);
    for (let f = 0; f < nF; f++) { r[f] = rmsDbRange(mono, f * win, (f + 1) * win); mx = Math.max(mx, r[f]); }
    let pkF = 0; while (pkF < nF && r[pkF] < mx) pkF++;
    let endF = nF; for (let f = pkF; f < nF; f++) if (r[f] < mx - 60) { endF = f + 1; break; }
    const natural = (endF * win) / SR;
    const len = Math.min(natural, maxLen, mono.length / SR);
    y = Float32Array.from(mono.subarray(0, Math.round(len * SR)));
    const cutEarly = natural > len + 0.05;
    fadeOut(y, cutEarly ? Math.min(1.0, Math.max(0.15, 0.25 * len)) : 0.15, cutEarly ? 'cos' : 'quad');
    Object.assign(info, { naturalLen: natural, cutEarly });
    bodyWin = [pkF * win, pkF * win + Math.round(0.4 * SR)];
  }

  // pitch
  let pitch = null;
  if (inst.pitch !== 'none') {
    const [t0, t1] = inst.kind === 'sustain' ? [Math.max(0.3, (speak ?? 0) + 0.1), Math.max(0.3, (speak ?? 0) + 0.1) + 1.5]
      : z.expect < 55 ? [0.12, 1.0] : [0.03, 0.6];
    pitch = measurePitch(y, z.expect, inst.pitch, t0, Math.min(t1, y.length / SR));
  }

  // pad with silence to a whole number of MP3 frames: ffmpeg writes a wrong LAME-tag padding when the
  // last frame holds only a few dozen samples, and whole frames keep delay + samples + padding exact
  if (y.length % 1152) { const z2 = new Float32Array(Math.ceil(y.length / 1152) * 1152); z2.set(y); y = z2; }

  // loudness: peak-normalize to -1 dBFS; keep the raw (pre-normalization) body level for layer balance
  let peak = 0; for (const v of y) peak = Math.max(peak, Math.abs(v));
  const rawBodyDb = rmsDbRange(y, bodyWin[0], bodyWin[1]);
  const norm = undb(-1) / peak;
  for (let i = 0; i < y.length; i++) y[i] *= norm;
  const bodyDb = rmsDbRange(y, bodyWin[0], bodyWin[1]);
  return { y, info, loop, speak, peakTime, pitch, rawBodyDb, bodyDb, normDb: db(norm) };
}

// ---------------------------------------------------------------------------------------------
// 7. verification of an encoded file
// ---------------------------------------------------------------------------------------------
function verifyFile(outFile, pcm, mp3, loop) {
  const probe = JSON.parse(run(FFPROBE, ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', outFile]).toString());
  const st = probe.streams[0];
  const res = { codec: st.codec_name, sampleRate: Number(st.sample_rate), channels: st.channels };
  if (res.codec !== 'mp3' || res.sampleRate !== SR || res.channels !== 1) throw new Error(`${outFile}: unexpected stream ${JSON.stringify(res)}`);
  // gapless decode (ffmpeg honours the LAME tag): length and alignment must match the source PCM
  const d = decodeMono(outFile);
  res.gaplessLen = d.length;
  res.gaplessLenOk = d.length === pcm.length;
  // codec latency is signal independent and was calibrated with noise (calibrateCodec); here we only
  // confirm the alignment locally (+-3 samples is less than one period of the highest note)
  res.gaplessLag = bestLagNear(pcm, d, 0, 3);
  // onset = first sample within 30 dB of the peak (MP3 pre-echo of very sharp attacks stays below that)
  const thr = (arr) => { let pk = 0; for (const v of arr) pk = Math.max(pk, Math.abs(v)); let i = 0; while (i < arr.length && Math.abs(arr[i]) < pk * undb(-30)) i++; return i; };
  res.onsetSrcMs = (thr(pcm) / SR) * 1000;
  res.onsetDecMs = (thr(d) / SR) * 1000;
  // non-gapless decode (strip the Info frame, as a decoder that ignores it would): expect +576+529 samples
  const buf = fs.readFileSync(outFile);
  const tmp = path.join(CACHE, 'work', 'nogapless.mp3');
  fs.mkdirSync(path.dirname(tmp), { recursive: true });
  fs.writeFileSync(tmp, buf.subarray(mp3.audioStart));
  const u = decodeMono(tmp);
  res.untrimmedLen = u.length;
  res.untrimmedLenExpected = mp3.delay + pcm.length + mp3.padding;
  res.untrimmedLag = bestLagNear(pcm, u, mp3.delay + 529, 3);
  // onset = first sample within 50 dB of the peak, in the PCM we encoded, in the gapless decode and in
  // the untrimmed decode read from the compensated offset (what a player does): they must agree.
  // (Reading the untrimmed decode from 0 would also show the codec's pre-echo of attacks that start at
  // sample 0; the compensated offset skips it.)
  const shiftSamples = mp3.delay + 529;
  const at50 = (arr) => { let pk = 0; for (const v of arr) pk = Math.max(pk, Math.abs(v)); let i = 0; while (i < arr.length && Math.abs(arr[i]) < pk * undb(-50)) i++; return i; };
  res.onsetPcmMs = (at50(pcm) / SR) * 1000;
  res.onsetGaplessMs = (at50(d) / SR) * 1000;
  res.onsetUntrimmedMs = (at50(u.subarray(shiftSamples)) / SR) * 1000;
  if (loop) {
    // in the decoded audio, the samples just before loopEnd must match those before loopStart,
    // and what follows loopEnd must match what follows loopStart
    res.seamBefore = corrAt(d, loop.end - 256, d, loop.start - 256, 256);
    res.seamAfter = corrAt(d, loop.end, d, loop.start, 1024);
    // the sample step across the wrap (loopEnd-1 -> loopStart) relative to ordinary steps in the loop
    const wrap = (a) => {
      const steps = []; for (let i = loop.start; i < loop.end - 1; i += 7) steps.push(Math.abs(a[i + 1] - a[i]));
      steps.sort((p, q) => p - q);
      return Math.abs(a[loop.start] - a[loop.end - 1]) / (steps[Math.floor(steps.length * 0.99)] + 1e-12);
    };
    res.wrapJump = wrap(d);
    res.wrapJumpPcm = wrap(pcm);
  }
  return res;
}

/**
 * Measure the codec latency with an aperiodic signal (noise bursts), so the alignment is unambiguous:
 * a gapless decode must line up at lag 0, a decode that ignores the LAME tag at encoderDelay + 529.
 */
function calibrateCodec(q) {
  let seed = 12345; const rnd = () => { seed = (seed * 1103515245 + 12345) >>> 0; return seed / 2 ** 32 - 0.5; };
  const n = Math.round(1.3 * SR) + 77; const x = new Float32Array(n);
  for (let i = 0; i < n; i++) { const burst = Math.floor(i / 4410) % 3 !== 2; x[i] = burst ? 0.5 * rnd() : 0; }
  const dir = path.join(CACHE, 'work'); fs.mkdirSync(dir, { recursive: true });
  const f = path.join(dir, `calib-q${q}.mp3`); encodeMp3(x, f, q);
  const buf = fs.readFileSync(f); const mp3 = parseMp3(buf);
  const d = decodeMono(f);
  fs.writeFileSync(path.join(dir, 'calib-nogapless.mp3'), buf.subarray(mp3.audioStart));
  const u = decodeMono(path.join(dir, 'calib-nogapless.mp3'));
  const lagG = xcorrLag(x, d, -3000, 3000, 32768), lagU = xcorrLag(x, u, -3000, 3000, 32768);
  const r = { q, delay: mp3.delay, padding: mp3.padding, frames: mp3.frames, samples: n, gaplessLen: d.length, gaplessLag: lagG, untrimmedLen: u.length, untrimmedLag: lagU };
  if (d.length !== n || lagG !== 0) throw new Error(`codec calibration (gapless) failed: ${JSON.stringify(r)}`);
  if (u.length !== mp3.delay + n + mp3.padding || lagU !== mp3.delay + 529) throw new Error(`codec calibration (untrimmed) failed: ${JSON.stringify(r)}`);
  log(`codec calibration q${q}: encoder delay ${mp3.delay} + decoder delay 529 = ${lagU} samples; gapless decode aligned at lag ${lagG}; padding ${mp3.padding}`);
  return r;
}

// ---------------------------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------------------------
async function main() {
  const t0 = Date.now();
  for (const bin of [FFMPEG, FFPROBE]) run(bin, ['-version']);
  log(`cache: ${CACHE}\nout:   ${OUT}`);
  const insts = INSTRUMENTS.filter((i) => !ARGS.only || ARGS.only.includes(i.key));
  // download
  const jobs = insts.flatMap((inst) => inst.zones.map((z) => ({ inst, z })));
  log(`fetching ${jobs.length} source files (pinned commits, verified by git blob SHA-1)...`);
  for (const k of new Set(jobs.map((j) => j.inst.src))) treeOf(k);
  await pool(jobs, ARGS.jobs, async (j) => { j.file = await fetchSource(j.inst.src, j.z.path); j.sha = treeOf(j.inst.src).get(j.z.path); });

  const calibration = [...new Set(insts.map((i) => i.q))].sort().map((q) => calibrateCodec(q));
  const stage = path.join(CACHE, 'work', 'out');
  fs.rmSync(stage, { recursive: true, force: true });
  fs.mkdirSync(stage, { recursive: true });
  const manifest = {
    version: PACK_VERSION,
    generator: 'scripts/build-orchestra-samples.mjs',
    credits: 'THIRD_PARTY_AUDIO.md',
    sources: Object.fromEntries(Object.entries(SOURCES).filter(([k]) => insts.some((i) => i.src === k)).map(([k, s]) => [k, {
      title: s.title, author: s.author, license: s.license, repo: `https://github.com/${s.repo}`, commit: s.commit,
    }])),
    format: null,
    usage: {
      pitch: 'detune (cents) = (midi - rootMidi) * 100 - tuneCents, i.e. playbackRate = 2 ** ((midi - rootMidi - tuneCents / 100) / 12). tuneCents is how sharp the recording is relative to rootMidi. Unpitched instruments (pitched: false): play at rate 1.',
      gain: 'Multiply by zone.gain: it brings every zone of every instrument and layer to the same body loudness, -20 dBFS RMS (RMS of the 0.4 s from the loudest point for one-shots, of the loop for sustains, of +-0.25 s around peakTime for swells). Layers are therefore level-matched and differ only in timbre; apply velocity yourself. instrument.recordedLayerDb gives the level difference the layers had as recorded (e.g. to make soft notes softer still). Files themselves are peak-normalized to -1 dBFS.',
      timing: 'All times (startOffset, loopStart, loopEnd, speak, peakTime) are seconds in the decoded buffer of a decoder that honours the LAME gapless tag; add format.shift for other decoders (see format.detect). Onsets sit at startOffset + ~1.5 ms (raised-cosine pre-roll).',
      loops: 'Sustain zones: source.loop = true; source.loopStart = loopStart + shift; source.loopEnd = loopEnd + shift; start(t, startOffset + shift); release with a gain ramp. A crossfade is baked in before loopEnd and the audio after loopEnd continues seamlessly from loopStart, so unlooped playback past loopEnd is also click-free.',
      speak: 'Sustains: seconds until the note reaches its steady level (-3 dB). Bowed strings speak slowly; start them a little early when the attack must land on a beat.',
      layers: 'instrument.layers lists the dynamics present. With one layer, use it for every velocity.',
      memory: 'Decoded buffers are float32 at the AudioContext rate: instrument.seconds * sampleRate * 4 bytes (about 0.19 MB per second at 48 kHz). Decode only the instruments a track uses.',
    },
    instruments: {},
  };

  const totals = {};
  const report = [];
  const measured = new Map(); // "instrument/name" -> { rootMidi, tuneCents }
  let fmt = null;
  for (const inst of insts) {
    const results = [];
    for (const j of jobs.filter((jj) => jj.inst === inst)) {
      const r = processZone(inst, j.z, j.file);
      // rootMidi = the note the sample was recorded for, confirmed by measurement (within a semitone);
      // tuneCents = measured deviation from it. A larger disagreement means the name is wrong: trust f0.
      let rootMidi = 60, tuneCents = 0;
      if (r.pitch) {
        // (timpani have no note names: the SFZ key centre is only a search prior, the drum is what it is)
        rootMidi = inst.pitchFromName !== false && Math.abs(r.pitch.midi - j.z.expect) < 1 ? j.z.expect : Math.round(r.pitch.midi);
        tuneCents = round((r.pitch.midi - rootMidi) * 100, 1);
        if (inst.pitchFromName !== false && rootMidi !== j.z.expect) warn(`${inst.key} ${j.z.path}: measured ${midiToPretty(rootMidi)} ${tuneCents}c, expected ${midiToPretty(j.z.expect)}; using the measured pitch`);
        for (const n of r.pitch.notes) warn(`${inst.key} ${j.z.path}: ${n}`);
      }
      if (j.z.pitchFrom) {
        const ref = measured.get(j.z.pitchFrom);
        if (!ref) throw new Error(`${inst.key} ${j.z.path}: pitch reference ${j.z.pitchFrom} not built yet`);
        ({ rootMidi, tuneCents } = ref);
      }
      if (j.z.name) measured.set(`${inst.key}/${j.z.name}`, { rootMidi, tuneCents });
      results.push({ j, r, rootMidi, tuneCents });
    }
    // every zone (every layer too) is brought to the same body loudness, -20 dBFS RMS, so switching
    // layers never jumps in level: velocity -> gain is the player's job, layers supply the timbre.
    // The recorded level difference between layers is kept in the manifest for reference.
    const layers = [...new Set(results.map((x) => x.j.z.layer))];
    const medRaw = Object.fromEntries(layers.map((l) => [l, median(results.filter((x) => x.j.z.layer === l).map((x) => x.r.rawBodyDb))]));
    const loudest = Math.max(...Object.values(medRaw));
    const target = Object.fromEntries(layers.map((l) => [l, -20]));

    const dir = path.join(stage, inst.key);
    fs.mkdirSync(dir, { recursive: true });
    const zones = [];
    for (const { j, r, rootMidi, tuneCents } of results) {
      const z = j.z;
      const base = z.name || inst.pitch === 'none' ? (z.name || z.variant || path.basename(z.path).replace(/\.\w+$/, ''))
        : `${midiToFileName(rootMidi)}${layers.length > 1 ? `-${z.layer}` : ''}`;
      const rel = `${inst.key}/${base}.mp3`;
      const outFile = path.join(stage, rel);
      encodeMp3(r.y, outFile, inst.q);
      const mp3 = parseMp3(fs.readFileSync(outFile));
      const v = verifyFile(outFile, r.y, mp3, r.loop);
      if (!fmt) fmt = { encoder: mp3.encoder, delay: mp3.delay };
      if (mp3.delay !== fmt.delay) throw new Error(`${rel}: encoder delay ${mp3.delay} differs from ${fmt.delay}`);
      if (mp3.tagFrames !== mp3.frames) throw new Error(`${rel}: tag says ${mp3.tagFrames} frames, file has ${mp3.frames}`);
      if (mp3.frames * 1152 !== mp3.delay + r.y.length + mp3.padding) throw new Error(`${rel}: frames*1152 (${mp3.frames * 1152}) != delay ${mp3.delay} + samples ${r.y.length} + padding ${mp3.padding}`);
      if (!v.gaplessLenOk || v.gaplessLag !== 0) throw new Error(`${rel}: gapless decode mismatch len ${v.gaplessLen}/${r.y.length} lag ${v.gaplessLag}`);
      if (v.untrimmedLen !== v.untrimmedLenExpected) throw new Error(`${rel}: untrimmed length ${v.untrimmedLen} != ${v.untrimmedLenExpected}`);
      if (v.untrimmedLag !== mp3.delay + 529) throw new Error(`${rel}: untrimmed offset ${v.untrimmedLag} != ${mp3.delay + 529}`);
      // (sharp attacks gain up to ~2.5 ms of codec pre-echo at -50 dB; that is masked and not a timing error)
      if (Math.abs(v.onsetGaplessMs - v.onsetPcmMs) > 3 || Math.abs(v.onsetUntrimmedMs - v.onsetPcmMs) > 3) {
        warn(`${rel}: decoded onset moved (pcm ${v.onsetPcmMs.toFixed(2)}, gapless ${v.onsetGaplessMs.toFixed(2)}, untrimmed+compensation ${v.onsetUntrimmedMs.toFixed(2)} ms)`);
      }
      if (inst.kind !== 'swell' && v.onsetPcmMs > 25) warn(`${rel}: slow attack, -50 dB point at ${v.onsetPcmMs.toFixed(1)} ms`);
      if (r.loop && v.wrapJump > Math.max(1.5, 2 * v.wrapJumpPcm)) warn(`${rel}: loop wrap step is ${v.wrapJump.toFixed(2)}x the 99th percentile sample step (PCM ${v.wrapJumpPcm.toFixed(2)}x)`);
      if (r.loop && (v.seamBefore < 0.9 || v.seamAfter < 0.9)) warn(`${rel}: loop seam correlation ${v.seamBefore.toFixed(3)}/${v.seamAfter.toFixed(3)}`);
      const bytes = fs.statSync(outFile).size;
      const gain = round(undb(target[z.layer] - r.bodyDb), 4);
      const zone = {
        file: rel,
        rootMidi,
        tuneCents,
        gain,
        layer: z.layer,
        ...(z.variant ? { variant: z.variant } : {}),
        startOffset: 0,
        ...(r.loop ? { loopStart: round(r.loop.start / SR, 6), loopEnd: round(r.loop.end / SR, 6) } : {}),
        ...(r.speak != null ? { speak: round(r.speak, 3) } : {}),
        ...(r.peakTime != null ? { peakTime: round(r.peakTime, 3) } : {}),
        duration: round(r.y.length / SR, 6),
        samples: r.y.length,
        padding: mp3.padding,
        frames: mp3.frames,
        bytes,
        source: `${inst.src}:${z.path}`,
      };
      zones.push(zone);
      report.push({
        file: rel, f0: r.pitch ? round(r.pitch.f0, 2) : null, ...(z.pitchFrom ? { pitchFrom: z.pitchFrom } : {}), root: r.pitch ? midiToPretty(rootMidi) : '-', tuneCents, gain,
        len: zone.duration, kB: round(bytes / 1024, 1), kbps: Math.round((bytes * 8) / zone.duration / 1000),
        trimMs: round(r.info.onsetTrimMs, 1), lag: r.info.stereoLag, raw: round(r.rawBodyDb, 1),
        loop: r.loop ? `${(r.loop.start / SR).toFixed(3)}-${(r.loop.end / SR).toFixed(3)} c=${r.loop.cost.toFixed(2)} lev=${r.loop.lev.toFixed(2)} xc=${r.loop.xfadeCorr.toFixed(2)} seam=${v.seamBefore.toFixed(3)}/${v.seamAfter.toFixed(3)} wrap=${v.wrapJump.toFixed(2)}/${v.wrapJumpPcm.toFixed(2)}` : '',
        onset: `${v.onsetPcmMs.toFixed(2)}/${v.onsetGaplessMs.toFixed(2)}/${v.onsetUntrimmedMs.toFixed(2)}ms`, attack30: `${v.onsetSrcMs.toFixed(1)}/${v.onsetDecMs.toFixed(1)}ms`, untrimmedLag: v.untrimmedLag,
        extra: r.info.cutEarly != null ? `nat=${r.info.naturalLen.toFixed(2)}` : r.speak != null ? `speak=${r.speak.toFixed(2)} steadyEnd=${r.info.steadyEnd.toFixed(2)}` : r.peakTime != null ? `peak=${r.peakTime.toFixed(2)}` : '',
      });
    }
    zones.sort((a, b) => a.rootMidi - b.rootMidi || a.layer.localeCompare(b.layer) || (a.variant || '').localeCompare(b.variant || ''));
    const instBytes = zones.reduce((s, z) => s + z.bytes, 0);
    totals[inst.key] = instBytes;
    const pitched = inst.pitch !== 'none';
    manifest.instruments[inst.key] = {
      label: inst.label,
      source: inst.src,
      kind: inst.kind,
      pitched,
      loop: inst.kind === 'sustain',
      layers,
      ...(layers.length > 1 ? { recordedLayerDb: Object.fromEntries(layers.map((l) => [l, round(medRaw[l] - loudest, 1)])) } : {}),
      ...(pitched ? { range: [Math.min(...zones.map((z) => z.rootMidi)), Math.max(...zones.map((z) => z.rootMidi))] } : {}),
      release: inst.release,
      ...(inst.note ? { note: inst.note } : {}),
      bytes: instBytes,
      seconds: round(zones.reduce((s2, z) => s2 + z.duration, 0), 2),
      zones,
    };
    log(`${inst.key}: ${zones.length} zones, ${(instBytes / 1024).toFixed(0)} KB`);
  }

  const delay = fmt.delay;
  manifest.format = {
    container: 'mp3',
    codec: 'MPEG-1 Layer III, mono, 44100 Hz, LAME VBR (ffmpeg libmp3lame)',
    sampleRate: SR,
    channels: 1,
    frameSamples: 1152,
    encoderDelay: delay,
    decoderDelay: 529,
    gapless: `Every file starts with a Xing/Info frame whose LAME tag holds encoderDelay (${delay}) and the per-file padding (zone.padding), so frames * 1152 = encoderDelay + samples + padding.`,
    shift: { gapless: 0, untrimmed: round((delay + 529) / SR, 6), untrimmedWithInfoFrame: round((delay + 529 + 1152) / SR, 6) },
    calibration: calibration.map(({ q, delay, gaplessLag, untrimmedLag }) => ({ lameVbrQuality: q, encoderDelay: delay, gaplessLag, untrimmedLag })),
    detect: `After decodeAudioData, let n = buffer.duration * ${SR}. Compare n with zone.samples (decoder honoured the gapless tag: shift.gapless), zone.samples + ${delay} + zone.padding (no trimming: shift.untrimmed) and that + 1152 (the Info frame was decoded as a silent frame: shift.untrimmedWithInfoFrame); use the closest. Add the shift to startOffset, loopStart and loopEnd.`,
  };
  manifest.totals = {
    files: Object.values(manifest.instruments).reduce((n, i) => n + i.zones.length, 0),
    mp3Bytes: Object.values(totals).reduce((a, b) => a + b, 0),
    seconds: round(Object.values(manifest.instruments).reduce((n, i) => n + i.seconds, 0), 1),
  };
  const manifestText = `${JSON.stringify(manifest, null, 1)}\n`;
  fs.writeFileSync(path.join(stage, 'manifest.json'), manifestText);
  const total = Object.values(totals).reduce((a, b) => a + b, 0) + Buffer.byteLength(manifestText);

  // report
  log('\nzone report');
  for (const r of report) log(Object.entries(r).map(([k, v]) => `${k}=${v}`).join(' '));
  log('\nsizes');
  for (const [k, v] of Object.entries(totals)) log(`  ${k.padEnd(14)} ${(v / 1024).toFixed(1).padStart(8)} KB`);
  log(`  ${'manifest'.padEnd(14)} ${(Buffer.byteLength(manifestText) / 1024).toFixed(1).padStart(8)} KB`);
  log(`  ${'TOTAL'.padEnd(14)} ${(total / 1024).toFixed(1).padStart(8)} KB (${(total / 1e6).toFixed(3)} MB, budget ${ARGS.budgetMb} MB)`);
  fs.writeFileSync(path.join(CACHE, 'work', 'build-report.json'), JSON.stringify({ report, totals, total, warnings }, null, 1));
  if (warnings.length) log(`\n${warnings.length} warning(s); see above`);
  if (total > ARGS.budgetMb * 1e6) throw new Error(`size budget exceeded: ${total} bytes > ${ARGS.budgetMb} MB`);

  if (ARGS.dryRun || ARGS.only) {
    log(`\n${ARGS.dryRun ? 'dry run' : 'partial build (--only)'}: staged in ${stage}, ${OUT} left untouched`);
  } else {
    fs.rmSync(OUT, { recursive: true, force: true });
    fs.mkdirSync(path.dirname(OUT), { recursive: true });
    fs.cpSync(stage, OUT, { recursive: true });
    log(`\nwrote ${OUT}`);
  }
  log(`done in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
}

main().catch((e) => { console.error(e); process.exit(1); });
