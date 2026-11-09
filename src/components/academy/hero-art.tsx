import { heroSvg, sanitizeHero, type HeroConfig } from "@/lib/hero";
import { crestSvg, isCrestId, type CrestId } from "@/lib/rooms";
import { CAPES, DEFAULT_CREST, isCape, rankFor, type Cape } from "@/lib/academy";
import { cn } from "@/lib/cn";

/** A member's hero (full body or head). The SVG comes only from validated option ids, so it's safe to inline. */
export function HeroArt({ hero, cape, view = "full", size, animate = true, className, label, idPrefix }: {
  hero: unknown; cape?: string | null; view?: "full" | "head"; size: number; animate?: boolean; className?: string; label?: string; idPrefix?: string;
}) {
  const c = cape && isCape(cape) ? CAPES[cape] : null;
  const svg = heroSvg(sanitizeHero(hero) as HeroConfig, { view, capeColor: c?.color ?? "#004F81", capeTrim: "#FED438", animate, idPrefix, title: label });
  const w = view === "full" ? Math.round(size * 0.75) : size;
  return <span role={label ? "img" : undefined} aria-label={label} aria-hidden={label ? undefined : true} className={cn("inline-block shrink-0 [&>svg]:h-full [&>svg]:w-full", className)} style={{ width: w, height: size }} dangerouslySetInnerHTML={{ __html: svg }} />;
}

export function CapeCrest({ cape, crest, size = 40, className }: { cape: Cape; crest?: string | null; size?: number; className?: string }) {
  const id: CrestId = crest && isCrestId(crest) ? crest : (DEFAULT_CREST[cape] as CrestId);
  const svg = crestSvg(id, { color: CAPES[cape].color, deep: CAPES[cape].deep, size, idPrefix: `cr-${cape}-${size}` });
  return <span aria-hidden className={cn("inline-block shrink-0 [&>svg]:h-full [&>svg]:w-full", className)} style={{ width: size, height: size }} dangerouslySetInnerHTML={{ __html: svg }} />;
}

/** Cape border around a picture: Cape color, glowing brighter as the rank goes up (gold shimmer for Champions and Legends). */
export function CapeRing({ cape, points, children, size, className }: { cape: string | null; points: number; children: React.ReactNode; size: number; className?: string }) {
  const c = cape && isCape(cape) ? CAPES[cape] : null;
  if (!c) return <span className={className}>{children}</span>;
  const r = rankFor(points).index;
  const glow = r >= 1 ? `0 0 ${4 + r * 4}px ${r * 1.5}px ${r >= 3 ? "rgba(254,212,56,.75)" : c.color + "aa"}` : "none";
  return (
    <span className={cn("relative inline-grid shrink-0 place-items-center rounded-full", r >= 3 && "cfk-shimmer", className)}
      style={{ width: size + 8, height: size + 8, background: r >= 3 ? `conic-gradient(from 0deg, ${c.color}, #FED438, ${c.color}, #fff6c8, ${c.color})` : c.color, boxShadow: glow }}>
      <span className="grid place-items-center overflow-hidden rounded-full bg-surface" style={{ width: size + 2, height: size + 2 }}>{children}</span>
    </span>
  );
}
