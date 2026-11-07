import Link from "next/link";
import { and, desc, eq, isNull } from "drizzle-orm";
import { ArrowLeft } from "lucide-react";
import { db } from "@/db";
import { paperPlanes, users } from "@/db/schema";
import { requireUser } from "@/server/auth";
import { PageHeader } from "@/components/ui/page-header";
import { PlaneIcon } from "@/components/academy/plane-icon";
import { ReportPlaneButton } from "@/components/academy/admin";
import { PLANE_STYLES, type PlaneStyle } from "@/lib/academy";
import { fmtDate } from "@/lib/dates";

export const metadata = { title: "Plane collection" };

export default async function PlanesPage() {
  const me = await requireUser();
  const planes = await db.select({ id: paperPlanes.id, style: paperPlanes.style, message: paperPlanes.message, createdAt: paperPlanes.createdAt, from: users.name })
    .from(paperPlanes).leftJoin(users, eq(users.id, paperPlanes.fromId)).where(and(eq(paperPlanes.toId, me.id), isNull(paperPlanes.reportedAt))).orderBy(desc(paperPlanes.createdAt)).limit(200);
  return (
    <>
      <Link href="/academy" className="mb-3 inline-flex items-center gap-1 text-sm text-muted hover:text-fg"><ArrowLeft className="h-4 w-4" />Courage Academy</Link>
      <PageHeader title="My plane collection" description={planes.length ? `${planes.length} paper plane${planes.length === 1 ? "" : "s"} caught. Come back here on a tough day.` : "Planes your teammates throw you land here."} />
      {planes.length === 0 ? <p className="text-sm text-muted">No planes yet. Throw one to a teammate — it&apos;s contagious.</p> : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {planes.map((p) => {
            const st = PLANE_STYLES[(p.style in PLANE_STYLES ? p.style : "thanks") as PlaneStyle];
            return (
              <article key={p.id} className="flex flex-col rounded-2xl p-5 shadow-soft" style={{ background: st.color, color: st.ink }}>
                <div className="mb-2 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider opacity-80"><PlaneIcon className="h-3.5 w-3.5" color={st.ink} />{st.label}</div>
                <p className="flex-1 whitespace-pre-wrap text-lg font-semibold leading-snug">{p.message}</p>
                <div className="mt-4 flex items-center justify-between text-sm"><span className="font-semibold opacity-80">— {p.from ?? "A former teammate"} · {fmtDate(p.createdAt, undefined, "MMM d")}</span><ReportPlaneButton id={p.id} /></div>
              </article>
            );
          })}
        </div>
      )}
    </>
  );
}
