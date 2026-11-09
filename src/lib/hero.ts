/**
 * Courage Academy hero builder: renders a customizable chibi superhero as an SVG string.
 *
 * Pure TypeScript, no dependencies, safe on server and client.
 *
 * Security: every field that reaches the SVG goes through `sanitizeHero` (only ids from
 * HERO_OPTIONS survive), app colors go through a strict hex check, the title is escaped and
 * the id prefix is reduced to [A-Za-z0-9_-]. `heroSvg` re-sanitizes its config itself, so
 * callers can't inject markup even if they skip `sanitizeHero`.
 *
 * Coordinates: everything is drawn in a 240x320 "full body" space (head centered at 120,100).
 * The "head" view reuses the same drawing, scaled into a 120x120 circle.
 *
 * Notes:
 * - Head coverings: the hijab uses `hairColor` as its fabric color. The beanie is knitted in
 *   the cape color with a trim pom-pom (hair peeks out in hairColor); the headband is in the
 *   cape trim color.
 * - The full cowl mask hides hair (and head coverings) and ears.
 * - The "cfk" outfit is always Courage for Kids navy with a yellow heart (ignores outfitColor).
 */

export type HeroConfig = {
  skin: string;
  face: string;
  expression: string;
  hair: string;
  hairColor: string;
  eyes: string;
  eyeColor: string;
  brows: string;
  freckles: boolean;
  glasses: string;
  facialHair: string;
  outfit: string;
  outfitColor: string;
  mask: string;
  maskColor: string;
  pose: string;
  background: string;
};

type Opt = { id: string; label: string; swatch?: string };
type OptionKey = Exclude<keyof HeroConfig, "freckles">;

const SKIN_HEX = ["#FFE5D6", "#FAD3BC", "#F3C3A1", "#E8B08A", "#D99D74", "#C68860", "#AE714A", "#94603D", "#7C4D31", "#663E27", "#50301E", "#3D2417"];

const o = (id: string, label: string, swatch?: string): Opt => (swatch ? { id, label, swatch } : { id, label });

const OPTIONS: Record<OptionKey, Opt[]> = {
  skin: SKIN_HEX.map((c, i) => o(`tone${i + 1}`, `Tone ${i + 1}`, c)),
  face: [o("round", "Round"), o("oval", "Oval"), o("square", "Square"), o("heart", "Heart")],
  expression: [o("smile", "Smile"), o("grin", "Big grin"), o("determined", "Determined"), o("laughing", "Laughing"), o("calm", "Calm"), o("wink", "Wink")],
  hair: [
    o("short", "Short"), o("buzz", "Buzz cut"), o("side-part", "Side part"), o("curly-short", "Short curls"), o("afro", "Afro"),
    o("puff", "Coily puff"), o("long-straight", "Long straight"), o("long-wavy", "Long wavy"), o("ponytail", "Ponytail"),
    o("bun", "High bun"), o("space-buns", "Space buns"), o("braids", "Two braids"), o("box-braids", "Box braids"),
    o("locs", "Locs"), o("mohawk", "Mohawk"), o("bob", "Bob"), o("bald", "Bald"), o("hijab", "Hijab"), o("beanie", "Beanie"),
    o("headband", "Headband"),
  ],
  hairColor: [
    o("black", "Black", "#2A2624"), o("dark-brown", "Dark brown", "#4B3123"), o("brown", "Brown", "#7B4F2E"), o("auburn", "Auburn", "#9C4425"),
    o("red", "Red", "#D0532F"), o("blonde", "Blonde", "#E9C46A"), o("platinum", "Platinum", "#EFE7D6"), o("gray", "Silver", "#A9ADB8"),
    o("blue", "Blue", "#3E7BE0"), o("pink", "Pink", "#F27AB5"), o("purple", "Purple", "#8E5BD9"), o("green", "Green", "#34B27A"),
  ],
  eyes: [o("round", "Round"), o("almond", "Almond"), o("happy", "Happy"), o("sparkle", "Sparkle"), o("sleepy", "Sleepy")],
  eyeColor: [
    o("brown", "Brown", "#7A4724"), o("dark-brown", "Dark brown", "#43281A"), o("hazel", "Hazel", "#9A7432"),
    o("green", "Green", "#3E9460"), o("blue", "Blue", "#3D84CC"), o("gray", "Gray", "#7E8C99"),
  ],
  brows: [o("soft", "Soft"), o("bold", "Bold"), o("arched", "Arched"), o("straight", "Straight")],
  glasses: [o("none", "None"), o("round", "Round"), o("square", "Square"), o("star", "Star"), o("goggles", "Goggles")],
  facialHair: [o("none", "None"), o("stubble", "Stubble"), o("mustache", "Mustache"), o("beard", "Short beard")],
  outfit: [o("cfk", "Courage for Kids hoodie"), o("hoodie", "Hoodie"), o("supersuit", "Super suit"), o("jersey", "Jersey"), o("tshirt", "T-shirt"), o("formal", "Suit & tie")],
  outfitColor: [
    o("red", "Red", "#E5463D"), o("orange", "Orange", "#F28A2E"), o("yellow", "Yellow", "#F5C431"), o("green", "Green", "#2EA866"),
    o("teal", "Teal", "#1AA3A0"), o("blue", "Blue", "#2F7BD8"), o("navy", "Navy", "#27407A"), o("purple", "Purple", "#7D52D0"),
    o("pink", "Pink", "#EC6AA6"), o("black", "Black", "#2C2E38"), o("white", "White", "#F1F2F4"),
  ],
  mask: [o("none", "None"), o("domino", "Eye mask"), o("half", "Bandana"), o("cowl", "Full cowl")],
  maskColor: [
    o("black", "Black", "#2B2B36"), o("red", "Red", "#D93A3A"), o("blue", "Blue", "#2E6FD6"), o("purple", "Purple", "#7A4FCF"),
    o("green", "Green", "#27A363"), o("gold", "Gold", "#F2B91E"), o("pink", "Pink", "#EE5EA0"), o("white", "White", "#F3F4F6"),
  ],
  pose: [o("hips", "Hands on hips"), o("fly", "Flying"), o("wave", "Waving"), o("cross", "Arms crossed"), o("victory", "Victory fist")],
  background: [o("none", "None"), o("night", "Night sky"), o("city", "City rooftop"), o("clouds", "Clouds"), o("space", "Outer space"), o("sunrise", "Sunrise")],
};

/** Every option list the editor shows (booleans like `freckles` are excluded). */
export const HERO_OPTIONS: { [K in keyof HeroConfig]?: { id: string; label: string; swatch?: string }[] } = OPTIONS;

export const DEFAULT_HERO: HeroConfig = {
  skin: "tone4", face: "round", expression: "smile", hair: "short", hairColor: "dark-brown", eyes: "round", eyeColor: "brown",
  brows: "soft", freckles: false, glasses: "none", facialHair: "none", outfit: "cfk", outfitColor: "blue", mask: "domino",
  maskColor: "black", pose: "hips", background: "none",
};

const OPTION_KEYS = Object.keys(OPTIONS) as OptionKey[];
const VALID: Record<string, Set<string>> = {};
const SWATCH: Record<string, Map<string, string>> = {};
for (const k of OPTION_KEYS) {
  VALID[k] = new Set(OPTIONS[k].map((x) => x.id));
  SWATCH[k] = new Map(OPTIONS[k].filter((x) => x.swatch).map((x) => [x.id, x.swatch as string]));
}

/** Accepts untrusted JSON. Unknown/invalid fields fall back to DEFAULT_HERO; only known ids survive. */
export function sanitizeHero(input: unknown): HeroConfig {
  const out: HeroConfig = { ...DEFAULT_HERO };
  if (!input || typeof input !== "object" || Array.isArray(input)) return out;
  const src = input as Record<string, unknown>;
  const has = (k: string) => Object.prototype.hasOwnProperty.call(src, k);
  for (const k of OPTION_KEYS) {
    const v = has(k) ? src[k] : undefined;
    if (typeof v === "string" && VALID[k].has(v)) out[k] = v;
  }
  if (has("freckles") && typeof src.freckles === "boolean") out.freckles = src.freckles;
  return out;
}

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A random (but always valid) hero. Pass a seed for deterministic output. */
export function randomHero(seed?: number): HeroConfig {
  const rnd = mulberry32(seed ?? Math.floor(Math.random() * 2 ** 31));
  const pick = (k: OptionKey) => OPTIONS[k][Math.floor(rnd() * OPTIONS[k].length)].id;
  const rare = (k: OptionKey, chance: number) => (rnd() < chance ? pick(k) : "none");
  const cfg: HeroConfig = { ...DEFAULT_HERO };
  for (const k of OPTION_KEYS) cfg[k] = pick(k);
  cfg.freckles = rnd() < 0.25;
  cfg.glasses = rare("glasses", 0.35);
  cfg.facialHair = rare("facialHair", 0.25);
  cfg.mask = rnd() < 0.7 ? pick("mask") : "none";
  if (cfg.glasses === "goggles" && cfg.mask === "domino") cfg.mask = "none";
  return cfg;
}

