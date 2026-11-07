import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { requireUser } from "@/server/auth";
import { academySettings, allSeasons, pointsByUser, pointsOf, standings, todayNY } from "@/server/academy";
import { Avatar } from "@/components/ui/avatar";
import { CAPES, rankFor } from "@/lib/academy";

export const metadata = { title: "Hall of Legends" };

/** Hidden page. Reached through the logo secret. */
export default async function LegendsPage() {
  await requireUser();
  const a = await academySettings();
  const [life, people, seasons] = await Promise.all([
    pointsByUser(null),
    db.select({ id: users.id, name: users.name, avatarFileId: users.avatarFileId }).from(users).where(eq(users.status, "active")).orderBy(asc(users.name)),
    allSeasons(),
  ]);
  const t = todayNY();
  const past = await Promise.all(seasons.filter((s) => s.endsOn < t).map(async (s) => ({ s, w: (await standings(s, a.capeCount))[0] })));
  const top = [...people].map((p) => ({ ...p, b: pointsOf(life, p.id) })).sort((x, y) => y.b.total - x.b.total);
  const legends = top.filter((p) => rankFor(p.b.total).index >= 4);
  const kind = [...top].sort((x, y) => y.b.planesGot + y.b.shoutGot - (x.b.planesGot + x.b.shoutGot))[0];
  return (
    <div className="-mx-4 -mt-6 min-h-[80vh] bg-[radial-gradient(circle_at_50%_0%,#0b5d96,#02243d_70%)] px-5 py-10 text-white md:-mx-8 md:-mt-8 md:px-10">
      <div className="mx-auto max-w-3xl text-center">
        <div className="text-5xl">⭐</div>
        <p className="mt-3 text-sm font-semibold uppercase tracking-[.25em] text-[#FED438]">You found it</p>
        <h1 className="mt-1 text-4xl font-extrabold">The Hall of Legends</h1>
        <p className="mt-2 text-white/75">Only heroes who follow the flying cape ever see this room.</p>

        <h2 className="mt-10 text-left text-sm font-bold uppercase tracking-wider text-[#FED438]">Greatest heroes of all time</h2>
        <ol className="mt-3 grid gap-3 sm:grid-cols-3">
          {top.slice(0, 3).map((p, i) => (
            <li key={p.id} className="rounded-2xl bg-white/10 p-4 ring-1 ring-white/15">
              <div className="text-3xl">{["🥇", "🥈", "🥉"][i]}</div>
              <div className="mt-2 flex justify-center"><Avatar name={p.name} fileId={p.avatarFileId} size={56} /></div>
              <div className="mt-2 font-bold">{p.name}</div>
              <div className="text-sm text-white/70">{rankFor(p.b.total).icon} {rankFor(p.b.total).name} · {p.b.total} pts</div>
            </li>
          ))}
        </ol>

        <h2 className="mt-10 text-left text-sm font-bold uppercase tracking-wider text-[#FED438]">Cape Cup champions</h2>
        {past.length ? <ul className="mt-3 space-y-2 text-left">{past.map(({ s, w }) => <li key={s.id} className="flex justify-between rounded-xl bg-white/10 px-4 py-3"><span className="font-semibold">{s.name}</span><span>{w && w.average > 0 ? `🏆 ${CAPES[w.cape].name}` : "—"}</span></li>)}</ul> : <p className="mt-3 text-left text-white/60">The first champion hasn&apos;t been crowned yet.</p>}

        <h2 className="mt-10 text-left text-sm font-bold uppercase tracking-wider text-[#FED438]">Legends</h2>
        <p className="mt-3 text-left text-white/80">{legends.length ? legends.map((p) => p.name).join(", ") : "No one has reached Legend rank yet. Will you be first?"}</p>

        {kind && kind.b.planesGot + kind.b.shoutGot > 0 && <>
          <h2 className="mt-10 text-left text-sm font-bold uppercase tracking-wider text-[#FED438]">Most appreciated</h2>
          <p className="mt-3 text-left text-white/80">{kind.name} — {kind.b.planesGot} planes caught and {kind.b.shoutGot} shout-outs.</p>
        </>}
      </div>
    </div>
  );
}
