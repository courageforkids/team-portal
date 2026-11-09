/**
 * Courage Academy — illustrated Cape common rooms and crest badges.
 * Pure TypeScript, no dependencies: every function returns an SVG string.
 * Safe for client and server. Only validated values are interpolated into markup.
 */

export type CapeId = "navy" | "gold" | "ember" | "evergreen";

export const ROOM_INFO: Record<CapeId, { name: string; blurb: string }> = {
  navy: { name: "The Tower", blurb: "A moonlit stone study with a crackling fire, where plans come together." },
  gold: { name: "The Sky Deck", blurb: "A sunny terrace above the clouds, strung with lights and floating lanterns." },
  ember: { name: "The Cave", blurb: "A glowing volcanic hideout where the next adventure is mapped out." },
  evergreen: { name: "The Lookout", blurb: "A cozy seaside lookout that keeps a warm light on for everyone." },
};

/** Where characters stand, in room viewBox units (0 0 1200 520). `y` is the feet line. */
export const ROOM_FLOOR: { y: number; left: number; right: number } = { y: 486, left: 120, right: 1080 };

export type CrestId = "shield" | "star" | "heart" | "flame" | "leaf" | "bolt" | "moon" | "sun" | "wing" | "anchor";

export const CRESTS: { id: CrestId; label: string }[] = [
  { id: "shield", label: "Shield" },
  { id: "star", label: "Star" },
  { id: "heart", label: "Heart" },
  { id: "flame", label: "Flame" },
  { id: "leaf", label: "Leaf" },
  { id: "bolt", label: "Bolt" },
  { id: "moon", label: "Moon" },
  { id: "sun", label: "Sun" },
  { id: "wing", label: "Wing" },
  { id: "anchor", label: "Anchor" },
];

const CREST_IDS = new Set<string>(CRESTS.map((c) => c.id));
export function isCrestId(v: unknown): v is CrestId {
  return typeof v === "string" && CREST_IDS.has(v);
}

const CAPE_COLORS: Record<CapeId, { color: string; deep: string }> = {
  navy: { color: "#1f6fb2", deep: "#004F81" },
  gold: { color: "#FED438", deep: "#c99a00" },
  ember: { color: "#f0643c", deep: "#c2410c" },
  evergreen: { color: "#2f9e6e", deep: "#166534" },
};
const CAPE_SYMBOL: Record<CapeId, CrestId> = { navy: "star", gold: "sun", ember: "flame", evergreen: "leaf" };
const isCapeId = (v: unknown): v is CapeId => typeof v === "string" && v in CAPE_COLORS;

/* ------------------------------------------------------------------ helpers */

const W = 1200;
const H = 520;
const WALL = 372; // wall / floor junction

const HEX = /^#[0-9a-fA-F]{6}$/;
const safeColor = (v: unknown, fallback: string) => (typeof v === "string" && HEX.test(v) ? v : fallback);
const safePrefix = (v: unknown, fallback: string) => {
  const s = typeof v === "string" ? v.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 40) : "";
  return s ? (/^[A-Za-z_]/.test(s) ? s : `r${s}`) : fallback;
};

const r1 = (n: number) => Math.round(n * 10) / 10;