// ---------------------------------------------------------------------------------------------
// Color & SVG helpers

const HEX = /^#[0-9a-fA-F]{6}$/;
const safeHex = (v: unknown, fallback: string) => (typeof v === "string" && HEX.test(v) ? v : fallback);

function rgb(h: string): [number, number, number] {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function mix(a: string, b: string, t: number): string {
  const x = rgb(a), y = rgb(b);
  return "#" + x.map((v, i) => Math.round(v + (y[i] - v) * t).toString(16).padStart(2, "0")).join("");
}
const lum = (h: string) => { const [r, g, b] = rgb(h); return (0.299 * r + 0.587 * g + 0.114 * b) / 255; };
/** Outline tone: a darker, slightly cool version of the fill. */
const ink = (c: string) => mix(c, "#1c1630", lum(c) > 0.8 ? 0.55 : 0.5);
const shade = (c: string, t = 0.18) => mix(c, "#1c1630", t);
const tint = (c: string, t = 0.35) => mix(c, "#ffffff", t);

const r1 = (n: number) => String(Math.round(n * 10) / 10);
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string);

const SW = 3; // standard outline width
function P(d: string, fill: string, stroke?: string, sw = SW, extra = ""): string {
  const s = stroke ? ` stroke="${stroke}" stroke-width="${sw}" stroke-linejoin="round" stroke-linecap="round"` : "";
  return `<path d="${d}" fill="${fill}"${s}${extra ? " " + extra : ""}/>`;
}
const line = (d: string, color: string, w: number, extra = "") => P(d, "none", color, w, extra);
function E(cx: number, cy: number, rx: number, ry: number, fill: string, stroke?: string, sw = SW, extra = ""): string {
  const s = stroke ? ` stroke="${stroke}" stroke-width="${sw}"` : "";
  return `<ellipse cx="${r1(cx)}" cy="${r1(cy)}" rx="${r1(rx)}" ry="${r1(ry)}" fill="${fill}"${s}${extra ? " " + extra : ""}/>`;
}
const C = (cx: number, cy: number, r: number, fill: string, stroke?: string, sw = SW, extra = "") => E(cx, cy, r, r, fill, stroke, sw, extra);
type Pt = [number, number];
const poly = (pts: Pt[]) => "M" + pts.map((p) => `${r1(p[0])},${r1(p[1])}`).join(" L");
/** Overlapping circles merged into one outlined blob (curls, puffs, buns, clouds). */
function blob(cs: [number, number, number][], fill: string, outline: string | null, sw = SW): string {
  const back = outline ? cs.map(([x, y, r]) => C(x, y, r + sw / 2, outline)).join("") : "";
  return back + cs.map(([x, y, r]) => C(x, y, outline ? r - sw / 2 : r, fill)).join("");
}
function starPts(cx: number, cy: number, R: number, r: number, n = 5, rot = -90): string {
  const pts: Pt[] = [];
  for (let i = 0; i < n * 2; i++) {
    const a = ((rot + (i * 180) / n) * Math.PI) / 180;
    const rad = i % 2 ? r : R;
    pts.push([cx + Math.cos(a) * rad, cy + Math.sin(a) * rad]);
  }
  return poly(pts) + "Z";
}
const heartD = (cx: number, cy: number, s: number) =>
  `M${r1(cx)},${r1(cy + s * 0.9)} C${r1(cx - s * 1.3)},${r1(cy + s * 0.1)} ${r1(cx - s * 0.9)},${r1(cy - s * 0.9)} ${r1(cx)},${r1(cy - s * 0.35)} C${r1(cx + s * 0.9)},${r1(cy - s * 0.9)} ${r1(cx + s * 1.3)},${r1(cy + s * 0.1)} ${r1(cx)},${r1(cy + s * 0.9)}Z`;

const SPLINE = `calcMode="spline" keyTimes="0;0.5;1" keySplines="0.45 0 0.55 1;0.45 0 0.55 1"`;
function morph(d0: string, d1: string, dur: number, begin = 0) {
  return `<animate attributeName="d" values="${d0};${d1};${d0}" dur="${dur}s" begin="${begin}s" repeatCount="indefinite" ${SPLINE}/>`;
}

// ---------------------------------------------------------------------------------------------
// Geometry

const HEAD_D: Record<string, string> = {
  round: "M120,48 C151,48 170,70 170,101 C170,133 148,152 120,152 C92,152 70,133 70,101 C70,70 89,48 120,48Z",
  oval: "M120,46 C149,46 167,68 167,99 C167,133 146,154 120,154 C94,154 73,133 73,99 C73,68 91,46 120,46Z",
  square: "M94,49 L146,49 Q170,49 170,74 L170,122 Q170,152 138,152 L102,152 Q70,152 70,122 L70,74 Q70,49 94,49Z",
  heart: "M120,48 C154,48 171,68 171,96 C171,124 146,146 120,154 C94,146 69,124 69,96 C69,68 86,48 120,48Z",
};

type Arm = { pts: Pt[]; open?: boolean };
type Leg = { pts: Pt[]; shoe: number }; // shoe = rotation in degrees (0 = standing, toes outward by side)
type Pose = { back: Arm[]; front: Arm[]; top: Arm[]; legs: Leg[]; fly: boolean };

const ARM_L_HIP: Arm = { pts: [[88, 172], [64, 203], [85, 227]] };
const ARM_R_HIP: Arm = { pts: [[152, 172], [176, 203], [155, 227]] };
const LEGS_STAND: Leg[] = [{ pts: [[107, 234], [106, 290]], shoe: 0 }, { pts: [[133, 234], [134, 290]], shoe: 0 }];

const POSES: Record<string, Pose> = {
  hips: { back: [], front: [ARM_L_HIP, ARM_R_HIP], top: [], legs: LEGS_STAND, fly: false },
  wave: { back: [], front: [ARM_L_HIP], top: [{ pts: [[152, 172], [182, 160], [192, 124]], open: true }], legs: LEGS_STAND, fly: false },
  victory: { back: [], front: [ARM_L_HIP], top: [{ pts: [[152, 172], [182, 150], [184, 112]] }], legs: LEGS_STAND, fly: false },
  cross: {
    back: [],
    front: [{ pts: [[152, 172], [162, 200], [98, 194]] }, { pts: [[88, 172], [78, 208], [144, 214]] }],
    top: [],
    legs: LEGS_STAND,
    fly: false,
  },
  fly: {
    back: [{ pts: [[90, 174], [76, 202], [72, 230]] }],
    front: [],
    top: [{ pts: [[152, 172], [170, 142], [178, 108]] }],
    legs: [{ pts: [[108, 234], [102, 290]], shoe: 20 }, { pts: [[133, 234], [144, 262], [126, 286]], shoe: 50 }],
    fly: true,
  },
  rest: {
    back: [],
    front: [{ pts: [[88, 172], [82, 204], [84, 232]] }, { pts: [[152, 172], [158, 204], [156, 232]] }],
    top: [],
    legs: LEGS_STAND,
    fly: false,
  },
};

// ---------------------------------------------------------------------------------------------
// Render context

type Ctx = {
  c: HeroConfig;
  id: (s: string) => string;
  anim: boolean;
  skin: string; skinO: string;
  hair: string; hairO: string;
  eye: string;
  out: string; outO: string;
  mask: string; maskO: string;
  cape: string; trim: string;
  defs: string[];
  num: number;
};

const MOUTH_LIGHT = "#5B2125";
const MOUTH_DEEP = "#1E0A0C";
const EYE_DARK = "#2A1C22";

// ----- cape ---------------------------------------------------------------------------------

