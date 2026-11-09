import { and, asc, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { paperPlanes, users } from "@/db/schema";
import { getCurrentUser } from "@/server/auth";
import { academySettings, canSeeAcademy, currentSeason, pointsByUser, pointsOf } from "@/server/academy";
import { activeNight } from "@/server/trivia";
import { rankFor } from "@/lib/academy";

export const dynamic = "force-dynamic";

/** Planes waiting to be caught, point changes and level-ups, for the little pop-ups across the app. */
export async function GET() {
  const me = await getCurrentUser();
  if (!me) return Response.json({ enabled: false }, { status: 401 });
  if (!canSeeAcademy(me, await academySettings())) return Response.json({ enabled: false });
  const [season, [u], life, planes, night] = await Promise.all([
    currentSeason(),
    db.select({ cape: users.cape }).from(users).where(eq(users.id, me.id)),
    pointsByUser(null),
    db.select({ id: paperPlanes.id, style: paperPlanes.style, sticker: paperPlanes.sticker, message: paperPlanes.message, createdAt: paperPlanes.createdAt, from: users.name })
      .from(paperPlanes).leftJoin(users, eq(users.id, paperPlanes.fromId))
      .where(and(eq(paperPlanes.toId, me.id), isNull(paperPlanes.seenAt), isNull(paperPlanes.reportedAt))).orderBy(asc(paperPlanes.createdAt)).limit(5),
    activeNight(),
  ]);
  const seasonPts = season ? pointsOf(await pointsByUser(season), me.id).total : null;
  const lifetime = pointsOf(life, me.id).total;
  return Response.json({
    enabled: true, cape: u?.cape ?? null, season: season ? { id: season.id, name: season.name } : null, seasonPoints: seasonPts, lifetimePoints: lifetime, rank: rankFor(lifetime).index,
    planes: planes.map((p) => ({ ...p, from: p.from?.split(" ")[0] ?? "A teammate" })),
    triviaNight: night && night.status === "live" ? { id: night.id, title: night.title } : null,
  }, { headers: { "Cache-Control": "no-store" } });
}
