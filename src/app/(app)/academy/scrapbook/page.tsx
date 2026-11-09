import { and, desc, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { paperPlanes, users } from "@/db/schema";
import { requireUser } from "@/server/auth";
import { requireAcademy } from "@/server/academy";
import { PageHeader } from "@/components/ui/page-header";
import { AcademyTabs } from "@/components/academy/tabs";
import { Scrapbook } from "@/components/academy/extras";
import { fmtDate } from "@/lib/dates";
import { isCape } from "@/lib/academy";

export const metadata = { title: "My scrapbook" };

export default async function ScrapbookPage() {
  const me = await requireUser();
  await requireAcademy(me);
  const [u] = await db.select({ cape: users.cape }).from(users).where(eq(users.id, me.id));
  const planes = await db.select({ id: paperPlanes.id, style: paperPlanes.style, sticker: paperPlanes.sticker, message: paperPlanes.message, createdAt: paperPlanes.createdAt, from: users.name })
    .from(paperPlanes).leftJoin(users, eq(users.id, paperPlanes.fromId)).where(and(eq(paperPlanes.toId, me.id), isNull(paperPlanes.reportedAt))).orderBy(desc(paperPlanes.createdAt)).limit(400);
  return (
    <>
      <AcademyTabs myCape={u?.cape && isCape(u.cape) ? u.cape : null} admin={me.role === "admin"} />
      <PageHeader title="My scrapbook" description={planes.length ? `${planes.length} paper plane${planes.length === 1 ? "" : "s"} caught. Come back here on a tough day.` : "Planes your teammates throw you land here."} />
      <Scrapbook planes={planes.map((p) => ({ id: p.id, style: p.style, sticker: p.sticker, message: p.message, from: p.from?.split(" ")[0] ?? "A former teammate", date: fmtDate(p.createdAt, undefined, "MMM d") }))} />
    </>
  );
}