function capeStand(s: number): string {
  const w = (n: number) => r1(n);
  return `M92,160 C76,190 62,240 ${w(49 - s * 3)},296 Q${w(67 - s * 3)},${w(307 + s * 3)} ${w(84 - s * 2)},${w(300 - s)} Q${w(101 - s * 2)},${w(311 - s * 3)} ${w(120 - s)},${w(302 + s * 2)} Q${w(139 - s)},${w(311 + s * 3)} ${w(156)},${w(300 - s * 2)} Q${w(173 + s)},${w(307 - s * 3)} ${w(191 + s * 2)},296 C178,240 164,190 148,160Z`;
}
function capeStandEdge(s: number): string {
  const d = capeStand(s);
  return "M" + d.slice(d.indexOf("C76,190 62,240 ") + 15, d.lastIndexOf(" C178")).trim();
}
function capeFly(s: number): string {
  const w = (n: number) => r1(n);
  return `M94,160 C72,176 44,206 ${w(16 - s * 3)},248 Q${w(28 + s * 2)},${w(260)} ${w(20 - s * 3)},${w(272 + s)} Q${w(36 + s * 2)},${w(280)} ${w(30 - s * 2)},${w(294 + s * 2)} Q${w(50 + s)},${w(296)} ${w(48 - s * 2)},${w(310 + s * 2)} Q${w(68 + s)},${w(306 - s)} ${w(74 - s)},${w(320 + s)} C112,282 138,224 148,162Z`;
}
function capeFlyEdge(s: number): string {
  const d = capeFly(s);
  const a = d.indexOf("44,206 ") + 7;
  return "M" + d.slice(a, d.lastIndexOf(" C112")).trim();
}

function drawCape(x: Ctx, fly: boolean): string {
  const lining = shade(x.cape, 0.3);
  const O = ink(x.cape);
  const body = fly ? capeFly : capeStand;
  const edge = fly ? capeFlyEdge : capeStandEdge;
  const d0 = body(0), d1 = body(1), e0 = edge(0), e1 = edge(1);
  const a1 = x.anim ? morph(d0, d1, fly ? 1.4 : 3.2) : "";
  const a2 = x.anim ? morph(e0, e1, fly ? 1.4 : 3.2) : "";
  let s = `<path d="${d0}" fill="${x.cape}" stroke="${O}" stroke-width="${SW}" stroke-linejoin="round">${a1}</path>`;
  // trim edge
  s += `<path d="${e0}" fill="none" stroke="${O}" stroke-width="9" stroke-linecap="round" stroke-linejoin="round">${a2}</path>`;
  s += `<path d="${e0}" fill="none" stroke="${x.trim}" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round">${a2}</path>`;
  // fold shading
  if (fly) {
    s += line("M112,176 C96,216 80,262 70,300", lining, 3, 'opacity=".5"');
    s += line("M102,170 C84,200 62,236 46,276", lining, 3, 'opacity=".4"');
    s += `<path d="${starPts(84, 252, 10, 4.5, 5, -72)}" fill="${x.trim}" stroke="${ink(x.trim)}" stroke-width="2" stroke-linejoin="round"/>`;
  } else {
    s += line("M98,200 C90,236 84,262 82,292", lining, 3, 'opacity=".45"');
    s += line("M142,200 C150,236 156,262 158,292", lining, 3, 'opacity=".45"');
  }
  // stand-up collar behind the neck
  s += P("M90,168 Q80,146 96,140 Q120,150 144,140 Q160,146 150,168Z", lining, O);
  return s;
}

function clasps(x: Ctx): string {
  const O = ink(x.trim);
  return [92, 148].map((cx) => C(cx, 166, 6, x.trim, O, 2.2) + `<path d="${starPts(cx, 166.3, 3.6, 1.6)}" fill="${x.cape}"/>`).join("");
}

// ----- body -----------------------------------------------------------------------------------

const TORSO = "M86,163 Q120,153 154,163 Q161,166 161,175 L162,232 Q162,242 152,242 L88,242 Q78,242 78,232 L79,175 Q79,166 86,163Z";

type Look = { sleeve: "long" | "short"; top: string; pants: string; shoe: string; shoeTrim: string; glove?: string };

function look(x: Ctx): Look {
  const c = x.c.outfit;
  if (c === "cfk") return { sleeve: "long", top: "#004F81", pants: "#3A3F4E", shoe: "#F4F4F6", shoeTrim: "#FED438" };
  if (c === "supersuit") return { sleeve: "long", top: x.out, pants: shade(x.out, 0.12), shoe: x.trim, shoeTrim: shade(x.trim, 0.2), glove: x.trim };
  if (c === "formal") return { sleeve: "long", top: x.out, pants: shade(x.out, 0.2), shoe: "#4A2E22", shoeTrim: "#2E1C15" };
  if (c === "jersey") return { sleeve: "short", top: x.out, pants: "#2F3344", shoe: "#F4F4F6", shoeTrim: x.out };
  if (c === "tshirt") return { sleeve: "short", top: x.out, pants: "#3E5C8C", shoe: "#F4F4F6", shoeTrim: "#E5463D" };
  return { sleeve: "long", top: x.out, pants: "#3E5C8C", shoe: "#F4F4F6", shoeTrim: shade(x.out, 0.05) };
}

function drawLegs(x: Ctx, L: Look, legs: Leg[]): string {
  let s = "";
  const pO = ink(L.pants);
  for (const lg of legs) s += line(poly(lg.pts), pO, 27);
  for (const lg of legs) s += line(poly(lg.pts), L.pants, 21);
  legs.forEach((lg, i) => {
    const [ex, ey] = lg.pts[lg.pts.length - 1];
    const side = i === 0 ? -1 : 1;
    const rot = lg.shoe ? lg.shoe : 0;
    const sO = ink(L.shoe);
    s += `<g transform="translate(${r1(ex)} ${r1(ey + 4)}) rotate(${rot})">`;
    s += P(`M${-12 * (side < 0 ? 1.15 : 0.85)},4 Q${-13 * (side < 0 ? 1.2 : 0.8)},-8 0,-8 Q${13 * (side > 0 ? 1.2 : 0.8)},-8 ${12 * (side > 0 ? 1.15 : 0.85)},4 Z`, L.shoe, sO);
    s += line(`M${side < 0 ? -12 : -9},4 L${side < 0 ? 9 : 12},4`, sO, 5);
    s += line(`M${side < 0 ? -11 : -8},3 L${side < 0 ? 8 : 11},3`, L.shoeTrim, 2.6);
    s += `</g>`;
  });
  return s;
}

function drawArm(x: Ctx, L: Look, a: Arm): string {
  const d = poly(a.pts);
  const sO = ink(x.skin);
  let s = "";
  if (L.sleeve === "long") {
    s += line(d, ink(L.top), 22) + line(d, L.top, 16);
  } else {
    s += line(d, sO, 19) + line(d, x.skin, 13);
    const [p0, p1] = a.pts;
    const m: Pt = [p0[0] + (p1[0] - p0[0]) * 0.62, p0[1] + (p1[1] - p0[1]) * 0.62];
    s += line(poly([p0, m]), ink(L.top), 24) + line(poly([p0, m]), L.top, 18);
    if (x.c.outfit === "jersey") {
      const m2: Pt = [p0[0] + (p1[0] - p0[0]) * 0.5, p0[1] + (p1[1] - p0[1]) * 0.5];
      const m3: Pt = [p0[0] + (p1[0] - p0[0]) * 0.54, p0[1] + (p1[1] - p0[1]) * 0.54];
      s += `<path d="${poly([m2, m3])}" stroke="#ffffff" stroke-width="18"/>`;
    }
  }
  // hand
  const [hx, hy] = a.pts[a.pts.length - 1];
  const hand = L.glove ?? x.skin;
  const hO = ink(hand);
  if (a.open) {
    s += E(hx + 7, hy + 3, 3.6, 5, hand, hO, 2.6, `transform="rotate(30 ${r1(hx + 7)} ${r1(hy + 3)})"`);
    s += E(hx, hy - 1, 8.5, 10.5, hand, hO, SW);
    s += line(`M${hx - 3},${hy - 9} L${hx - 3},${hy - 4} M${hx + 1},${hy - 10} L${hx + 1},${hy - 4}`, hO, 1.6, 'opacity=".6"');
  } else {
    s += C(hx, hy, 9, hand, hO, SW);
    s += line(`M${hx - 4},${hy - 2} Q${hx},${hy - 4} ${hx + 4},${hy - 2}`, hO, 1.6, 'opacity=".5"');
  }
  return s;
}

