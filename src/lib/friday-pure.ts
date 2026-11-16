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
