import Link from "next/link";
import { and, asc, count, desc, eq, gte, inArray, lte } from "drizzle-orm";
import { addDays, startOfMonth } from "date-fns";
import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import {
  CheckSquare, Clock3, Hourglass, Trophy, CalendarDays, Send, Megaphone, ArrowRight, Bell, CheckCircle2, RotateCcw, CalendarClock, Sparkles,
  LayoutDashboard, AlertTriangle, Inbox, Pin,
} from "lucide-react";
import { db } from "@/db";
import { announcementReads, announcements, events, notifications, pollVotes, polls, shoutoutRecipients, shoutouts, tasks, users } from "@/db/schema";
import { badgeOf } from "@/lib/community";
import { requireUser } from "@/server/auth";
import { birthdaysToday, upcomingCountdowns } from "@/server/home-extras";
import { loadTasks } from "@/server/queries";
import { allowedVisibilities, audienceMatches } from "@/server/policy";
import { StatCard } from "@/components/ui/stat";
import { Card, CardHeader } from "@/components/ui/card";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { TaskCard, DueChip } from "@/components/tasks/task-bits";
import { WelcomeCard } from "@/components/home/welcome-card";
import { PushPrompt } from "@/components/home/push-toggle";
import { vapidPublicKey } from "@/server/push";
import { ago, DEFAULT_TZ, fmtDate, fmtDateTime } from "@/lib/dates";
import { isOverdue, OPEN_FOR_ASSIGNEE, PRIORITY_RANK } from "@/lib/task-meta";
import { cn } from "@/lib/cn";

export const metadata = { title: "Home" };

const MISSION = [
  "Every box you help pack reminds a kid that a whole team is cheering for them.",
  "Small, consistent work adds up to something big for the families we serve.",
  "Their fight. Our mission. Thank you for showing up this week.",
  "Behind every task here is a child who'll open a box and smile.",
  "Courage is contagious — and so is the kindness you bring to this team.",
];

const NOTE_ICON: Record<string, typeof Bell> = {
  task_assigned: CheckSquare, submission_approved: CheckCircle2, revision_requested: RotateCcw, deadline_changed: CalendarClock,
  deadline_soon: Clock3, deadline_missed: AlertTriangle, announcement: Megaphone, task_submitted: Send, extension_requested: CalendarClock, extension_decided: CalendarClock,
};