function drawTorso(x: Ctx, L: Look): string {
  const c = x.c.outfit;
  const top = L.top;
  const O = ink(top);
  const clip = x.id("torso");
  x.defs.push(`<clipPath id="${clip}"><path d="${TORSO}"/></clipPath>`);
  let s = "";
  // hood (behind neck) for hoodies
  if (c === "hoodie" || c === "cfk") s += P("M90,170 Q86,150 104,146 L136,146 Q154,150 150,170Z", shade(top, 0.15), O);
  // neck
  s += `<rect x="109" y="136" width="22" height="34" rx="6" fill="${x.skin}" stroke="${ink(x.skin)}" stroke-width="${SW}"/>`;
  s += `<rect x="110.5" y="150" width="19" height="8" fill="${shade(x.skin, 0.14)}"/>`;
  if (x.c.mask === "cowl") s += `<rect x="109" y="136" width="22" height="30" rx="6" fill="${x.mask}" stroke="${x.maskO}" stroke-width="${SW}"/>`;
  s += P(TORSO, top, O);
  // side shading
  s += `<g clip-path="url(#${clip})"><path d="M146,150 L170,150 L170,250 L150,250 Q154,200 146,150Z" fill="#1c1630" opacity=".12"/></g>`;
  if (c === "hoodie" || c === "cfk") {
    s += P("M106,160 Q120,174 134,160 Q120,166 106,160Z", shade(top, 0.25), O, 2.4);
    const str = c === "cfk" ? "#F4F4F6" : tint(top, 0.6);
    s += line("M112,166 L111,188 M128,166 L129,188", O, 4.6) + line("M112,166 L111,188 M128,166 L129,188", str, 2.4);
    s += P("M98,212 L142,212 Q146,224 148,238 L92,238 Q94,224 98,212Z", shade(top, 0.1), O, 2.4);
    if (c === "cfk") {
      s += P(heartD(138, 184, 7), "#FED438", "#8a6a00", 2);
      s += `<text x="108" y="232" font-family="Arial Black,Arial,Helvetica,sans-serif" font-weight="900" font-size="10" fill="#FED438" letter-spacing=".5">CFK</text>`;
    }
  } else if (c === "jersey") {
    s += P("M104,160 L120,180 L136,160 Q120,166 104,160Z", x.skin, O, 2.4);
    s += line("M104,161 L120,181 L136,161", "#ffffff", 3.5);
    s += line("M78,226 L162,226", "#ffffff", 3, 'opacity=".9"');
    const n = String(x.num);
    s += `<text x="120" y="215" text-anchor="middle" font-family="Arial Black,Arial,Helvetica,sans-serif" font-weight="900" font-size="28" fill="#ffffff" stroke="${O}" stroke-width="2" paint-order="stroke">${n}</text>`;
  } else if (c === "tshirt") {
    s += P("M106,160 Q120,174 134,160 Q120,165 106,160Z", x.skin, O, 2.4);
    s += P("M124,180 L111,201 L120,201 L115,220 L131,195 L122,195 L127,180Z", "#ffffff", O, 2.2);
  } else if (c === "formal") {
    s += P("M104,160 L120,200 L136,160 Q120,166 104,160Z", "#ffffff", "#9aa1b0", 2);
    s += P("M117,166 L123,166 L125.5,192 L120,200 L114.5,192Z", x.cape, ink(x.cape), 2);
    s += P("M116,161 L124,161 L123,168 L117,168Z", x.cape, ink(x.cape), 2);
    s += P("M100,162 L120,202 L108,206 L94,172Z", shade(top, 0.15), O, 2.4);
    s += P("M140,162 L120,202 L132,206 L146,172Z", shade(top, 0.15), O, 2.4);
    s += C(120, 218, 2.2, shade(top, 0.4)) + C(120, 230, 2.2, shade(top, 0.4));
  } else if (c === "supersuit") {
    s += P("M106,160 Q120,170 134,160", "none", O, 2.4);
    s += P("M120,172 L140,184 L120,212 L100,184Z", x.trim, ink(x.trim), 2.6);
    s += `<path d="${starPts(120, 189, 9, 4)}" fill="${x.cape}" stroke="${ink(x.cape)}" stroke-width="1.6" stroke-linejoin="round"/>`;
    s += `<rect x="79" y="226" width="82" height="9" fill="${x.trim}" stroke="${ink(x.trim)}" stroke-width="2.4"/>`;
    s += `<rect x="113" y="224" width="14" height="13" rx="3" fill="${tint(x.trim, 0.4)}" stroke="${ink(x.trim)}" stroke-width="2.4"/>`;
  }
  return s;
}

// ----- head -----------------------------------------------------------------------------------

function eyeShape(x: Ctx, kind: string, side: number): string {
  const iris = x.eye;
  const hl = '<circle cx="-2.6" cy="-3.6" r="2.7" fill="#fff"/><circle cx="2.8" cy="3.2" r="1.3" fill="#fff"/>';
  switch (kind) {
    case "happy":
      return line("M-8,3 Q0,-7 8,3", EYE_DARK, 3.6);
    case "almond":
      return E(0, 1.5, 6.4, 7.4, iris) + C(0, 2, 3.4, EYE_DARK) + '<circle cx="-2.2" cy="-1.6" r="2.2" fill="#fff"/>' +
        P("M-10,0 Q-2,-10 10,-3 Q12,-2 11,0 Q2,-7 -10,0Z", EYE_DARK, EYE_DARK, 2) +
        line(side < 0 ? "M-10,0 L-12.5,-2.5" : "M10,-3 L12.5,-5.5", EYE_DARK, 2.4) + line("M-6,8 Q0,10.5 6,8", EYE_DARK, 1.6, 'opacity=".5"');
    case "sparkle":
      return E(0, 0, 9.4, 11, EYE_DARK) + E(0, 1.5, 7.3, 8.8, iris) + E(0, 4, 5.5, 4.5, tint(iris, 0.25), undefined, 0, 'opacity=".8"') +
        C(0, 1.5, 3.6, EYE_DARK) + `<path d="${starPts(-2.6, -3.6, 4.4, 1.5, 4, -90)}" fill="#fff"/>` + '<circle cx="3.2" cy="4" r="1.6" fill="#fff"/><circle cx="4.6" cy="-4.5" r="1" fill="#fff"/>';
    case "sleepy":
      return E(0, 2, 7.5, 8.5, EYE_DARK) + E(0, 3, 5.8, 6.8, iris) + C(0, 3.5, 3, EYE_DARK) + '<circle cx="2.5" cy="5.5" r="1.4" fill="#fff"/>' +
        P("M-11,-12 L11,-12 L11,0.5 Q0,-4 -11,0.5Z", x.skin) + line("M-9.5,1 Q0,-3.6 9.5,1", EYE_DARK, 3.2);
    default:
      return E(0, 0, 8.6, 10.2, EYE_DARK) + E(0, 1.3, 6.6, 8.2, iris) + C(0, 1.8, 3.4, EYE_DARK) + hl;
  }
}

function drawEyes(x: Ctx): string {
  const blink = x.anim
    ? `<animateTransform attributeName="transform" type="scale" values="1 1;1 1;1 0.1;1 1;1 1" keyTimes="0;0.92;0.95;0.98;1" dur="4.6s" repeatCount="indefinite"/>`
    : "";
  return ([[100, -1], [140, 1]] as const).map(([cx, side]) => {
    let kind = x.c.eyes;
    if (x.c.expression === "laughing" && kind !== "sleepy") kind = "happy";
    if (x.c.expression === "wink" && side > 0) kind = "happy";
    const b = kind === "happy" ? "" : blink;
    return `<g transform="translate(${cx} 110)"><g>${b}${eyeShape(x, kind, side)}</g></g>`;
  }).join("");
}

function drawBrows(x: Ctx, color: string): string {
  const b = x.c.brows;
  const ex = x.c.expression;
  const w = b === "bold" ? 5.2 : b === "straight" ? 4.2 : 3.6;
  const d = b === "arched" ? "M-9,2.5 Q-3,-5 9,0" : b === "straight" ? "M-8,0 L8,0" : "M-8,1.5 Q0,-3 8,0.5";
  const rot = ex === "determined" ? 14 : ex === "calm" ? -4 : 0;
  const dy = ex === "laughing" || ex === "grin" ? -2.5 : ex === "determined" ? 2 : 0;
  return ([[100, 1], [140, -1]] as const).map(([cx, m]) =>
    `<g transform="translate(${cx} ${r1(91 + dy)}) scale(${-m} 1) rotate(${rot})">${line(d, color, w)}</g>`).join("");
}

