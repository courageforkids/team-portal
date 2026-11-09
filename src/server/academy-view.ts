import "server-only";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { captains, pointsByUser, pointsOf, streaks, type AcademyConfig } from "./academy";
import { capeLabel, isCape } from "@/lib/academy";
import type { HeroCardData } from "@/components/academy/hero-card";

/** Everyone active, with what their hero card needs. */
export async function heroCards(a: AcademyConfig) {
  const [people, life, st, caps] = await Promise.all([
    db.select({ id: users.id, name: users.name, title: users.title, role: users.role, avatarFileId: users.avatarFileId, cape: users.cape, hero: users.hero, sortedAt: users.sortedAt })
      .from(users).where(eq(users.status, "active")).orderBy(asc(users.name)),
    pointsByUser(null), streaks(), captains(a),
  ]);
  const captainIds = new Set(Object.values(caps));
  const cards: (HeroCardData & { role: string; sortedAt: string | null })[] = people.map((p) => {
    const b = pointsOf(life, p.id);
    return {
      id: p.id, name: p.name, title: p.title, role: p.role, avatarFileId: p.avatarFileId, cape: p.cape, capeName: p.cape && isCape(p.cape) ? capeLabel(p.cape, a.capes) : undefined,
      hero: p.hero, lifetime: b.total, streak: st.get(p.id)?.current ?? 0, captain: captainIds.has(p.id), sortedAt: p.sortedAt?.toISOString() ?? null,
      stats: { tasks: b.tasks, meetings: b.meetings, shifts: b.shifts, planesGot: b.planesGot, shoutGot: b.shoutGot, duelWins: b.duelWins, missions: b.missions },
    };
  });
  return { cards, captains: caps, life };
}
