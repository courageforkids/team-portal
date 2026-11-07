"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { PartyPopper, Trash2 } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { ActionForm, Field, SubmitButton, Textarea } from "@/components/ui/form";
import { useToast } from "@/components/ui/toaster";
import { cn } from "@/lib/cn";
import { SHOUTOUT_BADGES } from "@/lib/community";
import { deleteShoutoutAction, giveShoutoutAction, toggleCheerAction } from "@/server/community-actions";

type Person = { id: string; name: string; avatarFileId: string | null };

export function GiveShoutout({ people, meId }: { people: Person[]; meId: string }) {
  const [open, setOpen] = useState(false);
  const [to, setTo] = useState<string[]>([]);
  const [badge, setBadge] = useState("thanks");
  const others = people.filter((p) => p.id !== meId);
  return (
    <>
      <Button variant="accent" onClick={() => setOpen(true)}><PartyPopper className="h-4 w-4" />Give a shout-out</Button>
      <Dialog open={open} onClose={() => setOpen(false)} title="Give a shout-out" description="Thank someone for something they did. The whole team sees it.">
        <ActionForm action={giveShoutoutAction} onSuccess={() => { setOpen(false); setTo([]); setBadge("thanks"); }} className="space-y-4">
          <fieldset>
            <legend className="label">Who</legend>
            <div className="flex flex-wrap gap-2">
              {others.map((p) => (
                <label key={p.id} className={cn("inline-flex cursor-pointer items-center gap-2 rounded-full border py-1 pl-1 pr-3 text-sm transition", to.includes(p.id) ? "border-brand/50 bg-brand-soft font-semibold text-brand-ink" : "border-line hover:bg-surface-2")}>
                  <input type="checkbox" name="to" value={p.id} checked={to.includes(p.id)} className="sr-only" onChange={() => setTo(to.includes(p.id) ? to.filter((x) => x !== p.id) : [...to, p.id])} />
                  <Avatar name={p.name} fileId={p.avatarFileId} size={24} /><span>{p.name.split(" ")[0]}</span>
                </label>
              ))}
            </div>
          </fieldset>
          <fieldset>
            <legend className="label">For</legend>
            <input type="hidden" name="badge" value={badge} />
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {SHOUTOUT_BADGES.map((b) => (
                <button type="button" key={b.key} onClick={() => setBadge(b.key)} aria-pressed={badge === b.key}
                  className={cn("flex items-center gap-2 rounded-xl border px-3 py-2 text-left text-sm transition", badge === b.key ? "border-brand/50 bg-brand-soft font-semibold" : "border-line hover:bg-surface-2")}>
                  <span className="text-lg" aria-hidden>{b.emoji}</span>{b.label}
                </button>
              ))}
            </div>
          </fieldset>
          <Field label="What did they do?" htmlFor="so-msg"><Textarea id="so-msg" name="message" rows={3} maxLength={500} placeholder="e.g. Stayed late to finish packing every single box. Legend." required /></Field>
          <div className="flex justify-end"><SubmitButton disabled={!to.length}>Post shout-out</SubmitButton></div>
        </ActionForm>
      </Dialog>
    </>
  );
}

export function CheerButton({ id, cheered, count }: { id: string; cheered: boolean; count: number }) {
  const [on, setOn] = useState(cheered);
  const [n, setN] = useState(count);
  const [, start] = useTransition();
  return (
    <button aria-pressed={on} onClick={() => { setOn(!on); setN(n + (on ? -1 : 1)); start(async () => { await toggleCheerAction(id); }); }}
      className={cn("inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-sm font-semibold transition", on ? "border-accent bg-accent-soft text-accent-ink" : "border-line text-muted hover:bg-surface-2")}>
      <span aria-hidden>👏</span>{n > 0 ? n : "Cheer"}
    </button>
  );
}

export function DeleteShoutout({ id }: { id: string }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  const toast = useToast();
  return (
    <button aria-label="Remove shout-out" disabled={pending} onClick={() => { if (window.confirm("Remove this shout-out?")) start(async () => { const r = await deleteShoutoutAction(id); toast.push(r.ok ? "success" : "error", r.ok ? r.message ?? "" : r.error); router.refresh(); }); }}
      className="rounded-lg p-1.5 text-faint hover:bg-surface-2 hover:text-bad"><Trash2 className="h-4 w-4" /></button>
  );
}