function drawMouth(x: Ctx): string {
  const MOUTH = lum(x.skin) < 0.4 ? MOUTH_DEEP : MOUTH_LIGHT;
  switch (x.c.expression) {
    case "grin":
      return P("M105,129 L135,129 Q133,146 120,146 Q107,146 105,129Z", MOUTH, ink(x.skin), 2.6) +
        P("M107.5,130.5 L132.5,130.5 L131.5,135 L108.5,135Z", "#ffffff") + E(120, 142, 6, 2.6, "#F27A86");
    case "laughing":
      return P("M103,127 Q120,124 137,127 Q135,152 120,152 Q105,152 103,127Z", MOUTH, ink(x.skin), 2.6) +
        P("M106,128.5 Q120,126.5 134,128.5 L133,132.5 Q120,131 107,132.5Z", "#ffffff") + E(120, 146, 8, 4.4, "#F27A86");
    case "determined":
      return line("M109,135 Q121,138 132,130", MOUTH, 3.2);
    case "calm":
      return line("M113,133 Q120,138 127,133", MOUTH, 3);
    case "wink":
      return P("M108,130 Q120,146 132,130 Q120,134 108,130Z", MOUTH, MOUTH, 2.4) + E(121, 138.5, 4, 2, "#F27A86");
    default:
      return line("M108,130 Q120,143 132,130", MOUTH, 3.2);
  }
}

function drawFacialHair(x: Ctx, headClip: string): string {
  const fh = x.c.facialHair;
  const col = x.hair, O = x.hairO;
  if (fh === "stubble")
    return `<g clip-path="url(#${headClip})">${P("M72,112 Q78,152 120,156 Q162,152 168,112 Q160,130 146,126 Q132,123 120,125 Q108,123 94,126 Q80,130 72,112Z", mix(col, x.skinO, 0.3), undefined, 0, 'opacity=".22"')}</g>`;
  const stache = P("M106,128.5 Q112,121.5 120,125 Q128,121.5 134,128.5 Q128,131 120,128.5 Q112,131 106,128.5Z", col, O, 2.2);
  if (fh === "mustache") return stache;
  if (fh === "beard")
    return `<g clip-path="url(#${headClip})">${P("M64,100 L76,100 Q78,136 104,140 Q112,144 120,144 Q128,144 136,140 Q162,136 164,100 L176,100 L176,170 L64,170Z", col)}</g>` +
      P("M70,104 Q74,144 104,150 Q120,160 136,150 Q166,144 170,104", "none", O, 2.6, 'opacity=".9"') + stache;
  return "";
}

function drawMask(x: Ctx, headClip: string): { under: string; over: string } {
  const m = x.c.mask, col = x.mask, O = x.maskO;
  if (m === "domino") {
    const d = "M70,104 Q72,93 96,95 Q110,97 120,101 Q130,97 144,95 Q168,93 170,104 Q172,118 160,123 Q148,127 134,119 Q127,115 120,115 Q113,115 106,119 Q92,127 80,123 Q68,118 70,104Z" +
      " M89,110 a11,10.5 0 1,0 22,0 a11,10.5 0 1,0 -22,0Z M129,110 a11,10.5 0 1,0 22,0 a11,10.5 0 1,0 -22,0Z";
    return { under: "", over: P(d, col, O, 2.6, 'fill-rule="evenodd"') + line("M78,100 Q90,96 100,97", tint(col, 0.35), 2, 'opacity=".6"') };
  }
  if (m === "half") {
    x.defs.push(`<clipPath id="${x.id("lowclip")}"><rect x="50" y="116" width="140" height="60"/></clipPath>`);
    const body = `<g clip-path="url(#${headClip})">${P("M60,119 Q120,111 180,119 L180,170 L60,170Z", col)}${line("M84,134 Q120,128 156,134", shade(col, 0.2), 2, 'opacity=".7"')}${P("M60,119 Q120,111 180,119", "none", O, 2.6)}</g>`;
    return { under: "", over: body + P(HEAD_D[x.c.face], "none", O, SW, `clip-path="url(#${x.id("lowclip")})"`) + P("M106,149 L120,170 L134,149 Q120,154 106,149Z", col, O, 2.4) + C(120, 140, 2.2, tint(col, 0.5)) + C(110, 146, 1.6, tint(col, 0.5)) + C(131, 146, 1.6, tint(col, 0.5)) };
  }
  if (m === "cowl") {
    const big = x.id("cowlclip");
    x.defs.push(`<clipPath id="${big}"><path d="${HEAD_D[x.c.face]}" transform="translate(120 101) scale(1.07) translate(-120 -101)"/></clipPath>`);
    const holes = " M87,111 Q88,97 101,98 Q114,100 114,111 Q112,123 100,123 Q88,122 87,111Z M153,111 Q152,97 139,98 Q126,100 126,111 Q128,123 140,123 Q152,122 153,111Z";
    const cover = "M50,20 L190,20 L190,180 L160,180 L160,128 Q148,118 120,121 Q92,118 80,128 L80,180 L50,180Z" + holes;
    const ears = P("M84,68 L80,30 L102,54Z", col, O) + P("M156,68 L160,30 L138,54Z", col, O);
    const outline = `<path d="${HEAD_D[x.c.face]}" transform="translate(120 101) scale(1.07) translate(-120 -101)" fill="none" stroke="${O}" stroke-width="${SW}"/>`;
    return {
      under: ears,
      over: `<g clip-path="url(#${big})">${P(cover, col, undefined, 0, 'fill-rule="evenodd"')}${P(cover, "none", O, 2.6)}${line("M86,62 Q100,54 112,54", tint(col, 0.35), 3, 'opacity=".55"')}</g>` + outline,
    };
  }
  return { under: "", over: "" };
}

function drawGlasses(x: Ctx): string {
  const g = x.c.glasses;
  const fr = "#2B2B3A";
  const lens = 'fill="#ffffff" fill-opacity=".18"';
  const arms = line("M88,107 L71,103 M152,107 L169,103", fr, 2.6);
  if (g === "round")
    return arms + C(100, 110, 12.5, "#ffffff", fr, 3, 'fill-opacity=".18"') + C(140, 110, 12.5, "#ffffff", fr, 3, 'fill-opacity=".18"') + line("M112.5,108 Q120,104 127.5,108", fr, 3);
  if (g === "square")
    return arms + `<rect x="87" y="99" width="26" height="21" rx="5" ${lens} stroke="${fr}" stroke-width="3.2"/><rect x="127" y="99" width="26" height="21" rx="5" ${lens} stroke="${fr}" stroke-width="3.2"/>` + line("M113,106 Q120,103 127,106", fr, 3.2);
  if (g === "star") {
    const st = "#FF5FA2";
    return line("M88,107 L71,103 M152,107 L169,103", st, 2.6) + [100, 140].map((cx) => `<path d="${starPts(cx, 111, 16, 8.5)}" fill="#ffd1e6" fill-opacity=".35" stroke="${st}" stroke-width="3" stroke-linejoin="round"/>`).join("") + line("M112,106 Q120,103 128,106", st, 3);
  }
  if (g === "goggles") {
    const strap = shade(x.mask, 0.3);
    return line("M66,106 L82,106 M158,106 L174,106", ink(strap), 8) + line("M66,106 L82,106 M158,106 L174,106", strap, 5) +
      `<rect x="81" y="97" width="78" height="27" rx="13" fill="#7FD8FF" fill-opacity=".5" stroke="${fr}" stroke-width="3.4"/>` +
      line("M120,99 L120,122", fr, 3) + line("M88,104 L96,104 M128,104 L136,104", "#ffffff", 2.6, 'opacity=".8"');
  }
  return "";
}

// ----- hair ------------------------------------------------------------------------------------

type HairLayers = { back: string; front: string };

function shine(x: Ctx, d = "M96,47 Q110,40 128,42"): string {
  return line(d, tint(x.hair, 0.4), 4, 'opacity=".75"');
}

function curlRing(cx: number, cy: number, rx: number, ry: number, from: number, to: number, n: number, r: number): [number, number, number][] {
  const out: [number, number, number][] = [];
  for (let i = 0; i < n; i++) {
    const a = ((from + ((to - from) * i) / (n - 1)) * Math.PI) / 180;
    out.push([cx + Math.cos(a) * rx, cy + Math.sin(a) * ry, r]);
  }
  return out;
}

