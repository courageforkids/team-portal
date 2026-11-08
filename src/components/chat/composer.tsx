"use client";
import { useEffect, useRef } from "react";

/**
 * Message box. A rich text box (not a <textarea>) so that Apple stickers, Memoji and other images
 * inserted from the phone's keyboard arrive as images we can send. Only plain text is kept as text.
 */
export function Composer({ clearSignal, onText, onEnter, onImages, disabled }: {
  clearSignal: number; onText: (t: string) => void; onEnter: () => void; onImages: (files: File[]) => void; disabled?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);

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
      onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && !("ontouchstart" in window)) { e.preventDefault(); onEnter(); } }}
      className="input max-h-36 min-h-10 flex-1 overflow-y-auto whitespace-pre-wrap break-words rounded-[20px] py-2.5 empty:before:pointer-events-none empty:before:text-faint empty:before:content-[attr(data-placeholder)]"
    />
  );
}
