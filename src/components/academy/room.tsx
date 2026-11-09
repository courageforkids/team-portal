"use client";
import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { ActionForm, Field, Input, Select, SubmitButton, Textarea } from "@/components/ui/form";
import { Avatar } from "@/components/ui/avatar";
import { useToast } from "@/components/ui/toaster";
import { cn } from "@/lib/cn";
import { roomSvg, ROOM_FLOOR, CRESTS, type CapeId } from "@/lib/rooms";
import { CAPTAIN_BONUS_MAX } from "@/lib/academy";
import { sfx } from "@/lib/music";
import { HeroArt } from "./hero-art";
import { HeroCard, type HeroCardData } from "./hero-card";
import { addBoardNoteAction, captainBonusAction, deleteBoardNoteAction, deleteMottoAction, setCapeIdentityAction, suggestMottoAction, voteMottoAction } from "@/server/academy-actions";

const VIEW_W = 1200, VIEW_H = 520;

/** The illustrated room with every member's hero standing on the floor. Tap a hero for their card. New members walk in once. */
export function RoomScene({ cape, winter, members, viewerId }: { cape: CapeId; winter: boolean; members: (HeroCardData & { sortedAt: string | null })[]; viewerId: string }) {
  const bg = useMemo(() => roomSvg(cape, { winter, idPrefix: `room-${cape}` }), [cape, winter]);
  const [open, setOpen] = useState<HeroCardData | null>(null);
  const [walkIn, setWalkIn] = useState<string[]>([]);
  useEffect(() => {
    // Anyone sorted in the last 3 days walks in the first time each viewer opens the room.
    const fresh = members.filter((m) => m.sortedAt && Date.now() - Date.parse(m.sortedAt) < 3 * 86400000 && m.id !== viewerId);
    const unseen = fresh.filter((m) => { try { return !localStorage.getItem(`cfk-walkin-${m.id}`); } catch { return false; } });
    if (!unseen.length) return;
    setWalkIn(unseen.map((m) => m.id));
    setTimeout(() => sfx.welcome(), 300);
    unseen.forEach((m) => { try { localStorage.setItem(`cfk-walkin-${m.id}`, "1"); } catch { /* ignore */ } });
  }, [members, viewerId]);

  const span = ROOM_FLOOR.right - ROOM_FLOOR.left;
  const n = Math.max(1, members.length);
  return (
    <div className="relative w-full overflow-hidden rounded-3xl shadow-pop" style={{ aspectRatio: `${VIEW_W} / ${VIEW_H}` }}>
      <div className="absolute inset-0 [&>svg]:h-full [&>svg]:w-full" aria-hidden dangerouslySetInnerHTML={{ __html: bg }} />
      {members.map((m, i) => {
        const x = ROOM_FLOOR.left + (span * (i + 0.5)) / n;
        const h = n <= 5 ? 40 : n <= 8 ? 33 : 27; // % of the room's height; heroes shrink a little in big Capes
        const fresh = walkIn.includes(m.id);
        return (
          <button key={m.id} type="button" onClick={() => setOpen(m)} aria-label={`${m.name}'s hero`}
            className="group absolute flex -translate-x-1/2 flex-col items-center focus:outline-none"
            style={{ left: `${(x / VIEW_W) * 100}%`, bottom: `${((VIEW_H - ROOM_FLOOR.y) / VIEW_H) * 100}%`, height: `${h}%`, animation: fresh ? `cfk-walk-in 1.6s cubic-bezier(.3,.8,.3,1) ${i * 0.15}s both` : undefined }}>
            <span className="relative h-full transition group-hover:-translate-y-1 group-focus-visible:-translate-y-1">
              {m.hero ? <HeroArt hero={m.hero} cape={m.cape} size={1000} className="!h-full !w-auto aspect-[3/4]" idPrefix={`rm-${m.id}`} />
                : <span className="grid h-full aspect-[3/4] place-items-end justify-center pb-2"><span className="rounded-full bg-white/90 p-1 shadow-pop"><Avatar name={m.name} fileId={m.avatarFileId} size={44} /></span></span>}
              {m.captain && <span className="absolute -top-2 left-1/2 -translate-x-1/2 text-lg drop-shadow" aria-label="Captain">👑</span>}
            </span>
            <span className="mt-0.5 max-w-[90px] truncate rounded-full bg-black/55 px-2 py-0.5 text-[10px] font-bold text-white sm:text-xs">{m.name.split(" ")[0]}{fresh ? " · new!" : ""}</span>
          </button>
        );
      })}
      <Dialog open={!!open} onClose={() => setOpen(null)} title={open?.name ?? ""} size="sm">
        {open && <div className="flex justify-center"><HeroCard d={open} /></div>}
      </Dialog>
    </div>
  );
}

