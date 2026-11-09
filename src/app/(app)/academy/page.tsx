import Link from "next/link";
import { and, desc, eq, gte, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { academyClaims, paperPlanes, planeHearts } from "@/db/schema";
import { requireUser } from "@/server/auth";
import { currentChallenge, currentSeason, mottos, pointsByUser, pointsOf, recentlyEndedSeason, requireAcademy, standings, todayNY, topMotto } from "@/server/academy";
import { heroCards } from "@/server/academy-view";
import { dailyQuestion, myDailyAnswer } from "@/server/trivia";
import { Card, CardHeader } from "@/components/ui/card";
import { HeroCard } from "@/components/academy/hero-card";
import { CupBars, Ceremony } from "@/components/academy/cape-cup";
import { ThrowPlaneButton } from "@/components/academy/throw-plane";
import { CapeCrest } from "@/components/academy/hero-art";
import { AcademyMusic, SoundControls } from "@/components/academy/music";
import { AcademyTabs } from "@/components/academy/tabs";
import { DailyQuestion, ChallengeButton } from "@/components/academy/trivia";
import { HeartButton, MissionClaimForm } from "@/components/academy/extras";
import { PlaneIcon } from "@/components/academy/plane-icon";
import { ReportPlaneButton } from "@/components/academy/admin";
import { CAPES, activeCapes, capeLabel, isCape, MISSION_KINDS, PLANE_STYLES, POINTS, rankFor, type PlaneStyle } from "@/lib/academy";
import { cn } from "@/lib/cn";

export const metadata = { title: "Courage Academy" };

export default async function AcademyPage() {
  const me = await requireUser();
  const a = await requireAcademy(me);
  const [season, ended, { cards }, challenge, motto, dq] = await Promise.all([
    currentSeason(), recentlyEndedSeason(), heroCards(a), currentChallenge(), mottos(), dailyQuestion(),
  ]);
  const seasonPts = season ? await pointsByUser(season) : null;
  const [board, endedBoard, myAnswer, board14, myClaims] = await Promise.all([
    season ? standings(season, a.capeCount, seasonPts!) : null,
    ended ? standings(ended, a.capeCount) : null,
    dq ? myDailyAnswer(me.id, dq.day) : null,
    db.select({ id: paperPlanes.id, style: paperPlanes.style, sticker: paperPlanes.sticker, message: paperPlanes.message, createdAt: paperPlanes.createdAt, fromId: paperPlanes.fromId, toId: paperPlanes.toId,
      hearts: sql<number>`(select count(*)::int from ${planeHearts} h where h.plane_id = ${paperPlanes.id})`,
      mine: sql<boolean>`exists(select 1 from ${planeHearts} h where h.plane_id = ${paperPlanes.id} and h.user_id = ${me.id})` })
      .from(paperPlanes).where(and(eq(paperPlanes.public, true), isNull(paperPlanes.reportedAt), gte(paperPlanes.createdAt, new Date(Date.now() - 14 * 86400000)))).orderBy(desc(paperPlanes.createdAt)).limit(24),
    db.select().from(academyClaims).where(eq(academyClaims.userId, me.id)).orderBy(desc(academyClaims.createdAt)).limit(5),
  ]);
  const names = Object.fromEntries(activeCapes(a.capeCount).map((c) => [c, capeLabel(c, a.capes)]));
  const nameOf = (id: string | null) => cards.find((c) => c.id === id)?.name.split(" ")[0] ?? "A teammate";
  const mine = cards.find((c) => c.id === me.id)!;
  const myCape = mine?.cape && isCape(mine.cape) ? mine.cape : null;
  const r = rankFor(mine?.lifetime ?? 0);
  const daysLeft = season ? Math.max(0, Math.round((Date.parse(season.endsOn) - Date.parse(todayNY())) / 86400000)) : 0;
  const winter = season?.theme === "winter";
  const others = cards.filter((p) => p.id !== me.id).map((p) => ({ id: p.id, name: p.name }));
  const weekAgo = Date.now() - 7 * 86400000;
  const potw = board14.filter((p) => p.createdAt.getTime() >= weekAgo && Number(p.hearts) > 0).sort((x, y) => Number(y.hearts) - Number(x.hearts))[0];

  return (
    <>
      <AcademyMusic track={winter ? "winter" : "academy"} />
      <AcademyTabs myCape={myCape} admin={me.role === "admin"} />
      <header className={cn("mb-6 overflow-hidden rounded-3xl bg-[radial-gradient(circle_at_20%_0%,#0b5d96,#02243d_70%)] p-5 text-white shadow-pop sm:p-7", winter && "cfk-winter")}>
        <div className="relative z-[1] flex flex-wrap items-center gap-4">
          {myCape ? <CapeCrest cape={myCape} crest={a.capes[myCape]?.crest} size={72} /> : <span className="text-5xl">🏰</span>}
          <div className="min-w-0 flex-1">
            <p className="text-xs font-bold uppercase tracking-[.2em] text-[#FED438]">Courage Academy{winter ? " · ❄️ " + season!.name : season ? " · " + season.name : ""}</p>
            <h1 className="text-2xl font-extrabold sm:text-3xl">{myCape ? names[myCape] : "Every hero has a cape"}</h1>
            <p className="text-white/80">{myCape ? `“${topMotto(motto.list, myCape) ?? CAPES[myCape].motto}”` : "Take the Sorting to find your Cape."}</p>
          </div>
          <div className="flex w-full flex-wrap gap-2 sm:w-auto">
            <ThrowPlaneButton people={others} className="inline-flex h-10 items-center gap-1.5 rounded-full bg-[#FED438] px-4 text-sm font-bold text-[#02243d]" />
            <ChallengeButton people={others} label="Duel" className="inline-flex h-10 items-center gap-1.5 rounded-full bg-white/15 px-4 text-sm font-bold text-white hover:bg-white/25" />
          </div>
        </div>
        <SoundControls track={winter ? "winter" : "academy"} className="relative z-[1] mt-4 [&_button]:border-white/20 [&_button]:bg-white/10 [&_button]:text-white" />
      </header>
      {ended && endedBoard && <Ceremony seasonId={ended.id} seasonName={ended.name} list={endedBoard} names={names} />}

      {challenge && (
        <div className="mb-6 flex flex-wrap items-center gap-3 rounded-2xl border-2 border-accent bg-accent-soft px-4 py-3">
          <span className="text-3xl" aria-hidden>🎯</span>
          <div className="min-w-0 flex-1"><p className="text-xs font-bold uppercase tracking-wider text-accent-ink">This week&apos;s Cape challenge · +{challenge.points}</p><p className="font-bold">{challenge.title}</p>{challenge.details && <p className="text-sm text-fg-2">{challenge.details}</p>}</div>
          <span className="text-xs font-semibold text-muted">Ends {new Date(challenge.endsOn + "T12:00:00").toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span>
        </div>
      )}

      {mine && !mine.hero && (
        <Link href="/academy/hero" className="mb-6 flex items-center gap-3 rounded-2xl border-2 border-dashed border-brand/40 bg-brand-soft p-4 lg:hidden">
          <span className="text-4xl">🦸</span><span><b className="block">Create your hero</b><span className="text-sm text-muted">Design your own character for your card and your Cape&apos;s room.</span></span>
        </Link>
      )}
      <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
        <div className="space-y-6">
          <Card>
            <CardHeader title="🏆 The Cape Cup" description={season ? `${season.name} · ${daysLeft} day${daysLeft === 1 ? "" : "s"} left` : "No season is running right now."} />
            <div className="px-5 pb-5">
              {board ? <CupBars list={board} myCape={myCape} names={names} /> : <p className="text-sm text-muted">{me.role === "admin" ? <>Start a season in <Link href="/academy/admin" className="font-semibold text-brand-ink underline">Admin</Link> to begin the race.</> : "An admin will start the next season soon."}</p>}
              {season && seasonPts && <p className="mt-4 text-sm text-muted">You&apos;ve added <b className="text-fg">{pointsOf(seasonPts, me.id).total}</b> points to your Cape this season.</p>}
              <div className="mt-4 flex flex-wrap gap-2">{activeCapes(a.capeCount).map((c) => <Link key={c} href={`/academy/capes/${c}`} className="inline-flex items-center gap-1.5 rounded-full border border-line px-3 py-1.5 text-xs font-semibold hover:bg-surface-2"><CapeCrest cape={c} crest={a.capes[c]?.crest} size={18} />{names[c]}&apos;s room</Link>)}</div>
            </div>
          </Card>

          {dq && (
            <Card>
              <CardHeader title="🧠 Question of the day" description="One try. Right answers earn 2 points for your Cape." action={<Link href="/academy/trivia" className="text-sm font-semibold text-brand-ink hover:underline">Trivia</Link>} />
              <div className="px-5 pb-5"><DailyQuestion question={dq.q.question} choices={dq.q.choices} category={dq.q.category} done={myAnswer ? { choice: myAnswer.choice, correct: myAnswer.correct, answer: dq.q.answer } : null} /></div>
            </Card>
          )}

          <Card>
            <CardHeader title="✈️ The Plane Board" description="Planes people chose to share. ❤️ your favorites." />
            <div className="px-5 pb-5">
              {potw && (
                <div className="mb-4 rounded-2xl border-2 border-accent p-1">
                  <p className="px-2 py-1 text-xs font-bold uppercase tracking-wider text-accent-ink">⭐ Plane of the Week</p>
                  <PlaneTile p={potw} from={nameOf(potw.fromId)} to={nameOf(potw.toId)} big />
                </div>
              )}
              {board14.length ? <div className="grid gap-3 sm:grid-cols-2">{board14.filter((p) => p.id !== potw?.id).slice(0, 8).map((p) => <PlaneTile key={p.id} p={p} from={nameOf(p.fromId)} to={nameOf(p.toId)} />)}</div>
                : <p className="text-sm text-muted">Nothing on the board yet. When you throw a plane, tick “Post it on the Plane Board”.</p>}
            </div>
          </Card>

          <Card>
            <CardHeader title="Hero cards" description="Tap a card to flip it." />
            <div className="scrollbar-thin flex gap-4 overflow-x-auto px-5 pb-5">{cards.filter((p) => p.cape && p.id !== me.id).map((p) => <HeroCard key={p.id} d={p} size="sm" />)}</div>
          </Card>

          <Card className="p-5">
            <h3 className="mb-2 font-semibold">How points work</h3>
            <ul className="grid gap-1 text-sm text-fg-2 sm:grid-cols-2">
              <li>✅ Task done on time: <b>+{POINTS.taskOnTime}</b> (late: 0)</li>
              <li>🔥 On-time streak, from week 3: <b>+{POINTS.streakWeek}</b>/week</li>
              <li>🙋 Shift you showed up for: <b>+{POINTS.shift}</b></li>
              <li>📝 Meeting attended: <b>+{POINTS.meeting}</b></li>
              <li>🎯 Missions (approved): <b>+5 to +20</b></li>
              <li>⚔️ Trivia duel win: <b>+{POINTS.duelWin}</b> (3 a day)</li>
              <li>🧠 Question of the day: <b>+{POINTS.dailyCorrect}</b></li>
              <li>🎉 Shout-out given or received: <b>+1</b></li>
              <li>✈️ Paper plane thrown or caught: <b>+1</b></li>
              <li>👑 Captain and admin bonuses</li>
            </ul>
            <p className="mt-2 text-xs text-muted">The Cup compares each Cape&apos;s average per member, so small Capes can win. Weekly challenges and trivia nights add points to the whole Cape.</p>
          </Card>
        </div>

        <aside className="space-y-6">
          {mine && (mine.hero ? <div className="flex justify-center"><HeroCard d={mine} /></div> : (
            <Link href="/academy/hero" className="block rounded-2xl border-2 border-dashed border-brand/40 bg-brand-soft p-6 text-center hover:border-brand">
              <div className="text-5xl">🦸</div><p className="mt-2 font-bold">Create your hero</p><p className="text-sm text-muted">Design your own character. It shows up on your card and in your Cape&apos;s room.</p>
            </Link>
          ))}
          <Card className="p-5">
            <div className="flex items-center justify-between text-sm font-semibold"><span>{r.icon} {r.name}</span>{mine && mine.streak > 0 && <span title="Weeks in a row with every task on time">🔥 {mine.streak} week{mine.streak === 1 ? "" : "s"}</span>}</div>
            <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-surface-2"><div className="h-full rounded-full bg-accent" style={{ width: `${Math.round(r.progress * 100)}%` }} /></div>
            <p className="mt-2 text-xs text-muted">{r.next ? `${r.toNext} more points to become a ${r.next.name}.` : "You've reached the top rank. Legend!"}</p>
          </Card>
          <Card className="p-5">
            <h3 className="mb-3 font-semibold">🎯 Claim mission points</h3>
            <MissionClaimForm />
            {myClaims.length > 0 && (
              <ul className="mt-4 space-y-1.5 border-t border-line pt-3 text-xs">
                {myClaims.map((c) => <li key={c.id} className="flex justify-between gap-2"><span className="truncate">{MISSION_KINDS[c.kind as keyof typeof MISSION_KINDS]?.emoji} {c.details}</span><span className={cn("shrink-0 font-semibold", c.status === "approved" ? "text-ok" : c.status === "declined" ? "text-muted" : "text-warn")}>{c.status === "approved" ? `+${c.points}` : c.status === "declined" ? "Declined" : "Waiting"}</span></li>)}
              </ul>
            )}
          </Card>
        </aside>
      </div>
    </>
  );
}

function PlaneTile({ p, from, to, big }: { p: { id: string; style: string; sticker: string | null; message: string; hearts: number; mine: boolean }; from: string; to: string; big?: boolean }) {
  const st = PLANE_STYLES[(p.style in PLANE_STYLES ? p.style : "thanks") as PlaneStyle];
  return (
    <article className="relative flex flex-col rounded-2xl p-4" style={{ background: st.color, color: st.ink }}>
      {p.sticker && <span className="absolute right-3 top-2 text-3xl" aria-hidden>{p.sticker}</span>}
      <div className="mb-1 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider opacity-80"><PlaneIcon className="h-3.5 w-3.5" color={st.ink} />{from} → {to}</div>
      <p className={cn("flex-1 whitespace-pre-wrap font-semibold leading-snug", big ? "text-xl" : "text-[15px]")}>{p.message}</p>
      <div className="mt-3 flex items-center justify-between"><HeartButton id={p.id} count={Number(p.hearts)} hearted={!!p.mine} /><ReportPlaneButton id={p.id} /></div>
    </article>
  );
}
