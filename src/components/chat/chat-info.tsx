"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { BellOff, Bell, LogOut, Pencil, UserPlus, X, ShieldCheck, Archive, ArchiveRestore } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { Avatar } from "@/components/ui/avatar";
import { Button, buttonClass } from "@/components/ui/button";
import { useToast } from "@/components/ui/toaster";
import { addMembersAction, archiveWorkGroupAction, leaveConversationAction, removeMemberAction, renameConversationAction, startDmAction, toggleMuteAction } from "@/server/chat-actions";
import { WorkGroupDialog } from "./workgroup-dialog";

type Person = { id: string; name: string; title?: string; avatarFileId: string | null };

export type ChatInfoProps = {
  open: boolean; onClose: () => void;
  conversation: { id: string; kind: "team" | "dm" | "group" | "workgroup"; title: string | null; description: string; archived: boolean };
  me: { id: string; role: string };
  members: Person[]; everyone: Person[];
  member: boolean; manage: boolean; muted: boolean;
};

export function ChatInfo({ open, onClose, conversation: c, me, members, everyone, member, manage, muted }: ChatInfoProps) {
  const [busy, start] = useTransition();
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(c.title ?? "");
  const [adding, setAdding] = useState(false);
  const [pick, setPick] = useState<string[]>([]);
  const [editGroup, setEditGroup] = useState(false);
  const toast = useToast();
  const router = useRouter();
  const run = (fn: () => Promise<{ ok: boolean; message?: string; error?: string; redirectTo?: string }>, after?: () => void) => start(async () => {
    const r = await fn();
    if (r.ok) { if (r.message) toast.push("success", r.message); after?.(); if (r.redirectTo) router.push(r.redirectTo); else router.refresh(); }
    else toast.push("error", r.error ?? "Something went wrong.");
  });
  const notIn = everyone.filter((p) => !members.some((m) => m.id === p.id));
  const isAdmin = me.role === "admin";

  return (
    <>
      <Dialog open={open} onClose={onClose} title={c.kind === "dm" ? "Direct message" : c.title || "Chat details"} description={c.kind === "workgroup" ? c.description || "Work group" : c.kind === "team" ? "Everyone on the team is in this chat." : undefined}>
        <div className="space-y-5">
          <p className="flex items-start gap-2 rounded-lg bg-surface-2 px-3 py-2 text-xs text-muted">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
            Chats are for Courage for Kids work. Administrators can review messages to keep everyone safe. Never share patient names, photos or medical details here.
          </p>

          {c.kind === "group" && manage && (
            renaming ? (
              <div className="flex gap-2">
                <input className="input h-10" value={name} onChange={(e) => setName(e.target.value)} placeholder="Chat name" aria-label="Chat name" maxLength={80} />
                <Button disabled={busy} onClick={() => run(() => renameConversationAction(c.id, name), () => setRenaming(false))}>Save</Button>
              </div>
            ) : <Button variant="secondary" size="sm" onClick={() => setRenaming(true)}><Pencil className="h-4 w-4" />Rename chat</Button>
          )}

          <div>
            <div className="mb-2 flex items-center justify-between">
              <h3 className="eyebrow">{members.length} {members.length === 1 ? "person" : "people"}</h3>
              {manage && c.kind === "group" && <button onClick={() => setAdding((a) => !a)} className="inline-flex items-center gap-1 text-xs font-semibold text-brand-ink hover:underline"><UserPlus className="h-3.5 w-3.5" />Add people</button>}
              {c.kind === "workgroup" && isAdmin && <button onClick={() => setEditGroup(true)} className="inline-flex items-center gap-1 text-xs font-semibold text-brand-ink hover:underline"><Pencil className="h-3.5 w-3.5" />Edit work group</button>}
            </div>
            {adding && (
              <div className="mb-3 rounded-xl border border-line p-2">
                <div className="max-h-48 space-y-0.5 overflow-y-auto">
                  {notIn.length === 0 && <p className="px-2 py-3 text-sm text-muted">Everyone's already here.</p>}
                  {notIn.map((p) => (
                    <label key={p.id} className="flex cursor-pointer items-center gap-3 rounded-lg px-2 py-1.5 hover:bg-surface-2">
                      <input type="checkbox" className="h-[18px] w-[18px] accent-[var(--brand)]" checked={pick.includes(p.id)} onChange={() => setPick((x) => x.includes(p.id) ? x.filter((y) => y !== p.id) : [...x, p.id])} />
                      <Avatar name={p.name} fileId={p.avatarFileId} size={26} /><span className="text-sm">{p.name}</span>
                    </label>
                  ))}
                </div>
                {notIn.length > 0 && <div className="mt-2 flex justify-end"><Button size="sm" disabled={busy || !pick.length} onClick={() => run(() => addMembersAction(c.id, pick), () => { setPick([]); setAdding(false); })}>Add {pick.length || ""}</Button></div>}
              </div>
            )}
            <ul className="max-h-72 space-y-1 overflow-y-auto">
              {members.map((p) => (
                <li key={p.id} className="flex items-center gap-3 rounded-lg px-1 py-1.5">
                  <Avatar name={p.name} fileId={p.avatarFileId} size={32} />
                  <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{p.name}{p.id === me.id ? " (you)" : ""}</span>{p.title && <span className="block truncate text-xs text-muted">{p.title}</span>}</span>
                  {p.id !== me.id && c.kind !== "dm" && <button onClick={() => run(() => startDmAction(p.id))} className="rounded-lg px-2 py-1 text-xs font-semibold text-brand-ink hover:bg-brand-soft">Message</button>}
                  {manage && c.kind === "group" && p.id !== me.id && <button onClick={() => run(() => removeMemberAction(c.id, p.id))} aria-label={`Remove ${p.name}`} className="rounded-lg p-1 text-faint hover:bg-surface-2 hover:text-bad"><X className="h-4 w-4" /></button>}
                </li>
              ))}
            </ul>
          </div>


          <div className="flex flex-wrap gap-2 border-t border-line pt-4">
            {member && <Button variant="secondary" size="sm" disabled={busy} onClick={() => run(() => toggleMuteAction(c.id, !muted))}>{muted ? <><Bell className="h-4 w-4" />Unmute</> : <><BellOff className="h-4 w-4" />Mute alerts</>}</Button>}
            {member && c.kind === "group" && <Button variant="ghost" size="sm" disabled={busy} onClick={() => run(() => leaveConversationAction(c.id))}><LogOut className="h-4 w-4" />Leave chat</Button>}
            {c.kind === "workgroup" && isAdmin && <Button variant="ghost" size="sm" disabled={busy} onClick={() => run(() => archiveWorkGroupAction(c.id, !c.archived))}>{c.archived ? <><ArchiveRestore className="h-4 w-4" />Restore</> : <><Archive className="h-4 w-4" />Archive work group</>}</Button>}
            {c.kind === "workgroup" && isAdmin && <Link href={`/tasks/new?workGroupId=${c.id}`} className={buttonClass("secondary", "sm")}>New task for this group</Link>}
          </div>
        </div>
      </Dialog>
      {c.kind === "workgroup" && isAdmin && (
        <WorkGroupDialog open={editGroup} onClose={() => setEditGroup(false)} everyone={everyone}
          initial={{ id: c.id, title: c.title ?? "", description: c.description, memberIds: members.map((m) => m.id) }} />
      )}
    </>
  );
}