function drawHair(x: Ctx): HairLayers {
  const h = x.c.hair, H = x.hair, O = x.hairO;
  const capFull = "M64,112 C57,58 84,34 120,34 C156,34 183,58 176,112";
  const parted = capFull + " L171,112 C170,92 160,74 140,68 C130,66 124,70 120,74 C116,70 110,66 100,68 C80,74 70,92 69,112Z";
  switch (h) {
    case "short":
      return { back: "", front: P(capFull + " L171,112 C170,96 166,84 160,77 C146,82 126,80 112,69 C103,79 88,84 77,83 C73,91 71,101 69,112Z", H, O) + shine(x) };
    case "buzz":
      return { back: "", front: P("M69,99 C66,60 92,43 120,43 C148,43 174,60 171,99 C163,80 145,70 120,70 C95,70 77,80 69,99Z", H, O, 2.4, 'fill-opacity=".92"') + line("M100,50 Q112,46 124,47", tint(H, 0.35), 3, 'opacity=".6"') };
    case "side-part":
      return { back: "", front: P("M64,112 C55,56 84,30 124,31 C162,32 185,58 176,112 L171,112 C171,94 166,82 158,75 C138,70 108,74 92,60 C88,72 80,80 71,86 C70,94 69,104 69,112Z", H, O) + line("M92,60 Q94,46 104,37", O, 2.4) + shine(x, "M110,40 Q132,36 150,46") };
    case "curly-short": {
      const curls = curlRing(120, 84, 52, 44, 192, 348, 10, 12);
      const bangs: [number, number, number][] = [[80, 82, 10], [92, 74, 11], [107, 70, 11], [122, 70, 11], [137, 72, 11], [150, 77, 10], [161, 85, 9]];
      return { back: "", front: P("M66,108 C60,56 86,38 120,38 C154,38 180,56 174,108 L160,90 L80,90Z", H, O) + blob([...curls, ...bangs], H, O, 2.4) };
    }
    case "afro": {
      const ring = curlRing(120, 84, 58, 50, 0, 345, 24, 22);
      const bangs = curlRing(120, 92, 46, 24, 196, 344, 9, 10);
      return {
        back: blob([...ring, [120, 84, 60]], H, O),
        front: P("M68,100 C64,54 90,42 120,42 C150,42 176,54 172,100 Q160,80 120,74 Q80,80 68,100Z", H) + blob(bangs, H, O) + line("M84,56 Q100,46 116,46", tint(H, 0.3), 4, 'opacity=".55"'),
      };
    }
    case "puff": {
      const puff = curlRing(120, 30, 20, 16, 0, 345, 16, 12);
      return {
        back: "",
        front: blob([...puff, [120, 30, 22]], H, O) + P("M67,108 C62,62 86,45 120,45 C154,45 178,62 173,108 L169,108 C167,86 150,71 120,71 C90,71 73,86 71,108Z", H, O) +
          `<rect x="106" y="46" width="28" height="8" rx="4" fill="${x.trim}" stroke="${ink(x.trim)}" stroke-width="2.2"/>` + line("M90,56 Q104,49 116,49", tint(H, 0.35), 3, 'opacity=".6"'),
      };
    }
    case "long-straight":
      return {
        back: P("M64,92 C58,38 182,38 176,92 L182,214 Q120,226 58,214Z", shade(H, 0.12), O),
        front: P(capFull + " L177,198 Q171,204 164,198 L164,110 C161,92 148,76 122,68 C104,74 88,88 76,110 L76,198 Q69,204 63,198Z", H, O) + shine(x) + line("M70,130 L70,190 M170,130 L170,190", shade(H, 0.2), 2, 'opacity=".6"'),
      };
    case "long-wavy":
      return {
        back: P("M64,90 C58,38 182,38 176,90 Q188,128 177,160 Q190,190 179,216 Q120,230 61,216 Q50,190 63,160 Q52,128 64,90Z", shade(H, 0.12), O),
        front: P(capFull + " Q184,136 172,160 Q184,184 172,204 Q164,208 160,200 Q168,180 160,160 Q170,136 162,112 C158,92 146,76 122,68 C104,74 88,88 78,112 Q70,136 80,160 Q72,180 80,200 Q76,208 68,204 Q56,184 68,160 Q56,136 64,112Z", H, O) + shine(x),
      };
    case "ponytail":
      return {
        back: P("M150,62 C204,48 214,118 196,168 Q190,186 176,194 Q190,154 176,114 Q168,86 148,76Z", H, O) + line("M186,100 Q194,130 186,160", shade(H, 0.2), 2.4, 'opacity=".7"'),
        front: P("M66,108 C59,58 86,37 120,37 C154,37 181,58 174,108 L170,108 C168,86 152,71 130,68 Q114,75 96,72 C84,79 74,91 70,108Z", H, O) + C(160, 66, 6, x.trim, ink(x.trim), 2.2) + shine(x),
      };
    case "bun":
      return {
        back: "",
        front: blob([[120, 30, 20]], H, O) + line("M108,26 Q120,18 132,26", shade(H, 0.25), 2.4) + P("M66,108 C59,60 86,40 120,40 C154,40 181,60 174,108 L170,108 C168,86 150,71 120,70 C90,71 72,86 70,108Z", H, O) +
          `<rect x="107" y="42" width="26" height="7" rx="3.5" fill="${x.trim}" stroke="${ink(x.trim)}" stroke-width="2.2"/>` + line("M88,58 Q100,50 112,50", tint(H, 0.35), 3, 'opacity=".6"'),
      };
    case "space-buns":
      return {
        back: "",
        front: blob([[78, 48, 18], [162, 48, 18]], H, O) + line("M70,42 Q78,36 86,42 M154,42 Q162,36 170,42", shade(H, 0.25), 2.4) + P(parted, H, O) + shine(x, "M84,60 Q94,50 108,46"),
      };
    case "braids": {
      const braid = (bx: number) => {
        let s = "";
        for (let i = 0; i < 6; i++) s += E(bx + (i % 2 ? 1 : -1), 118 + i * 14, 9 - i * 0.4, 9.5, H, O, 2.6);
        return s + `<rect x="${bx - 6}" y="196" width="12" height="6" rx="3" fill="${x.trim}" stroke="${ink(x.trim)}" stroke-width="2"/>` + P(`M${bx - 6},202 L${bx},214 L${bx + 6},202Z`, H, O, 2.4);
      };
      return { back: P("M66,90 C62,44 178,44 174,90 L174,130 L66,130Z", shade(H, 0.12), O), front: braid(70) + braid(170) + P(parted, H, O) + shine(x, "M84,62 Q94,50 108,46") };
    }
    case "box-braids": {
      let tex = "";
      for (let bx = 70; bx <= 170; bx += 9) tex += line(`M${bx},120 L${bx + (bx < 120 ? -4 : 4)},216`, shade(H, 0.32), 2, 'opacity=".8"');
      let strands = "";
      for (const bx of [63, 71, 169, 177]) strands += line(`M${bx},106 L${bx + (bx < 120 ? -2 : 2)},${bx === 63 || bx === 177 ? 204 : 212}`, O, 7.5) + line(`M${bx},106 L${bx + (bx < 120 ? -2 : 2)},${bx === 63 || bx === 177 ? 204 : 212}`, H, 4.2);
      return {
        back: P("M62,92 C56,36 184,36 178,92 L186,218 Q120,230 54,218Z", shade(H, 0.12), O) + tex,
        front: strands + P(parted, H, O) + line("M86,56 L80,74 M100,44 L96,62 M140,44 L144,62 M154,56 L160,74", shade(H, 0.3), 2, 'opacity=".8"') + shine(x, "M84,60 Q94,50 108,46"),
      };
    }
    case "locs": {
      const loc = (x0: number, y0: number, x1: number, y1: number) => line(`M${x0},${y0} Q${(x0 + x1) / 2 + (x0 < 120 ? -4 : 4)},${(y0 + y1) / 2} ${x1},${y1}`, O, 11) + line(`M${x0},${y0} Q${(x0 + x1) / 2 + (x0 < 120 ? -4 : 4)},${(y0 + y1) / 2} ${x1},${y1}`, H, 7);
      return {
        back: P("M62,92 C56,36 184,36 178,92 L184,184 Q120,194 56,184Z", shade(H, 0.12), O),
        front: loc(68, 100, 64, 178) + loc(77, 96, 76, 170) + loc(172, 100, 176, 178) + loc(163, 96, 164, 170) +
          P("M64,108 C57,56 84,34 120,34 C156,34 183,56 176,108 L168,104 C164,90 156,80 146,76 L140,90 L132,74 L122,88 L112,72 L102,88 L94,76 C84,80 76,90 72,104Z", H, O) +
          line("M98,46 L96,60 M112,40 L112,56 M128,40 L128,56 M142,46 L144,60", shade(H, 0.3), 2, 'opacity=".8"'),
      };
    }
    case "mohawk":
      return {
        back: "",
        front: P("M70,99 C67,62 92,45 120,45 C148,45 173,62 170,99 C163,80 145,72 120,72 C95,72 77,80 70,99Z", H, undefined, 0, 'opacity=".45"') +
          P("M106,74 Q96,50 102,32 L112,42 Q110,20 122,8 L126,30 Q136,16 148,18 L140,40 Q152,40 152,52 L136,76 Q121,70 106,74Z", H, O) + line("M114,40 Q118,26 122,18", tint(H, 0.35), 3, 'opacity=".7"'),
      };
    case "bob":
      return {
        back: P("M62,92 C56,36 184,36 178,92 L182,150 Q120,160 58,150Z", shade(H, 0.12), O),
        front: P("M62,112 C55,56 84,34 120,34 C156,34 185,56 178,112 L180,150 Q172,156 164,150 C166,120 166,92 158,80 C140,86 104,86 82,80 C74,92 74,120 76,150 Q68,156 60,150Z", H, O) + shine(x),
      };
    case "bald":
      return { back: "", front: E(104, 62, 10, 5, "#ffffff", undefined, 0, 'opacity=".28" transform="rotate(-20 104 62)"') };
    case "hijab": {
      const F = H, FO = ink(H);
      const outer = "M60,106 C56,44 90,30 120,30 C150,30 184,44 180,106 C181,136 172,156 160,166 Q186,176 178,200 Q120,214 62,200 Q54,176 80,166 C68,156 59,136 60,106Z";
      const hole = " M120,58 C146,58 160,78 160,105 C160,134 143,150 120,150 C97,150 80,134 80,105 C80,78 94,58 120,58Z";
      return {
        back: P("M58,104 C54,44 90,28 120,28 C150,28 186,44 182,104 L188,184 Q120,200 52,184Z", shade(F, 0.15), FO),
        front: P(outer + hole, F, FO, SW, 'fill-rule="evenodd"') + P(hole.trim(), "none", shade(F, 0.3), 3) + line("M76,176 Q100,192 132,184 M150,170 Q162,184 170,196", shade(F, 0.2), 2.2, 'opacity=".7"') + line("M78,60 Q98,40 122,38", tint(F, 0.4), 4, 'opacity=".55"'),
      };
    }
    case "beanie": {
      const B = x.cape, BO = ink(x.cape);
      let ribs = "";
      for (let i = 72; i <= 168; i += 8) ribs += line(`M${i},78 L${i},88`, shade(B, 0.25), 1.6, 'opacity=".7"');
      return {
        back: "",
        front: P("M66,114 C62,98 64,88 70,82 L84,92 Q78,104 72,114Z", H, O, 2.4) + P("M174,114 C178,98 176,88 170,82 L156,92 Q162,104 168,114Z", H, O, 2.4) +
          P("M64,82 C62,40 90,24 120,24 C150,24 178,40 176,82Z", B, BO) + line("M88,40 Q104,30 120,30", tint(B, 0.35), 4, 'opacity=".6"') +
          `<rect x="61" y="74" width="118" height="18" rx="9" fill="${shade(B, 0.1)}" stroke="${BO}" stroke-width="${SW}"/>` + ribs + blob([[120, 22, 10], [113, 18, 6], [127, 18, 6], [120, 14, 6]], x.trim, ink(x.trim), 2.6),
      };
    }
    case "headband":
      return {
        back: P("M62,92 C56,36 184,36 178,92 L184,176 Q120,188 56,176Z", shade(H, 0.12), O),
        front: P(capFull + " L180,176 Q172,182 166,176 C168,140 168,108 160,92 C150,96 120,96 80,92 C72,108 72,140 74,176 Q68,182 60,176Z", H, O) +
          line("M66,96 C64,58 92,42 120,42 C148,42 176,58 174,96", ink(x.trim), 11) + line("M66,96 C64,58 92,42 120,42 C148,42 176,58 174,96", x.trim, 7) +
          P("M84,92 Q90,74 102,70 Q100,82 110,90 Q116,74 128,72 Q126,84 136,92 Q144,80 154,80 Q156,88 158,94 Z", H, O, 2.4),
      };
    default:
      return { back: "", front: "" };
  }
}

