"use client";
import Link from "next/link";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Info, ImagePlus, Loader2, MoreHorizontal, Send, X, Lock, BellOff, ListChecks, Reply, RotateCw, Pin, PinOff, Search } from "lucide-react";
import { Avatar, AvatarStack } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toaster";
import { cn } from "@/lib/cn";
import { asSticker, compressImage, isStickerName } from "@/lib/compress-image";
import { Composer } from "./composer";
import { deleteMessageAction, editMessageAction, pinMessageAction, reactAction, reportMessageAction, sendMessageAction, markReadAction } from "@/server/chat-actions";
import { mentionHandles, MENTION_RE, type Mentionable } from "@/lib/mentions";
import { PhotoViewer } from "./photo-viewer";
import { spellOf } from "@/lib/academy";
import { fireEffect } from "@/components/academy/effects";
import type { ChatMessage, PinnedMessage } from "@/server/chat";

const EDIT_WINDOW_MS = 15 * 60_000;
import { ChatInfo, type ChatInfoProps } from "./chat-info";

const URL_RE = /(https?:\/\/[^\s<]+[^\s<.,:;"')\]!?])/g;
/** Message text with links made tappable and @mentions of people in the chat in bold (yours highlighted). */
function Linkified({ text, handles, myHandle }: { text: string; handles?: Set<string>; myHandle?: string }) {
  const parts = text.split(URL_RE);
  return <>{parts.map((p, i) => (i % 2 === 1
    ? <a key={i} href={p} target="_blank" rel="noopener noreferrer" className="underline decoration-current/40 underline-offset-2 break-all">{p}</a>
    : <Mentions key={i} text={p} handles={handles} myHandle={myHandle} />))}</>;
}
function Mentions({ text, handles, myHandle }: { text: string; handles?: Set<string>; myHandle?: string }) {
  if (!handles?.size || !text.includes("@")) return <span>{text}</span>;
  const out: React.ReactNode[] = [];
  let last = 0;
  for (const m of text.matchAll(MENTION_RE)) {
    const h = m[2].toLowerCase();
    if (!handles.has(h)) continue;
    const start = m.index! + m[1].length;
    out.push(text.slice(last, start));
    out.push(<span key={start} className={cn("font-semibold", h === myHandle && "rounded bg-accent/30 px-0.5")}>@{m[2]}</span>);
    last = start + m[2].length + 1;
  }
  out.push(text.slice(last));
  return <span>{out}</span>;
}

function dayLabel(iso: string) {
  const d = new Date(iso), today = new Date();
  const y = new Date(); y.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return "Today";
  if (d.toDateString() === y.toDateString()) return "Yesterday";
  return d.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });
}
const timeOf = (iso: string) => new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });

export type ConversationHeader = {
  id: string; kind: "team" | "dm" | "group" | "workgroup"; title: string; subtitle: string; description: string;
  people: { id: string; name: string; avatarFileId: string | null }[];
  member: boolean; canPost: boolean; archived: boolean; muted: boolean;
  tasks: { id: string; title: string; status: string }[];
  canPin: boolean; mentionables: Mentionable[];
};

