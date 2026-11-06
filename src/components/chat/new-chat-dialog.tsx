"use client";
import { useState } from "react";
import { Dialog } from "@/components/ui/dialog";
import { ActionForm, Field, Input, SubmitButton } from "@/components/ui/form";
import { Avatar } from "@/components/ui/avatar";
import { cn } from "@/lib/cn";
import { createGroupAction } from "@/server/chat-actions";

type Person = { id: string; name: string; title?: string; avatarFileId: string | null };

/** Pick 1 person for a direct message, or 2+ for a group chat. */
export function NewChatDialog({ open, onClose, everyone, meId }: { open: boolean; onClose: () => void; everyone: Person[]; meId: string }) {
  const [picked, setPicked] = useState<string[]>([]);
  const [q, setQ] = useState("");
  const shown = everyone.filter((p) => p.id !== meId && (p.name + " " + (p.title ?? "")).toLowerCase().includes(q.toLowerCase()));
  return (
    <Dialog open={open} onClose={() => { setPicked([]); onClose(); }} title="New chat" description="Pick one person to message them, or several to start a group chat.">
      <ActionForm action={createGroupAction} onSuccess={() => { setPicked([]); onClose(); }} className="space-y-4">
        <input className="input h-10" placeholder="Search the team" aria-label="Search the team" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
        <div className="max-h-72 space-y-0.5 overflow-y-auto rounded-xl border border-line p-1.5">
          {shown.length === 0 && <p className="px-2 py-4 text-center text-sm text-muted">No one matches “{q}”.</p>}
          {shown.map((p) => (
            <label key={p.id} className={cn("flex min-h-11 cursor-pointer items-center gap-3 rounded-lg px-2 py-1.5", picked.includes(p.id) ? "bg-brand-soft" : "hover:bg-surface-2")}>
              <input type="checkbox" name="members" value={p.id} checked={picked.includes(p.id)} className="h-[18px] w-[18px] accent-[var(--brand)]"
                onChange={() => setPicked((x) => x.includes(p.id) ? x.filter((y) => y !== p.id) : [...x, p.id])} />
              <Avatar name={p.name} fileId={p.avatarFileId} size={30} />
              <span className="min-w-0"><span className="block truncate text-sm font-medium">{p.name}</span>{p.title && <span className="block truncate text-xs text-muted">{p.title}</span>}</span>
            </label>
          ))}
        </div>
        {picked.length > 1 && <Field label="Group name" htmlFor="gc-title" hint="Optional"><Input id="gc-title" name="title" placeholder="e.g. Packing day crew" maxLength={80} /></Field>}
        <div className="flex justify-end">
          <SubmitButton disabled={!picked.length}>{picked.length > 1 ? `Start group chat (${picked.length + 1})` : "Start chat"}</SubmitButton>
        </div>
      </ActionForm>
    </Dialog>
  );
}