// ----- backgrounds ----------------------------------------------------------------------------

const BG_STARS: Pt[] = (() => {
  const r = mulberry32(20240607);
  return Array.from({ length: 26 }, () => [r(), r() * 0.75] as Pt);
})();

function drawBackground(x: Ctx, w: number, h: number): string {
  const bg = x.c.background;
  const g = x.id("bg");
  const lin = (stops: [number, string][]) =>
    x.defs.push(`<linearGradient id="${g}" x1="0" y1="0" x2="0" y2="1">${stops.map(([o2, c]) => `<stop offset="${o2}" stop-color="${c}"/>`).join("")}</linearGradient>`);
  const rect = `<rect width="${w}" height="${h}" fill="url(#${g})"/>`;
  const k = w / 240; // scale factor for decorations
  const stars = (n: number, col: string, size: number) =>
    BG_STARS.slice(0, n).map(([px, py], i) => {
      const cx = px * w, cy = py * h, s = (i % 3 === 0 ? 1.6 : 1) * size * Math.max(k, 0.6);
      const tw = x.anim && i % 4 === 0 ? `<animate attributeName="opacity" values="1;.3;1" dur="${2 + (i % 5) * 0.6}s" repeatCount="indefinite"/>` : "";
      return i % 3 === 0 ? `<path d="${starPts(cx, cy, s * 1.6, s * 0.5, 4)}" fill="${col}">${tw}</path>` : `<circle cx="${r1(cx)}" cy="${r1(cy)}" r="${r1(s * 0.7)}" fill="${col}" opacity=".85">${tw}</circle>`;
    }).join("");
  if (bg === "night") {
    lin([[0, "#0E1A40"], [0.7, "#2B2668"], [1, "#4A3584"]]);
    return rect + stars(22, "#ffffff", 1.6) + C(w * 0.8, h * 0.13, 15 * k, "#FFF2C2") + C(w * 0.8 + 6 * k, h * 0.13 - 3 * k, 12 * k, "#2A2565");
  }
  if (bg === "space") {
    lin([[0, "#070B22"], [1, "#24124E"]]);
    return rect + stars(26, "#ffffff", 1.5) + C(w * 0.17, h * 0.17, 16 * k, "#F28AB8") + E(w * 0.17, h * 0.17, 27 * k, 6 * k, "none", "#FFD86B", 3 * k, `transform="rotate(-18 ${r1(w * 0.17)} ${r1(h * 0.17)})"`) +
      C(w * 0.85, h * 0.62, 7 * k, "#7AD3FF", undefined, 0, 'opacity=".8"');
  }
  if (bg === "clouds") {
    lin([[0, "#5DB6F5"], [1, "#CDEEFF"]]);
    const cl = (cx: number, cy: number, s: number) => blob([[cx, cy, 16 * s], [cx - 18 * s, cy + 6 * s, 12 * s], [cx + 18 * s, cy + 6 * s, 12 * s], [cx, cy + 9 * s, 13 * s]], "#ffffff", null);
    return rect + `<g opacity=".95">${cl(w * 0.2, h * 0.16, k)}${cl(w * 0.82, h * 0.34, k * 0.8)}${cl(w * 0.12, h * 0.7, k * 1.1)}${cl(w * 0.86, h * 0.86, k * 1.3)}</g>`;
  }
  if (bg === "sunrise") {
    lin([[0, "#FF9EB5"], [0.55, "#FFC48A"], [1, "#FFE6A0"]]);
    const sx = w * 0.5, sy = h * 0.8, R = 70 * k;
    let rays = "";
    for (let i = 0; i < 9; i++) {
      const a = Math.PI + (i + 0.5) * (Math.PI / 9);
      rays += line(`M${r1(sx + Math.cos(a) * R * 1.2)},${r1(sy + Math.sin(a) * R * 1.2)} L${r1(sx + Math.cos(a) * R * 1.6)},${r1(sy + Math.sin(a) * R * 1.6)}`, "#FFF4C4", 5 * k, 'opacity=".8"');
    }
    return rect + rays + C(sx, sy, R, "#FFF1B0") + P(`M0,${r1(h * 0.84)} Q${r1(w * 0.3)},${r1(h * 0.76)} ${r1(w * 0.6)},${r1(h * 0.86)} T${w},${r1(h * 0.82)} L${w},${h} L0,${h}Z`, "#7CC28C") +
      P(`M0,${r1(h * 0.92)} Q${r1(w * 0.5)},${r1(h * 0.84)} ${w},${r1(h * 0.93)} L${w},${h} L0,${h}Z`, "#56A872");
  }
  if (bg === "city") {
    lin([[0, "#4B347F"], [0.55, "#C65B8C"], [1, "#FFA45E"]]);
    const bld: [number, number, number][] = [[0, 0.62, 0.16], [0.14, 0.5, 0.14], [0.27, 0.66, 0.12], [0.37, 0.56, 0.16], [0.52, 0.7, 0.1], [0.6, 0.46, 0.15], [0.74, 0.6, 0.13], [0.86, 0.52, 0.14]];
    let s = rect + C(w * 0.7, h * 0.6, 26 * k, "#FFD27A", undefined, 0, 'opacity=".9"');
    for (const [bx, by, bw] of bld) {
      s += `<rect x="${r1(bx * w)}" y="${r1(by * h)}" width="${r1(bw * w + 1)}" height="${r1(h - by * h)}" fill="#3A2A5E"/>`;
      for (let wy = by * h + 8 * k; wy < h * 0.86; wy += 12 * k)
        for (let wx = bx * w + 5 * k; wx < (bx + bw) * w - 6 * k; wx += 9 * k)
          if ((Math.round(wx * 7 + wy * 3) % 5) < 2) s += `<rect x="${r1(wx)}" y="${r1(wy)}" width="${r1(4 * k)}" height="${r1(5 * k)}" fill="#FFD86B" opacity=".85"/>`;
    }
    return s + `<rect x="0" y="${r1(h * 0.88)}" width="${w}" height="${r1(h * 0.12)}" fill="#2A1E44"/><rect x="0" y="${r1(h * 0.88)}" width="${w}" height="${r1(4 * k)}" fill="#55407E"/>`;
  }
  return "";
}

