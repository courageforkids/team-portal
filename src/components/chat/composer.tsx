"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { mentionHandles, type Mentionable } from "@/lib/mentions";
import { Avatar } from "@/components/ui/avatar";

/**
 * Message box. A rich text box (not a <textarea>) so that Apple stickers, Memoji and other images
 * inserted from the phone's keyboard arrive as images we can send. Only plain text is kept as text.
 */
export function Composer({ clearSignal, onText, onEnter, onImages, disabled, mentionables = [], meId }: {
  clearSignal: number; onText: (t: string) => void; onEnter: () => void; onImages: (files: File[]) => void; disabled?: boolean;
  /** People who can be @mentioned (empty in direct chats). */
  mentionables?: Mentionable[]; meId?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  // @mention picker: what's been typed after "@", and where (so we can swap it for the name).
  const [mention, setMention] = useState<string | null>(null);
  const caret = useRef<{ node: Text; at: number; end: number } | null>(null);
  const handles = useMemo(() => mentionHandles(mentionables), [mentionables]);
  const matches = mention === null ? [] : handles.filter((h) => h.id !== meId).filter((h) => {
    const q = mention.toLowerCase();
    return h.handle.toLowerCase().startsWith(q) || h.name.toLowerCase().split(/\s+/).some((w) => w.startsWith(q));
  }).slice(0, 6);

  const checkMention = () => {
    if (!handles.length) return;
    const sel = window.getSelection();
    const node = sel?.anchorNode;
    if (!sel || !node || node.nodeType !== Node.TEXT_NODE || !ref.current?.contains(node)) { setMention(null); return; }
    const before = (node.textContent ?? "").slice(0, sel.anchorOffset);
    const m = /(?:^|[\s(])@([\p{L}\p{N}]*)$/u.exec(before);
    if (!m) { setMention(null); caret.current = null; return; }
    caret.current = { node: node as Text, at: sel.anchorOffset - m[1].length - 1, end: sel.anchorOffset };
    setMention(m[1]);
  };

  const pickMention = (handle: string) => {
    const el = ref.current, c = caret.current;
    if (!el || !c || !el.contains(c.node)) return;
    el.focus();
    const range = document.createRange();
    range.setStart(c.node, c.at); range.setEnd(c.node, Math.min(c.end, c.node.length));
    const sel = window.getSelection();
    sel?.removeAllRanges(); sel?.addRange(range);
    document.execCommand("insertText", false, `@${handle} `);
    setMention(null); caret.current = null;
    onText(textOf(el));
  };

  // Clear after a message is sent (not on first load, so anything typed early is kept).
  const lastSignal = useRef(clearSignal);
  useEffect(() => {
    if (clearSignal === lastSignal.current) { if (ref.current?.innerText.trim()) onText(ref.current.innerText); return; }
    lastSignal.current = clearSignal;
    if (ref.current) { ref.current.textContent = ""; onText(""); }
  }, [clearSignal]); // eslint-disable-line react-hooks/exhaustive-deps

  const textOf = (el: HTMLElement) => el.innerText.replace(/ /g, " ").replace(/\n$/, "");

  // Pull any images the keyboard dropped in (stickers arrive as <img>), remove them, and hand them over as files.
  const harvest = async () => {
    const el = ref.current;
    if (!el) return;
    const imgs = Array.from(el.querySelectorAll("img"));
    if (imgs.length) {
      const files: File[] = [];
      for (const img of imgs) {
        const src = img.getAttribute("src") ?? "";
        img.remove();
        if (!src) continue;
        try {
          const blob = await (await fetch(src)).blob();
          if (blob.type.startsWith("image/")) files.push(new File([blob], `pasted-${Date.now()}.${blob.type.split("/")[1] || "png"}`, { type: blob.type }));
        } catch { /* couldn't read it; skip */ }
      }
      if (files.length) onImages(files);
    }
    // Drop any formatting a paste might have brought in, keeping just the text.
    if (el.querySelector("*:not(br):not(div):not(span)")) el.textContent = textOf(el);
    onText(textOf(el));
    checkMention();
  };

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // iPhone sends stickers through "beforeinput" with the image attached.
    const onBeforeInput = (e: InputEvent) => {
      const files = Array.from(e.dataTransfer?.files ?? []).filter((f) => f.type.startsWith("image/"));
      if (files.length) { e.preventDefault(); onImages(files); }
    };
    el.addEventListener("beforeinput", onBeforeInput as EventListener);
    return () => el.removeEventListener("beforeinput", onBeforeInput as EventListener);
  }, [onImages]);

  return (
    <div className="relative min-w-0 flex-1">
    {matches.length > 0 && (
      <div role="listbox" aria-label="Mention someone" className="absolute bottom-full left-0 z-30 mb-2 w-64 max-w-[80vw] overflow-hidden rounded-xl border border-line bg-surface shadow-pop">
        {matches.map((h) => (
          <button key={h.id} type="button" role="option" aria-selected="false" onMouseDown={(e) => e.preventDefault()} onClick={() => pickMention(h.handle)}
            className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm hover:bg-surface-2">
            <Avatar name={h.name} size={26} /><span className="min-w-0 flex-1 truncate font-medium">{h.name}</span><span className="text-xs text-muted">@{h.handle}</span>
          </button>
        ))}
      </div>
    )}
    <div
      ref={ref}
      id="composer"
      role="textbox"
      aria-label="Message"
      aria-multiline="true"
      contentEditable={!disabled}
      suppressContentEditableWarning
      data-placeholder="Message"
      onInput={() => void harvest()}
      onPaste={(e) => {
        const files = Array.from(e.clipboardData.files).filter((f) => f.type.startsWith("image/"));
        e.preventDefault();
        if (files.length) onImages(files);
        const t = e.clipboardData.getData("text/plain");
        if (t) document.execCommand("insertText", false, t);
      }}
      onDrop={(e) => {
        const files = Array.from(e.dataTransfer.files).filter((f) => f.type.startsWith("image/"));
        if (files.length) { e.preventDefault(); onImages(files); }
      }}
      onKeyDown={(e) => {
        if (matches.length && (e.key === "Enter" || e.key === "Tab")) { e.preventDefault(); pickMention(matches[0].handle); return; }
        if (e.key === "Escape" && mention !== null) { setMention(null); return; }
        if (e.key === "Enter" && !e.shiftKey && !("ontouchstart" in window)) { e.preventDefault(); onEnter(); }
      }}
      onKeyUp={(e) => { if (e.key.startsWith("Arrow")) checkMention(); }}
      onBlur={() => setTimeout(() => setMention(null), 300)}
      className="input max-h-36 min-h-10 w-full overflow-y-auto whitespace-pre-wrap break-words rounded-[20px] py-2.5 empty:before:pointer-events-none empty:before:text-faint empty:before:content-[attr(data-placeholder)]"
    />
    </div>
  );
}
