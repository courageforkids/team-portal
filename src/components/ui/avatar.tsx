import { cn } from "@/lib/cn";

const PALETTE = ["#004F81", "#0E7490", "#7C3AED", "#B45309", "#BE185D", "#15803D", "#4338CA", "#9A3412"];
export function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase() || "?";
}
function colorFor(name: string) {
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

export function Avatar({ name, fileId, size = 32, className }: { name: string; fileId?: string | null; size?: number; className?: string }) {
  const style = { width: size, height: size, fontSize: Math.max(10, Math.round(size * 0.38)) };
  if (fileId)
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={`/api/files/${fileId}?inline=1`} alt="" style={style} className={cn("shrink-0 rounded-full object-cover ring-2 ring-surface", className)} />;
  return (
    <span aria-hidden style={{ ...style, background: colorFor(name) }}
      className={cn("inline-grid shrink-0 place-items-center rounded-full font-semibold text-white ring-2 ring-surface", className)}>
      {initials(name)}
    </span>
  );
}

export function AvatarStack({ people, max = 3, size = 26 }: { people: { name: string; avatarFileId?: string | null }[]; max?: number; size?: number }) {
  const shown = people.slice(0, max);
  const extra = people.length - shown.length;
  return (
    <span className="flex -space-x-2" title={people.map((p) => p.name).join(", ")}>
      {shown.map((p, i) => <Avatar key={i} name={p.name} fileId={p.avatarFileId} size={size} />)}
      {extra > 0 && (
        <span style={{ width: size, height: size }} className="inline-grid place-items-center rounded-full bg-surface-3 text-[11px] font-semibold text-fg-2 ring-2 ring-surface">+{extra}</span>
      )}
      <span className="sr-only">{people.map((p) => p.name).join(", ")}</span>
    </span>
  );
}
