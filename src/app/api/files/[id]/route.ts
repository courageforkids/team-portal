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
  const inline = new URL(req.url).searchParams.get("inline") === "1" && INLINE_SAFE.has(f.mimeType);
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "Content-Type": f.mimeType,
      "Content-Length": String(buf.length),
      "Content-Disposition": `${inline ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(f.filename)}`,
      "Cache-Control": "private, max-age=300",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; img-src 'self'; media-src 'self'; style-src 'unsafe-inline'; sandbox",
    },
  });
}