export function ConversationView({ me, header, initial, info, highlight, startedOlder, pins: initialPins, spells = false, holiday = false }: {
  me: { id: string; role: string }; header: ConversationHeader; initial: ChatMessage[]; info: Omit<ChatInfoProps, "open" | "onClose">; highlight?: string;
  startedOlder?: boolean; pins: PinnedMessage[];
  /** Courage Academy chat spells (/confetti, /cape, /lumos, /cheer, /snow) for people who can see the Academy. */
  spells?: boolean;
  /** Christmas look: adds 🎄 and ⛄ reactions. */
  holiday?: boolean;
}) {
  const [items, setItems] = useState<ChatMessage[]>(initial);
  const [hasOlder, setHasOlder] = useState(initial.length >= 50 || !!startedOlder);
  const [pins, setPins] = useState<PinnedMessage[]>(initialPins);
  const [pinsOpen, setPinsOpen] = useState(false);
  const [focus, setFocus] = useState<string | undefined>(highlight); // message to ring (from a notification, search or a reply quote)
  const scrollTo = useRef<string | undefined>(highlight);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<{ id: string; authorName: string; body: string; createdAt: string }[] | null>(null);
  const handleInfo = useMemo(() => {
    const hs = mentionHandles(header.mentionables);
    return { set: new Set(hs.map((h) => h.handle.toLowerCase())), mine: hs.find((h) => h.id === me.id)?.handle.toLowerCase() };
  }, [header.mentionables, me.id]);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [text, setText] = useState("");
  const [clearSignal, setClearSignal] = useState(0);
  const [typing, setTyping] = useState<string[]>([]);
  const lastPing = useRef(0);
  const [files, setFiles] = useState<File[]>([]);
  const sending = false;
  const [infoOpen, setInfoOpen] = useState(false);
  const [menuFor, setMenuFor] = useState<ChatMessage | null>(null);
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  const [viewer, setViewer] = useState<{ src: string; alt: string } | null>(null);
  const [online, setOnline] = useState(true);
  const outbox = useRef(new Map<string, FormData>()); // unsent messages, keyed by their temporary id
  const rsince = useRef<string | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const atBottom = useRef(true);
  const fileInput = useRef<HTMLInputElement>(null);
  const toast = useToast();
  const router = useRouter();

  const seen = useRef(new Set(initial.map((m) => m.id)));
  const merge = useCallback((incoming: ChatMessage[]) => {
    if (!incoming.length) return;
    // Spells cast in the last 20 seconds play for everyone watching this chat.
    if (spells) for (const m of incoming) {
      if (seen.current.has(m.id) || m.pending) continue;
      seen.current.add(m.id);
      const sp = !m.deleted && !m.system ? spellOf(m.body) : null;
      if (sp && Date.now() - Date.parse(m.createdAt) < 20000) fireEffect(sp.effect);
    }
    setItems((prev) => {
      const map = new Map(prev.map((m) => [m.id, m]));
      for (const m of incoming) map.set(m.id, m);
      return [...map.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    });
  }, [spells]);

  const lastAt = items.filter((m) => !m.pending).at(-1)?.createdAt;
  const poll = useCallback(async () => {
    try {
      const q = new URLSearchParams();
      if (lastAt) q.set("after", lastAt);
      if (rsince.current) q.set("rsince", rsince.current);
      const r = await fetch(`/api/chat/${header.id}?${q}`, { cache: "no-store" });
      if (r.ok) {
        const d = await r.json();
        merge([...d.messages, ...(d.changed ?? [])]);
        setTyping(d.typing ?? []);
        if (d.pins) setPins(d.pins);
        if (d.now) rsince.current = d.now;
      }
    } catch { /* offline: try again next tick */ }
  }, [header.id, lastAt, merge]);

  // Live updates: poll every 3s while the tab is visible.
  useEffect(() => {
    const t = setInterval(() => { if (document.visibilityState === "visible") poll(); }, 3000);
    const onVis = () => { if (document.visibilityState === "visible") poll(); };
    document.addEventListener("visibilitychange", onVis);
    return () => { clearInterval(t); document.removeEventListener("visibilitychange", onVis); };
  }, [poll]);
  useEffect(() => { if (header.member) void markReadAction(header.id).then(() => window.dispatchEvent(new Event("cfk-badges-refresh"))); }, [header.id, header.member]);

  // Stick to the bottom when new messages arrive (unless the person scrolled up to read).
  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el) return;
    if (scrollTo.current) {
      const target = document.getElementById(`m-${scrollTo.current}`);
      if (target) { target.scrollIntoView({ block: "center" }); scrollTo.current = undefined; atBottom.current = false; }
      return;
    }
    if (atBottom.current) el.scrollTop = el.scrollHeight;
  }, [items]);

  // Go to a message: scroll if it's loaded, otherwise load the messages around it first.
  const jumpTo = useCallback(async (id: string) => {
    setFocus(id);
    const el = document.getElementById(`m-${id}`);
    if (el) { el.scrollIntoView({ behavior: "smooth", block: "center" }); atBottom.current = false; return; }
    try {
      const r = await fetch(`/api/chat/${header.id}?around=${id}`, { cache: "no-store" });
      if (!r.ok) { toast.push("error", "That message isn't available anymore."); return; }
      const win: ChatMessage[] = (await r.json()).messages;
      scrollTo.current = id; atBottom.current = false;
      setHasOlder(true);
      // Newer messages fill back in automatically through the live updates.
      setItems((prev) => [...win, ...prev.filter((m) => m.pending)]);
    } catch { toast.push("error", "Couldn't load that message. Check your connection."); }
  }, [header.id, toast]);

  // Search inside this chat (waits until you stop typing).
  useEffect(() => {
    if (!searchOpen) return;
    const q = query.trim();
    if (q.length < 2) { setResults(null); return; }
    const t = setTimeout(async () => {
      try {
        const r = await fetch(`/api/chat/${header.id}/search?q=${encodeURIComponent(q)}`, { cache: "no-store" });
        if (r.ok) setResults((await r.json()).results);
      } catch { /* offline */ }
    }, 250);
    return () => clearTimeout(t);
  }, [query, searchOpen, header.id]);

  const loadOlder = async () => {
    if (!items.length) return;
    setLoadingOlder(true);
    const el = scroller.current; const prevH = el?.scrollHeight ?? 0;
    try {
      const r = await fetch(`/api/chat/${header.id}?before=${encodeURIComponent(items[0].createdAt)}`, { cache: "no-store" });
      const older: ChatMessage[] = r.ok ? (await r.json()).messages : [];
      setHasOlder(older.length >= 40);
      atBottom.current = false;
      merge(older);
      requestAnimationFrame(() => { if (el) el.scrollTop = el.scrollHeight - prevH; });
    } finally { setLoadingOlder(false); }
  };

  // Sends one queued message; on success the real message replaces the temporary one.
  const deliver = useCallback(async (tempId: string) => {
    const fd = outbox.current.get(tempId);
    if (!fd) return;
    setItems((prev) => prev.map((m) => (m.id === tempId ? { ...m, pending: "sending" } : m)));
    try {
      const r = await sendMessageAction(null, fd);
      if (r.ok) {
        outbox.current.delete(tempId);
        setItems((prev) => prev.filter((m) => m.id !== tempId));
        await poll();
        return;
      }
      toast.push("error", r.error);
    } catch { /* offline or server unreachable */ }
    setItems((prev) => prev.map((m) => (m.id === tempId ? { ...m, pending: "failed" } : m)));
  }, [poll, toast]);

  // Messages appear instantly; they send in the background (and wait for a connection if offline).
  const send = async () => {
    const body = text.trim();
    if ((!body && !files.length) || sending) return;
    const fd = new FormData();
    fd.append("conversationId", header.id);
    fd.append("body", body);
    files.forEach((f) => fd.append("files", f));
    if (replyTo) fd.append("replyToId", replyTo.id);
    const tempId = `temp-${Date.now()}`;
    outbox.current.set(tempId, fd);
    const temp: ChatMessage = {
      id: tempId, authorId: me.id, authorName: "You", authorAvatar: null, body, system: false, createdAt: new Date().toISOString(), editedAt: null, deleted: false, unsent: false, pinned: false,
      files: files.map((f, i) => ({ id: `${tempId}-${i}`, filename: f.name, mimeType: f.type, size: f.size, localUrl: URL.createObjectURL(f) })),
      reactions: [], replyTo: replyTo ? { id: replyTo.id, authorName: replyTo.authorName, body: replyTo.body.slice(0, 140), hasImage: replyTo.files.length > 0 } : null,
      pending: navigator.onLine ? "sending" : "failed",
    };
    setItems((prev) => [...prev, temp]);
    setText(""); setClearSignal((n) => n + 1); setFiles([]); setReplyTo(null); atBottom.current = true;
    if (navigator.onLine) void deliver(tempId);
  };

  // Back online: send anything that was waiting.
  useEffect(() => {
    setOnline(navigator.onLine);
    const up = () => { setOnline(true); for (const id of outbox.current.keys()) void deliver(id); void poll(); };
    const down = () => setOnline(false);
    window.addEventListener("online", up); window.addEventListener("offline", down);
    return () => { window.removeEventListener("online", up); window.removeEventListener("offline", down); };
  }, [deliver, poll]);

  const react = (m: ChatMessage, emoji: string) => {
    // Show it right away, then save.
    setItems((prev) => prev.map((x) => {
      if (x.id !== m.id) return x;
      const had = x.reactions.find((r) => r.mine)?.emoji;
      let rs = x.reactions.map((r) => (r.mine ? { ...r, count: r.count - 1, mine: false, names: r.names.filter((n) => n !== "You") } : r)).filter((r) => r.count > 0);
      if (had !== emoji) {
        const ex = rs.find((r) => r.emoji === emoji);
        rs = ex ? rs.map((r) => (r.emoji === emoji ? { ...r, count: r.count + 1, mine: true, names: [...r.names, "You"] } : r)) : [...rs, { emoji, count: 1, mine: true, names: ["You"] }];
      }
      return { ...x, reactions: rs };
    }));
    void reactAction(m.id, emoji).then((r) => { if (!r.ok) toast.push("error", r.error); void poll(); });
  };

  // Stickers and pasted photos go into the message box; they send when you press Send.
  const onImages = useCallback(async (list: File[]) => {
    for (const f of list.slice(0, 4)) {
      const sticker = await asSticker(f);
      const ready = sticker ?? await compressImage(f);
      setFiles((cur) => [...cur, ready].slice(0, 4));
    }
  }, []);

  const pickFiles = async (list: FileList | null) => {
    const arr = Array.from(list ?? []).slice(0, 4);
    const small = await Promise.all(arr.map((f) => compressImage(f)));
    setFiles((cur) => [...cur, ...small].slice(0, 4));
    if (fileInput.current) fileInput.current.value = "";
  };

  const grouped = useMemo(() => {
    const out: { day: string; rows: { m: ChatMessage; first: boolean }[] }[] = [];
    let prev: ChatMessage | null = null;
    for (const m of items) {
      const day = dayLabel(m.createdAt);
      if (!out.length || out.at(-1)!.day !== day) { out.push({ day, rows: [] }); prev = null; }
      const first = !prev || prev.system || m.system || prev.authorId !== m.authorId || new Date(m.createdAt).getTime() - new Date(prev.createdAt).getTime() > 5 * 60_000;
      out.at(-1)!.rows.push({ m, first });
      prev = m;
    }
    return out;
  }, [items]);

  const isGroupish = header.kind !== "dm";
  const canInteract = header.canPost;
  return (
    <section className="flex h-full min-h-0 flex-col bg-surface md:rounded-xl md:border md:border-line">
      {/* Header */}
      <header className="flex items-center gap-3 border-b border-line px-3 py-2.5 sm:px-4">
        <Link href="/messages" className="rounded-lg p-1.5 text-muted hover:bg-surface-2 md:hidden" aria-label="Back to chats"><ArrowLeft className="h-5 w-5" /></Link>
        {header.kind === "dm" ? <Avatar name={header.people[0]?.name ?? "?"} fileId={header.people[0]?.avatarFileId} size={36} /> : <AvatarStack people={header.people} max={3} size={28} />}
        <button onClick={() => setInfoOpen(true)} className="min-w-0 flex-1 text-left">
          <div className="flex items-center gap-1.5 truncate font-semibold">{header.title}{header.muted && <BellOff className="h-3.5 w-3.5 text-faint" aria-label="Muted" />}</div>
          <div className="truncate text-xs text-muted">{header.subtitle}</div>
        </button>
        <button onClick={() => { setSearchOpen(true); setQuery(""); setResults(null); }} className="rounded-lg p-2 text-muted hover:bg-surface-2 hover:text-fg" aria-label="Search this chat"><Search className="h-5 w-5" /></button>
        <button onClick={() => setInfoOpen(true)} className="rounded-lg p-2 text-muted hover:bg-surface-2 hover:text-fg" aria-label="Chat details"><Info className="h-5 w-5" /></button>
      </header>
      {searchOpen && (
        <div className="relative border-b border-line px-3 py-2">
          <div className="flex items-center gap-2">
            <Search className="h-4 w-4 shrink-0 text-muted" aria-hidden />
            <input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search this chat" aria-label="Search this chat"
              onKeyDown={(e) => { if (e.key === "Escape") setSearchOpen(false); }}
              className="min-w-0 flex-1 bg-transparent py-1.5 text-base outline-none placeholder:text-faint" />
            <button onClick={() => setSearchOpen(false)} className="rounded-lg px-2 py-1 text-sm font-semibold text-brand-ink">Done</button>
          </div>
          {results && (
            <div className="absolute inset-x-0 top-full z-30 max-h-[50vh] overflow-y-auto border-b border-line bg-surface shadow-pop" role="list" aria-label="Search results">
              {results.length === 0 ? <p className="px-4 py-3 text-sm text-muted">No messages match “{query.trim()}”.</p> : results.map((r) => (
                <button key={r.id} role="listitem" onClick={() => { setSearchOpen(false); void jumpTo(r.id); }} className="block w-full border-b border-line px-4 py-2.5 text-left last:border-0 hover:bg-surface-2">
                  <span className="flex justify-between gap-2 text-xs text-muted"><span className="font-semibold text-fg">{r.authorName}</span><span>{new Date(r.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span></span>
                  <span className="line-clamp-2 text-sm"><Highlight text={r.body} q={query.trim()} /></span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
      {pins.length > 0 && (
        <div className="flex items-center gap-2 border-b border-line bg-surface-2/60 px-3 py-1.5">
          <button onClick={() => void jumpTo(pins[0].id)} className="flex min-w-0 flex-1 items-center gap-2 text-left text-xs" aria-label="Go to pinned message">
            <Pin className="h-3.5 w-3.5 shrink-0 text-brand" aria-hidden />
            <span className="min-w-0 flex-1 truncate"><span className="font-semibold">{pins[0].authorName.split(" ")[0]}:</span> {pins[0].body || (pins[0].hasImage ? "📷 Photo" : "")}</span>
          </button>
          <button onClick={() => setPinsOpen(true)} className="shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold text-brand-ink hover:bg-surface">{pins.length > 1 ? `${pins.length} pinned` : "Pinned"}</button>
        </div>
      )}
      {header.kind === "workgroup" && header.tasks.length > 0 && (
        <div className="flex items-center gap-2 overflow-x-auto border-b border-line bg-surface-2/60 px-3 py-2 text-xs scrollbar-thin">
          <ListChecks className="h-4 w-4 shrink-0 text-muted" aria-hidden />
          {header.tasks.map((t) => <Link key={t.id} href={`/tasks/${t.id}`} className="shrink-0 rounded-full border border-line bg-surface px-2.5 py-1 font-medium hover:border-brand/40 hover:text-brand-ink">{t.title}</Link>)}
        </div>
      )}

      {/* Messages */}
      <div ref={scroller} onScroll={(e) => { const el = e.currentTarget; atBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80; }}
        className="min-h-0 flex-1 overflow-y-auto px-3 py-4 sm:px-5" aria-live="polite">
        {hasOlder && <div className="mb-3 text-center"><button onClick={loadOlder} disabled={loadingOlder} className="text-xs font-semibold text-brand-ink hover:underline">{loadingOlder ? "Loading…" : "Load earlier messages"}</button></div>}
        {!items.length && (
          <div className="grid h-full place-items-center text-center text-sm text-muted">
            <div><p className="font-semibold text-fg">No messages yet</p><p>{header.canPost ? "Say hi 👋" : "Nothing has been posted here."}</p></div>
          </div>
        )}
        {grouped.map((g) => (
          <div key={g.day}>
            <div className="sticky top-0 z-10 my-3 flex justify-center"><span className="rounded-full bg-surface-2 px-3 py-1 text-[11px] font-semibold text-muted shadow-soft">{g.day}</span></div>
            {g.rows.map(({ m, first }) => {
              if (m.system) return <p key={m.id} id={`m-${m.id}`} className="my-2 text-center text-xs text-muted">{m.body} · {timeOf(m.createdAt)}</p>;
              const mine = m.authorId === me.id;
              const spell = spells && !m.deleted ? spellOf(m.body) : null;
              if (spell) return <p key={m.id} id={`m-${m.id}`} className="my-2 text-center"><span className="inline-block rounded-full bg-accent-soft px-3 py-1 text-xs font-semibold text-accent-ink">✨ {mine ? "You" : m.authorName.split(" ")[0]} cast {spell.name} · {timeOf(m.createdAt)}</span></p>;
              const stickers = m.deleted ? [] : m.files.filter((f) => isStickerName(f.filename));
              const others = m.files.filter((f) => !isStickerName(f.filename));
              const showBubble = m.deleted || !!m.body || others.length > 0;
              return (
                <SwipeRow key={m.id} id={`m-${m.id}`} enabled={canInteract && !m.deleted && !m.pending} onReply={() => setReplyTo(m)} onLongPress={() => setMenuFor(m)}
                  className={cn("group flex gap-2", mine ? "justify-end" : "justify-start", first ? "mt-3" : "mt-0.5", m.reactions.length > 0 && "mb-3")}>
                  {!mine && isGroupish && <div className="w-7 shrink-0">{first && <Avatar name={m.authorName} fileId={m.authorAvatar} size={28} />}</div>}
                  <div className={cn("flex max-w-[78%] flex-col", mine ? "items-end" : "items-start")}>
                    {first && !mine && isGroupish && <span className="mb-0.5 ml-1 text-[11px] font-semibold text-muted">{m.authorName}</span>}
                    <div className={cn("flex items-end gap-1", mine && "flex-row-reverse")}>
                      <div className={cn("flex flex-col gap-1", mine ? "items-end" : "items-start")}>
                      {stickers.length > 0 && (
                        <div className={cn("flex flex-wrap gap-1", focus === m.id && !showBubble && "rounded-xl ring-2 ring-accent")}>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          {stickers.map((f) => <img key={f.id} src={f.localUrl ?? `/api/files/${f.id}?inline=1`} alt="Sticker" loading="lazy" className="h-28 w-auto max-w-[160px] object-contain" />)}
                        </div>
                      )}
                      {showBubble && (
                      <div className={cn("rounded-2xl px-3.5 py-2 text-[15px] leading-snug shadow-soft",
                        m.deleted ? "border border-dashed border-line bg-transparent italic text-faint" : mine ? "bg-brand text-brand-fg" : "bg-surface-2 text-fg",
                        m.pending === "sending" && "opacity-70", m.pending === "failed" && "opacity-60",
                        focus === m.id && "ring-2 ring-accent")}>
                        {m.deleted ? (m.unsent ? "Message unsent" : "Message removed") : (<>
                          {m.replyTo && (
                            <button type="button" onClick={() => void jumpTo(m.replyTo!.id)}
                              className={cn("mb-1.5 block w-full rounded-lg border-l-[3px] px-2 py-1 text-left text-xs", mine ? "border-white/70 bg-white/15" : "border-brand bg-surface")}>
                              <span className="block font-semibold">{m.replyTo.authorName}</span>
                              <span className="line-clamp-2 opacity-80">{m.replyTo.body || (m.replyTo.hasImage ? "📷 Photo" : "")}</span>
                            </button>
                          )}
                          {others.length > 0 && (
                            <div className={cn("mb-1 grid gap-1", others.length > 1 ? "grid-cols-2" : "grid-cols-1")}>
                              {others.map((f) => f.mimeType.startsWith("image/") && !f.mimeType.includes("hei") ? (
                                <button type="button" key={f.id} onClick={() => setViewer({ src: f.localUrl ?? `/api/files/${f.id}?inline=1`, alt: f.filename })} className="block overflow-hidden rounded-xl" aria-label={`Open photo ${f.filename}`}>
                                  {/* eslint-disable-next-line @next/next/no-img-element */}
                                  <img src={f.localUrl ?? `/api/files/${f.id}?inline=1`} alt={f.filename} loading="lazy" className="max-h-64 w-full object-cover" />
                                </button>
                              ) : <a key={f.id} href={`/api/files/${f.id}`} className="underline">{f.filename}</a>)}
                            </div>
                          )}
                          {m.body && <p className="whitespace-pre-wrap break-words"><Linkified text={m.body} handles={handleInfo.set} myHandle={handleInfo.mine} /></p>}
                        </>)}
                      </div>
                      )}
                      </div>
                      {!m.deleted && !m.pending && (
                        <button onClick={() => setMenuFor(m)} aria-label="Message options"
                          className="rounded-full p-1 text-faint opacity-60 transition hover:bg-surface-2 hover:text-fg md:opacity-0 md:group-hover:opacity-100 focus:opacity-100">
                          <MoreHorizontal className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                    {m.reactions.length > 0 && (
                      <div className={cn("-mt-2 flex gap-1", mine ? "mr-2" : "ml-2")}>
                        {m.reactions.map((r) => (
                          <button key={r.emoji} onClick={() => canInteract && react(m, r.emoji)} title={r.names.join(", ")} aria-label={`${r.emoji} ${r.count}: ${r.names.join(", ")}`}
                            className={cn("rounded-full border px-1.5 py-0.5 text-xs shadow-soft", r.mine ? "border-brand bg-brand-soft" : "border-line bg-surface")}>
                            {r.emoji}{r.count > 1 && <span className="ml-0.5 font-semibold tabular-nums">{r.count}</span>}
                          </button>
                        ))}
                      </div>
                    )}
                    {m.pending === "failed" ? (
                      <button onClick={() => (navigator.onLine ? void deliver(m.id) : toast.push("error", "You're offline. It will send when you're back online."))} className="mx-1 mt-0.5 inline-flex items-center gap-1 text-[11px] font-semibold text-bad">
                        <RotateCw className="h-3 w-3" />{online ? "Not sent · Tap to retry" : "Waiting for connection…"}
                      </button>
                    ) : (
                      <span className="mx-1 mt-0.5 inline-flex items-center gap-1 text-[10px] text-faint">{m.pinned && <Pin className="h-2.5 w-2.5" aria-label="Pinned" />}{m.pending === "sending" ? "Sending…" : timeOf(m.createdAt)}{m.editedAt && !m.deleted ? " · edited" : ""}</span>
                    )}
                  </div>
                </SwipeRow>
              );
            })}
          </div>
        ))}
      </div>

      {typing.length > 0 && (
        <div className="flex items-center gap-2 px-4 pb-1 pt-1 text-xs text-muted" aria-live="polite">
          <span className="inline-flex items-center gap-1 rounded-full bg-surface-2 px-2.5 py-1.5" aria-hidden>
            {[0, 1, 2].map((i) => <span key={i} className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted" style={{ animationDelay: `${i * 0.15}s` }} />)}
          </span>
          <span>{typing.length === 1 ? `${typing[0]} is typing…` : typing.length === 2 ? `${typing[0]} and ${typing[1]} are typing…` : "Several people are typing…"}</span>
        </div>
      )}
      {/* Composer */}
      {header.canPost ? (
        <div className="border-t border-line p-2.5 sm:p-3">
          {!online && <p className="mb-2 rounded-lg bg-warn-soft px-3 py-1.5 text-center text-xs font-medium text-warn">You're offline. Messages will send when you're back online.</p>}
          {replyTo && (
            <div className="mb-2 flex items-center gap-2 rounded-lg border-l-[3px] border-brand bg-surface-2 px-3 py-1.5 text-xs">
              <Reply className="h-3.5 w-3.5 shrink-0 text-muted" />
              <span className="min-w-0 flex-1"><span className="font-semibold">Replying to {replyTo.authorId === me.id ? "yourself" : replyTo.authorName}</span><span className="block truncate text-muted">{replyTo.body || (replyTo.files.length ? "📷 Photo" : "")}</span></span>
              <button onClick={() => setReplyTo(null)} aria-label="Cancel reply" className="rounded p-1 text-muted hover:text-fg"><X className="h-3.5 w-3.5" /></button>
            </div>
          )}
          {files.length > 0 && (
            <div className="mb-2 flex gap-2 overflow-x-auto">
              {files.map((f, i) => (
                <div key={i} className="relative shrink-0">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={URL.createObjectURL(f)} alt={isStickerName(f.name) ? "Sticker preview" : ""} className={isStickerName(f.name) ? "h-16 w-auto max-w-24 object-contain" : "h-16 w-16 rounded-lg object-cover"} />
                  <button onClick={() => setFiles(files.filter((_, j) => j !== i))} aria-label={isStickerName(f.name) ? "Remove sticker" : "Remove photo"} className="absolute -right-1.5 -top-1.5 rounded-full bg-fg p-0.5 text-bg"><X className="h-3 w-3" /></button>
                </div>
              ))}
            </div>
          )}
          <div className="flex items-end gap-2">
            <button onClick={() => fileInput.current?.click()} className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-muted hover:bg-surface-2 hover:text-fg" aria-label="Add a photo"><ImagePlus className="h-5 w-5" /></button>
            <input ref={fileInput} type="file" accept="image/*" multiple className="sr-only" onChange={(e) => pickFiles(e.target.files)} />
            <Composer clearSignal={clearSignal} onText={(t) => {
              setText(t);
              // Let others see "typing…" (at most one ping every 3 seconds).
              if (t.trim() && Date.now() - lastPing.current > 3000) { lastPing.current = Date.now(); void fetch(`/api/chat/${header.id}/typing`, { method: "POST" }).catch(() => {}); }
            }} onEnter={send} onImages={onImages} mentionables={header.mentionables} meId={me.id} />
            <button onClick={send} disabled={!text.trim() && !files.length} aria-label="Send"
              className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-brand text-brand-fg transition hover:bg-brand-hover disabled:opacity-40">
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </button>
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-center gap-2 border-t border-line px-4 py-3 text-xs text-muted">
          <Lock className="h-3.5 w-3.5" />{header.archived ? "This work group is archived. The chat is read-only." : "You're viewing this chat as an administrator. Only members can post."}
        </div>
      )}

      <ChatInfo {...info} open={infoOpen} onClose={() => setInfoOpen(false)} />
      {viewer && <PhotoViewer src={viewer.src} alt={viewer.alt} onClose={() => setViewer(null)} />}
      <Dialog open={pinsOpen} onClose={() => setPinsOpen(false)} title="Pinned messages" size="sm">
        <ul className="space-y-1">
          {pins.map((p) => (
            <li key={p.id} className="flex items-start gap-2 rounded-lg hover:bg-surface-2">
              <button onClick={() => { setPinsOpen(false); void jumpTo(p.id); }} className="min-w-0 flex-1 px-2 py-2 text-left text-sm">
                <span className="block text-xs font-semibold text-muted">{p.authorName}</span>
                <span className="line-clamp-3">{p.body || (p.hasImage ? "📷 Photo" : "")}</span>
              </button>
              {header.canPin && (
                <button onClick={() => void pinMessageAction(p.id, false).then((r) => { if (!r.ok) toast.push("error", r.error); setPins((cur) => cur.filter((x) => x.id !== p.id)); void poll(); })}
                  className="m-1.5 rounded-lg p-1.5 text-muted hover:bg-surface hover:text-fg" aria-label={`Unpin message from ${p.authorName}`}><PinOff className="h-4 w-4" /></button>
              )}
            </li>
          ))}
        </ul>
      </Dialog>
      <MessageMenu m={menuFor} me={me} canInteract={canInteract} canPin={header.canPin} reactions={holiday ? [...REACTIONS.slice(0, 4), ...HOLIDAY_REACTIONS] : REACTIONS} onReact={(m, e) => { react(m, e); setMenuFor(null); }} onReply={(m) => { setReplyTo(m); setMenuFor(null); }} onClose={() => setMenuFor(null)} onChanged={() => { setMenuFor(null); poll(); router.refresh(); }} refetch={async () => {
        const from = new Date(new Date(items[0]?.createdAt ?? 0).getTime() - 1).toISOString();
        const r = await fetch(`/api/chat/${header.id}?after=${encodeURIComponent(from)}`, { cache: "no-store" });
        if (r.ok) { const all: ChatMessage[] = (await r.json()).messages; setItems((prev) => prev.map((p) => all.find((x) => x.id === p.id) ?? p)); }
      }} />
    </section>
  );
}

const REACTIONS = ["❤️", "👍", "😂", "😮", "😢", "🙏"];
const HOLIDAY_REACTIONS = ["🎄", "⛄"];

/** A message row that can be swiped right to reply (phones) or long-pressed for the menu. */
function SwipeRow({ enabled, onReply, onLongPress, className, children, id }: { enabled: boolean; onReply: () => void; onLongPress: () => void; className: string; children: React.ReactNode; id: string }) {
  const [dx, setDx] = useState(0);
  const st = useRef<{ x: number; y: number; t?: ReturnType<typeof setTimeout>; locked?: "h" | "v" } | null>(null);
  return (
    <div id={id} className={cn(className, "relative")} style={{ transform: dx ? `translateX(${dx}px)` : undefined, transition: dx ? "none" : "transform .2s" }}
      onContextMenu={(e) => { if (enabled) { e.preventDefault(); onLongPress(); } }}
      onTouchStart={(e) => {
        if (!enabled) return;
        const t = e.touches[0];
        st.current = { x: t.clientX, y: t.clientY, t: setTimeout(() => { st.current = null; setDx(0); onLongPress(); }, 500) };
      }}
      onTouchMove={(e) => {
        const s = st.current; if (!s) return;
        const t = e.touches[0]; const mx = t.clientX - s.x, my = t.clientY - s.y;
        if (Math.abs(mx) > 6 || Math.abs(my) > 6) clearTimeout(s.t);
        if (!s.locked) s.locked = Math.abs(mx) > Math.abs(my) + 4 ? "h" : Math.abs(my) > 8 ? "v" : undefined;
        if (s.locked === "h" && mx > 0) setDx(Math.min(70, mx * 0.6));
      }}
      onTouchEnd={() => { const s = st.current; if (s) clearTimeout(s.t); if (dx > 45) onReply(); setDx(0); st.current = null; }}>
      {dx > 10 && <Reply className="absolute -left-7 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" style={{ opacity: Math.min(1, dx / 45) }} aria-hidden />}
      {children}
    </div>
  );
}

function Highlight({ text, q }: { text: string; q: string }) {
  const i = q ? text.toLowerCase().indexOf(q.toLowerCase()) : -1;
  if (i < 0) return <>{text}</>;
  const from = Math.max(0, i - 40);
  return <>{from > 0 && "…"}{text.slice(from, i)}<mark className="rounded bg-accent/40 px-0.5 text-fg">{text.slice(i, i + q.length)}</mark>{text.slice(i + q.length)}</>;
}

function MessageMenu({ m, me, canInteract, canPin, reactions, onReact, onReply, onClose, onChanged, refetch }: { m: ChatMessage | null; me: { id: string; role: string }; canInteract: boolean; canPin: boolean; reactions: string[]; onReact: (m: ChatMessage, e: string) => void; onReply: (m: ChatMessage) => void; onClose: () => void; onChanged: () => void; refetch: () => Promise<void> }) {
  const [mode, setMode] = useState<"menu" | "edit" | "report">("menu");
  const [value, setValue] = useState("");
  const [busy, start] = useTransition();
  const toast = useToast();
  useEffect(() => { setMode("menu"); setValue(m?.body ?? ""); }, [m]);
  if (!m) return null;
  const mine = m.authorId === me.id;
  const fresh = Date.now() - new Date(m.createdAt).getTime() < EDIT_WINDOW_MS; // own messages: edit/unsend for 15 minutes
  const minutesLeft = Math.max(1, Math.ceil((EDIT_WINDOW_MS - (Date.now() - new Date(m.createdAt).getTime())) / 60_000));
  const run = (fn: () => Promise<{ ok: boolean; message?: string; error?: string }>) => start(async () => {
    const r = await fn();
    if (r.ok) { if (r.message) toast.push("success", r.message); await refetch(); onChanged(); }
    else toast.push("error", r.error ?? "Something went wrong.");
  });
  return (
    <Dialog open={!!m} onClose={onClose} title={mode === "edit" ? "Edit message" : mode === "report" ? "Report message" : "Message"} size="sm">
      {mode === "menu" && (
        <div className="space-y-1">
          {canInteract && (
            <div className="mb-2 flex justify-between rounded-full bg-surface-2 px-2 py-1.5" role="group" aria-label="React">
              {reactions.map((e) => (
                <button key={e} onClick={() => onReact(m, e)} aria-label={`React ${e}`}
                  className={cn("grid h-10 w-10 place-items-center rounded-full text-2xl transition active:scale-90", m.reactions.find((r) => r.mine)?.emoji === e && "bg-brand-soft ring-2 ring-brand")}>{e}</button>
              ))}
            </div>
          )}
          {canInteract && <Button variant="ghost" className="w-full justify-start" onClick={() => onReply(m)}><Reply className="h-4 w-4" />Reply</Button>}
          {m.body && <p className="mb-3 line-clamp-3 rounded-lg bg-surface-2 px-3 py-2 text-sm text-fg-2">{m.body}</p>}
          {m.body && <Button variant="ghost" className="w-full justify-start" onClick={() => { navigator.clipboard?.writeText(m.body); toast.push("success", "Copied."); onClose(); }}>Copy text</Button>}
          {canPin && <Button variant="ghost" className="w-full justify-start" disabled={busy} onClick={() => run(() => pinMessageAction(m.id, !m.pinned))}>{m.pinned ? <><PinOff className="h-4 w-4" />Unpin</> : <><Pin className="h-4 w-4" />Pin to top of chat</>}</Button>}
          {mine && fresh && m.body && <Button variant="ghost" className="w-full justify-start" onClick={() => setMode("edit")}>Edit</Button>}
          {mine && fresh && <Button variant="ghost" className="w-full justify-start text-bad" disabled={busy} onClick={() => run(() => deleteMessageAction(m.id))}>Unsend</Button>}
          {mine && fresh && <p className="px-3 text-[11px] text-faint">You can edit or unsend for {minutesLeft} more minute{minutesLeft === 1 ? "" : "s"}.</p>}
          {me.role === "admin" && (!mine || !fresh) && <Button variant="ghost" className="w-full justify-start text-bad" disabled={busy} onClick={() => run(() => deleteMessageAction(m.id))}>Remove (admin)</Button>}
          {!mine && <Button variant="ghost" className="w-full justify-start" onClick={() => setMode("report")}>Report to an administrator</Button>}
        </div>
      )}
      {mode === "edit" && (
        <div className="space-y-3">
          <textarea className="input min-h-24" value={value} onChange={(e) => setValue(e.target.value)} aria-label="Message text" />
          <div className="flex justify-end gap-2"><Button variant="secondary" onClick={() => setMode("menu")}>Back</Button><Button disabled={busy} onClick={() => run(() => editMessageAction(m.id, value))}>Save</Button></div>
        </div>
      )}
      {mode === "report" && (
        <div className="space-y-3">
          <p className="text-sm text-muted">Administrators will see this message and your note. The person who wrote it won't be told who reported it.</p>
          <textarea className="input min-h-20" value={value === m.body ? "" : value} onChange={(e) => setValue(e.target.value)} placeholder="What's wrong? (optional)" aria-label="Reason" />
          <div className="flex justify-end gap-2"><Button variant="secondary" onClick={() => setMode("menu")}>Back</Button><Button disabled={busy} onClick={() => run(() => reportMessageAction(m.id, value === m.body ? "" : value))}>Send report</Button></div>
        </div>
      )}
    </Dialog>
  );
}
