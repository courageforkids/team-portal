import Link from "next/link";
import { desc, eq, isNotNull, isNull, ne, sql } from "drizzle-orm";
import { db } from "@/db";
import { academyChallenges, academyClaims, paperPlanes, triviaQuestions, users } from "@/db/schema";
import { requireAdmin } from "@/server/auth";
import { allSeasons, captains, requireAcademy } from "@/server/academy";
import { activeNight, ensureTriviaSeeded } from "@/server/trivia";
import { Card, CardHeader } from "@/components/ui/card";
import { AcademyTabs } from "@/components/academy/tabs";
import {
  AcademySettingsForm, BonusForm, CaptainForm, ChallengeForm, ClaimReview, DecideChallenge, DeleteSeasonButton, NightForm, QuestionForm, QuestionToggle, ReportedPlaneActions, ResortForm, SeasonForm,
} from "@/components/academy/admin";
import { activeCapes, capeLabel, isCape, MISSION_KINDS } from "@/lib/academy";
import { TRIVIA_CATEGORIES } from "@/lib/trivia-bank";
import { ago } from "@/lib/dates";

export const metadata = { title: "Academy admin" };

export default async function AcademyAdminPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const me = await requireAdmin();
  const a = await requireAcademy(me);
  const sp = await searchParams;
  await ensureTriviaSeeded();
  const [people, seasons, claims, challenges, reported, caps, night, questions, [{ qCount }]] = await Promise.all([
    db.select({ id: users.id, name: users.name, role: users.role, cape: users.cape }).from(users).where(eq(users.status, "active")).orderBy(users.name),
    allSeasons(),
    db.select({ c: academyClaims, name: users.name }).from(academyClaims).leftJoin(users, eq(users.id, academyClaims.userId)).where(eq(academyClaims.status, "pending")).orderBy(academyClaims.createdAt),
    db.select().from(academyChallenges).where(isNull(academyChallenges.winnerCape)).orderBy(desc(academyChallenges.startsOn)),
    db.select({ id: paperPlanes.id, message: paperPlanes.message, from: users.name }).from(paperPlanes).leftJoin(users, eq(users.id, paperPlanes.fromId)).where(isNotNull(paperPlanes.reportedAt)).orderBy(desc(paperPlanes.createdAt)),
    captains(a), activeNight(),
    db.select().from(triviaQuestions).where(sp.q ? sql`${triviaQuestions.question} ilike ${"%" + sp.q.slice(0, 60) + "%"}` : ne(triviaQuestions.category, "__")).orderBy(desc(triviaQuestions.createdAt)).limit(40),
    db.select({ qCount: sql<number>`count(*)::int` }).from(triviaQuestions),
  ]);
  const myCape = people.find((p) => p.id === me.id)?.cape ?? null;
  const names = Object.fromEntries(activeCapes(a.capeCount).map((c) => [c, capeLabel(c, a.capes)]));
  return (
    <>
      <AcademyTabs myCape={myCape && isCape(myCape) ? myCape : null} admin />
      <h1 className="mb-1 text-2xl font-extrabold">Academy admin</h1>
      <p className="mb-6 text-muted">Courage Academy is open to the whole team.</p>
      <div className="space-y-6">
        <Card><CardHeader title="Settings" /><div className="px-5 pb-5"><AcademySettingsForm capeCount={a.capeCount} borders={a.borders} /></div></Card>

        <Card>
          <CardHeader title={`🎯 Mission claims${claims.length ? ` (${claims.length})` : ""}`} description="Approve real-world wins. You can change the points before approving." />
          {claims.length ? <ul className="divide-y divide-line border-t border-line">{claims.map(({ c, name }) => (
            <li key={c.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 text-sm">
              <span className="min-w-0 flex-1"><b>{name}</b> · {MISSION_KINDS[c.kind as keyof typeof MISSION_KINDS]?.emoji} {MISSION_KINDS[c.kind as keyof typeof MISSION_KINDS]?.label}<span className="block text-fg-2">{c.details}</span><span className="text-xs text-muted">{ago(c.createdAt)}</span></span>
              <ClaimReview id={c.id} points={c.points} />
            </li>))}</ul> : <p className="px-5 pb-5 text-sm text-muted">Nothing waiting.</p>}
        </Card>

        <Card>
          <CardHeader title="❄️ Seasons" description="The Cape Cup runs during a season. A ceremony plays for everyone when it ends. Winter seasons give the Academy a snowy look and winter music." />
          <div className="space-y-4 px-5 pb-5">
            <SeasonForm />
            {seasons.length > 0 && <ul className="divide-y divide-line rounded-xl border border-line">{seasons.map((s) => <li key={s.id} className="flex items-center justify-between px-3 py-2 text-sm"><span><b>{s.name}</b>{s.theme === "winter" ? " ❄️" : ""} · {s.startsOn} → {s.endsOn}</span><DeleteSeasonButton id={s.id} name={s.name} /></li>)}</ul>}
          </div>
        </Card>

        <Card>
          <CardHeader title="🎯 Weekly Cape challenges" description="Post a challenge; when it ends, pick the winning Cape and they get the points." />
          <div className="space-y-4 px-5 pb-5">
            <ChallengeForm />
            {challenges.length > 0 && <ul className="divide-y divide-line rounded-xl border border-line">{challenges.map((c) => (
              <li key={c.id} className="space-y-2 px-3 py-3 text-sm"><div><b>{c.title}</b> · +{c.points} · {c.startsOn} → {c.endsOn}</div><DecideChallenge id={c.id} capes={activeCapes(a.capeCount).map((cape) => ({ cape, name: names[cape] }))} /></li>
            ))}</ul>}
          </div>
        </Card>

        <Card>
          <CardHeader title="👑 Captains" description="Captains rotate on the 1st of each month (top scorer from last month). Pick someone to override." />
          <div className="space-y-3 px-5 pb-5">{activeCapes(a.capeCount).map((c) => <CaptainForm key={c} cape={c} capeName={names[c]} current={caps[c] ?? null} members={people.filter((p) => p.cape === c)} />)}</div>
        </Card>

        <Card>
          <CardHeader title="🎤 Trivia night" description="A live Cape-vs-Cape game. Set it up, then open the host screen and press Start when everyone's in." />
          <div className="px-5 pb-5">{night ? <Link href="/academy/trivia/night" className="font-semibold text-brand-ink underline">“{night.title}” is {night.status === "live" ? "live" : "ready"}: open the host screen →</Link> : <NightForm />}</div>
        </Card>

        <Card>
          <CardHeader title={`🧠 Trivia questions (${qCount})`} description="Add your own (great for Courage for Kids facts). Turn off any you don't like." />
          <div className="space-y-4 px-5 pb-5">
            <QuestionForm />
            <form className="flex gap-2"><input name="q" defaultValue={sp.q ?? ""} placeholder="Search questions" aria-label="Search questions" className="input" /><button className="rounded-lg border border-line px-3 text-sm font-semibold">Search</button></form>
            <ul className="divide-y divide-line rounded-xl border border-line">{questions.map((q) => (
              <li key={q.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                <span className="shrink-0" title={TRIVIA_CATEGORIES.find((c) => c.id === q.category)?.label}>{TRIVIA_CATEGORIES.find((c) => c.id === q.category)?.emoji}</span>
                <span className={`min-w-0 flex-1 ${q.active ? "" : "text-muted line-through"}`}>{q.question} <span className="text-xs text-muted">({q.choices[q.answer]})</span></span>
                <QuestionToggle id={q.id} active={q.active} />
              </li>))}</ul>
          </div>
        </Card>

        <Card><CardHeader title="⭐ Bonus points" description="For things the portal can't see." /><div className="px-5 pb-5"><BonusForm capeCount={a.capeCount} people={people.map((p) => ({ id: p.id, name: p.name }))} capeNames={names} /></div></Card>
        <Card><CardHeader title="Capes" description="Move someone to another Cape, or clear it so they take the Sorting again." /><div className="px-5 pb-5"><ResortForm capeCount={a.capeCount} people={people} capeNames={names} /></div></Card>
        <Card>
          <CardHeader title="Reported planes" />
          {reported.length ? <ul className="divide-y divide-line border-t border-line">{reported.map((p) => <li key={p.id} className="flex items-center justify-between gap-3 px-5 py-3 text-sm"><span><b>{p.from ?? "Someone"}:</b> {p.message}</span><ReportedPlaneActions id={p.id} /></li>)}</ul> : <p className="px-5 pb-5 text-sm text-muted">Nothing reported.</p>}
        </Card>
      </div>
    </>
  );
}
