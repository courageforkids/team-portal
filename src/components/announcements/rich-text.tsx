import { Fragment, type ReactNode } from "react";
import { cn } from "@/lib/cn";

const URL_RE = /\bhttps?:\/\/[^\s<>"']+/gi;
const TRAILING = /[.,;:!?)\]}'"]+$/;

/** Turns http(s) URLs inside plain text into safe links. Never renders user content as HTML. */
export function Linkify({ text }: { text: string }) {
  const out: ReactNode[] = [];
  let last = 0;
  for (const m of text.matchAll(URL_RE)) {
    let url = m[0];
    const trail = url.match(TRAILING)?.[0] ?? "";
    // keep a closing paren when the URL itself contains an opening one, e.g. Wikipedia links
    if (trail && !(trail === ")" && url.includes("("))) url = url.slice(0, -trail.length);
    const start = m.index ?? 0;
    if (start > last) out.push(text.slice(last, start));
    let safe: string | null = null;
    try { const u = new URL(url); if (u.protocol === "http:" || u.protocol === "https:") safe = u.href; } catch { /* not a URL */ }
    out.push(safe
      ? <a key={start} href={safe} target="_blank" rel="noopener noreferrer nofollow" className="break-words font-medium text-brand-ink underline decoration-brand/30 underline-offset-2 hover:decoration-brand">{url}</a>
      : url);
    last = start + url.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return <>{out}</>;
}

/** Paragraphs (blank lines) and line breaks from plain text, with links. */
export function RichText({ text, className }: { text: string; className?: string }) {
  const paragraphs = text.replace(/\r\n?/g, "\n").split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  return (
    <div className={cn("space-y-4 text-[15px] leading-relaxed text-fg-2 break-words", className)}>
      {paragraphs.map((p, i) => (
        <p key={i}>
          {p.split("\n").map((line, j) => (
            <Fragment key={j}>{j > 0 && <br />}<Linkify text={line} /></Fragment>
          ))}
        </p>
      ))}
    </div>
  );
}
