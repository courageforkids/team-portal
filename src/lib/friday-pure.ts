/** Pure helpers shared by the server and the tests (no database, no secrets). */

/** Stable JSON (sorted keys) so an action always hashes the same way. */
export function stableJson(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(stableJson).join(",")}]`;
  if (v && typeof v === "object") return `{${Object.keys(v as object).sort().map((k) => `${JSON.stringify(k)}:${stableJson((v as Record<string, unknown>)[k])}`).join(",")}}`;
  return JSON.stringify(v ?? null);
}

export type Usage = { input_tokens?: number | null; output_tokens?: number | null; cache_creation_input_tokens?: number | null; cache_read_input_tokens?: number | null; server_tool_use?: { web_search_requests?: number | null } | null };
/** Cost in thousandths of a dollar. Claude Opus 5.5: $4 / $20 per million tokens, cache writes $5, cache reads $0.20; web search $10 per 1,000. */
export function costMills(u: Usage) {
  const m = ((u.input_tokens ?? 0) * 4 + (u.output_tokens ?? 0) * 20 + (u.cache_creation_input_tokens ?? 0) * 5 + (u.cache_read_input_tokens ?? 0) * 0.2) / 1000
    + (u.server_tool_use?.web_search_requests ?? 0) * 10;
  return Math.ceil(m);
}

/** Date and hour in a time zone. */
export function localParts(tz: string, d = new Date()) {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23" }).formatToParts(d).map((x) => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, hour: Number(p.hour) };
}

/* ── Authenticator-app codes (RFC 6238 TOTP, SHA-1, 6 digits, 30 s). ── */
const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
export function base32Encode(buf: Uint8Array) {
  let bits = 0, value = 0, out = "";
  for (const b of buf) { value = (value << 8) | b; bits += 8; while (bits >= 5) { out += B32[(value >>> (bits - 5)) & 31]; bits -= 5; } }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}
export function base32Decode(s: string) {
  const clean = s.toUpperCase().replace(/[^A-Z2-7]/g, "");
  let bits = 0, value = 0; const out: number[] = [];
  for (const c of clean) { value = (value << 5) | B32.indexOf(c); bits += 5; if (bits >= 8) { out.push((value >>> (bits - 8)) & 255); bits -= 8; } }
  return Buffer.from(out);
}
export async function hotp(secret: Buffer, counter: number, digits = 6) {
  const { createHmac } = await import("node:crypto");
  const msg = Buffer.alloc(8); msg.writeBigUInt64BE(BigInt(counter));
  const h = createHmac("sha1", secret).update(msg).digest();
  const o = h[h.length - 1] & 15;
  const code = ((h[o] & 127) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3];
  return String(code % 10 ** digits).padStart(digits, "0");
}
/** Accepts the current code and one step either side (clock drift). */
export async function verifyTotp(base32Secret: string, code: string, now = Date.now(), digits = 6) {
  const c = code.replace(/\s/g, "");
  if (!/^\d{6,8}$/.test(c)) return false;
  const secret = base32Decode(base32Secret), step = Math.floor(now / 1000 / 30);
  for (const d of [0, -1, 1]) if ((await hotp(secret, step + d, digits)) === c) return true;
  return false;
}
