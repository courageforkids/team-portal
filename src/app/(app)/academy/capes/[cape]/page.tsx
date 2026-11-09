import Link from "next/link";
import { notFound } from "next/navigation";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { capeBoardNotes, capeMottoVotes, conversations, messages, users } from "@/db/schema";
import { requireUser } from "@/server/auth";
import { currentSeason, mottos, pointsByUser, pointsOf, requireAcademy, standings, topMotto, trophies } from "@/server/academy";
import { heroCards } from "@/server/academy-view";
import { Card, CardHeader } from "@/components/ui/card";
import { Avatar } from "@/components/ui/avatar";
import { AcademyTabs } from "@/components/academy/tabs";
import { AcademyMusic, SoundControls } from "@/components/academy/music";
import { CapeCrest, CapeRing } from "@/components/academy/hero-art";
import { BoardNoteForm, CaptainTools, DeleteNoteButton, MottoVoting, RoomScene } from "@/components/academy/room";
import { activeCapes, CAPES, capeLabel, DEFAULT_CREST, isCape } from "@/lib/academy";
import { ROOM_INFO } from "@/lib/rooms";
import { ago } from "@/lib/dates";

export const metadata = { title: "Common room" };

export default async function CommonRoomPage({ params }: { params: Promise<{ cape: string }> }) {
  const me = await requireUser();
  const a = await requireAcademy(me);
  const { cape } = await params;
  if (!isCape(cape) || !activeCapes(a.capeCount).includes(cape)) notFound();
  const [{ cards, captains }, season, motto, trophy, notes, [vote], chat] = await Promise.all([
    heroCards(a), currentSeason(), mottos(), trophies(a.capeCount),
    db.select({ id: capeBoardNotes.id, body: capeBoardNotes.body, createdAt: capeBoardNotes.createdAt, createdById: capeBoardNotes.createdById, by: users.name }).from(capeBoardNotes).leftJoin(users, eq(users.id, capeBoardNotes.createdById)).where(eq(capeBoardNotes.cape, cape)).orderBy(desc(capeBoardNotes.createdAt)).limit(10),
    db.select({ mottoId: capeMottoVotes.mottoId }).from(capeMottoVotes).where(and(eq(capeMottoVotes.cape, cape), eq(capeMottoVotes.userId, me.id))),
    db.select({ id: conversations.id }).from(conversations).where(eq(conversations.dmKey, `cape:${cape}`)),
  ]);
  const myCape = cards.find((c) => c.id === me.id)?.cape ?? null;
  const member = myCape === cape;
  const insider = member || me.role === "admin"; // visitors from other Capes can look around but not read the board or chat
  const isCaptain = captains[cape] === me.id;
  const members = cards.filter((c) => c.cape === cape);
  const name = capeLabel(cape, a.capes);
  const crest = a.capes[cape]?.crest ?? DEFAULT_CREST[cape];
  const winter = season?.theme === "winter";
  const captain = members.find((m) => m.id === captains[cape]);

  const weekPts = await pointsByUser({ startsOn: new Date(Date.now() - 7 * 86400000).toLocaleDateString("en-CA", { timeZone: "America/New_York" }), endsOn: new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" }) });
  const mvp = [...members].sort((x, y) => pointsOf(weekPts, y.id).total - pointsOf(weekPts, x.id).total)[0];
  const mvpPts = mvp ? pointsOf(weekPts, mvp.id).total : 0;
  const streakStar = [...members].sort((x, y) => y.streak - x.streak)[0];
  const seasonBoard = season ? await standings(season, a.capeCount) : null;
  const mine = seasonBoard?.find((s) => s.cape === cape);
  const place = seasonBoard ? seasonBoard.findIndex((s) => s.cape === cape) + 1 : 0;
  const recent = insider && chat[0] ? await db.select({ id: messages.id, body: messages.body, system: messages.system, createdAt: messages.createdAt, name: users.name, avatar: users.avatarFileId })
    .from(messages).leftJoin(users, eq(users.id, messages.authorId)).where(and(eq(messages.conversationId, chat[0].id))).orderBy(desc(messages.createdAt)).limit(6) : [];
  const myTrophies = [...trophy.seasons.filter((t) => t.cape === cape).map((t) => ({ id: t.id, label: t.name, icon: "🏆" })), ...trophy.challenges.filter((t) => t.cape === cape).map((t) => ({ id: t.id, label: t.title, icon: "🎯" }))];

  return (
    <>
      <AcademyMusic track={winter ? "winter" : cape} />
      <AcademyTabs myCape={myCape && isCape(myCape) ? myCape : null} admin={me.role === "admin"} />
      <header className="mb-4 flex flex-wrap items-center gap-4">
        <CapeCrest cape={cape} crest={crest} size={64} />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-bold uppercase tracking-[.2em] text-muted">{ROOM_INFO[cape].name} · {members.length} member{members.length === 1 ? "" : "s"}</p>
          <h1 className="text-2xl font-extrabold sm:text-3xl" style={{ color: CAPES[cape].deep }}>{name}</h1>
          <p className="text-fg-2">“{topMotto(motto.list, cape) ?? CAPES[cape].motto}”</p>
        </div>
        <SoundControls track={winter ? "winter" : cape} className="w-full sm:w-auto" />
      </header>
      {!member && <p className="mb-3 rounded-xl bg-surface-2 px-4 py-2 text-sm text-muted">👀 You&apos;re visiting. {me.role === "admin" ? "As an admin you can see everything here." : "Only members can see the board and the chat."}</p>}

      <RoomScene cape={cape} winter={winter} members={members} viewerId={me.id} />
      <p className="mt-2 text-center text-xs text-muted">{ROOM_INFO[cape].blurb} Tap a hero to see their card.</p>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="📌 Captain's board" description={captain ? `Captain this month: ${captain.name}` : "A captain is picked each month."} />
          <div className="space-y-3 px-5 pb-5">
            {insider ? (notes.length ? (
              <ul className="grid gap-3 sm:grid-cols-2">
                {notes.map((n, i) => (
                  <li key={n.id} className="relative rounded-md bg-[#fff6c8] p-3 text-[#3b2f00] shadow-soft" style={{ transform: `rotate(${i % 2 ? 1.2 : -1.2}deg)` }}>
                    <span className="absolute -top-2 left-1/2 -translate-x-1/2 text-lg" aria-hidden>📌</span>
                    <p className="whitespace-pre-wrap text-sm font-medium">{n.body}</p>
                    <div className="mt-2 flex items-center justify-between text-[11px] opacity-70"><span>{n.by?.split(" ")[0] ?? "Captain"} · {ago(n.createdAt)}</span>{(isCaptain || me.role === "admin" || n.createdById === me.id) && <DeleteNoteButton id={n.id} />}</div>
                  </li>
                ))}
              </ul>
            ) : <p className="text-sm text-muted">Nothing pinned yet.</p>) : <p className="text-sm text-muted">🔒 Members only.</p>}
            {(isCaptain || me.role === "admin") && <BoardNoteForm cape={cape} />}
          </div>
        </Card>

        <Card>
          <CardHeader title="📊 Cape stats" />
          <dl className="space-y-3 px-5 pb-5 text-sm">
            {mine && <div className="flex justify-between"><dt className="text-muted">{season!.name}</dt><dd className="font-bold">{place === 1 && mine.average > 0 ? "🏆 " : ""}#{place} · {mine.average} avg</dd></div>}
            {mvp && mvpPts > 0 && <div className="flex items-center justify-between gap-2"><dt className="text-muted">MVP this week</dt><dd className="flex items-center gap-2 font-bold"><CapeRing cape={cape} points={mvp.lifetime} size={22}><Avatar name={mvp.name} fileId={mvp.avatarFileId} size={22} /></CapeRing>{mvp.name.split(" ")[0]} · {mvpPts}</dd></div>}
            {streakStar && streakStar.streak > 0 && <div className="flex justify-between"><dt className="text-muted">Longest streak</dt><dd className="font-bold">🔥 {streakStar.name.split(" ")[0]} · {streakStar.streak} wk</dd></div>}
            <div className="flex justify-between"><dt className="text-muted">Trophies</dt><dd className="font-bold">{myTrophies.length}</dd></div>
          </dl>
        </Card>

        <Card>
          <CardHeader title="🏆 Trophy shelf" />
          <div className="px-5 pb-5">
            {myTrophies.length ? (
              <ul className="grid grid-cols-3 gap-2">
                {myTrophies.map((t) => <li key={t.id} className="flex flex-col items-center rounded-xl bg-gradient-to-b from-surface-2 to-surface p-2 text-center"><span className="text-3xl drop-shadow">{t.icon}</span><span className="mt-1 line-clamp-2 text-[11px] font-semibold">{t.label}</span></li>)}
              </ul>
            ) : <p className="text-sm text-muted">The shelf is waiting for your first trophy. Win a weekly challenge, a trivia night or the season!</p>}
          </div>
        </Card>

        <Card>
          <CardHeader title="✍️ Our motto" description={member ? "Suggest one and vote. The top motto shows everywhere." : undefined} />
          <div className="px-5 pb-5">
            {insider ? <MottoVoting mottos={motto.list.filter((m) => m.cape === cape)} myVote={vote?.mottoId ?? null} canVote={member} viewerId={me.id} isAdmin={me.role === "admin"} /> : <p className="text-sm text-muted">🔒 Members only.</p>}
          </div>
        </Card>

        <Card>
          <CardHeader title="💬 Cape chat" action={insider && chat[0] ? <Link href={`/messages/${chat[0].id}`} className="text-sm font-semibold text-brand-ink hover:underline">Open chat</Link> : undefined} />
          <div className="px-5 pb-5">
            {!insider ? <p className="text-sm text-muted">🔒 Members only.</p> : recent.length ? (
              <ul className="space-y-2">
                {[...recent].reverse().map((m) => m.system ? <li key={m.id} className="text-center text-xs text-muted">{m.body}</li> : (
                  <li key={m.id} className="flex items-start gap-2 text-sm"><Avatar name={m.name ?? "?"} fileId={m.avatar} size={24} /><span className="min-w-0"><b>{m.name?.split(" ")[0]}</b> <span className="break-words text-fg-2">{m.body.slice(0, 140) || "📷 Photo"}</span></span></li>
                ))}
              </ul>
            ) : <p className="text-sm text-muted">No messages yet. {chat[0] && <Link href={`/messages/${chat[0].id}`} className="font-semibold text-brand-ink underline">Say hi 👋</Link>}</p>}
          </div>
        </Card>

        {(isCaptain || me.role === "admin") && (
          <Card className="lg:col-span-3">
            <CardHeader title="👑 Captain tools" description={`Give up to 10 bonus points a week to teammates, and pick your Cape's name and crest.${!isCaptain ? " (You're seeing this as an admin.)" : ""}`} />
            <div className="px-5 pb-5"><CaptainTools cape={cape} name={a.capes[cape]?.name ?? ""} crest={crest} teammates={members.filter((m) => m.id !== me.id).map((m) => ({ id: m.id, name: m.name }))} canBonus={isCaptain} /></div>
          </Card>
        )}
      </div>
    </>
  );
}
