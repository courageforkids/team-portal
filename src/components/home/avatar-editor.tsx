"use client";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Camera, Trash2, ZoomIn, ZoomOut, Loader2 } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Button, buttonClass } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toaster";
import { removeAvatarAction, updateAvatarAction } from "@/server/profile-actions";

const VIEW = 280; // crop area size in CSS pixels
const OUT = 512;  // saved image size

type Img = { el: HTMLImageElement; w: number; h: number; url: string };

/** Profile photo picker with a round preview you can drag and zoom before saving. */
export function AvatarEditor({ name, fileId }: { name: string; fileId: string | null }) {
  const [img, setImg] = useState<Img | null>(null);
  const [zoom, setZoom] = useState(1);
  const [pos, setPos] = useState({ x: 0, y: 0 }); // image top-left inside the crop square
  const drag = useRef<{ id: number; sx: number; sy: number; ox: number; oy: number } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [saving, start] = useTransition();
  const toast = useToast();
  const router = useRouter();

  const base = img ? VIEW / Math.min(img.w, img.h) : 1;
  const scale = base * zoom;
  const dw = img ? img.w * scale : VIEW, dh = img ? img.h * scale : VIEW;
  const clamp = useCallback((x: number, y: number, w = dw, h = dh) => ({
    x: Math.min(0, Math.max(VIEW - w, x)), y: Math.min(0, Math.max(VIEW - h, y)),
  }), [dw, dh]);

  useEffect(() => () => { if (img) URL.revokeObjectURL(img.url); }, [img]);

  const pick = (file: File | undefined) => {
    if (!file) return;
    const url = URL.createObjectURL(file);
    const el = new Image();
    el.onload = () => {
      const w = el.naturalWidth, h = el.naturalHeight, s = VIEW / Math.min(w, h);
      setImg({ el, w, h, url });
      setZoom(1);
      setPos({ x: (VIEW - w * s) / 2, y: (VIEW - h * s) / 2 });
    };
    el.onerror = () => { URL.revokeObjectURL(url); toast.push("error", "That photo couldn't be opened. Try a JPG or PNG."); };
    el.src = url;
    if (inputRef.current) inputRef.current.value = "";
  };

  const setZoomKeepingCenter = (z: number) => {
    if (!img) return;
    const nz = Math.min(4, Math.max(1, z));
    const ns = base * nz;
    // keep the point under the center of the circle in place
    const cx = (VIEW / 2 - pos.x) / scale, cy = (VIEW / 2 - pos.y) / scale;
    const nw = img.w * ns, nh = img.h * ns;
    setZoom(nz);
    setPos(clamp(VIEW / 2 - cx * ns, VIEW / 2 - cy * ns, nw, nh));
  };

  const save = () => start(async () => {
    if (!img) return;
    const canvas = document.createElement("canvas");
    canvas.width = OUT; canvas.height = OUT;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, OUT, OUT);
    const src = VIEW / scale;
    ctx.drawImage(img.el, -pos.x / scale, -pos.y / scale, src, src, 0, 0, OUT, OUT);
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.88));
    if (!blob) { toast.push("error", "Couldn't prepare the photo. Try again."); return; }
    const fd = new FormData();
    fd.append("avatar", new File([blob], "profile.jpg", { type: "image/jpeg" }));
    const r = await updateAvatarAction(null, fd);
    if (r.ok) { toast.push("success", r.message ?? "Photo updated."); setImg(null); router.refresh(); }
    else toast.push("error", r.error);
  });

  const remove = () => start(async () => {
    const r = await removeAvatarAction();
    toast.push(r.ok ? "success" : "error", r.ok ? r.message ?? "Photo removed." : r.error);
    router.refresh();
  });

  return (
    <div className="flex items-center gap-4">
      <Avatar name={name} fileId={fileId} size={64} />
      <div className="flex flex-wrap gap-2">
        <label className={buttonClass("secondary", "sm", "h-9 cursor-pointer")}>
          <Camera className="h-4 w-4" />{fileId ? "Change photo" : "Add photo"}
          <input ref={inputRef} type="file" accept="image/*" className="sr-only" onChange={(e) => pick(e.target.files?.[0])} />
        </label>
        {fileId && <Button type="button" variant="ghost" size="sm" className="h-9" disabled={saving} onClick={remove}><Trash2 className="h-4 w-4" />Remove</Button>}
      </div>

      <Dialog open={!!img} onClose={() => !saving && setImg(null)} title="Adjust your photo" description="Drag to move it. Use the slider to zoom." size="sm">
        {img && (
          <div className="flex flex-col items-center">
            <div
              className="relative cursor-grab touch-none select-none overflow-hidden rounded-2xl bg-surface-2 active:cursor-grabbing"
              style={{ width: VIEW, height: VIEW }}
              onPointerDown={(e) => { (e.target as HTMLElement).setPointerCapture(e.pointerId); drag.current = { id: e.pointerId, sx: e.clientX, sy: e.clientY, ox: pos.x, oy: pos.y }; }}
              onPointerMove={(e) => { const d = drag.current; if (!d || d.id !== e.pointerId) return; setPos(clamp(d.ox + e.clientX - d.sx, d.oy + e.clientY - d.sy)); }}
              onPointerUp={() => { drag.current = null; }}
              onPointerCancel={() => { drag.current = null; }}
              onWheel={(e) => setZoomKeepingCenter(zoom - e.deltaY * 0.002)}
              role="img" aria-label="Photo preview. Drag to reposition."
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={img.url} alt="" draggable={false} className="pointer-events-none absolute max-w-none"
                style={{ left: pos.x, top: pos.y, width: dw, height: dh }} />
              {/* round mask: shows exactly what will be saved */}
              <div className="pointer-events-none absolute inset-0 rounded-full shadow-[0_0_0_9999px_rgba(0,0,0,0.45)] ring-2 ring-white/90" />
            </div>
            <div className="mt-5 flex w-full max-w-[280px] items-center gap-3">
              <button type="button" aria-label="Zoom out" className="rounded-lg p-1.5 text-muted hover:bg-surface-2" onClick={() => setZoomKeepingCenter(zoom - 0.25)}><ZoomOut className="h-4 w-4" /></button>
              <input type="range" min={1} max={4} step={0.01} value={zoom} aria-label="Zoom" onChange={(e) => setZoomKeepingCenter(Number(e.target.value))} className="h-2 flex-1 cursor-pointer accent-[var(--brand)]" />
              <button type="button" aria-label="Zoom in" className="rounded-lg p-1.5 text-muted hover:bg-surface-2" onClick={() => setZoomKeepingCenter(zoom + 0.25)}><ZoomIn className="h-4 w-4" /></button>
            </div>
            <div className="mt-5 flex w-full justify-end gap-2">
              <Button type="button" variant="secondary" disabled={saving} onClick={() => setImg(null)}>Cancel</Button>
              <Button type="button" disabled={saving} onClick={save}>{saving && <Loader2 className="h-4 w-4 animate-spin" />}Save photo</Button>
            </div>
          </div>
        )}
      </Dialog>
    </div>
  );
}
