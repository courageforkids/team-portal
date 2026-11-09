"use client";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Dices, Download, Save } from "lucide-react";
import { DEFAULT_HERO, HERO_OPTIONS, heroSvg, randomHero, sanitizeHero, type HeroConfig } from "@/lib/hero";
import { saveHeroAction } from "@/server/academy-actions";
import { useToast } from "@/components/ui/toaster";
import { buttonClass } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { sfx } from "@/lib/music";

type Key = keyof HeroConfig;
const TABS: { id: string; label: string; fields: { key: Key; label: string }[] }[] = [
  { id: "look", label: "Look", fields: [{ key: "skin", label: "Skin tone" }, { key: "face", label: "Face shape" }, { key: "expression", label: "Expression" }] },
  { id: "hair", label: "Hair", fields: [{ key: "hair", label: "Hairstyle" }, { key: "hairColor", label: "Color" }] },
  { id: "eyes", label: "Eyes", fields: [{ key: "eyes", label: "Eyes" }, { key: "eyeColor", label: "Eye color" }, { key: "brows", label: "Brows" }, { key: "glasses", label: "Glasses" }, { key: "facialHair", label: "Facial hair" }] },
  { id: "gear", label: "Hero gear", fields: [{ key: "outfit", label: "Outfit" }, { key: "outfitColor", label: "Outfit color" }, { key: "mask", label: "Mask" }, { key: "maskColor", label: "Mask color" }] },
  { id: "scene", label: "Pose & scene", fields: [{ key: "pose", label: "Pose" }, { key: "background", label: "Background" }] },
];