function useRun() {
  const [pending, start] = useTransition();
  const toast = useToast();
  const router = useRouter();
  return { pending, run: (fn: () => Promise<{ ok: boolean; message?: string; error?: string }>) => start(async () => { const r = await fn(); toast.push(r.ok ? "success" : "error", r.ok ? r.message ?? "Done." : r.error ?? ""); router.refresh(); }) };
}

export function BoardNoteForm({ cape }: { cape: string }) {
  return (
    <ActionForm action={addBoardNoteAction} resetOnSuccess className="space-y-2">
      <input type="hidden" name="cape" value={cape} />
      <Textarea name="body" rows={2} maxLength={300} placeholder="Goal for this week: 3 business emails each!" aria-label="New board note" />
      <SubmitButton size="sm">📌 Pin note</SubmitButton>
    </ActionForm>
  );
}
export function DeleteNoteButton({ id }: { id: string }) {
  const { pending, run } = useRun();
  return <button type="button" disabled={pending} onClick={() => run(() => deleteBoardNoteAction(id))} aria-label="Remove note" className="rounded p-1 text-muted hover:text-bad"><Trash2 className="h-3.5 w-3.5" /></button>;
}

export function MottoVoting({ mottos, myVote, canVote, viewerId, isAdmin }: { mottos: { id: string; text: string; votes: number; createdById: string | null }[]; myVote: string | null; canVote: boolean; viewerId: string; isAdmin: boolean }) {
  const { pending, run } = useRun();
  const max = Math.max(1, ...mottos.map((m) => m.votes));
  return (
    <div className="space-y-3">
      {mottos.length === 0 && <p className="text-sm text-muted">No motto ideas yet. Suggest the first one!</p>}
      <ul className="space-y-1.5">
        {mottos.map((m) => (
          <li key={m.id} className="relative overflow-hidden rounded-xl border border-line">
            <div className="absolute inset-y-0 left-0 bg-accent-soft" style={{ width: `${(m.votes / max) * 100}%` }} aria-hidden />
            <div className="relative flex items-center gap-2 px-3 py-2 text-sm">
              <span className="flex-1 font-medium">“{m.text}”</span>
              <span className="tabular-nums text-xs text-muted">{m.votes} vote{m.votes === 1 ? "" : "s"}</span>
              {canVote && <button type="button" disabled={pending || myVote === m.id} onClick={() => run(() => voteMottoAction(m.id))} className={cn("rounded-full px-2.5 py-1 text-xs font-bold", myVote === m.id ? "bg-brand text-brand-fg" : "bg-surface-2 hover:bg-surface-3")}>{myVote === m.id ? "Your pick" : "Vote"}</button>}
              {(m.createdById === viewerId || isAdmin) && <button type="button" disabled={pending} onClick={() => run(() => deleteMottoAction(m.id))} aria-label="Remove motto" className="rounded p-1 text-muted hover:text-bad"><Trash2 className="h-3.5 w-3.5" /></button>}
            </div>
          </li>
        ))}
      </ul>
      {canVote && (
        <ActionForm action={suggestMottoAction} resetOnSuccess className="flex gap-2">
          <Input name="text" maxLength={60} placeholder="Suggest a motto" aria-label="Suggest a motto" />
          <SubmitButton size="sm" variant="secondary">Add</SubmitButton>
        </ActionForm>
      )}
    </div>
  );
}

export function CaptainTools({ cape, name, crest, teammates, canBonus }: { cape: string; name: string; crest: string; teammates: { id: string; name: string }[]; canBonus: boolean }) {
  return (
    <div className="space-y-5">
      {canBonus && <ActionForm action={captainBonusAction} resetOnSuccess className="grid gap-2 sm:grid-cols-[1.2fr_.6fr_1.6fr_auto] sm:items-end">
        <Field label="Give a bonus to" htmlFor="cb-to"><Select id="cb-to" name="userId" defaultValue=""><option value="" disabled>Teammate</option>{teammates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</Select></Field>
        <Field label="Points" htmlFor="cb-pts"><Input id="cb-pts" name="points" type="number" min={1} max={CAPTAIN_BONUS_MAX} defaultValue={2} /></Field>
        <Field label="For" htmlFor="cb-why"><Input id="cb-why" name="reason" maxLength={120} placeholder="Carried the bake sale" /></Field>
        <SubmitButton size="sm">Give</SubmitButton>
      </ActionForm>}
      <ActionForm action={setCapeIdentityAction} className="grid gap-2 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
        <input type="hidden" name="cape" value={cape} />
        <Field label="Cape name" htmlFor="ci-name"><Input id="ci-name" name="name" maxLength={24} defaultValue={name} /></Field>
        <Field label="Crest" htmlFor="ci-crest"><Select id="ci-crest" name="crest" defaultValue={crest}>{CRESTS.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}</Select></Field>
        <SubmitButton size="sm" variant="secondary">Save</SubmitButton>
      </ActionForm>
    </div>
  );
}
