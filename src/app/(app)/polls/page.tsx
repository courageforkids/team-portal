import { desc, eq, inArray } from "drizzle-orm";
import { Vote } from "lucide-react";
import { db } from "@/db";
import { pollVotes, polls, users } from "@/db/schema";
import { requireUser } from "@/server/auth";
import { audienceMatches } from "@/server/policy";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { NewPollButton } from "@/components/community/new-poll";
import { PollCard, type PollView } from "@/components/community/poll-card";
import { fmtDateTime } from "@/lib/dates";

export const metadata = { title: "Polls" };

export default async function PollsPage() {
  const me = await requireUser();
  const rows = (await db.select({ p: polls, author: users.name }).from(polls).leftJoin(users, eq(users.id, polls.createdById)).orderBy(desc(polls.createdAt)).limit(60))
    .filter((r) => audienceMatches(r.p.audience, me) || r.p.createdById === me.id);
  const ids = rows.map((r) => r.p.id);
  const votes = ids.length ? await db.select({ v: pollVotes, name: users.name }).from(pollVotes).innerJoin(users, eq(users.id, pollVotes.userId)).where(inArray(pollVotes.pollId, ids)) : [];
  const now = new Date();
  const views: PollView[] = rows.map(({ p, author }) => {
    const vs = votes.filter((x) => x.v.pollId === p.id);
    const open = !p.closedAt && !(p.closesAt && p.closesAt <= now);
    const mine = vs.find((x) => x.v.userId === me.id)?.v.optionIds ?? [];
    const canManage = p.createdById === me.id || me.role === "admin";
    const showResults = !open || p.showResults === "always" || (p.showResults === "after_vote" && (mine.length > 0 || canManage));
    return {
      id: p.id, question: p.question, description: p.description, multiple: p.multiple, anonymous: p.anonymous, open, myVote: mine, total: vs.length, showResults, canManage,
      author: author?.split(" ")[0] ?? "Someone", closesLabel: open && p.closesAt ? `closes ${fmtDateTime(p.closesAt)}` : null,
      options: p.options.map((o) => {
        const who = vs.filter((x) => x.v.optionIds.includes(o.id));
        return { id: o.id, label: o.label, count: who.length, voters: p.anonymous ? [] : who.map((x) => x.name.split(" ")[0]) };
      }),
    };
  });
  const openPolls = views.filter((v) => v.open), closed = views.filter((v) => !v.open);
  return (
    <>
      <PageHeader title="Polls" description="Quick team votes: pick a date, choose a design, decide together." actions={me.role !== "volunteer" && <NewPollButton canDraft={me.role === "admin"} />} />
      {views.length === 0 && <div className="card"><EmptyState icon={Vote} title="No polls yet">{me.role !== "volunteer" ? "Ask the team something, like which day works for packing." : "When there's a team vote, it'll show up here."}</EmptyState></div>}
      <div className="grid gap-4 lg:grid-cols-2">{openPolls.map((p) => <PollCard key={p.id} p={p} />)}</div>
      {closed.length > 0 && <><h2 className="eyebrow mb-3 mt-8">Closed</h2><div className="grid gap-4 lg:grid-cols-2">{closed.map((p) => <PollCard key={p.id} p={p} />)}</div></>}
    </>
  );
}
