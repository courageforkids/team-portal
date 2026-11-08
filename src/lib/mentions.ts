/**
 * @mentions in chat. Each person's handle is their first name ("@Julia"); if two people in the chat share a
 * first name, both get their last initial added ("@JuliaB"). The server and the chat screen use the same rules.
 */
export type Mentionable = { id: string; name: string };

const clean = (s: string) => s.replace(/[^\p{L}\p{N}]/gu, "");

export function mentionHandles(people: Mentionable[]): { id: string; name: string; handle: string }[] {
  const firsts = people.map((p) => clean(p.name.split(" ")[0] ?? "") || "Member");
  return people.map((p, i) => {
    const dup = firsts.filter((f) => f.toLowerCase() === firsts[i].toLowerCase()).length > 1;
    const last = p.name.trim().split(/\s+/).slice(1).join("");
    return { id: p.id, name: p.name, handle: dup && last ? `${firsts[i]}${clean(last)[0] ?? ""}` : firsts[i] };
  });
}

/** Splits text into plain parts and @handle parts that match someone in the chat. */
export const MENTION_RE = /(^|[^\p{L}\p{N}_@])@([\p{L}\p{N}]+)/gu;

export function findMentionedIds(body: string, people: Mentionable[]): string[] {
  const handles = mentionHandles(people);
  const ids = new Set<string>();
  for (const m of body.matchAll(MENTION_RE)) {
    const h = handles.find((x) => x.handle.toLowerCase() === m[2].toLowerCase());
    if (h) ids.add(h.id);
  }
  return [...ids];
}