function rng(seed: number) {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Stop = [number, string, number?];
const stops = (s: Stop[]) =>
  s.map(([o, c, op]) => `<stop offset="${o}" stop-color="${c}"${op === undefined ? "" : ` stop-opacity="${op}"`}/>`).join("");
const lin = (id: string, x1: number, y1: number, x2: number, y2: number, s: Stop[], user = false) =>
  `<linearGradient id="${id}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"${user ? ' gradientUnits="userSpaceOnUse"' : ""}>${stops(s)}</linearGradient>`;
const rad = (id: string, s: Stop[], cx = 0.5, cy = 0.5, r = 0.5) =>
  `<radialGradient id="${id}" cx="${cx}" cy="${cy}" r="${r}">${stops(s)}</radialGradient>`;
const glowGrad = (id: string, color: string, peak = 0.7) => rad(id, [[0, color, peak], [0.35, color, peak * 0.45], [1, color, 0]]);

function hexRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function mix(a: string, b: string, t: number) {
  const A = hexRgb(a);
  const B = hexRgb(b);
  return `#${A.map((v, i) => Math.round(v + (B[i] - v) * t).toString(16).padStart(2, "0")).join("")}`;
}
function luminance(hex: string) {
  const [r, g, b] = hexRgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function starPts(cx: number, cy: number, R: number, r: number, n = 5, rot = -90) {
  const pts: string[] = [];
  for (let i = 0; i < n * 2; i++) {
    const a = ((rot + (i * 180) / n) * Math.PI) / 180;
    const rr = i % 2 === 0 ? R : r;
    pts.push(`${r1(cx + rr * Math.cos(a))},${r1(cy + rr * Math.sin(a))}`);
  }
  return pts.join(" ");
}

const archPath = (cx: number, top: number, w: number, bottom: number) =>
  `M${cx - w / 2} ${bottom}V${top + w / 2}A${w / 2} ${w / 2} 0 0 1 ${cx + w / 2} ${top + w / 2}V${bottom}Z`;

const flamePath = (cx: number, base: number, w: number, h: number) =>
  `M${r1(cx - w / 2)} ${r1(base - h * 0.18)}C${r1(cx - w / 2)} ${r1(base - h * 0.55)} ${r1(cx - w * 0.08)} ${r1(base - h * 0.62)} ${cx} ${r1(base - h)}` +
  `C${r1(cx + w * 0.12)} ${r1(base - h * 0.66)} ${r1(cx + w / 2)} ${r1(base - h * 0.5)} ${r1(cx + w / 2)} ${r1(base - h * 0.18)}` +
  `C${r1(cx + w / 2)} ${r1(base + h * 0.02)} ${r1(cx + w * 0.25)} ${base} ${cx} ${base}C${r1(cx - w * 0.25)} ${base} ${r1(cx - w / 2)} ${r1(base + h * 0.02)} ${r1(cx - w / 2)} ${r1(base - h * 0.18)}Z`;

/** Point on a quadratic Bézier. */
const qpt = (a: [number, number], c: [number, number], b: [number, number], t: number): [number, number] => [
  (1 - t) * (1 - t) * a[0] + 2 * (1 - t) * t * c[0] + t * t * b[0],
  (1 - t) * (1 - t) * a[1] + 2 * (1 - t) * t * c[1] + t * t * b[1],
];

/* ------------------------------------------------------------ crest symbols */

/** Symbol art in a 100x100 box, centered near (50,50). `fill` is the symbol color, `field` the background it sits on. */
function symbol(id: CrestId, fill: string, field: string): string {
  switch (id) {
    case "shield":
      return `<path d="M50 25L71 31.5V48C71 62 61.5 70.5 50 76C38.5 70.5 29 62 29 48V31.5Z" fill="${fill}"/><path d="M36 57L50 45L64 57V64.5L50 52.5L36 64.5Z" fill="${field}"/>`;
    case "star":
      return `<polygon points="${starPts(50, 52, 26, 11)}" fill="${fill}" stroke="${fill}" stroke-width="3" stroke-linejoin="round"/>`;
    case "heart":
      return `<path d="M50 75C30 61 24 51 24 41.5C24 32.5 31 26 38.5 26C44 26 48 29 50 33C52 29 56 26 61.5 26C69 26 76 32.5 76 41.5C76 51 70 61 50 75Z" fill="${fill}"/>`;
    case "flame":
      return `<path d="M50 22C54 33 67 40 67 57C67 68 59.5 77 50 77C40.5 77 33 69 33 58C33 50 38 45.5 41 38C44 42 45.5 46 45.5 50C49.5 44.5 53 35 50 22Z" fill="${fill}"/><path d="M50 53C53.5 58 57.5 61 57.5 66.5C57.5 71.5 54 74.5 50 74.5C46 74.5 42.5 71.5 42.5 67C42.5 62 46.5 58.5 50 53Z" fill="${field}"/>`;
    case "leaf":
      return `<path d="M29 73C26 48 44 28 75 25C77 53 58 74 33 73Z" fill="${fill}"/><path d="M32 70Q49 52 66 35" stroke="${field}" stroke-width="3.2" stroke-linecap="round" fill="none"/><path d="M32 70L24 78" stroke="${fill}" stroke-width="4.5" stroke-linecap="round"/>`;
    case "bolt":
      return `<path d="M55 21L31 55H47L41 79L69 43H53L65 21Z" fill="${fill}" stroke="${fill}" stroke-width="2.5" stroke-linejoin="round"/>`;
    case "moon":
      return `<path d="M46.6 28A22 22 0 1 0 69.1 56.2A18 18 0 0 1 46.6 28Z" fill="${fill}"/><polygon points="${starPts(68, 31, 7.5, 3.2)}" fill="${fill}"/>`;
    case "sun": {
      let rays = "";
      for (let i = 0; i < 8; i++) {
        const a = (i * Math.PI) / 4 - Math.PI / 2;
        const tip = [50 + 27 * Math.cos(a), 51 + 27 * Math.sin(a)];
        const b1 = [50 + 15 * Math.cos(a - 0.3), 51 + 15 * Math.sin(a - 0.3)];
        const b2 = [50 + 15 * Math.cos(a + 0.3), 51 + 15 * Math.sin(a + 0.3)];
        rays += `${i ? " " : ""}M${r1(b1[0])} ${r1(b1[1])}L${r1(tip[0])} ${r1(tip[1])}L${r1(b2[0])} ${r1(b2[1])}Z`;
      }
      return `<path d="${rays}" fill="${fill}" stroke="${fill}" stroke-width="2" stroke-linejoin="round"/><circle cx="50" cy="51" r="13" fill="${fill}"/>`;
    }
    case "wing":
      return `<path d="M27 68C29 46 44 29 74 25C72 33 67 38 60 41.5C66 42 71 41 76 39.5C72 49 65 53.5 56.5 55.5C62.5 56.5 67 56.5 71.5 56C65 65 55 69.5 44 70C37.5 70.2 31.5 69.6 27 68Z" fill="${fill}"/><path d="M36 60Q46 50 58 43M38 66Q50 60 60 56" stroke="${field}" stroke-width="2.6" stroke-linecap="round" fill="none"/>`;
    case "anchor":
      return `<g fill="none" stroke="${fill}" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"><circle cx="50" cy="28" r="5.5"/><path d="M50 34V75M38 42H62M28 58Q31 75 50 75Q69 75 72 58"/></g><path d="M22 61L28 53L34 61Z M66 61L72 53L78 61Z" fill="${fill}" stroke="${fill}" stroke-width="2" stroke-linejoin="round"/>`;
  }
}

const SHIELD = "M50 6L85 15.5Q88 16.5 88 20V47C88 71 71 86 50 95C29 86 12 71 12 47V20Q12 16.5 15 15.5Z";

/** Crest art (inner markup) in a 100x100 box. */
function crestBody(crest: CrestId, color: string, deep: string, p: string, ribbon: boolean): string {
  const light = luminance(color) > 0.45;
  const ink = light ? mix(deep, "#000000", 0.38) : "#fffaf0";
  const shadow = light ? "#ffffff" : mix(deep, "#000000", 0.45);
  const defs =
    `<defs>${lin(`${p}co`, 0, 0, 0, 1, [[0, mix(deep, "#ffffff", 0.08)], [1, mix(deep, "#000000", 0.28)]])}` +
    `${lin(`${p}ci`, 0, 0, 0, 1, [[0, mix(color, "#ffffff", 0.22)], [0.6, color], [1, mix(color, deep, 0.45)]])}` +
    `${lin(`${p}cr`, 0, 0, 0, 1, [[0, mix(deep, "#ffffff", 0.12)], [1, mix(deep, "#000000", 0.2)]])}</defs>`;
  const inner = `transform="translate(50 50) scale(0.84) translate(-50 -50)"`;
  let out = defs;
  out += `<path d="${SHIELD}" fill="#000" opacity="0.18" transform="translate(0 2.2)"/>`;
  out += `<path d="${SHIELD}" fill="url(#${p}co)"/>`;
  out += `<path d="${SHIELD}" fill="url(#${p}ci)" ${inner}/>`;
  out += `<path d="${SHIELD}" fill="none" stroke="#ffffff" stroke-opacity="0.35" stroke-width="2" transform="translate(50 50) scale(0.74) translate(-50 -50)"/>`;
  out += `<path d="M20 22.5Q20 19.6 22.5 18.9L50 11.5L77.5 18.9Q80 19.6 80 22.5V37C62 31 38 31 20 41Z" fill="#ffffff" opacity="0.16"/>`;
  out += `<g transform="translate(50 52) scale(0.86) translate(-50 -50)">`;
  out += `<g transform="translate(0 1.8)" opacity="${light ? 0.35 : 0.3}">${symbol(crest, shadow, shadow)}</g>`;
  out += symbol(crest, ink, color);
  out += `</g>`;
  if (ribbon) {
    out += `<path d="M2 78L14 74L12 84L16 92L4 92L8 85Z M98 78L86 74L88 84L84 92L96 92L92 85Z" fill="${mix(deep, "#000000", 0.35)}"/>`;
    out += `<path d="M10 72Q50 64 90 72L88 88Q50 80 12 88Z" fill="url(#${p}cr)" stroke="${mix(deep, "#000000", 0.3)}" stroke-width="1"/>`;
    out += `<path d="M18 77Q50 71 82 77" stroke="#ffffff" stroke-opacity="0.35" stroke-width="1.4" fill="none"/>`;
  }
  return out;
}

/** A heraldic shield badge with the crest's symbol. Square viewBox (0 0 100 100). */
export function crestSvg(
  crest: CrestId,
  opts: { color: string; deep: string; size?: number; idPrefix?: string; ribbon?: boolean; title?: string },
): string {
  const id: CrestId = isCrestId(crest) ? crest : "shield";
  const color = safeColor(opts?.color, "#004F81");
  const deep = safeColor(opts?.deep, "#FED438");
  const size = typeof opts?.size === "number" && Number.isFinite(opts.size) && opts.size > 0 ? Math.min(Math.round(opts.size), 2000) : 64;
  const p = safePrefix(opts?.idPrefix, `crest-${id}-${color.slice(1)}-${deep.slice(1)}${opts?.ribbon === true ? "-r" : ""}`) + "-";
  const label = CRESTS.find((c) => c.id === id)?.label ?? "Crest";
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="${size}" height="${size}" role="img" aria-label="${label} crest">` +
    crestBody(id, color, deep, p, opts?.ribbon === true) +
    `</svg>`
  );
}

/* ---------------------------------------------------------- shared room bits */

type Ctx = { p: string; animate: boolean; winter: boolean; color: string; deep: string; cape: CapeId };

function banner(c: Ctx, x: number, y: number, w: number, h: number): string {
  const { color, deep, p } = c;
  const light = luminance(color) > 0.45;
  const emblem = light ? mix(deep, "#000000", 0.35) : "#FED438";
  const cloth = `M${x - w / 2} ${y}H${x + w / 2}V${y + h}L${x} ${r1(y + h - h * 0.16)}L${x - w / 2} ${y + h}Z`;
  const s = (w * 0.86) / 100;
  let o = `<g>`;
  o += `<path d="${cloth}" fill="#000" opacity="0.22" transform="translate(5 6)"/>`;
  o += `<path d="${cloth}" fill="url(#${p}ban)"/>`;
  o += `<rect x="${x - w / 2}" y="${y}" width="${r1(w * 0.12)}" height="${h - h * 0.1}" fill="${deep}" opacity="0.55"/>`;
  o += `<rect x="${r1(x + w / 2 - w * 0.12)}" y="${y}" width="${r1(w * 0.12)}" height="${h - h * 0.1}" fill="${deep}" opacity="0.55"/>`;
  o += `<path d="M${x - w / 2} ${r1(y + h * 0.72)}H${x + w / 2}" stroke="${emblem}" stroke-width="3" opacity="0.85"/>`;
  o += `<g transform="translate(${r1(x - 50 * s)} ${r1(y + h * 0.36 - 50 * s)}) scale(${r1(s * 100) / 100})">${symbol(CAPE_SYMBOL[c.cape], emblem, color)}</g>`;
  o += `<rect x="${x - w / 2 - 8}" y="${y - 5}" width="${w + 16}" height="7" rx="3.5" fill="#c9a24a"/>`;
  o += `<circle cx="${x - w / 2 - 9}" cy="${y - 1.5}" r="5" fill="#e6c068"/><circle cx="${x + w / 2 + 9}" cy="${y - 1.5}" r="5" fill="#e6c068"/>`;
  o += `</g>`;
  return o;
}

function rug(c: Ctx, cx = 600, cy = 470, rx = 420, ry = 40): string {
  const { color, deep } = c;
  return (
    `<ellipse cx="${cx}" cy="${cy + 4}" rx="${rx + 6}" ry="${ry + 5}" fill="#000" opacity="0.22"/>` +
    `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="${mix(deep, "#000000", 0.12)}"/>` +
    `<ellipse cx="${cx}" cy="${cy}" rx="${rx - 18}" ry="${ry - 7}" fill="${mix(color, deep, 0.25)}"/>` +
    `<ellipse cx="${cx}" cy="${cy}" rx="${rx - 34}" ry="${ry - 13}" fill="none" stroke="${luminance(color) > 0.45 ? mix(deep, "#000000", 0.25) : "#FED438"}" stroke-opacity="0.55" stroke-width="2.5" stroke-dasharray="10 8"/>` +
    `<ellipse cx="${cx}" cy="${cy}" rx="${rx - 70}" ry="${ry - 21}" fill="${mix(color, "#ffffff", 0.08)}" opacity="0.55"/>`
  );
}

function lantern(x: number, y: number, s: number, p: string, rope = 0): string {
  let o = `<g transform="translate(${x} ${y}) scale(${s})">`;
  if (rope) o += `<path d="M0 ${-rope}V-14" stroke="#3a2a1e" stroke-width="2"/>`;
  o += `<circle r="44" fill="url(#${p}lglow)"/>`;
  o += `<rect x="-9" y="-16" width="18" height="5" rx="2" fill="#3b2a1d"/>`;
  o += `<rect x="-12" y="-12" width="24" height="28" rx="9" fill="url(#${p}lbody)"/>`;
  o += `<path d="M-4 -12V16M4 -12V16" stroke="#c9692a" stroke-opacity="0.45" stroke-width="1.5"/>`;
  o += `<rect x="-8" y="15" width="16" height="5" rx="2" fill="#3b2a1d"/>`;
  o += `</g>`;
  return o;
}

function garland(a: [number, number], ctrl: [number, number], b: [number, number], c: Ctx, bulbs = 9): string {
  const d = `M${a[0]} ${a[1]}Q${ctrl[0]} ${ctrl[1]} ${b[0]} ${b[1]}`;
  let o = `<path d="${d}" stroke="#1d5a3a" stroke-width="13" fill="none" stroke-linecap="round"/>`;
  o += `<path d="${d}" stroke="#2f7d4f" stroke-width="8" fill="none" stroke-linecap="round" stroke-dasharray="3 5"/>`;
  o += `<path d="${d}" stroke="#4fa36a" stroke-width="4" fill="none" stroke-linecap="round" stroke-dasharray="2 9"/>`;
  const cols = ["#e8473c", "#FED438", c.color === "#FED438" ? "#ffffff" : c.color, "#ffffff"];
  for (let i = 1; i < bulbs; i++) {
    const [x, y] = qpt(a, ctrl, b, i / bulbs);
    o += `<circle cx="${r1(x)}" cy="${r1(y + 6)}" r="4.2" fill="${cols[i % cols.length]}" stroke="#00000033" stroke-width="1"/>`;
  }
  return o;
}

function tree(x: number, base: number, h: number, c: Ctx): string {
  const w = h * 0.62;
  let o = `<g>`;
  o += `<ellipse cx="${x}" cy="${base + 2}" rx="${r1(w * 0.55)}" ry="6" fill="#000" opacity="0.25"/>`;
  o += `<rect x="${r1(x - w * 0.14)}" y="${r1(base - h * 0.14)}" width="${r1(w * 0.28)}" height="${r1(h * 0.14)}" rx="3" fill="${c.deep}"/>`;
  o += `<rect x="${r1(x - w * 0.17)}" y="${r1(base - h * 0.16)}" width="${r1(w * 0.34)}" height="${r1(h * 0.04)}" rx="2" fill="${c.color}"/>`;
  const tiers: [number, number, number][] = [
    [0.18, 0.5, 1],
    [0.38, 0.72, 0.8],
    [0.58, 0.92, 0.58],
  ];
  for (const [b, t, ww] of tiers) {
    const yb = base - h * b;
    const yt = base - h * t;
    o += `<path d="M${r1(x - (w / 2) * ww)} ${r1(yb)}Q${x} ${r1(yb + 8)} ${r1(x + (w / 2) * ww)} ${r1(yb)}L${x} ${r1(yt)}Z" fill="#2f7d4f"/>`;
    o += `<path d="M${x} ${r1(yt)}L${r1(x + (w / 2) * ww)} ${r1(yb)}Q${r1(x + (w / 4) * ww)} ${r1(yb + 5)} ${x} ${r1(yb + 6)}Z" fill="#1f5e3a"/>`;
  }
  const orn = ["#e8473c", "#FED438", "#ffffff", c.color === "#FED438" ? "#e8473c" : c.color];
  const spots: [number, number][] = [
    [-0.28, 0.24], [0.22, 0.28], [0, 0.34], [-0.15, 0.46], [0.18, 0.5], [-0.05, 0.62], [0.1, 0.72], [-0.3, 0.3],
  ];
  spots.forEach(([dx, dy], i) => {
    o += `<circle cx="${r1(x + dx * w)}" cy="${r1(base - dy * h)}" r="${r1(Math.max(2.5, h * 0.03))}" fill="${orn[i % orn.length]}"/>`;
  });
  o += `<polygon points="${starPts(x, base - h * 0.95, h * 0.08, h * 0.035)}" fill="#FED438" stroke="#c99a00" stroke-width="1"/>`;
  o += `</g>`;
  return o;
}

/** Falling snow inside an area; animated with a single looping translate when `animate`. */
function snowfall(c: Ctx, area: { x: number; y: number; w: number; h: number }, n: number, seed: number, clip?: string): string {
  const rand = rng(seed);
  let flakes = "";
  for (let i = 0; i < n; i++) {
    const x = area.x + rand() * area.w;
    const y = area.y + rand() * area.h;
    const r = 1.3 + rand() * 2.4;
    flakes += `<circle cx="${r1(x)}" cy="${r1(y)}" r="${r1(r)}"/>`;
  }
  const clipAttr = clip ? ` clip-path="url(#${clip})"` : "";
  if (!c.animate) return `<g fill="#ffffff" opacity="0.85"${clipAttr}>${flakes}</g>`;
  return (
    `<g fill="#ffffff" opacity="0.85"${clipAttr}><g>` +
    `<g>${flakes}</g><g transform="translate(14 ${-area.h})">${flakes}</g>` +
    `<animateTransform attributeName="transform" type="translate" values="0 0;-14 ${area.h}" dur="${r1(area.h / 22)}s" repeatCount="indefinite"/>` +
    `</g></g>`
  );
}

function plankFloor(top: number, bottom: number, vx: number, stroke: string, opacity: number, step = 110): string {
  let d = "";
  for (let xb = -500; xb <= 1700; xb += step) {
    const xt = vx + (xb - vx) * 0.42;
    d += `M${r1(xt)} ${top}L${xb} ${bottom}`;
  }
  return `<path d="${d}" stroke="${stroke}" stroke-opacity="${opacity}" stroke-width="2"/>`;
}

function finish(c: Ctx): string {
  return (
    `<rect y="${WALL}" width="${W}" height="34" fill="url(#${c.p}junction)"/>` +
    `<rect width="${W}" height="${H}" fill="url(#${c.p}vig)"/>`
  );
}

function commonDefs(c: Ctx): string {
  const { p, color, deep } = c;
  return (
    rad(`${p}vig`, [[0.5, "#0a0614", 0], [0.8, "#0a0614", 0.25], [1, "#0a0614", 0.62]], 0.5, 0.42, 0.72) +
    lin(`${p}junction`, 0, 0, 0, 1, [[0, "#000000", 0.38], [1, "#000000", 0]]) +
    lin(`${p}ban`, 0, 0, 0, 1, [[0, mix(color, "#ffffff", 0.1)], [1, mix(color, deep, 0.55)]]) +
    glowGrad(`${p}lglow`, "#ffc766", 0.55) +
    lin(`${p}lbody`, 0, 0, 0, 1, [[0, "#fff1b3"], [0.5, "#ffc35a"], [1, "#f08a2c"]]) +
    glowGrad(`${p}warm`, "#ff9a3c", 0.6) +
    glowGrad(`${p}white`, "#fff6dc", 0.6)
  );
}

const anim = (c: Ctx, s: string) => (c.animate ? s : "");

/* ------------------------------------------------------------------- navy */

function navyRoom(c: Ctx): string {
  const { p } = c;
  const rand = rng(11);
  let defs = commonDefs(c);
  defs += rad(`${p}wall`, [[0, "#34507e"], [0.55, "#223a60"], [1, "#111c33"]], 0.5, 0.35, 0.75);
  defs += lin(`${p}floor`, 0, 0, 0, 1, [[0, "#4a3326"], [1, "#22150e"]]);
  defs += lin(`${p}night`, 0, 50, 0, 290, [[0, "#081634"], [0.6, "#173a73"], [1, "#2c5a98"]], true);
  defs += lin(`${p}shaft`, 0, 0, 0, 1, [[0, "#cfe3ff", 0.14], [1, "#cfe3ff", 0]]);
  defs += lin(`${p}stone`, 0, 0, 0, 1, [[0, "#4b5f86"], [1, "#34466a"]]);
  defs += rad(`${p}fire`, [[0, "#ffd36b"], [0.45, "#ff7a2a"], [1, "#2a0d06"]], 0.5, 0.85, 0.75);
  const windows = [380, 600, 820];
  const wTop = 56;
  const wBot = 282;
  const wW = 112;
  defs += `<clipPath id="${p}win">${windows.map((x) => `<path d="${archPath(x, wTop, wW, wBot)}"/>`).join("")}</clipPath>`;

  let o = `<rect width="${W}" height="${WALL}" fill="url(#${p}wall)"/>`;
  // curved stone courses
  let d = "";
  for (let row = 0, y = 0; y < WALL; row++, y += 31) {
    d += `M0 ${y}H${W}`;
    for (let t = -1.35 + (row % 2) * 0.06; t < 1.4; t += 0.12) {
      const x = 600 + 720 * Math.sin(t);
      d += `M${r1(x)} ${y}V${Math.min(y + 31, WALL)}`;
    }
  }
  o += `<path d="${d}" stroke="#0b1428" stroke-opacity="0.4" stroke-width="2"/>`;
  for (let i = 0; i < 26; i++) {
    const t = -1.3 + rand() * 2.6;
    const x = 600 + 720 * Math.sin(t);
    const y = Math.floor(rand() * 12) * 31;
    const w = 70 * Math.cos(t) + 8;
    o += `<rect x="${r1(x)}" y="${y + 2}" width="${r1(w)}" height="27" fill="#ffffff" opacity="${r1(0.02 + rand() * 0.04)}"/>`;
  }
  // light shafts
  windows.forEach((x) => {
    o += `<path d="M${x - wW / 2} ${wBot + 10}H${x + wW / 2}L${x + wW / 2 + 90} 480H${x - wW / 2 + 40}Z" fill="url(#${p}shaft)"/>`;
  });
  // windows
  windows.forEach((x) => {
    o += `<path d="${archPath(x, wTop - 13, wW + 28, wBot + 6)}" fill="url(#${p}stone)"/>`;
    o += `<path d="${archPath(x, wTop - 13, wW + 28, wBot + 6)}" fill="none" stroke="#0b1428" stroke-opacity="0.35" stroke-width="2"/>`;
  });
  o += `<g clip-path="url(#${p}win)"><rect x="300" y="40" width="600" height="260" fill="url(#${p}night)"/>`;
  let stars = "";
  for (let i = 0; i < 40; i++) {
    const wx = windows[i % 3] + (rand() - 0.5) * wW;
    const wy = wTop + rand() * 180;
    stars += `<circle cx="${r1(wx)}" cy="${r1(wy)}" r="${r1(0.8 + rand() * 1.4)}"/>`;
  }
  o += `<g fill="#ffffff" opacity="0.85">${stars}</g>`;
  const tw = [
    [352, 92, "2.6s"],
    [838, 120, "3.4s"],
    [624, 196, "4.1s"],
  ] as const;
  tw.forEach(([x, y, dur]) => {
    o += `<polygon points="${starPts(x, y, 7, 2.2, 4, 0)}" fill="#fff6c8">${anim(c, `<animate attributeName="opacity" values="1;0.25;1" dur="${dur}" repeatCount="indefinite"/>`)}</polygon>`;
  });
  o += `<circle cx="600" cy="128" r="60" fill="url(#${p}white)"/>`;
  o += `<path d="M590 98A30 30 0 1 0 626 140A24 24 0 0 1 590 98Z" fill="#fff4cf"/>`;
  o += `<path d="M300 262Q380 240 460 258T640 254T900 262V300H300Z" fill="#0d2147" opacity="0.8"/>`;
  if (c.winter) o += `<rect x="300" y="40" width="600" height="260" fill="url(#${p}frost)"/>`;
  o += `</g>`;
  if (c.winter) {
    defs += rad(`${p}frost`, [[0.6, "#ffffff", 0], [1, "#e8f4ff", 0.5]], 0.5, 0.5, 0.6);
    o += snowfall(c, { x: 320, y: 40, w: 560, h: 250 }, 46, 5, `${p}win`);
  }
  windows.forEach((x) => {
    o += `<path d="${archPath(x, wTop, wW, wBot)}" fill="none" stroke="#1b2438" stroke-width="7"/>`;
    o += `<path d="M${x} ${wTop}V${wBot}M${x - wW / 2} 170H${x + wW / 2}" stroke="#1b2438" stroke-width="5"/>`;
    o += `<rect x="${x - wW / 2 - 20}" y="${wBot}" width="${wW + 40}" height="13" rx="3" fill="#5a6e96"/>`;
    o += `<rect x="${x - wW / 2 - 20}" y="${wBot + 10}" width="${wW + 40}" height="4" fill="#000" opacity="0.25"/>`;
    if (c.winter) o += `<path d="M${x - wW / 2 - 18} ${wBot + 1}Q${x - 30} ${wBot - 9} ${x} ${wBot - 4}T${x + wW / 2 + 18} ${wBot + 1}Z" fill="#f4f9ff"/>`;
  });
  // banners
  o += banner(c, 490, 74, 50, 150);
  o += banner(c, 710, 74, 50, 150);

  // bookshelf
  o += `<rect x="34" y="88" width="222" height="290" rx="6" fill="#5b3a24"/>`;
  o += `<rect x="34" y="84" width="222" height="12" rx="4" fill="#704a2e"/>`;
  o += `<rect x="48" y="102" width="194" height="262" fill="#2a1a12"/>`;
  const books = ["#1f6fb2", "#8b2e2e", "#2f6b4f", "#c9a227", "#6b4c8a", "#d8cbb0", "#004F81", "#b85c38"];
  [164, 230, 296, 364].forEach((shelf) => {
    let bx = 52;
    while (bx < 232) {
      const bw = 9 + Math.floor(rand() * 10);
      if (bx + bw > 238) break;
      const bh = 34 + Math.floor(rand() * 22);
      const col = books[Math.floor(rand() * books.length)];
      if (rand() < 0.08) {
        bx += 14;
        continue;
      }
      o += `<rect x="${bx}" y="${shelf - bh}" width="${bw}" height="${bh}" rx="1.5" fill="${col}"/>`;
      o += `<rect x="${bx}" y="${shelf - bh + 6}" width="${bw}" height="3" fill="#FED438" opacity="0.5"/>`;
      bx += bw + 1;
    }
    o += `<rect x="44" y="${shelf}" width="202" height="8" fill="#704a2e"/>`;
  });
  // globe + candle on top of shelf
  o += `<circle cx="90" cy="62" r="18" fill="#3f8fc9"/><path d="M78 56Q86 50 92 58T104 62M80 70Q90 66 98 72" stroke="#7cc58a" stroke-width="5" fill="none" stroke-linecap="round"/><path d="M90 80V84M80 85H100" stroke="#c9a24a" stroke-width="4"/><path d="M68 62A22 22 0 0 0 112 62" stroke="#c9a24a" stroke-width="3" fill="none"/>`;
  o += `<rect x="208" y="54" width="12" height="30" rx="2" fill="#f4ead2"/><circle cx="214" cy="44" r="26" fill="url(#${p}lglow)"/><path d="${flamePath(214, 53, 8, 15)}" fill="#ffc94a"/>`;

  // fireplace
  o += `<rect x="984" y="0" width="152" height="204" fill="url(#${p}stone)"/>`;
  let fd = "";
  for (let y = 26; y < 204; y += 30) fd += `M984 ${y}H1136`;
  for (let y = 0, k = 0; y < 204; y += 30, k++) for (let x = 1004 + (k % 2) * 25; x < 1136; x += 50) fd += `M${x} ${y}V${Math.min(y + 26, 204)}`;
  o += `<path d="${fd}" stroke="#1b2438" stroke-opacity="0.35" stroke-width="2"/>`;
  o += `<ellipse cx="1060" cy="330" rx="180" ry="150" fill="url(#${p}warm)"/>`;
  o += `<rect x="958" y="212" width="204" height="162" rx="4" fill="url(#${p}stone)"/>`;
  o += `<path d="${archPath(1060, 250, 132, WALL)}" fill="url(#${p}fire)"/>`;
  o += `<path d="${archPath(1060, 250, 132, WALL)}" fill="none" stroke="#283656" stroke-width="10"/>`;
  o += `<rect x="1004" y="352" width="110" height="14" rx="7" fill="#5a3420" transform="rotate(-8 1060 359)"/><rect x="1004" y="352" width="110" height="14" rx="7" fill="#6e4128" transform="rotate(8 1060 359)"/>`;
  const flames =
    `<path d="${flamePath(0, 0, 76, 92)}" fill="#ff7a2a"/>` +
    `<path d="${flamePath(-16, 0, 36, 58)}" fill="#ff9a3c"/><path d="${flamePath(18, 0, 40, 66)}" fill="#ff9a3c"/>` +
    `<path d="${flamePath(0, 0, 44, 60)}" fill="#ffc94a"/><path d="${flamePath(0, 0, 20, 30)}" fill="#fff1b3"/>`;
  o += `<g transform="translate(1060 356)"><g>${flames}${anim(c, `<animateTransform attributeName="transform" type="scale" values="1 1;1.05 0.93;0.97 1.06;1 1" dur="1.6s" repeatCount="indefinite"/>`)}</g></g>`;
  o += `<rect x="944" y="200" width="232" height="16" rx="4" fill="#6b4428"/><rect x="944" y="212" width="232" height="5" fill="#000" opacity="0.25"/>`;
  o += `<rect x="962" y="366" width="196" height="12" rx="3" fill="#56688c"/>`;
  o += `<ellipse cx="1060" cy="404" rx="190" ry="44" fill="url(#${p}warm)">${anim(c, `<animate attributeName="opacity" values="0.9;0.65;1;0.9" dur="2.2s" repeatCount="indefinite"/>`)}</ellipse>`;
  o += `<g transform="translate(1018 62) scale(0.84)">${crestBody("star", c.color, c.deep, `${p}mc`, false)}</g>`;
  [970, 1150].forEach((x) => {
    o += `<rect x="${x - 5}" y="176" width="10" height="24" rx="2" fill="#f4ead2"/><circle cx="${x}" cy="166" r="22" fill="url(#${p}lglow)"/><path d="${flamePath(x, 175, 7, 13)}" fill="#ffc94a"/>`;
  });
  if (c.winter) {
    o += garland([948, 206], [1060, 240], [1172, 206], c, 8);
    o += tree(300, 380, 120, c);
  }

  // floor
  o += `<rect y="${WALL}" width="${W}" height="${H - WALL}" fill="url(#${p}floor)"/>`;
  o += plankFloor(WALL, H, 600, "#120a06", 0.35);
  o += `<path d="M0 410H1200M0 458H1200" stroke="#120a06" stroke-opacity="0.18" stroke-width="2"/>`;
  o += `<ellipse cx="1060" cy="404" rx="190" ry="44" fill="url(#${p}warm)" opacity="0.7"/>`;
  o += `<rect y="${WALL - 8}" width="${W}" height="10" fill="#1a2238"/>`;
  o += rug(c);
  return `<defs>${defs}</defs>${o}`;
}

/* ------------------------------------------------------------------- gold */

function cloud(cx: number, cy: number, s: number, fill: string): string {
  return (
    `<g transform="translate(${cx} ${cy}) scale(${s})" fill="${fill}">` +
    `<circle cx="-46" cy="4" r="26"/><circle cx="-14" cy="-14" r="36"/><circle cx="26" cy="-6" r="30"/><circle cx="56" cy="8" r="20"/>` +
    `<rect x="-72" y="4" width="148" height="26" rx="13"/></g>`
  );
}

function goldRoom(c: Ctx): string {
  const { p } = c;
  const rand = rng(22);
  let defs = commonDefs(c);
  defs += lin(`${p}sky`, 0, 0, 0, WALL, [[0, "#5b58a8"], [0.3, "#b97ca6"], [0.58, "#f4a46e"], [0.82, "#ffd47c"], [1, "#ffe9b0"]], true);
  defs += lin(`${p}deck`, 0, 0, 0, 1, [[0, "#d6955a"], [1, "#94582e"]]);
  defs += lin(`${p}sun`, 0, 0, 0, 1, [[0, "#fff8d6"], [1, "#ffd04a"]]);
  defs += glowGrad(`${p}sunglow`, "#fff1b0", 0.85);
  defs += lin(`${p}pole`, 0, 0, 1, 0, [[0, "#a8683a"], [0.5, "#c98a52"], [1, "#7a4724"]]);
  defs += glowGrad(`${p}bulb`, "#fff0b0", 0.9);

  let o = `<rect width="${W}" height="${WALL + 10}" fill="url(#${p}sky)"/>`;
  // high stars fading at the top
  let st = "";
  for (let i = 0; i < 18; i++) st += `<circle cx="${r1(rand() * W)}" cy="${r1(rand() * 70)}" r="${r1(0.8 + rand())}"/>`;
  o += `<g fill="#ffffff" opacity="0.6">${st}</g>`;
  o += `<circle cx="600" cy="250" r="290" fill="url(#${p}sunglow)"/>`;
  o += `<circle cx="600" cy="252" r="64" fill="url(#${p}sun)"/>`;
  // floating islands
  const island = (x: number, y: number, s: number) =>
    `<g transform="translate(${x} ${y}) scale(${s})" fill="#a682b0" opacity="0.7"><path d="M-60 0H60Q40 18 20 22L6 46L-4 26Q-30 22 -60 0Z"/><rect x="-60" y="-6" width="120" height="8" rx="4" fill="#b996bd"/><path d="M-30 -6V-30M-30 -50L-46 -22H-14Z" stroke="#a682b0" stroke-width="5"/><circle cx="26" cy="-22" r="16"/><rect x="24" y="-10" width="4" height="6"/></g>`;
  o += island(200, 160, 0.9) + island(1010, 120, 0.7);
  // wispy high clouds
  o += `<g opacity="0.55">${cloud(330, 210, 0.55, "#ffd9c0")}${cloud(880, 196, 0.5, "#ffd9c0")}</g>`;
  // floating lanterns
  const lgA = [lantern(380, 120, 0.8, p), lantern(800, 92, 0.9, p), lantern(960, 210, 0.6, p)].join("");
  const lgB = [lantern(460, 60, 0.6, p), lantern(720, 170, 0.7, p), lantern(260, 250, 0.55, p)].join("");
  o += `<g>${lgA}${anim(c, `<animateTransform attributeName="transform" type="translate" values="0 0;0 -8;0 0" dur="6s" repeatCount="indefinite"/>`)}</g>`;
  o += `<g>${lgB}${anim(c, `<animateTransform attributeName="transform" type="translate" values="0 -5;0 4;0 -5" dur="7.5s" repeatCount="indefinite"/>`)}</g>`;
  // sea of clouds
  let back = "";
  let front = "";
  for (let x = -80; x < 1320; x += 130) back += cloud(x + rand() * 30, 262 + rand() * 16, 0.9 + rand() * 0.3, "#f7c4a2");
  for (let x = -40; x < 1320; x += 110) front += cloud(x + rand() * 30, 292 + rand() * 12, 0.9 + rand() * 0.35, "#fff0dc");
  o += `<g>${back}${anim(c, `<animateTransform attributeName="transform" type="translate" values="0 0;-30 0;0 0" dur="48s" repeatCount="indefinite"/>`)}</g>`;
  o += `<g>${front}${anim(c, `<animateTransform attributeName="transform" type="translate" values="0 0;24 0;0 0" dur="36s" repeatCount="indefinite"/>`)}</g>`;
  if (c.winter) o += snowfall(c, { x: 0, y: 0, w: W, h: WALL }, 90, 9);

  // railing
  let bal = "";
  for (let x = 12; x < W; x += 24) bal += `<rect x="${x}" y="306" width="6" height="52" rx="2"/>`;
  o += `<g fill="#8a5530">${bal}</g>`;
  o += `<rect x="0" y="352" width="${W}" height="10" fill="#7a4724"/>`;
  for (let x = 120; x < W; x += 240) o += `<rect x="${x - 8}" y="292" width="16" height="82" rx="3" fill="url(#${p}pole)"/><rect x="${x - 11}" y="286" width="22" height="10" rx="3" fill="#c98a52"/>`;
  o += `<rect x="0" y="294" width="${W}" height="14" rx="4" fill="#a8683a"/><rect x="0" y="294" width="${W}" height="4" rx="2" fill="#dba06a"/>`;
  if (c.winter) {
    o += `<path d="M0 296${Array.from({ length: 25 }, (_, i) => `Q${i * 48 + 24} ${286 - (i % 3)} ${i * 48 + 48} 295`).join("")}V300H0Z" fill="#f6fbff"/>`;
    o += garland([0, 306], [300, 336], [600, 306], c, 10) + garland([600, 306], [900, 336], [1200, 306], c, 10);
  }
  // telescope
  o += `<g><path d="M206 300L184 376M206 300L228 376M206 300V376" stroke="#5b3a24" stroke-width="5" stroke-linecap="round"/><g transform="rotate(-24 206 296)"><rect x="168" y="286" width="84" height="18" rx="6" fill="#c9a24a"/><rect x="246" y="283" width="16" height="24" rx="4" fill="#e6c068"/><rect x="190" y="286" width="6" height="18" fill="#8a6a28"/></g></g>`;

  // poles with banners
  [70, 1130].forEach((x, i) => {
    const dir = i === 0 ? 1 : -1;
    o += `<rect x="${x - 8}" y="20" width="16" height="370" rx="4" fill="url(#${p}pole)"/>`;
    o += `<circle cx="${x}" cy="18" r="11" fill="#FED438" stroke="#c99a00" stroke-width="2"/>`;
    o += `<rect x="${dir === 1 ? x : x - 92}" y="54" width="92" height="7" rx="3" fill="#7a4724"/>`;
    o += banner(c, x + dir * 48, 64, 66, 190);
    if (c.winter) o += `<ellipse cx="${x}" cy="9" rx="12" ry="5" fill="#f6fbff"/><rect x="${dir === 1 ? x : x - 92}" y="50" width="92" height="5" rx="2.5" fill="#f6fbff"/>`;
  });
  // string lights
  const a: [number, number] = [70, 34];
  const ctl: [number, number] = [600, 150];
  const b: [number, number] = [1130, 34];
  o += `<path d="M70 34Q600 150 1130 34" stroke="#3b2a1d" stroke-width="2" fill="none"/>`;
  let bulbs = "";
  let bulbGlow = "";
  const bc = ["#fff4c2", "#FED438", "#ffb36b"];
  for (let i = 1; i < 22; i++) {
    const [x, y] = qpt(a, ctl, b, i / 22);
    bulbGlow += `<circle cx="${r1(x)}" cy="${r1(y + 8)}" r="16" fill="url(#${p}bulb)"/>`;
    bulbs += `<rect x="${r1(x - 2)}" y="${r1(y)}" width="4" height="4" fill="#3b2a1d"/><circle cx="${r1(x)}" cy="${r1(y + 8)}" r="4.5" fill="${bc[i % 3]}"/>`;
  }
  o += `<g>${bulbGlow}${anim(c, `<animate attributeName="opacity" values="1;0.55;1" dur="3s" repeatCount="indefinite"/>`)}</g>${bulbs}`;

  // deck
  o += `<rect y="${WALL}" width="${W}" height="${H - WALL}" fill="url(#${p}deck)"/>`;
  o += plankFloor(WALL, H, 600, "#5a3418", 0.35, 90);
  o += `<rect y="${WALL - 2}" width="${W}" height="8" fill="#6e3f20"/>`;
  if (c.winter) {
    o += tree(1010, 384, 120, c);
  }
  o += rug(c);
  return `<defs>${defs}</defs>${o}`;
}

/* ------------------------------------------------------------------ ember */

function crystal(x: number, base: number, w: number, h: number, angle: number, c1: string, c2: string): string {
  const pts = (half: 1 | -1) =>
    half === -1
      ? `${x - w / 2},${base} ${x - w / 2},${r1(base - h + w * 0.6)} ${x},${base - h} ${x},${base}`
      : `${x},${base} ${x},${base - h} ${x + w / 2},${r1(base - h + w * 0.6)} ${x + w / 2},${base}`;
  return `<g transform="rotate(${angle} ${x} ${base})"><polygon points="${pts(-1)}" fill="${c1}"/><polygon points="${pts(1)}" fill="${c2}"/><path d="M${r1(x - w * 0.3)} ${r1(base - h * 0.2)}V${r1(base - h + w * 0.7)}" stroke="#fff6d8" stroke-opacity="0.55" stroke-width="2" stroke-linecap="round"/></g>`;
}

function crystalCluster(x: number, base: number, s: number, p: string, c: Ctx): string {
  const c1 = "#ffd27a";
  const c2 = "#ff9845";
  const c3 = mix(c.color, "#ffffff", 0.25);
  const c4 = c.deep;
  return (
    `<g transform="translate(${x} ${base}) scale(${s})">` +
    `<ellipse cx="0" cy="-40" rx="120" ry="90" fill="url(#${p}cglow)"/>` +
    crystal(-34, 0, 26, 74, -24, c3, c4) +
    crystal(30, 0, 28, 84, 20, c3, c4) +
    crystal(0, 0, 36, 120, -2, c1, c2) +
    crystal(-14, 2, 20, 52, -40, c1, c2) +
    crystal(16, 2, 20, 56, 38, c1, c2) +
    `<ellipse cx="0" cy="2" rx="52" ry="8" fill="#2a1009"/></g>`
  );
}

function emberRoom(c: Ctx): string {
  const { p } = c;
  const rand = rng(33);
  let defs = commonDefs(c);
  defs += rad(`${p}wall`, [[0, "#86402a"], [0.5, "#4a1d13"], [1, "#1c0b08"]], 0.5, 0.55, 0.7);
  defs += lin(`${p}lava`, 0, 110, 0, WALL, [[0, "#3a0f08"], [0.45, "#b8361a"], [0.75, "#ff7a2a"], [1, "#ffc45c"]], true);
  defs += lin(`${p}floor`, 0, 0, 0, 1, [[0, "#5a2818"], [1, "#22100a"]]);
  defs += glowGrad(`${p}cglow`, "#ffb04a", 0.55);
  defs += glowGrad(`${p}lavaglow`, "#ff7a2a", 0.6);
  defs += lin(`${p}sky`, 0, 0, 0, 1, [[0, "#0d1530"], [1, "#2b2f5e"]]);
  defs += lin(`${p}shaft`, 0, 0, 0, 1, [[0, "#d8e4ff", 0.16], [1, "#d8e4ff", 0]]);
  const opening = "M440 372C438 300 452 232 482 190C512 148 560 120 600 118C650 120 698 150 724 196C750 240 764 300 762 372Z";
  defs += `<clipPath id="${p}open"><path d="${opening}"/></clipPath>`;
  const shaft = "M262 30H358L420 372H214Z";
  defs += `<clipPath id="${p}shaftclip"><path d="${shaft}"/></clipPath>`;

  let o = `<rect width="${W}" height="${WALL}" fill="url(#${p}wall)"/>`;
  for (let i = 0; i < 46; i++) {
    const x = rand() * W;
    const y = 30 + rand() * 330;
    o += `<ellipse cx="${r1(x)}" cy="${r1(y)}" rx="${r1(20 + rand() * 50)}" ry="${r1(10 + rand() * 22)}" fill="${rand() < 0.5 ? "#000000" : "#ffb070"}" opacity="${r1(0.04 + rand() * 0.06)}"/>`;
  }
  // lava opening
  o += `<ellipse cx="600" cy="300" rx="300" ry="230" fill="url(#${p}lavaglow)">${anim(c, `<animate attributeName="opacity" values="0.85;1;0.85" dur="4s" repeatCount="indefinite"/>`)}</ellipse>`;
  o += `<g clip-path="url(#${p}open)"><rect x="430" y="110" width="340" height="270" fill="url(#${p}lava)"/>`;
  o += `<path d="M440 372V280L478 238L500 268L536 214L566 258L600 228L628 262L664 220L700 270L728 244L762 290V372Z" fill="#6a1e10" opacity="0.85"/>`;
  o += `<path d="M440 372V318L490 300L530 322L580 304L640 324L700 302L762 320V372Z" fill="#3e110a"/>`;
  o += `<path d="M440 352Q520 336 600 350T762 346V372H440Z" fill="#ffcf6b"/><path d="M460 358Q540 348 600 358T740 356" stroke="#fff3b8" stroke-width="3" fill="none" stroke-linecap="round"/>`;
  o += `<rect x="430" y="110" width="340" height="270" fill="#ffb347" opacity="0">${anim(c, `<animate attributeName="opacity" values="0;0.18;0" dur="4s" repeatCount="indefinite"/>`)}</rect>`;
  o += `</g><path d="${opening}" fill="none" stroke="#24100a" stroke-width="12"/>`;
  // skylight shaft
  o += `<path d="${shaft}" fill="url(#${p}shaft)"/>`;
  if (c.winter) {
    o += snowfall(c, { x: 214, y: 20, w: 206, h: 352 }, 36, 7, `${p}shaftclip`);
    o += `<path d="M232 384Q250 360 300 362Q356 360 380 384Z" fill="#f4f8ff" opacity="0.95"/>`;
  }

  // ceiling and side rock frame
  let ceil = "M0 0H1200V30";
  for (let x = 1200; x > 0; x -= 40) {
    const deep = rand() < 0.35 ? 40 + rand() * 46 : 10 + rand() * 18;
    ceil += `L${r1(x - 20)} ${r1(26 + deep)}L${x - 40} ${r1(22 + rand() * 12)}`;
  }
  ceil += "Z";
  o += `<path d="${ceil}" fill="#1a0a07"/>`;
  o += `<path d="M248 0L258 16L274 24C290 42 326 46 342 32L356 20L368 0Z" fill="url(#${p}sky)"/>`;
  o += `<g fill="#ffffff"><circle cx="292" cy="14" r="1.4"/><circle cx="330" cy="24" r="1.1"/><circle cx="312" cy="8" r="1"/></g>`;
  if (c.winter) {
    let ice = "";
    for (let x = 30; x < W; x += 52 + rand() * 40) {
      if (x > 240 && x < 380) continue;
      const len = 12 + rand() * 18;
      ice += `M${r1(x - 4)} 34L${r1(x)} ${r1(34 + len)}L${r1(x + 4)} 34Z`;
    }
    o += `<path d="M250 2L259 18L275 26C291 44 327 48 343 34L357 22L367 2" stroke="#f4f8ff" stroke-width="5" fill="none" stroke-linejoin="round"/>`;
    o += `<path d="${ice}" fill="#dff1ff" opacity="0.9"/>`;
    o += garland([452, 214], [600, 70], [748, 214], c, 11);
  }
  // banners and torches
  o += banner(c, 330, 72, 60, 170);
  o += banner(c, 870, 72, 60, 170);
  [[410, 196], [790, 196]].forEach(([x, y], i) => {
    o += `<circle cx="${x}" cy="${y - 20}" r="76" fill="url(#${p}warm)"/>`;
    o += `<path d="M${x - 14} ${y + 24}L${x} ${y + 34}L${x + 14} ${y + 24}" stroke="#3a2418" stroke-width="5" fill="none"/>`;
    o += `<rect x="${x - 4}" y="${y - 4}" width="8" height="44" rx="2" fill="#5a3420"/>`;
    o += `<path d="M${x - 10} ${y - 8}H${x + 10}L${x + 7} ${y + 2}H${x - 7}Z" fill="#3a2418"/>`;
    const fl = `<path d="${flamePath(0, 0, 24, 44)}" fill="#ff7a2a"/><path d="${flamePath(0, 0, 14, 28)}" fill="#ffc94a"/><path d="${flamePath(0, 0, 6, 12)}" fill="#fff1b3"/>`;
    o += `<g transform="translate(${x} ${y - 8})"><g>${fl}${anim(c, `<animateTransform attributeName="transform" type="scale" values="1 1;1.06 0.92;0.95 1.07;1 1" dur="${i ? "1.3s" : "1.7s"}" repeatCount="indefinite"/>`)}</g></g>`;
  });

  // map table (back right)
  o += `<g><ellipse cx="960" cy="392" rx="120" ry="10" fill="#000" opacity="0.35"/>`;
  o += `<rect x="868" y="336" width="12" height="56" fill="#3e2416"/><rect x="1040" y="336" width="12" height="56" fill="#3e2416"/>`;
  o += `<path d="M846 330L1074 330L1060 314H860Z" fill="#7a4a2a"/><rect x="846" y="330" width="228" height="12" fill="#5a3420"/>`;
  o += `<path d="M880 326L1040 326L1030 316L888 316Z" fill="#f1dfb4"/><path d="M900 322Q940 314 970 321T1022 319" stroke="#b5562e" stroke-width="1.6" stroke-dasharray="4 3" fill="none"/><path d="M1016 315L1024 323M1024 315L1016 323" stroke="#c2410c" stroke-width="2"/>`;
  o += `<rect x="864" y="296" width="8" height="18" rx="2" fill="#f4ead2"/><circle cx="868" cy="290" r="20" fill="url(#${p}lglow)"/><path d="${flamePath(868, 296, 6, 11)}" fill="#ffc94a"/></g>`;

  o += `<g transform="translate(985 150) scale(0.42)">${crystal(-22, 0, 22, 60, -30, "#ffd27a", "#ff9845")}${crystal(0, 0, 26, 86, 0, mix(c.color, "#ffffff", 0.25), c.deep)}${crystal(22, 0, 22, 58, 28, "#ffd27a", "#ff9845")}</g>`;
  o += `<ellipse cx="985" cy="130" rx="60" ry="50" fill="url(#${p}cglow)"/>`;
  o += `<path d="M0 0H138C116 60 150 124 126 190C108 252 140 312 116 380L96 520H0Z" fill="#1c0b07"/><path d="M138 0C116 60 150 124 126 190C108 252 140 312 116 380" stroke="#5a2416" stroke-width="3" fill="none"/>`;
  o += `<path d="M1200 0H1062C1084 60 1050 124 1074 190C1092 252 1060 312 1084 380L1104 520H1200Z" fill="#1c0b07"/><path d="M1062 0C1084 60 1050 124 1074 190C1092 252 1060 312 1084 380" stroke="#5a2416" stroke-width="3" fill="none"/>`;

  // floor
  o += `<rect y="${WALL}" width="${W}" height="${H - WALL}" fill="url(#${p}floor)"/>`;
  for (let i = 0; i < 26; i++) {
    const x = rand() * W;
    const y = WALL + 10 + rand() * 140;
    o += `<ellipse cx="${r1(x)}" cy="${r1(y)}" rx="${r1(12 + rand() * 26)}" ry="${r1(4 + rand() * 6)}" fill="#000" opacity="${r1(0.08 + rand() * 0.1)}"/>`;
  }
  o += `<ellipse cx="600" cy="392" rx="240" ry="30" fill="url(#${p}lavaglow)" opacity="0.7"/>`;
  o += crystalCluster(190, 384, 1, p, c);
  o += `<rect y="${WALL - 4}" width="${W}" height="6" fill="#1c0b07" opacity="0.6"/>`;
  o += rug(c);
  return `<defs>${defs}</defs>${o}`;
}

/* -------------------------------------------------------------- evergreen */

function evergreenRoom(c: Ctx): string {
  const { p } = c;
  const rand = rng(44);
  let defs = commonDefs(c);
  defs += lin(`${p}wall`, 0, 0, 0, 1, [[0, "#8a5a3c"], [1, "#6e4329"]]);
  defs += lin(`${p}floor`, 0, 0, 0, 1, [[0, "#7a4e30"], [1, "#3e2616"]]);
  defs += lin(`${p}brass`, 0, 0, 1, 1, [[0, "#f0cf7e"], [0.5, "#c9a04e"], [1, "#8a6526"]]);
  defs += lin(`${p}sky`, 0, 30, 0, 222, [[0, "#152a52"], [0.55, "#4f5a92"], [0.85, "#d98f86"], [1, "#f6b77e"]], true);
  defs += lin(`${p}sea`, 0, 220, 0, 310, [[0, "#2c6585"], [1, "#0d2c44"]], true);
  defs += lin(`${p}beam`, 1, 0, 0, 0, [[0, "#fff6c8", 0.75], [1, "#fff6c8", 0]]);
  defs += rad(`${p}frost`, [[0.7, "#ffffff", 0], [1, "#e8f4ff", 0.55]]);
  const cx = 600;
  const cy = 172;
  const R = 126;
  defs += `<clipPath id="${p}glass"><circle cx="${cx}" cy="${cy}" r="${R}"/></clipPath>`;

  let o = `<rect width="${W}" height="${WALL}" fill="url(#${p}wall)"/>`;
  let pl = "";
  for (let x = 0; x < W; x += 58) pl += `M${x} 0V${WALL}`;
  for (let i = 0; i < 18; i++) {
    const x = Math.floor(rand() * 21) * 58;
    const y = 60 + rand() * 280;
    pl += `M${x} ${r1(y)}H${x + 58}`;
  }
  o += `<path d="${pl}" stroke="#4a2c18" stroke-opacity="0.45" stroke-width="2.5"/>`;
  for (let i = 0; i < 14; i++) o += `<ellipse cx="${r1(29 + Math.floor(rand() * 20) * 58)}" cy="${r1(40 + rand() * 300)}" rx="4" ry="6" fill="#4a2c18" opacity="0.35"/>`;
  // ceiling beam + braces
  o += `<rect width="${W}" height="30" fill="#5a3520"/><rect y="26" width="${W}" height="6" fill="#000" opacity="0.2"/>`;
  o += `<path d="M0 104L0 136L140 30L100 30Z" fill="#5a3520"/><path d="M1200 104L1200 136L1060 30L1100 30Z" fill="#5a3520"/>`;
  for (let x = 40; x < W; x += 160) o += `<circle cx="${x}" cy="15" r="3" fill="#c9a04e"/>`;

  // porthole window
  o += `<circle cx="${cx}" cy="${cy}" r="${R + 60}" fill="url(#${p}white)" opacity="0.5"/>`;
  o += `<g clip-path="url(#${p}glass)">`;
  o += `<rect x="${cx - R}" y="${cy - R}" width="${R * 2}" height="${R * 2}" fill="url(#${p}sky)"/>`;
  let st = "";
  for (let i = 0; i < 26; i++) st += `<circle cx="${r1(cx - R + rand() * R * 2)}" cy="${r1(cy - R + rand() * 90)}" r="${r1(0.7 + rand() * 1.2)}"/>`;
  o += `<g fill="#ffffff" opacity="0.8">${st}</g>`;
  o += `<circle cx="636" cy="74" r="13" fill="#fff4cf"/><circle cx="636" cy="74" r="30" fill="url(#${p}white)"/>`;
  o += `<rect x="${cx - R}" y="220" width="${R * 2}" height="${R}" fill="url(#${p}sea)"/>`;
  o += `<path d="M500 240H540M560 256H610M490 272H530M620 236H660M540 288H600M640 280H680" stroke="#bfe3f0" stroke-opacity="0.45" stroke-width="2.5" stroke-linecap="round"/>`;
  o += `<path d="M626 232H646M622 242H650" stroke="#fff4cf" stroke-opacity="0.55" stroke-width="2.5" stroke-linecap="round"/>`;
  // island + lighthouse
  o += `<path d="M626 228Q640 206 660 210Q672 196 690 204Q712 200 724 228Z" fill="#25344a"/>`;
  o += `<path d="M680 212L684 128H700L704 212Z" fill="#f4efe6"/><path d="M682.6 186L701.4 186L702.2 198L681.8 198ZM683.9 152H700.1L700.7 164H683.3Z" fill="#d8453b"/>`;
  o += `<rect x="680" y="114" width="24" height="16" fill="#3a3a4a"/><rect x="684" y="116" width="16" height="12" fill="#ffe680"/><path d="M676 114L692 100L708 114Z" fill="#d8453b"/><rect x="676" y="128" width="32" height="4" fill="#3a3a4a"/>`;
  o += `<g transform="translate(692 122)"><g><path d="M0 -4L-300 -40V40L0 4Z" fill="url(#${p}beam)"/>${anim(c, `<animateTransform attributeName="transform" type="rotate" values="-14;18;-14" dur="7s" repeatCount="indefinite"/>`)}</g><circle r="26" fill="url(#${p}white)"/></g>`;
  if (c.winter) {
    o += `<rect x="${cx - R}" y="${cy - R}" width="${R * 2}" height="${R * 2}" fill="url(#${p}frost)"/>`;
    o += `<path d="M${cx - R} 292Q560 278 600 284T${cx + R} 288V${cy + R}H${cx - R}Z" fill="#f4f9ff"/>`;
  }
  o += `</g>`;
  if (c.winter) o += snowfall(c, { x: cx - R, y: cy - R, w: R * 2, h: R * 2 }, 40, 3, `${p}glass`);
  o += `<path d="M${cx - R + 30} ${cy - 40}A${R - 20} ${R - 20} 0 0 1 ${cx - 30} ${cy - R + 26}" stroke="#ffffff" stroke-opacity="0.18" stroke-width="10" fill="none" stroke-linecap="round"/>`;
  o += `<circle cx="${cx}" cy="${cy}" r="${R + 8}" fill="none" stroke="#5a3a18" stroke-width="10"/>`;
  o += `<circle cx="${cx}" cy="${cy}" r="${R + 20}" fill="none" stroke="url(#${p}brass)" stroke-width="20"/>`;
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    o += `<circle cx="${r1(cx + (R + 20) * Math.cos(a))}" cy="${r1(cy + (R + 20) * Math.sin(a))}" r="3" fill="#7a5620"/>`;
  }
  if (c.winter) {
    const gr = R + 34;
    o += `<circle cx="${cx}" cy="${cy}" r="${gr}" fill="none" stroke="#1d5a3a" stroke-width="14"/>`;
    o += `<circle cx="${cx}" cy="${cy}" r="${gr}" fill="none" stroke="#2f7d4f" stroke-width="9" stroke-dasharray="3 5"/>`;
    o += `<circle cx="${cx}" cy="${cy}" r="${gr}" fill="none" stroke="#4fa36a" stroke-width="4" stroke-dasharray="2 9"/>`;
    const cols = ["#e8473c", "#FED438", "#ffffff"];
    for (let i = 0; i < 18; i++) {
      const a = (i / 18) * Math.PI * 2;
      o += `<circle cx="${r1(cx + gr * Math.cos(a))}" cy="${r1(cy + gr * Math.sin(a))}" r="4.2" fill="${cols[i % 3]}"/>`;
    }
    o += `<path d="M${cx} ${cy + gr - 4}l-16 22l12 -2l4 10l4 -10l12 2Z" fill="#d8453b"/><circle cx="${cx}" cy="${cy + gr}" r="8" fill="#e8473c"/>`;
  }
  o += `<rect x="456" y="318" width="288" height="14" rx="4" fill="#5a3520"/><rect x="456" y="328" width="288" height="5" fill="#000" opacity="0.25"/>`;

  // banners
  o += banner(c, 96, 60, 64, 180);
  o += banner(c, 1104, 60, 64, 180);
  // shelves with plants (left)
  const pot = (x: number, y: number, s: number, leaf: string) =>
    `<g transform="translate(${x} ${y}) scale(${s})"><path d="M0 -16C-20 -40 -26 -50 -10 -60C0 -46 2 -30 0 -16ZM0 -16C18 -44 30 -48 34 -36C20 -30 10 -22 0 -16ZM0 -16C-6 -40 6 -66 14 -70C18 -50 10 -30 0 -16ZM0 -16C-20 -26 -34 -26 -38 -20C-24 -14 -10 -14 0 -16Z" fill="${leaf}"/><path d="M-14 -16H14L10 6H-10Z" fill="#c9673e"/><rect x="-16" y="-19" width="32" height="6" rx="2" fill="#b4552f"/></g>`;
  o += `<rect x="186" y="142" width="190" height="10" rx="2" fill="#5a3520"/><rect x="186" y="232" width="190" height="10" rx="2" fill="#5a3520"/>`;
  o += `<path d="M198 152L206 166H214L222 152M340 152L348 166H356L364 152M198 242L206 256H214L222 242M340 242L348 256H356L364 242" stroke="#4a2c18" stroke-width="4" fill="none"/>`;
  o += pot(220, 136, 0.9, "#3f9a5e") + pot(330, 136, 0.7, "#2f7d4f");
  o += `<rect x="252" y="110" width="12" height="32" rx="1.5" fill="#1f6fb2"/><rect x="265" y="114" width="10" height="28" rx="1.5" fill="#FED438"/><rect x="276" y="106" width="13" height="36" rx="1.5" fill="#2f9e6e"/><rect x="292" y="118" width="11" height="24" rx="1.5" fill="#f0643c" transform="rotate(12 297 142)"/>`;
  o += `<path d="M232 232V206Q232 198 240 198H256Q264 198 264 206V232Z" fill="#9fd3d6" opacity="0.8"/><rect x="238" y="192" width="20" height="8" rx="2" fill="#7a4e30"/>`;
  o += `<path d="M284 232L292 212H304L312 232Z" fill="#f4efe6"/><path d="M296 212V200" stroke="#5a3520" stroke-width="2"/><path d="M297 201L309 206L297 209Z" fill="#2f9e6e"/>`;
  o += pot(350, 226, 0.85, "#4fae6e");
  // ship wheel (right)
  o += `<g transform="translate(920 170)"><g stroke="#6e4329" stroke-width="7" stroke-linecap="round">`;
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4;
    o += `<path d="M${r1(36 * Math.cos(a))} ${r1(36 * Math.sin(a))}L${r1(60 * Math.cos(a))} ${r1(60 * Math.sin(a))}"/>`;
  }
  o += `</g><circle r="40" fill="none" stroke="#7a4e30" stroke-width="9"/><circle r="40" fill="none" stroke="#a8744a" stroke-width="3"/><circle r="12" fill="url(#${p}brass)"/></g>`;
  // hanging plant
  o += `<path d="M1010 30V92M1010 92L990 112M1010 92L1030 112" stroke="#3a2a1e" stroke-width="2"/>`;
  o += `<path d="M988 112H1032L1026 136H994Z" fill="#c9673e"/>`;
  o += `<path d="M994 132C986 150 990 172 982 190M1004 136C1004 160 1000 178 1004 200M1022 134C1032 152 1028 170 1036 182" stroke="#2f7d4f" stroke-width="3" fill="none"/>`;
  let lv = "";
  [[984, 150], [988, 176], [1002, 160], [1003, 190], [1028, 152], [1032, 174], [994, 120], [1022, 118], [1010, 112]].forEach(([x, y], i) => {
    lv += `<ellipse cx="${x}" cy="${y}" rx="8" ry="5" transform="rotate(${i % 2 ? 30 : -30} ${x} ${y})"/>`;
  });
  o += `<g fill="#3f9a5e">${lv}</g>`;
  // lanterns
  o += `<g>${lantern(430, 112, 1, p, 82)}${lantern(770, 112, 1, p, 82)}${anim(c, `<animate attributeName="opacity" values="1;0.82;1" dur="3.6s" repeatCount="indefinite"/>`)}</g>`;

  // floor
  o += `<rect y="${WALL}" width="${W}" height="${H - WALL}" fill="url(#${p}floor)"/>`;
  o += plankFloor(WALL, H, 600, "#2a170c", 0.3, 100);
  o += `<path d="M0 404H1200M0 446H1200M0 494H1200" stroke="#2a170c" stroke-opacity="0.2" stroke-width="2"/>`;
  o += `<rect y="${WALL - 8}" width="${W}" height="10" fill="#4a2c18"/>`;
  o += pot(52, 420, 1.6, "#3f9a5e") + pot(1150, 424, 1.5, "#2f7d4f");
  if (c.winter) o += tree(1000, 384, 116, c);
  // braided rug
  const { color, deep } = c;
  o += `<ellipse cx="600" cy="474" rx="420" ry="40" fill="#000" opacity="0.22"/>`;
  [[414, 37, deep], [394, 33, color], [372, 29, "#f4e6c4"], [348, 25, deep], [322, 21, color], [294, 17, "#f4e6c4"], [262, 13, mix(color, "#ffffff", 0.15)]].forEach(
    ([rx, ry, col]) => {
      o += `<ellipse cx="600" cy="470" rx="${rx}" ry="${ry}" fill="${col}"/>`;
    },
  );
  return `<defs>${defs}</defs>${o}`;
}

/* ---------------------------------------------------------------- export */

/**
 * Full illustrated common room for a Cape. viewBox 0 0 1200 520; the floor band (y ≥ 372) is kept clear
 * for characters, which stand on ROOM_FLOOR.y. Animation is subtle SMIL and on by default.
 */
export function roomSvg(cape: CapeId, opts?: { winter?: boolean; animate?: boolean; idPrefix?: string }): string {
  const id: CapeId = isCapeId(cape) ? cape : "navy";
  const winter = opts?.winter === true;
  const animate = opts?.animate !== false;
  const p = safePrefix(opts?.idPrefix, `room-${id}${winter ? "-w" : ""}${animate ? "" : "-s"}`) + "-";
  const c: Ctx = { p, animate, winter, cape: id, ...CAPE_COLORS[id] };
  const body = id === "navy" ? navyRoom(c) : id === "gold" ? goldRoom(c) : id === "ember" ? emberRoom(c) : evergreenRoom(c);
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid slice" role="img" aria-label="${ROOM_INFO[id].name}">` +
    body +
    finish(c) +
    `</svg>`
  );
}
