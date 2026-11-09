/** Courage Academy — shared definitions (safe for client and server). Original theme built on the logo's caped kid. */

export const CAPES = {
  navy: { name: "Navy Cape", color: "#1f6fb2", deep: "#004F81", text: "#ffffff", emoji: "🔵", motto: "The steady ones who get it done.", blurb: "Navy Capes are the backbone. You plan, you follow through, and people know they can count on you." },
  gold: { name: "Gold Cape", color: "#FED438", deep: "#c99a00", text: "#3b2f00", emoji: "🟡", motto: "The sparks with big energy and ideas.", blurb: "Gold Capes light up the room. You bring the ideas, the fun and the energy that keeps everyone going." },
  ember: { name: "Ember Cape", color: "#f0643c", deep: "#c2410c", text: "#ffffff", emoji: "🔴", motto: "The bold ones who go first.", blurb: "Ember Capes jump in first. When something needs doing, you're already on your way." },
  evergreen: { name: "Evergreen Cape", color: "#2f9e6e", deep: "#166534", text: "#ffffff", emoji: "🟢", motto: "The helpers who look out for everyone.", blurb: "Evergreen Capes notice people. You make sure nobody gets left out and everyone feels part of the team." },
} as const;
export type Cape = keyof typeof CAPES;
export const CAPE_ORDER: Cape[] = ["navy", "gold", "ember", "evergreen"];
export const activeCapes = (count: 2 | 4) => CAPE_ORDER.slice(0, count);
/** With only two Capes, the other two answers fold into these. */
export const FOLD: Record<Cape, Cape> = { navy: "navy", gold: "gold", ember: "gold", evergreen: "navy" };
export const isCape = (v: unknown): v is Cape => typeof v === "string" && v in CAPES;

export const SORTING_QUESTIONS: { q: string; a: [string, Cape][] }[] = [
  { q: "Packing day starts in 10 minutes and supplies are missing. You…", a: [["Make a quick plan and split up jobs", "navy"], ["Turn it into a race to find everything", "gold"], ["Grab your keys and go get more", "ember"], ["Check that everyone's okay first", "evergreen"]] },
  { q: "Your favorite part of a big event is…", a: [["When everything runs smoothly", "navy"], ["The energy and the music", "gold"], ["Being right up front", "ember"], ["The people you meet", "evergreen"]] },
  { q: "Pick a superpower.", a: [["Perfect memory", "navy"], ["Making anyone laugh", "gold"], ["Super speed", "ember"], ["Knowing how people feel", "evergreen"]] },
  { q: "The team is stuck on a problem. You…", a: [["Break it into steps", "navy"], ["Throw out ten wild ideas", "gold"], ["Try something right away", "ember"], ["Ask everyone what they think", "evergreen"]] },
  { q: "Pick a snack for the team.", a: [["Something everyone likes, no surprises", "navy"], ["Something new and fun", "gold"], ["Something spicy", "ember"], ["Homemade cookies", "evergreen"]] },
  { q: "A friend says you're the one who…", a: [["Always has a plan", "navy"], ["Brings the fun", "gold"], ["Isn't scared of anything", "ember"], ["Always shows up for them", "evergreen"]] },
];

export const RANKS = [
  { name: "Rookie", min: 0, icon: "🌱" },
  { name: "Sidekick", min: 40, icon: "⚡" },
  { name: "Hero", min: 120, icon: "🦸" },
  { name: "Champion", min: 300, icon: "🛡️" },
  { name: "Legend", min: 600, icon: "👑" },
] as const;
export function rankFor(points: number) {
  let i = 0;
  RANKS.forEach((r, j) => { if (points >= r.min) i = j; });
  const next = RANKS[i + 1];
  return { index: i, ...RANKS[i], next: next ?? null, toNext: next ? next.min - points : 0, progress: next ? (points - RANKS[i].min) / (next.min - RANKS[i].min) : 1 };
}

export const POINTS = { taskOnTime: 10, meeting: 2, shift: 5, shoutGiven: 1, shoutGot: 1, planeSent: 1, planeGot: 1, duelWin: 3, dailyCorrect: 2, streakWeek: 5 } as const;
/** Duel wins that count toward points per day (more duels are fine, they just don't add points). */
export const DUEL_WINS_PER_DAY = 3;
/** A streak week (≥1 on-time task, nothing late) earns a bonus from the 3rd week in a row. */
export const STREAK_BONUS_FROM = 3;

/** Real-world things members can claim points for; an admin approves each one. */
export const MISSION_KINDS = {
  business: { label: "Got a business to donate", points: 15, emoji: "🏪" },
  volunteer: { label: "Recruited a new volunteer", points: 10, emoji: "🙋" },
  press: { label: "Got us press or a feature", points: 20, emoji: "📰" },
  packing: { label: "Packed Courage Boxes", points: 5, emoji: "📦" },
  social: { label: "Made a post that took off", points: 5, emoji: "📱" },
  other: { label: "Something else awesome", points: 5, emoji: "✨" },
} as const;
export type MissionKind = keyof typeof MISSION_KINDS;

/** Captains can hand out small bonuses to their own Cape. */
export const CAPTAIN_BONUS_MAX = 5;
export const CAPTAIN_BONUS_PER_WEEK = 10;

export const PLANE_STICKERS = ["⭐", "❤️", "🎉", "🔥", "🦸", "🏆", "💪", "🌟", "🍪", "🎄", "❄️", "😂"] as const;

export const PLANE_STYLES = {
  thanks: { label: "Thank you", color: "#FED438", ink: "#3b2f00" },
  luck: { label: "Good luck", color: "#8cc4ec", ink: "#06304f" },
  crushed: { label: "You crushed it", color: "#f8a07f", ink: "#4a1405" },
  just: { label: "Just because", color: "#9be3bf", ink: "#063b22" },
} as const;
export type PlaneStyle = keyof typeof PLANE_STYLES;
export const PLANES_PER_DAY = 5;

export const SPELLS = {
  "/confetti": { name: "Confetti", effect: "confetti" },
  "/cape": { name: "Cape Swoop", effect: "cape" },
  "/lumos": { name: "Lumos", effect: "lumos" },
  "/cheer": { name: "Cheer", effect: "cheer" },
  "/snow": { name: "Let It Snow", effect: "snow" },
} as const;
export type Effect = "confetti" | "cape" | "lumos" | "cheer" | "fanfare" | "snow";
export const spellOf = (body: string) => SPELLS[body.trim().toLowerCase() as keyof typeof SPELLS] ?? null;

/** A Cape's display name: the custom name its captain chose, or the default. */
export function capeLabel(cape: Cape, identity?: Record<string, { name?: string; crest?: string }>) {
  return identity?.[cape]?.name?.trim() || CAPES[cape].name;
}
export const DEFAULT_CREST: Record<Cape, string> = { navy: "shield", gold: "sun", ember: "flame", evergreen: "leaf" };
