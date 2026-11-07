import { and, asc, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { paperPlanes, users } from "@/db/schema";
import { getCurrentUser } from "@/server/auth";
import { academySettings, currentSeason, pointsByUser, pointsOf } from "@/server/academy";
import { rankFor } from "@/lib/academy";

export const dynamic = "force-dynamic";

export async function GET() {
  const me = await getCurrentUser();
  if (!me) return Response.json({ enabled: false }, { status: 401 });
  const a = await academySettings();
  if (!a.enabled) return Response.json({ enabled: false });
  const [season, [u], life, planes] = await Promise.all([
    currentSeason(),
    db.select({ cape: users.cape }).from(users).where(eq(users.id, me.id)),
    pointsByUser(null),
    db.select({ id: paperPlanes.id, style: paperPlanes.style, message: paperPlanes.message, createdAt: paperPlanes.createdAt, from: users.name })
      .from(paperPlanes).leftJoin(users, eq(users.id, paperPlanes.fromId))
      .where(and(eq(paperPlanes.toId, me.id), isNull(paperPlanes.seenAt), isNull(paperPlanes.reportedAt))).orderBy(asc(paperPlanes.createdAt)).limit(5),
  ]);
  const seasonPts = season ? pointsOf(await pointsByUser(season), me.id).total : null;
  const lifetime = pointsOf(life, me.id).total;
  return Response.json({
    enabled: true, cape: u?.cape ?? null, season: season ? { id: season.id, name: season.name } : null, seasonPoints: seasonPts, lifetimePoints: lifetime, rank: rankFor(lifetime).index,
    planes: planes.map((p) => ({ ...p, from: p.from?.split(" ")[0] ?? "A teammate" })),
  }, { headers: { "Cache-Control": "no-store" } });
}
