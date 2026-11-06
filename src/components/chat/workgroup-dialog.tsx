"use client";
import { useState } from "react";
import { Dialog } from "@/components/ui/dialog";
import { ActionForm, Field, Input, SubmitButton, Textarea } from "@/components/ui/form";
import { Avatar } from "@/components/ui/avatar";
import { cn } from "@/lib/cn";
import { saveWorkGroupAction } from "@/server/chat-actions";

type Person = { id: string; name: string; title?: string; avatarFileId: string | null };

/** Admin: create or edit a work pair/group. Members get a shared chat and can be assigned tasks together. */
export function WorkGroupDialog({ open, onClose, everyone, initial }: {
  open: boolean; onClose: () => void; everyone: Person[]; initial?: { id: string; title: string; description: string; memberIds: string[] };
}) {
  const [picked, setPicked] = useState<string[]>(initial?.memberIds ?? []);
  const [q, setQ] = useState("");
  const shown = everyone.filter((p) => p.name.toLowerCase().includes(q.toLowerCase()));
  return (
    <Dialog open={open} onClose={onClose} title={initial ? "Edit work group" : "New work pair or group"}
      description="Put 2 or more people together. They get their own chat, and you can assign tasks to the whole group at once.">
      <ActionForm action={saveWorkGroupAction} onSuccess={onClose} className="space-y-4">
        {initial && <input type="hidden" name="id" value={initial.id} />}
        <Field label="Name" htmlFor="wg-title" required><Input id="wg-title" name="title" defaultValue={initial?.title} placeholder="e.g. Sponsor outreach" maxLength={80} required /></Field>
        <Field label="What are they working on?" htmlFor="wg-desc" hint="Optional"><Textarea id="wg-desc" name="description" rows={2} defaultValue={initial?.description} maxLength={500} /></Field>
        <div>
          <div className="mb-1.5 flex items-center justify-between"><span className="label mb-0">People <span className="text-bad">*</span></span><span className="text-xs text-muted">{picked.length} selected{picked.length === 2 ? " · a pair" : ""}</span></div>
          <input className="input mb-2 h-9 text-sm" placeholder="Find a person" aria-label="Find a person" value={q} onChange={(e) => setQ(e.target.value)} />
          <div className="max-h-60 space-y-0.5 overflow-y-auto rounded-xl border border-line p-1.5">
            {shown.map((p) => (
              <label key={p.id} className={cn("flex cursor-pointer items-center gap-3 rounded-lg px-2 py-1.5", picked.includes(p.id) ? "bg-brand-soft" : "hover:bg-surface-2")}>
                <input type="checkbox" name="members" value={p.id} checked={picked.includes(p.id)} className="h-[18px] w-[18px] accent-[var(--brand)]"
                  onChange={() => setPicked((x) => x.includes(p.id) ? x.filter((y) => y !== p.id) : [...x, p.id])} />
                <Avatar name={p.name} fileId={p.avatarFileId} size={26} />
                <span className="min-w-0"><span className="block truncate text-sm font-medium">{p.name}</span>{p.title && <span className="block truncate text-xs text-muted">{p.title}</span>}</span>
              </label>
            ))}
          </div>
        </div>
        <div className="flex justify-end"><SubmitButton disabled={picked.length < 2}>{initial ? "Save" : "Create work group"}</SubmitButton></div>
      </ActionForm>
    </Dialog>
  );
}