export default async function HomePage({ searchParams }: { searchParams: Promise<{ denied?: string }> }) {
  const me = await requireUser();
  const { denied } = await searchParams;
  const tz = me.timezone || DEFAULT_TZ;
  const now = new Date();
  const hour = Number(formatInTimeZone(now, tz, "H"));
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const firstName = me.name.split(" ")[0];
  const dayIndex = Math.floor(now.getTime() / 86400_000);
  const monthStart = fromZonedTime(formatInTimeZone(startOfMonth(now), tz, "yyyy-MM-01'T'00:00"), tz);

  const [active, completed, notes, upcomingEvents, anns] = await Promise.all([
    loadTasks(me, { scope: "mine", view: "active" }),
    loadTasks(me, { scope: "mine", view: "completed", limit: 200 }),
    db.select().from(notifications).where(eq(notifications.userId, me.id)).orderBy(desc(notifications.createdAt)).limit(7),
    db.select().from(events).where(and(gte(events.startsAt, addDays(now, -0.5)), lte(events.startsAt, addDays(now, 14)), inArray(events.visibility, allowedVisibilities(me.role)))).orderBy(asc(events.startsAt)).limit(5),
    db.select({ a: announcements, ack: announcementReads.acknowledgedAt }).from(announcements)
      .leftJoin(announcementReads, and(eq(announcementReads.announcementId, announcements.id), eq(announcementReads.userId, me.id)))
      .where(lte(announcements.publishAt, now)).orderBy(desc(announcements.pinned), desc(announcements.publishAt)).limit(20),
  ]);
  const visibleAnns = anns.filter((r) => audienceMatches(r.a.audience, me));
  const [openPolls, myVotes, latestShout] = await Promise.all([
    db.select({ id: polls.id, question: polls.question, audience: polls.audience, closesAt: polls.closesAt, closedAt: polls.closedAt }).from(polls).orderBy(desc(polls.createdAt)).limit(20),
    db.select({ pollId: pollVotes.pollId }).from(pollVotes).where(eq(pollVotes.userId, me.id)),
    db.select({ s: shoutouts, from: users.name }).from(shoutouts).leftJoin(users, eq(users.id, shoutouts.fromId)).orderBy(desc(shoutouts.createdAt)).limit(1),
  ]);
  const [countdowns, bdays] = await Promise.all([upcomingCountdowns(2), birthdaysToday()]);
  const votedIds = new Set(myVotes.map((v) => v.pollId));
  const pollsToVote = openPolls.filter((p) => !p.closedAt && !(p.closesAt && p.closesAt <= now) && !votedIds.has(p.id) && audienceMatches(p.audience, me));
  const shout = latestShout[0];
  const shoutTo = shout ? await db.select({ name: users.name }).from(shoutoutRecipients).innerJoin(users, eq(users.id, shoutoutRecipients.userId)).where(eq(shoutoutRecipients.shoutoutId, shout.s.id)) : [];
  const needsAck = visibleAnns.filter((r) => r.a.requireAck && !r.ack);
  const pinned = visibleAnns.find((r) => r.a.pinned);

  const open = active.filter((t) => OPEN_FOR_ASSIGNEE.includes(t.status));
  const awaiting = active.filter((t) => t.status === "submitted" || t.status === "under_review");
  const dueSoon = open.filter((t) => t.dueAt && t.dueAt.getTime() - now.getTime() <= 7 * 86400_000);
  const doneThisMonth = completed.filter((t) => t.completedAt && t.completedAt >= monthStart).length;
  const rank = (t: (typeof open)[number]) => (isOverdue(t) ? 0 : t.status === "revision_requested" ? 1 : t.status === "blocked" ? 3 : 2);
  const priorities = [...open].sort((a, b) => rank(a) - rank(b) || (a.dueAt?.getTime() ?? Infinity) - (b.dueAt?.getTime() ?? Infinity) || PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority]).slice(0, 4);
  const deadlines = open.filter((t) => t.dueAt && t.dueAt <= addDays(now, 21)).sort((a, b) => a.dueAt!.getTime() - b.dueAt!.getTime()).slice(0, 6);
  const nextToSubmit = priorities.find((t) => t.status !== "blocked");

  let exec: { review: number; overdue: number } | null = null;
  if (me.role === "admin") {
    const [[r], [o]] = await Promise.all([
      db.select({ n: count() }).from(tasks).where(inArray(tasks.status, ["submitted", "under_review"])),
      db.select({ n: count() }).from(tasks).where(and(inArray(tasks.status, OPEN_FOR_ASSIGNEE), lte(tasks.dueAt, now))),
    ]);
    exec = { review: r.n, overdue: o.n };
  }

  return (
    <div className="space-y-6">
      {denied && <div role="alert" className="rounded-xl border border-line bg-surface-2 px-4 py-3 text-sm text-fg-2">That page is only available to administrators.</div>}

      {/* Welcome */}
      <section className="animate-in relative overflow-hidden rounded-2xl bg-brand px-5 py-6 text-brand-fg sm:px-7 sm:py-7">
        <div aria-hidden className="absolute -right-10 -top-16 h-56 w-56 rounded-full bg-accent/25 blur-2xl" />
        <div aria-hidden className="absolute bottom-[-60px] right-24 h-40 w-40 rounded-full bg-white/10 blur-2xl" />
        <div className="relative flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm font-medium text-white/75">{formatInTimeZone(now, tz, "EEEE, MMMM d")}</p>
            <h1 className="mt-1 text-[26px] font-bold tracking-tight sm:text-3xl">{greeting}, {firstName}!</h1>
            <p className="mt-1 text-white/85">Here’s what’s happening at Courage for Kids.</p>
            <p className="mt-3 flex max-w-xl items-start gap-2 text-sm text-white/75"><Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-accent" />{MISSION[dayIndex % MISSION.length]}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {nextToSubmit ? <ButtonLink href={`/tasks/${nextToSubmit.id}`} variant="accent"><Send className="h-4 w-4" />Work on next task</ButtonLink>
              : <ButtonLink href="/tasks" variant="accent"><CheckSquare className="h-4 w-4" />View my tasks</ButtonLink>}
          </div>
        </div>
      </section>

      {!me.onboardedAt && <WelcomeCard name={firstName} role={me.role} />}
      {vapidPublicKey() && <PushPrompt publicKey={vapidPublicKey()!} />}

      {needsAck.length > 0 && (
        <Link href={`/announcements/${needsAck[0].a.id}`} className="focus-ring flex items-center gap-3 rounded-xl border border-accent/60 bg-accent-soft px-4 py-3 text-sm transition hover:brightness-[.98]">
          <Megaphone className="h-5 w-5 shrink-0 text-accent-ink" />
          <span className="min-w-0 flex-1"><b className="text-fg">Please read and acknowledge:</b> <span className="text-fg-2">{needsAck[0].a.title}</span>{needsAck.length > 1 && <span className="text-muted"> (+{needsAck.length - 1} more)</span>}</span>
          <ArrowRight className="h-4 w-4 shrink-0 text-accent-ink" />
        </Link>
      )}

      {pollsToVote.length > 0 && (
        <Link href={`/polls#poll-${pollsToVote[0].id}`} className="focus-ring flex items-center gap-3 rounded-xl border border-brand/30 bg-brand-soft px-4 py-3 text-sm transition hover:brightness-[.98]">
          <span className="text-lg" aria-hidden>🗳️</span>
          <span className="min-w-0 flex-1"><b className="text-fg">Vote:</b> <span className="text-fg-2">{pollsToVote[0].question}</span>{pollsToVote.length > 1 && <span className="text-muted"> (+{pollsToVote.length - 1} more)</span>}</span>
          <ArrowRight className="h-4 w-4 shrink-0 text-brand-ink" />
        </Link>
      )}

      {bdays.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-accent/60 bg-accent-soft px-4 py-3 text-sm">
          <span className="text-2xl" aria-hidden>🎂</span>
          <span className="min-w-0 flex-1">{bdays.some((b) => b.id === me.id) ? <b className="text-fg">Happy birthday, {firstName}! The whole team is cheering for you today.</b>
            : <><b className="text-fg">It&apos;s {bdays.map((b) => b.name.split(" ")[0]).join(" & ")}&apos;s birthday!</b> <Link href="/shoutouts" className="font-semibold text-accent-ink hover:underline">Give them a shout-out</Link></>}</span>
        </div>
      )}
      {countdowns.length > 0 && (
        <section aria-label="Countdowns" className="grid gap-3 sm:grid-cols-2">
          {countdowns.map((c) => (
            <Link key={c.id} href={`/volunteer/events/${c.id}`} className="focus-ring flex items-center gap-4 rounded-xl border border-line bg-surface px-4 py-3 shadow-soft transition hover:border-line-strong">
              <div className="grid h-14 w-14 shrink-0 place-items-center rounded-xl bg-brand text-brand-fg"><div className="text-center leading-none"><div className="text-xl font-extrabold tabular-nums">{c.days}</div><div className="text-[10px] font-semibold uppercase">{c.days === 1 ? "day" : "days"}</div></div></div>
              <div className="min-w-0 flex-1">
                <div className="line-clamp-2 font-semibold leading-snug">{c.days === 0 ? `${c.title} is today!` : `${c.title} in ${c.days} day${c.days === 1 ? "" : "s"}`}</div>
                {c.capacity > 0 ? (
                  <div className="mt-1.5"><div className="h-1.5 overflow-hidden rounded-full bg-surface-2"><div className="h-full rounded-full bg-accent" style={{ width: `${Math.min(100, (c.filled / c.capacity) * 100)}%` }} /></div><div className="mt-1 text-xs text-muted">{c.filled} of {c.capacity} volunteer spots filled</div></div>
                ) : <div className="text-xs text-muted">{c.filled ? `${c.filled} signed up` : formatInTimeZone(c.startsAt, tz, "EEE, MMM d")}</div>}
              </div>
            </Link>
          ))}
        </section>
      )}

      {exec && (
        <Link href="/admin" className="focus-ring flex flex-wrap items-center gap-x-6 gap-y-2 rounded-xl border border-line bg-surface px-4 py-3 text-sm shadow-soft transition hover:border-line-strong">
          <span className="inline-flex items-center gap-2 font-semibold"><LayoutDashboard className="h-4 w-4 text-brand-ink" />Executive snapshot</span>
          <span className="inline-flex items-center gap-1.5 text-fg-2"><Inbox className="h-4 w-4 text-violet" /><b>{exec.review}</b> awaiting your review</span>
          <span className="inline-flex items-center gap-1.5 text-fg-2"><AlertTriangle className="h-4 w-4 text-warn" /><b>{exec.overdue}</b> overdue across the team</span>
          <span className="ml-auto inline-flex items-center gap-1 font-semibold text-brand-ink">Command center<ArrowRight className="h-4 w-4" /></span>
        </Link>
      )}

      {/* Overview */}
      <section aria-label="Overview" className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <StatCard label="Assigned to me" value={open.length} icon={CheckSquare} href="/tasks" hint={open.length ? "Still to do" : "All clear"} />
        <StatCard label="Due this week" value={dueSoon.length} icon={Clock3} tone="accent" href="/tasks?due=week" hint="Next 7 days" />
        <StatCard label="Awaiting review" value={awaiting.length} icon={Hourglass} tone="violet" href="/tasks?view=review" hint="Submitted by you" />
        <StatCard label="Completed this month" value={doneThisMonth} icon={Trophy} tone="ok" href="/tasks?view=completed" hint={formatInTimeZone(now, tz, "MMMM")} />
        <div className="col-span-2 lg:col-span-1"><StatCard label="Upcoming events" value={upcomingEvents.length} icon={CalendarDays} href="/calendar" hint="Next 2 weeks" /></div>
      </section>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader title="My priorities" description="What to focus on first." action={<Link href="/tasks" className="text-sm font-semibold text-brand-ink hover:underline">All tasks</Link>} />
            <div className="grid gap-3 px-5 pb-5 sm:grid-cols-2">
              {priorities.length ? priorities.map((t) => <TaskCard key={t.id} t={t} />) : (
                <div className="sm:col-span-2"><EmptyState compact icon={CheckCircle2} title="Nothing on your plate right now">{awaiting.length ? `${awaiting.length} submission${awaiting.length === 1 ? " is" : "s are"} waiting for review.` : "New assignments will appear here."}</EmptyState></div>
              )}
            </div>
          </Card>

          <Card>
            <CardHeader title="Upcoming deadlines" description="Next three weeks." />
            {deadlines.length ? (
              <ol className="divide-y divide-line border-t border-line">
                {deadlines.map((t) => (
                  <li key={t.id}>
                    <Link href={`/tasks/${t.id}`} className="focus-ring flex items-center gap-4 px-5 py-3 hover:bg-surface-2">
                      <div className={cn("w-12 shrink-0 rounded-lg py-1 text-center", isOverdue(t) ? "bg-warn-soft text-warn" : "bg-surface-2 text-fg-2")}>
                        <div className="text-[10px] font-bold uppercase">{fmtDate(t.dueAt, t.timezone, "MMM")}</div>
                        <div className="text-lg font-bold leading-tight">{fmtDate(t.dueAt, t.timezone, "d")}</div>
                      </div>
                      <div className="min-w-0 flex-1"><div className="truncate font-medium">{t.title}</div><DueChip status={t.status} dueAt={t.dueAt} tz={t.timezone} /></div>
                    </Link>
                  </li>
                ))}
              </ol>
            ) : <EmptyState compact icon={CalendarClock} title="No deadlines coming up">Enjoy the breathing room.</EmptyState>}
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="p-5">
            <h2 className="mb-3 text-[15px] font-semibold">Quick actions</h2>
            <div className="grid grid-cols-2 gap-2">
              {[
                { href: "/tasks", label: "View my tasks", icon: CheckSquare },
                { href: nextToSubmit ? `/tasks/${nextToSubmit.id}` : "/tasks", label: "Submit assignment", icon: Send },
                { href: "/calendar", label: "View calendar", icon: CalendarDays },
                { href: "/announcements", label: "Announcements", icon: Megaphone },
              ].map((a) => (
                <Link key={a.label} href={a.href} className="focus-ring flex min-h-[76px] flex-col items-start justify-between gap-2 rounded-xl border border-line p-3 text-sm font-semibold transition hover:border-brand/40 hover:bg-brand-soft">
                  <a.icon className="h-5 w-5 text-brand-ink" aria-hidden />{a.label}
                </Link>
              ))}
            </div>
          </Card>

          {shout && (
            <Link href={`/shoutouts#s-${shout.s.id}`} className="focus-ring card block p-5 transition hover:border-line-strong">
              <div className="eyebrow mb-1.5">Latest shout-out</div>
              <div className="flex items-start gap-3">
                <span className="text-2xl" aria-hidden>{badgeOf(shout.s.badge).emoji}</span>
                <div className="min-w-0"><div className="text-sm"><b>{shout.from?.split(" ")[0] ?? "Someone"}</b> → <b>{shoutTo.map((t) => t.name.split(" ")[0]).join(", ")}</b></div><p className="mt-0.5 line-clamp-3 text-sm text-muted">{shout.s.message}</p></div>
              </div>
            </Link>
          )}

          {pinned && (
            <Link href={`/announcements/${pinned.a.id}`} className="focus-ring card block p-5 transition hover:border-line-strong">
              <div className="eyebrow mb-1.5 flex items-center gap-1.5"><Pin className="h-3 w-3" />Pinned announcement</div>
              <div className="font-semibold">{pinned.a.title}</div>
              <p className="mt-1 line-clamp-3 text-sm text-muted">{pinned.a.body}</p>
            </Link>
          )}

          <Card>
            <CardHeader title="Upcoming events" action={<Link href="/calendar" className="text-sm font-semibold text-brand-ink hover:underline">Calendar</Link>} />
            {upcomingEvents.length ? (
              <ul className="space-y-3 px-5 pb-5">
                {upcomingEvents.map((e) => (
                  <li key={e.id} className="flex gap-3 text-sm">
                    <CalendarDays className="mt-0.5 h-4 w-4 shrink-0 text-muted" />
                    <div className="min-w-0"><div className="font-medium">{e.title}</div><div className="text-xs text-muted">{e.allDay ? fmtDate(e.startsAt, tz, "EEE, MMM d") : fmtDateTime(e.startsAt, tz)}{e.location ? ` · ${e.location}` : ""}</div></div>
                  </li>
                ))}
              </ul>
            ) : <EmptyState compact title="No events in the next two weeks" />}
          </Card>

          <Card>
            <CardHeader title="Recent activity" action={<Link href="/notifications" className="text-sm font-semibold text-brand-ink hover:underline">See all</Link>} />
            {notes.length ? (
              <ul className="space-y-1 px-3 pb-3">
                {notes.map((n) => {
                  const Icon = NOTE_ICON[n.type] ?? Bell;
                  return (
                    <li key={n.id}>
                      <Link href={n.href ?? "/notifications"} className="focus-ring flex gap-3 rounded-lg px-2 py-2 hover:bg-surface-2">
                        <span className={cn("grid h-8 w-8 shrink-0 place-items-center rounded-lg", n.readAt ? "bg-surface-2 text-muted" : "bg-brand-soft text-brand-ink")}><Icon className="h-4 w-4" /></span>
                        <span className="min-w-0"><span className={cn("block truncate text-sm", !n.readAt && "font-semibold")}>{n.title}</span><span className="text-xs text-muted">{ago(n.createdAt)}</span></span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            ) : <EmptyState compact icon={Bell} title="No activity yet">Assignments, reviews and announcements will show up here.</EmptyState>}
          </Card>
        </div>
      </div>
    </div>
  );
}
