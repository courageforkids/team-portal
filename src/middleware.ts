import { NextResponse, type NextRequest } from "next/server";

const PUBLIC = ["/api/v1", "/login", "/forgot-password", "/reset-password", "/invite", "/api/cron", "/api/calendar", "/api/health"];

/** Fast redirect for signed-out visitors. Real authorization happens on the server for every request. */
export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (PUBLIC.some((p) => pathname === p || pathname.startsWith(p + "/"))) return NextResponse.next();
  if (pathname.startsWith("/api/")) return NextResponse.next();
  if (!req.cookies.get("cfk_session")) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.search = pathname === "/" ? "" : `?next=${encodeURIComponent(pathname + req.nextUrl.search)}`;
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}
export const config = { matcher: ["/((?!_next/static|_next/image|icon.png|apple-icon.png|logo.png|robots.txt|manifest.webmanifest|sw.js).*)"] };
