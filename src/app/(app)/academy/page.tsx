import Link from "next/link";
import { asc, desc, eq, isNotNull } from "drizzle-orm";
import { db } from "@/db";
import { paperPlanes, users } from "@/db/schema";
import { requireUser } from "@/server/auth";
import { academySettings, allSeasons, currentSeason, pointsByUser, pointsOf, questProgress, recentlyEndedSeason, standings, todayNY } from "@/server/academy";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardHeader } from "@/components/ui/card";
import { HeroCard } from "@/components/academy/hero-card";
import { CupBars, Ceremony } from "@/components/academy/cape-cup";
import { QuestMap } from "@/components/academy/quest-map";
import { ThrowPlaneButton } from "@/components/academy/throw-plane";
import { CapeIcon } from "@/components/academy/sorting";
import { AcademySettingsForm, BonusForm, DeleteSeasonButton, ReportedPlaneActions, ResortForm, SeasonForm, SoundToggle } from "@/components/academy/admin";
import { CAPES, isCape, POINTS, rankFor } from "@/lib/academy";

export const metadata = { title: "Courage Academy" };

export default async function AcademyPage() {
  const me = await requireUser();
  const a = await academySettings();
  if (!a.enabled) return <PageHeader title="Courage Academy" description="Courage Academy is turned off right now." />;
  const [season, ended, life, people, goals, seasons] = await Promise.all([
    currentSeason(), recentlyEndedSeason(), pointsByUser(null),
    db.select({ id: users.id, name: users.name, title: users.title, avatarFileId: users.avatarFileId, cape: users.cape }).from(users).where(eq(users.status, "active")).orderBy(asc(users.name)),
    questProgress(a.goals), me.role === "admin" ? allSeasons() : Promise.resolve([]),
  ]);
  const seasonPts = season ? await pointsByUser(season) : null;
  const [board, endedBoard] = await Promise.all([season ? standings(season, a.capeCount, seasonPts!) : null, ended ? standings(ended, a.capeCount) : null]);
  const reported = me.role === "admin"
    ? await db.select({ id: paperPlanes.id, message: paperPlanes.message, createdAt: paperPlanes.createdAt, from: users.name }).from(paperPlanes).leftJoin(users, eq(users.id, paperPlanes.fromId)).where(isNotNull(paperPlanes.reportedAt)).orderBy(desc(paperPlanes.createdAt))
    : [];
  const mine = people.find((p) => p.id === me.id);
  const myCape = mine?.cape && isCape(mine.cape) ? mine.cape : null;
  const myLife = pointsOf(life, me.id);
  const r = rankFor(myLife.total);
  const daysLeft = season ? Math.max(0, Math.round((Date.parse(season.endsOn) - Date.parse(todayNY())) / 86400000)) : 0;
  const sorted = people.filter((p) => p.cape);
  const card = (p: (typeof people)[number]) => { const b = pointsOf(life, p.id); return { name: p.name, title: p.title, avatarFileId: p.avatarFileId, cape: p.cape, lifetime: b.total, stats: { tasks: b.tasks, meetings: b.meetings, shifts: b.shifts, planesGot: b.planesGot, shoutGot: b.shoutGot } }; };
  const others = people.filter((p) => p.id !== me.id).map((p) => ({ id: p.id, name: p.name }));

  return (
    <>
      <PageHeader eyebrow="Courage Academy" title={myCape ? <span className="inline-flex items-center gap-2"><CapeIcon color={CAPES[myCape].color} size={40} />{CAPES[myCape].name}</span> : "Courage Academy"}
        description={myCape ? CAPES[myCape].motto : "Every hero has a cape."}
        actions={<div className="flex flex-wrap gap-2"><SoundToggle /><ThrowPlaneButton people={others} /></div>} />
      {ended && endedBoard && <Ceremony seasonId={ended.id} seasonName={ended.name} list={endedBoard} />}

      <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
        <div className="space-y-6">
          <Card>
            <CardHeader title="🏆 The Cape Cup" description={season ? `${season.name} · ${daysLeft} day${daysLeft === 1 ? "" : "s"} left` : "No season is running right now."} />
            <div className="px-5 pb-5">
              {board ? <CupBars list={board} myCape={myCape} /> : <p className="text-sm text-muted">{me.role === "admin" ? "Start a season below to begin the race." : "An admin will start the next season soon."}</p>}
              {season && seasonPts && <p className="mt-4 text-sm text-muted">You&apos;ve added <b className="text-fg">{pointsOf(seasonPts, me.id).total}</b> points to your Cape this season.</p>}
            </div>
          </Card>

          {goals.length > 0 && (
            <Card>
              <CardHeader title="🗺️ Quest map" description="Where the whole team is headed this year." />
              <div className="grid gap-3 px-5 pb-5 md:grid-cols-2">{goals.map((g) => <QuestMap key={g.id} goal={g} />)}</div>
            </Card>
          )}

          <Card>
            <CardHeader title="Hero cards" description="Tap a card to flip it." />
            <div className="scrollbar-thin flex gap-4 overflow-x-auto px-5 pb-5">{sorted.filter((p) => p.id !== me.id).map((p) => <HeroCard key={p.id} d={card(p)} size="sm" />)}</div>
          </Card>

          <Card className="p-5">
            <h3 className="mb-2 font-semibold">How points work</h3>
            <ul className="grid gap-1 text-sm text-fg-2 sm:grid-cols-2">
              <li>✅ Task done on time: <b>+{POINTS.taskOnTime}</b> (late: 0)</li>
              <li>🙋 Shift you showed up for: <b>+{POINTS.shift}</b></li>
              <li>📝 Meeting attended: <b>+{POINTS.meeting}</b></li>
              <li>🎉 Shout-out given or received: <b>+1</b></li>
              <li>✈️ Paper plane thrown or caught: <b>+1</b></li>
              <li>⭐ Bonus points from an admin</li>
            </ul>
            <p className="mt-2 text-xs text-muted">The Cup compares each Cape&apos;s average per member, so small Capes can win. Points never go down.</p>
          </Card>
        </div>

        <aside className="space-y-6">
          {mine && <div className="flex justify-center"><HeroCard d={card(mine)} /></div>}
          <Card className="p-5">
            <div className="text-sm font-semibold">{r.icon} {r.name}</div>
            <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-surface-2"><div className="h-full rounded-full bg-accent" style={{ width: `${Math.round(r.progress * 100)}%` }} /></div>
            <p className="mt-2 text-xs text-muted">{r.next ? `${r.toNext} more points to become a ${r.next.name}.` : "You've reached the top rank. Legend!"}</p>
            <Link href="/academy/planes" className="mt-4 block text-sm font-semibold text-brand hover:underline">✈️ My plane collection</Link>
          </Card>
          <p className="px-1 text-xs text-muted">Psst… heroes say the logo hides a secret.</p>
        </aside>
      </div>

      {me.role === "admin" && (
        <section id="admin" className="mt-10 space-y-6">
          <h2 className="text-lg font-bold">Academy admin</h2>
          <Card><CardHeader title="Settings" /><div className="px-5 pb-5"><AcademySettingsForm enabled={a.enabled} capeCount={a.capeCount} goals={a.goals} /></div></Card>
          <Card>
            <CardHeader title="Seasons" description="The Cape Cup runs during a season. A ceremony plays for everyone when it ends." />
            <div className="space-y-4 px-5 pb-5">
              <SeasonForm />
              {seasons.length > 0 && <ul className="divide-y divide-line rounded-xl border border-line">{seasons.map((s) => <li key={s.id} className="flex items-center justify-between px-3 py-2 text-sm"><span><b>{s.name}</b> · {s.startsOn} → {s.endsOn}</span><DeleteSeasonButton id={s.id} name={s.name} /></li>)}</ul>}
            </div>
          </Card>
          <Card><CardHeader title="Bonus points" description="For things the portal can't see." /><div className="px-5 pb-5"><BonusForm capeCount={a.capeCount} people={people.map((p) => ({ id: p.id, name: p.name }))} /></div></Card>
          <Card><CardHeader title="Capes" description="Move someone to another Cape, or clear it so they take the Sorting again." /><div className="px-5 pb-5"><ResortForm capeCount={a.capeCount} people={people} /></div></Card>
          <Card>
            <CardHeader title="Reported planes" />
            {reported.length ? <ul className="divide-y divide-line border-t border-line">{reported.map((p) => <li key={p.id} className="flex items-center justify-between gap-3 px-5 py-3 text-sm"><span><b>{p.from ?? "Someone"}:</b> {p.message}</span><ReportedPlaneActions id={p.id} /></li>)}</ul> : <p className="px-5 pb-5 text-sm text-muted">Nothing reported.</p>}
          </Card>
        </section>
      )}
    </>
  );
}
