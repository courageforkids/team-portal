import { desc, eq, inArray } from "drizzle-orm";
import { PartyPopper } from "lucide-react";
import { db } from "@/db";
import { shoutoutCheers, shoutoutRecipients, shoutouts, users } from "@/db/schema";
import { requireUser } from "@/server/auth";
import { getPeople } from "@/server/queries";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { Avatar, AvatarStack } from "@/components/ui/avatar";
import { CheerButton, DeleteShoutout, GiveShoutout } from "@/components/community/shoutouts";
import { badgeOf } from "@/lib/community";
import { ago } from "@/lib/dates";

export const metadata = { title: "Shout-outs" };

export default async function ShoutoutsPage() {
  const me = await requireUser();
  const [people, rows] = await Promise.all([
    getPeople(),
    db.select({ s: shoutouts, fromName: users.name, fromAvatar: users.avatarFileId }).from(shoutouts).leftJoin(users, eq(users.id, shoutouts.fromId)).orderBy(desc(shoutouts.createdAt)).limit(60),
  ]);
  const ids = rows.map((r) => r.s.id);
  const [recips, cheers] = ids.length ? await Promise.all([
    db.select({ sid: shoutoutRecipients.shoutoutId, id: users.id, name: users.name, avatarFileId: users.avatarFileId }).from(shoutoutRecipients).innerJoin(users, eq(users.id, shoutoutRecipients.userId)).where(inArray(shoutoutRecipients.shoutoutId, ids)),
    db.select().from(shoutoutCheers).where(inArray(shoutoutCheers.shoutoutId, ids)),
  ]) : [[], []];
  return (
    <>
      <PageHeader title="Shout-outs" description="Celebrate each other. Big wins and small kindnesses both count." actions={<GiveShoutout people={people.map((p) => ({ id: p.id, name: p.name, avatarFileId: p.avatarFileId }))} meId={me.id} />} />
      {rows.length === 0 && <div className="card"><EmptyState icon={PartyPopper} title="No shout-outs yet">Be the first. Thank someone for something they did this week.</EmptyState></div>}
      <div className="mx-auto max-w-2xl space-y-4">
        {rows.map(({ s, fromName, fromAvatar }) => {
          const to = recips.filter((r) => r.sid === s.id);
          const c = cheers.filter((x) => x.shoutoutId === s.id);
          const b = badgeOf(s.badge);
          return (
            <article key={s.id} id={`s-${s.id}`} className="card scroll-mt-20 p-5">
              <div className="flex items-start gap-3">
                <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-accent-soft text-2xl" aria-hidden>{b.emoji}</div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm"><span className="font-semibold">{fromName?.split(" ")[0] ?? "Someone"}</span> <span className="text-muted">gave a</span> <span className="font-semibold text-accent-ink">{b.label}</span> <span className="text-muted">shout-out to</span></div>
                  <div className="mt-1.5 flex flex-wrap items-center gap-2">
                    <AvatarStack people={to} max={5} size={26} />
                    <span className="text-sm font-semibold">{to.map((p) => p.name.split(" ")[0]).join(", ")}</span>
                  </div>
                  <p className="prose-body mt-3 text-[15px] text-fg">{s.message}</p>
                  <div className="mt-3 flex items-center gap-2">
                    <CheerButton id={s.id} cheered={c.some((x) => x.userId === me.id)} count={c.length} />
                    <span className="text-xs text-faint">{ago(s.createdAt)}</span>
                    <span className="ml-auto flex items-center gap-1">{fromName && <Avatar name={fromName} fileId={fromAvatar} size={20} />}{(s.fromId === me.id || me.role === "admin") && <DeleteShoutout id={s.id} />}</span>
                  </div>
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </>
  );
}
