"use client";
import Link from "next/link";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Info, ImagePlus, Loader2, MoreHorizontal, Send, X, Lock, BellOff, ListChecks } from "lucide-react";
import { Avatar, AvatarStack } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toaster";
import { cn } from "@/lib/cn";
import { asSticker, compressImage, isStickerName } from "@/lib/compress-image";
import { Composer } from "./composer";
import { deleteMessageAction, editMessageAction, reportMessageAction, sendMessageAction, markReadAction } from "@/server/chat-actions";
import type { ChatMessage } from "@/server/chat";
import { ChatInfo, type ChatInfoProps } from "./chat-info";

const URL_RE = /(https?:\/\/[^\s<]+[^\s<.,:;"')\]!?])/g;
function Linkified({ text }: { text: string }) {
  const parts = text.split(URL_RE);
  return <>{parts.map((p, i) => (i % 2 === 1
    ? <a key={i} href={p} target="_blank" rel="noopener noreferrer" className="underline decoration-current/40 underline-offset-2 break-all">{p}</a>
    : <span key={i}>{p}</span>))}</>;
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
};

export function ConversationView({ me, header, initial, info, highlight }: {
  me: { id: string; role: string }; header: ConversationHeader; initial: ChatMessage[]; info: Omit<ChatInfoProps, "open" | "onClose">; highlight?: string;
}) {
  const [items, setItems] = useState<ChatMessage[]>(initial);
  const [hasOlder, setHasOlder] = useState(initial.length >= 50);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [text, setText] = useState("");
  const [clearSignal, setClearSignal] = useState(0);
  const [typing, setTyping] = useState<string[]>([]);
  const lastPing = useRef(0);
  const [files, setFiles] = useState<File[]>([]);
  const [sending, setSending] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);
  const [menuFor, setMenuFor] = useState<ChatMessage | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const atBottom = useRef(true);
  const fileInput = useRef<HTMLInputElement>(null);
  const toast = useToast();
  const router = useRouter();

  const merge = useCallback((incoming: ChatMessage[]) => {
    if (!incoming.length) return;
    setItems((prev) => {
      const map = new Map(prev.map((m) => [m.id, m]));
      for (const m of incoming) map.set(m.id, m);
      return [...map.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    });
  }, []);

  const lastAt = items.at(-1)?.createdAt;
  const poll = useCallback(async () => {
    try {
      const url = `/api/chat/${header.id}${lastAt ? `?after=${encodeURIComponent(lastAt)}` : ""}`;
      const r = await fetch(url, { cache: "no-store" });
      if (r.ok) { const d = await r.json(); merge(d.messages); setTyping(d.typing ?? []); }
    } catch { /* offline: try again next tick */ }
  }, [header.id, lastAt, merge]);

  // Live updates: poll every 3s while the tab is visible.
  useEffect(() => {
    const t = setInterval(() => { if (document.visibilityState === "visible") poll(); }, 3000);
    const onVis = () => { if (document.visibilityState === "visible") poll(); };
    document.addEventListener("visibilitychange", onVis);
    return () => { clearInterval(t); document.removeEventListener("visibilitychange", onVis); };
  }, [poll]);
  useEffect(() => { if (header.member) markReadAction(header.id); }, [header.id, header.member]);

  // Stick to the bottom when new messages arrive (unless the person scrolled up to read).
  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el) return;
    if (highlight) { document.getElementById(`m-${highlight}`)?.scrollIntoView({ block: "center" }); return; }
    if (atBottom.current) el.scrollTop = el.scrollHeight;
  }, [items, highlight]);

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

  const send = async () => {
    const body = text.trim();
    if ((!body && !files.length) || sending) return;
    setSending(true);
    const fd = new FormData();
    fd.append("conversationId", header.id);
    fd.append("body", body);
    files.forEach((f) => fd.append("files", f));
    const r = await sendMessageAction(null, fd);
    setSending(false);
    if (r.ok) { setText(""); setClearSignal((n) => n + 1); setFiles([]); atBottom.current = true; await poll(); }
    else toast.push("error", r.error);
  };

  // Stickers send right away, like iMessage; ordinary pasted photos are added as attachments.
  const sendSticker = async (sticker: File) => {
    const fd = new FormData();
    fd.append("conversationId", header.id);
    fd.append("body", "");
    fd.append("files", sticker);
    const r = await sendMessageAction(null, fd);
    if (r.ok) { atBottom.current = true; await poll(); } else toast.push("error", r.error);
  };
  const onImages = useCallback(async (list: File[]) => {
    for (const f of list.slice(0, 4)) {
      const sticker = await asSticker(f);
      if (sticker) await sendSticker(sticker);
      else { const small = await compressImage(f); setFiles((cur) => [...cur, small].slice(0, 4)); }
    }
  }, [header.id]); // eslint-disable-line react-hooks/exhaustive-deps

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
        <button onClick={() => setInfoOpen(true)} className="rounded-lg p-2 text-muted hover:bg-surface-2 hover:text-fg" aria-label="Chat details"><Info className="h-5 w-5" /></button>
      </header>
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
              const stickerOnly = !m.deleted && !m.body && m.files.length > 0 && m.files.every((f) => isStickerName(f.filename));
              return (
                <div key={m.id} id={`m-${m.id}`} className={cn("group flex gap-2", mine ? "justify-end" : "justify-start", first ? "mt-3" : "mt-0.5")}>
                  {!mine && isGroupish && <div className="w-7 shrink-0">{first && <Avatar name={m.authorName} fileId={m.authorAvatar} size={28} />}</div>}
                  <div className={cn("flex max-w-[78%] flex-col", mine ? "items-end" : "items-start")}>
                    {first && !mine && isGroupish && <span className="mb-0.5 ml-1 text-[11px] font-semibold text-muted">{m.authorName}</span>}
                    <div className={cn("flex items-end gap-1", mine && "flex-row-reverse")}>
                      {stickerOnly ? (
                        <div className={cn("flex flex-wrap gap-1", highlight === m.id && "rounded-xl ring-2 ring-accent")}>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          {m.files.map((f) => <img key={f.id} src={`/api/files/${f.id}?inline=1`} alt="Sticker" loading="lazy" className="h-28 w-auto max-w-[160px] object-contain" />)}
                        </div>
                      ) : (
                      <div className={cn("rounded-2xl px-3.5 py-2 text-[15px] leading-snug shadow-soft",
                        m.deleted ? "border border-dashed border-line bg-transparent italic text-faint" : mine ? "bg-brand text-brand-fg" : "bg-surface-2 text-fg",
                        highlight === m.id && "ring-2 ring-accent")}>
                        {m.deleted ? "Message removed" : (<>
                          {m.files.length > 0 && (
                            <div className={cn("mb-1 grid gap-1", m.files.length > 1 ? "grid-cols-2" : "grid-cols-1")}>
                              {m.files.map((f) => f.mimeType.startsWith("image/") && !f.mimeType.includes("hei") ? (
                                <a key={f.id} href={`/api/files/${f.id}?inline=1`} target="_blank" rel="noopener" className="block overflow-hidden rounded-xl">
                                  {/* eslint-disable-next-line @next/next/no-img-element */}
                                  <img src={`/api/files/${f.id}?inline=1`} alt={f.filename} loading="lazy" className="max-h-64 w-full object-cover" />
                                </a>
                              ) : <a key={f.id} href={`/api/files/${f.id}`} className="underline">{f.filename}</a>)}
                            </div>
                          )}
                          {m.body && <p className="whitespace-pre-wrap break-words"><Linkified text={m.body} /></p>}
                        </>)}
                      </div>
                      )}
                      {!m.deleted && (
                        <button onClick={() => setMenuFor(m)} aria-label="Message options"
                          className="rounded-full p-1 text-faint opacity-60 transition hover:bg-surface-2 hover:text-fg md:opacity-0 md:group-hover:opacity-100 focus:opacity-100">
                          <MoreHorizontal className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                    <span className="mx-1 mt-0.5 text-[10px] text-faint">{timeOf(m.createdAt)}{m.editedAt && !m.deleted ? " · edited" : ""}</span>
                  </div>
                </div>
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
          {files.length > 0 && (
            <div className="mb-2 flex gap-2 overflow-x-auto">
              {files.map((f, i) => (
                <div key={i} className="relative shrink-0">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={URL.createObjectURL(f)} alt="" className="h-16 w-16 rounded-lg object-cover" />
                  <button onClick={() => setFiles(files.filter((_, j) => j !== i))} aria-label="Remove photo" className="absolute -right-1.5 -top-1.5 rounded-full bg-fg p-0.5 text-bg"><X className="h-3 w-3" /></button>
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
            }} onEnter={send} onImages={onImages} />
            <button onClick={send} disabled={sending || (!text.trim() && !files.length)} aria-label="Send"
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
      <MessageMenu m={menuFor} me={me} onClose={() => setMenuFor(null)} onChanged={() => { setMenuFor(null); poll(); router.refresh(); }} refetch={async () => {
        const from = new Date(new Date(items[0]?.createdAt ?? 0).getTime() - 1).toISOString();
        const r = await fetch(`/api/chat/${header.id}?after=${encodeURIComponent(from)}`, { cache: "no-store" });
        if (r.ok) { const all: ChatMessage[] = (await r.json()).messages; setItems((prev) => prev.map((p) => all.find((x) => x.id === p.id) ?? p)); }
      }} />
    </section>
  );
}

function MessageMenu({ m, me, onClose, onChanged, refetch }: { m: ChatMessage | null; me: { id: string; role: string }; onClose: () => void; onChanged: () => void; refetch: () => Promise<void> }) {
  const [mode, setMode] = useState<"menu" | "edit" | "report">("menu");
  const [value, setValue] = useState("");
  const [busy, start] = useTransition();
  const toast = useToast();
  useEffect(() => { setMode("menu"); setValue(m?.body ?? ""); }, [m]);
  if (!m) return null;
  const mine = m.authorId === me.id;
  const run = (fn: () => Promise<{ ok: boolean; message?: string; error?: string }>) => start(async () => {
    const r = await fn();
    if (r.ok) { if (r.message) toast.push("success", r.message); await refetch(); onChanged(); }
    else toast.push("error", r.error ?? "Something went wrong.");
  });
  return (
    <Dialog open={!!m} onClose={onClose} title={mode === "edit" ? "Edit message" : mode === "report" ? "Report message" : "Message"} size="sm">
      {mode === "menu" && (
        <div className="space-y-1">
          {m.body && <p className="mb-3 line-clamp-3 rounded-lg bg-surface-2 px-3 py-2 text-sm text-fg-2">{m.body}</p>}
          {m.body && <Button variant="ghost" className="w-full justify-start" onClick={() => { navigator.clipboard?.writeText(m.body); toast.push("success", "Copied."); onClose(); }}>Copy text</Button>}
          {mine && m.body && <Button variant="ghost" className="w-full justify-start" onClick={() => setMode("edit")}>Edit</Button>}
          {(mine || me.role === "admin") && <Button variant="ghost" className="w-full justify-start text-bad" disabled={busy} onClick={() => run(() => deleteMessageAction(m.id))}>{mine ? "Delete" : "Remove (admin)"}</Button>}
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
