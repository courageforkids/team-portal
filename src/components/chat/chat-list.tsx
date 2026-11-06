"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { MessageSquarePlus, Users, Search, Eye } from "lucide-react";
import { Avatar, AvatarStack } from "@/components/ui/avatar";
import { cn } from "@/lib/cn";
import type { ConversationListItem } from "@/server/chat";
import { NewChatDialog } from "./new-chat-dialog";
import { WorkGroupDialog } from "./workgroup-dialog";

type Person = { id: string; name: string; title?: string; avatarFileId: string | null };

function when(iso: string | null) {
  if (!iso) return "";
  const d = new Date(iso), now = new Date();
  if (d.toDateString() === now.toDateString()) return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  if (now.getTime() - d.getTime() < 6 * 86400_000) return d.toLocaleDateString(undefined, { weekday: "short" });
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function ChatList({ initial, everyone, me, oversight }: { initial: ConversationListItem[]; everyone: Person[]; me: { id: string; role: string }; oversight: boolean }) {
  const [items, setItems] = useState(initial);
  const [q, setQ] = useState("");
  const [newOpen, setNewOpen] = useState(false);
  const [wgOpen, setWgOpen] = useState(false);
  const pathname = usePathname();
  const activeId = pathname.split("/")[2];
  useEffect(() => setItems(initial), [initial]);
  useEffect(() => {
    const tick = async () => {
      if (document.visibilityState !== "visible") return;
      try { const r = await fetch(`/api/chat/summary${oversight ? "?all=1" : ""}`, { cache: "no-store" }); if (r.ok) setItems((await r.json()).conversations); } catch {}
    };
    const t = setInterval(tick, 6000);
    return () => clearInterval(t);
  }, [oversight]);
  const shown = items.filter((c) => (c.title + " " + c.subtitle).toLowerCase().includes(q.toLowerCase()));
  const mine = shown.filter((c) => c.member), watching = shown.filter((c) => !c.member);
  const Row = ({ c }: { c: ConversationListItem }) => (
    <Link href={`/messages/${c.id}`} aria-current={c.id === activeId ? "page" : undefined}
      className={cn("focus-ring flex items-center gap-3 rounded-xl px-2.5 py-2.5 transition", c.id === activeId ? "bg-brand-soft" : "hover:bg-surface-2")}>
      <div className="shrink-0">
        {c.kind === "dm" ? <Avatar name={c.people[0]?.name ?? "?"} fileId={c.people[0]?.avatarFileId} size={40} />
          : c.kind === "team" ? <span className="grid h-10 w-10 place-items-center rounded-full bg-brand text-brand-fg"><Users className="h-5 w-5" /></span>
          : <div className="grid h-10 w-10 place-items-center"><AvatarStack people={c.people} max={2} size={26} /></div>}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <span className={cn("truncate text-[15px]", c.unread ? "font-bold" : "font-semibold")}>{c.title}</span>
          <span className="shrink-0 text-[11px] text-faint">{when(c.lastMessageAt)}</span>
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className={cn("truncate text-[13px]", c.unread ? "text-fg-2" : "text-muted")}>{c.kind === "workgroup" && <span className="mr-1 rounded bg-accent-soft px-1 text-[10px] font-bold uppercase text-accent-ink">Work group</span>}{c.lastPreview}</span>
          {c.unread > 0 && <span className={cn("min-w-5 shrink-0 rounded-full px-1.5 text-center text-[11px] font-bold", c.muted ? "bg-surface-3 text-muted" : "bg-brand text-brand-fg")}>{c.unread > 99 ? "99+" : c.unread}</span>}
        </div>
      </div>
    </Link>
  );
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center justify-between gap-2 pb-3">
        <h1 className="text-2xl font-bold tracking-tight">Chat</h1>
        <div className="flex gap-1.5">
          {me.role === "admin" && <button onClick={() => setWgOpen(true)} className="inline-flex h-9 items-center gap-1.5 rounded-[10px] border border-line-strong bg-surface px-3 text-[13px] font-semibold hover:bg-surface-2" title="New work pair or group"><Users className="h-4 w-4" /><span className="hidden lg:inline">Work group</span></button>}
          <button onClick={() => setNewOpen(true)} className="inline-flex h-9 items-center gap-1.5 rounded-[10px] bg-brand px-3 text-[13px] font-semibold text-brand-fg hover:bg-brand-hover"><MessageSquarePlus className="h-4 w-4" />New</button>
        </div>
      </div>
      <div className="relative mb-2">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" aria-hidden />
        <input className="input h-10 pl-9" placeholder="Search chats" aria-label="Search chats" value={q} onChange={(e) => setQ(e.target.value)} type="search" />
      </div>
      <div className="-mx-1 min-h-0 flex-1 space-y-0.5 overflow-y-auto px-1 scrollbar-thin">
        {mine.map((c) => <Row key={c.id} c={c} />)}
        {!mine.length && <p className="px-2 py-6 text-center text-sm text-muted">No chats match.</p>}
        {me.role === "admin" && (
          oversight ? (<>
            {watching.length > 0 && <div className="eyebrow mt-4 flex items-center gap-1.5 px-2 pb-1"><Eye className="h-3 w-3" />Other team chats (view only)</div>}
            {watching.map((c) => <Row key={c.id} c={c} />)}
            <Link href="/messages" className="mt-2 block px-2 text-xs font-semibold text-brand-ink hover:underline">Hide other team chats</Link>
          </>) : <Link href="/messages?all=1" className="mt-3 flex items-center gap-1.5 px-2 text-xs font-semibold text-muted hover:text-fg"><Eye className="h-3.5 w-3.5" />Review all team chats</Link>
        )}
      </div>
      <NewChatDialog open={newOpen} onClose={() => setNewOpen(false)} everyone={everyone} meId={me.id} />
      {me.role === "admin" && <WorkGroupDialog open={wgOpen} onClose={() => setWgOpen(false)} everyone={everyone.filter(Boolean)} />}
    </div>
  );
}