// ---------------------------------------------------------------------------------------------

function character(x: Ctx, poseId: string): string {
  const pose = POSES[poseId] ?? POSES.hips;
  const L = look(x);
  const headClip = x.id("head");
  x.defs.push(`<clipPath id="${headClip}"><path d="${HEAD_D[x.c.face]}"/></clipPath>`);
  const cowl = x.c.mask === "cowl";
  const hair = cowl ? { back: "", front: "" } : drawHair(x);
  const mask = drawMask(x, headClip);
  const browColor = x.c.hair === "hijab" || x.c.hair === "bald" ? mix(x.hair, "#2a1c16", 0.55) : mix(x.hair, "#2a1c16", lum(x.hair) > 0.6 ? 0.45 : 0.2);

  let s = "";
  s += drawCape(x, pose.fly);
  s += hair.back;
  s += pose.back.map((a) => drawArm(x, L, a)).join("");
  s += drawLegs(x, L, pose.legs);
  s += drawTorso(x, L);
  // A hijab drapes over the chest, so arms that rest in front of the body go over it.
  const drape = x.c.hair === "hijab" && !cowl;
  const front = drape ? [] : pose.front;
  const fromUnderDrape = (a: Arm): Arm => {
    const [p0, p1, ...rest] = a.pts;
    return { ...a, pts: [[p0[0] + (p1[0] - p0[0]) * 0.4, p0[1] + (p1[1] - p0[1]) * 0.4], p1, ...rest] };
  };
  const top = drape ? [...pose.front, ...pose.top].map(fromUnderDrape) : pose.top;
  s += front.map((a) => drawArm(x, L, a)).join("");
  s += clasps(x);
  // head
  s += mask.under;
  if (!cowl && x.c.hair !== "hijab") {
    s += E(70, 110, 8, 11, x.skin, x.skinO) + E(170, 110, 8, 11, x.skin, x.skinO);
    s += line("M68,106 Q72,110 69,115 M172,106 Q168,110 171,115", x.skinO, 2, 'opacity=".5"');
  }
  s += P(HEAD_D[x.c.face], x.skin, x.skinO);
  s += E(86, 125, 7.5, 4.5, "#FF7B8A", undefined, 0, 'opacity=".38"') + E(154, 125, 7.5, 4.5, "#FF7B8A", undefined, 0, 'opacity=".38"');
  if (x.c.freckles) {
    const fc = mix(x.skin, "#5a2e1a", 0.45);
    s += [[82, 120], [88, 118], [85, 124], [158, 120], [152, 118], [155, 124]].map(([fx, fy]) => C(fx, fy, 1.4, fc, undefined, 0, 'opacity=".75"')).join("");
  }
  s += drawEyes(x);
  s += line("M117,121 Q120,124 123,121", x.skinO, 2.2, 'opacity=".7"');
  s += drawFacialHair(x, headClip);
  s += drawMouth(x);
  s += mask.over;
  s += drawBrows(x, cowl ? shade(x.mask, 0.55) : browColor);
  s += hair.front;
  s += drawGlasses(x);
  s += top.map((a) => drawArm(x, L, a)).join("");
  return s;
}

export function heroSvg(
  cfg: HeroConfig,
  opts: { view: "full" | "head"; capeColor: string; capeTrim?: string; animate?: boolean; idPrefix?: string; title?: string },
): string {
  const c = sanitizeHero(cfg);
  const view = opts?.view === "head" ? "head" : "full";
  const anim = opts?.animate !== false;
  let pre = typeof opts?.idPrefix === "string" ? opts.idPrefix.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 32) : "";
  if (!pre) pre = "h" + Math.random().toString(36).slice(2, 8);
  if (!/^[A-Za-z]/.test(pre)) pre = "h" + pre;
  const cape = safeHex(opts?.capeColor, "#004F81");
  const trim = safeHex(opts?.capeTrim, "#FED438");
  const skin = SWATCH.skin.get(c.skin) as string;
  const hair = SWATCH.hairColor.get(c.hairColor) as string;
  const out = SWATCH.outfitColor.get(c.outfitColor) as string;
  const mask = SWATCH.maskColor.get(c.maskColor) as string;
  let num = 0;
  for (const ch of c.skin + c.hair + c.hairColor + c.outfitColor + c.face) num = (num * 31 + ch.charCodeAt(0)) % 997;
  const x: Ctx = {
    c, id: (s) => `${pre}-${s}`, anim,
    skin, skinO: ink(skin), hair, hairO: ink(hair), eye: SWATCH.eyeColor.get(c.eyeColor) as string,
    out, outO: ink(out), mask, maskO: ink(mask), cape, trim, defs: [], num: (num % 99) + 1,
  };
  const title = typeof opts?.title === "string" && opts.title ? `<title>${esc(opts.title)}</title>` : "";
  const head = `xmlns="http://www.w3.org/2000/svg" role="img"`;

  if (view === "head") {
    const clip = x.id("frame");
    x.defs.push(`<clipPath id="${clip}"><circle cx="60" cy="60" r="60"/></clipPath>`);
    const bg = c.background === "none" ? `<rect width="120" height="120" fill="${mix(cape, "#ffffff", 0.72)}"/>` : drawBackground(x, 120, 120);
    const body = character(x, "rest");
    const s = 0.7;
    const inner = `<g transform="translate(${r1(60 - 120 * s)} ${r1(63 - 104 * s)}) scale(${s})">${body}</g>`;
    return `<svg ${head} viewBox="0 0 120 120" width="120" height="120">${title}<defs>${x.defs.join("")}</defs><g clip-path="url(#${clip})">${bg}${inner}</g></svg>`;
  }

  const pose = POSES[c.pose] ? c.pose : "hips";
  const body = character(x, pose);
  let bg = "";
  if (c.background !== "none") {
    const clip = x.id("frame");
    x.defs.push(`<clipPath id="${clip}"><rect width="240" height="320" rx="20"/></clipPath>`);
    bg = `<g clip-path="url(#${clip})">${drawBackground(x, 240, 320)}</g>`;
  }
  const flying = POSES[pose].fly;
  const shadow = E(120, flying ? 310 : 306, flying ? 30 : 48, flying ? 4.5 : 6.5, "#1c1630", undefined, 0, `opacity="${flying ? 0.12 : 0.18}"`);
  let fig = body;
  if (flying) {
    const bob = anim ? `<animateTransform attributeName="transform" type="translate" values="0 0;0 -5;0 0" dur="2.4s" repeatCount="indefinite" ${SPLINE}/>` : "";
    fig = `<g>${bob}<g transform="translate(118 166) rotate(18) scale(0.9) translate(-120 -180)">${body}</g></g>`;
  }
  return `<svg ${head} viewBox="0 0 240 320" width="240" height="320">${title}<defs>${x.defs.join("")}</defs>${bg}${shadow}${fig}</svg>`;
}
