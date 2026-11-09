import { NextResponse } from "next/server";
import { getCurrentUser } from "@/server/auth";
import { canViewFile } from "@/server/policy";
import { readStored } from "@/server/storage";

const INLINE_SAFE = new Set(["image/png", "image/jpeg", "image/gif", "image/webp", "application/pdf", "video/mp4", "video/quicktime", "audio/mpeg", "audio/mp4"]);

/** Every file download goes through here so access is checked against the record that owns the file. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new NextResponse("Not found", { status: 404 });
  const user = await getCurrentUser();
  const res = await canViewFile(user, id);
  if (!res.ok) return new NextResponse(user ? "Not found" : "Sign in required", { status: user ? 404 : 401 });
  const f = res.file;
  const buf = await readStored(f.storageKey).catch(() => null);
  if (!buf) return new NextResponse("File is missing from storage", { status: 410 });
  // Generated Courage Academy hero pictures are SVGs the portal itself wrote (never user uploads), so they can show inline.
  const generatedHero = f.mimeType === "image/svg+xml" && f.ownerType === "avatar" && f.filename === "hero.svg";
  const inline = new URL(req.url).searchParams.get("inline") === "1" && (INLINE_SAFE.has(f.mimeType) || generatedHero);
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "Content-Type": f.mimeType,
      "Content-Length": String(buf.length),
      "Content-Disposition": `${inline ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(f.filename)}`,
      "Cache-Control": "private, max-age=300",
      "X-Content-Type-Options": "nosniff",
      // Safari won't draw an SVG picture sent with "sandbox", so the portal's own hero pictures skip it (they never contain scripts).
      "Content-Security-Policy": generatedHero ? "default-src 'none'; style-src 'unsafe-inline'" : "default-src 'none'; img-src 'self'; media-src 'self'; style-src 'unsafe-inline'; sandbox",
    },
  });
}