export function HeroCreator({ initial, capeColor, capeName, name, heroAvatar }: { initial: unknown; capeColor: string; capeName: string | null; name: string; heroAvatar: boolean }) {
  const [hero, setHero] = useState<HeroConfig>(() => (initial ? sanitizeHero(initial) : DEFAULT_HERO));
  const [tab, setTab] = useState("look");
  const [asAvatar, setAsAvatar] = useState(heroAvatar);
  const [busy, start] = useTransition();
  const toast = useToast();
  const router = useRouter();
  const preview = useMemo(() => heroSvg(hero, { view: "full", capeColor, capeTrim: "#FED438", animate: true, idPrefix: "edit", title: `${name}'s hero` }), [hero, capeColor, name]);
  const head = useMemo(() => heroSvg(hero, { view: "head", capeColor, capeTrim: "#FED438", animate: false, idPrefix: "edithead" }), [hero, capeColor]);
  const set = <K extends Key>(k: K, v: HeroConfig[K]) => { setHero((h) => ({ ...h, [k]: v })); sfx.tick(); };

  const save = () => start(async () => {
    const fd = new FormData();
    fd.append("hero", JSON.stringify(hero));
    fd.append("useAsAvatar", asAvatar ? "1" : "0");
    if (asAvatar) { const png = await headPng(); if (png) fd.append("png", png, "hero.png"); }
    const r = await saveHeroAction(fd);
    if (r.ok) { toast.push("success", r.message ?? "Saved."); sfx.sparkle(); router.refresh(); } else toast.push("error", r.error);
  });

  // The profile picture is saved as a PNG (drawn here), so it shows on every phone like a normal photo.
  const headPng = async (): Promise<Blob | null> => {
    try {
      const svg = heroSvg(hero, { view: "head", capeColor, capeTrim: "#FED438", animate: false, idPrefix: "png" });
      const img = new Image();
      await new Promise<void>((res, rej) => { img.onload = () => res(); img.onerror = rej; img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg); });
      const c = document.createElement("canvas"); c.width = 256; c.height = 256;
      c.getContext("2d")!.drawImage(img, 0, 0, 256, 256);
      return await new Promise((res) => c.toBlob(res, "image/png"));
    } catch { return null; }
  };

  // "Save as image": a 1080×1920 story/wallpaper with the hero, name and Cape.
  const download = async () => {
    try {
      const W = 1080, H = 1920;
      const c = document.createElement("canvas"); c.width = W; c.height = H;
      const g = c.getContext("2d")!;
      const bg = g.createLinearGradient(0, 0, 0, H); bg.addColorStop(0, "#02243d"); bg.addColorStop(1, "#0b5d96");
      g.fillStyle = bg; g.fillRect(0, 0, W, H);
      for (let i = 0; i < 90; i++) { g.fillStyle = `rgba(255,255,255,${Math.random() * 0.7})`; g.beginPath(); g.arc(Math.random() * W, Math.random() * H * 0.8, Math.random() * 3 + 0.5, 0, Math.PI * 2); g.fill(); }
      const svg = heroSvg(hero, { view: "full", capeColor, capeTrim: "#FED438", animate: false, idPrefix: "dl" });
      const img = new Image();
      await new Promise<void>((res, rej) => { img.onload = () => res(); img.onerror = rej; img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg); });
      g.drawImage(img, (W - 840) / 2, 360, 840, 1120);
      g.textAlign = "center"; g.fillStyle = "#ffffff"; g.font = "800 84px system-ui, sans-serif"; g.fillText(name, W / 2, 1610);
      g.fillStyle = "#FED438"; g.font = "700 46px system-ui, sans-serif"; g.fillText(capeName ? capeName.toUpperCase() : "COURAGE ACADEMY", W / 2, 1690);
      g.fillStyle = "rgba(255,255,255,.75)"; g.font = "600 36px system-ui, sans-serif"; g.fillText("Courage for Kids · Their fight. Our mission.", W / 2, 1800);
      const blob: Blob | null = await new Promise((res) => c.toBlob(res, "image/png"));
      if (!blob) throw new Error("no image");
      const file = new File([blob], "my-hero.png", { type: "image/png" });
      if (navigator.canShare?.({ files: [file] })) await navigator.share({ files: [file], title: "My Courage Academy hero" }).catch(() => {});
      else { const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "my-hero.png"; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); }
    } catch { toast.push("error", "Couldn't make the image on this device."); }
  };

  const fields = TABS.find((t) => t.id === tab)!.fields;
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,360px)_1fr]">
      <div className="lg:sticky lg:top-24 lg:self-start">
        <div className="relative mx-auto grid aspect-[3/4] w-full max-w-[210px] place-items-center sm:max-w-[320px] overflow-hidden rounded-3xl bg-[radial-gradient(circle_at_50%_35%,#0b5d96,#02243d_75%)] shadow-pop">
          <div className="h-[92%] w-[92%] [&>svg]:h-full [&>svg]:w-full" dangerouslySetInnerHTML={{ __html: preview }} />
        </div>
        <div className="mt-4 flex items-center justify-center gap-3">
          <span className="h-14 w-14 overflow-hidden rounded-full ring-2 ring-line [&>svg]:h-full [&>svg]:w-full" aria-label="Profile picture preview" role="img" dangerouslySetInnerHTML={{ __html: head }} />
          <label className="flex items-center gap-2 text-sm font-medium">
            <input type="checkbox" checked={asAvatar} onChange={(e) => setAsAvatar(e.target.checked)} className="h-5 w-5 accent-[var(--color-brand)]" />
            Use as my profile picture
          </label>
        </div>
        <div className="mt-4 grid grid-cols-3 gap-2">
          <button type="button" onClick={() => { setHero(randomHero()); sfx.pop(); }} className={buttonClass("secondary")}><Dices className="h-4 w-4" />Random</button>
          <button type="button" onClick={download} className={buttonClass("secondary")}><Download className="h-4 w-4" />Image</button>
          <button type="button" onClick={save} disabled={busy} className={buttonClass("primary")}><Save className="h-4 w-4" />{busy ? "Saving…" : "Save"}</button>
        </div>
      </div>

      <div className="min-w-0">
        <div role="tablist" aria-label="Hero parts" className="scrollbar-thin -mx-1 mb-4 flex gap-1.5 overflow-x-auto px-1 pb-1">
          {TABS.map((t) => (
            <button key={t.id} role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)}
              className={cn("shrink-0 rounded-full px-4 py-2 text-sm font-semibold", tab === t.id ? "bg-brand text-brand-fg" : "bg-surface-2 text-fg-2 hover:bg-surface-3")}>{t.label}</button>
          ))}
        </div>
        <div className="space-y-6">
          {fields.map((f) => {
            const opts = HERO_OPTIONS[f.key] ?? [];
            return (
              <fieldset key={f.key}>
                <legend className="mb-2 text-sm font-semibold">{f.label}</legend>
                <div className="flex flex-wrap gap-2">
                  {opts.map((o) => {
                    const on = hero[f.key] === o.id;
                    return o.swatch ? (
                      <button key={o.id} type="button" onClick={() => set(f.key, o.id as never)} aria-label={o.label} aria-pressed={on} title={o.label}
                        className={cn("h-10 w-10 rounded-full border-2 transition", on ? "scale-110 border-fg ring-2 ring-brand/40" : "border-line")} style={{ background: o.swatch }} />
                    ) : (
                      <button key={o.id} type="button" onClick={() => set(f.key, o.id as never)} aria-pressed={on}
                        className={cn("min-h-10 rounded-xl border px-3 py-2 text-sm font-medium transition", on ? "border-brand bg-brand-soft text-brand-ink" : "border-line bg-surface hover:bg-surface-2")}>{o.label}</button>
                    );
                  })}
                </div>
              </fieldset>
            );
          })}
          {tab === "eyes" && (
            <label className="flex items-center gap-2 text-sm font-medium">
              <input type="checkbox" checked={hero.freckles} onChange={(e) => set("freckles", e.target.checked)} className="h-5 w-5" />Freckles
            </label>
          )}
          {tab === "gear" && <p className="text-xs text-muted">Your cape always matches your Cape&apos;s color.</p>}
        </div>
      </div>
    </div>
  );
}
