import { and, asc, eq, gte } from "drizzle-orm";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { formatInTimeZone } from "date-fns-tz";
import { randomBytes } from "node:crypto";
import { db } from "@/db";
import { users, volunteerHours } from "@/db/schema";
import { getCurrentUser } from "@/server/auth";
import { schoolYearStart } from "@/server/volunteer";
import { audit } from "@/server/audit";

const NAVY = rgb(0, 79 / 255, 129 / 255);
const YELLOW = rgb(254 / 255, 212 / 255, 56 / 255);
const GRAY = rgb(0.42, 0.45, 0.5);
const fmtH = (m: number) => { const h = m / 60; return Number.isInteger(h) ? String(h) : h.toFixed(2).replace(/0$/, ""); };
const niceDate = (iso: string) => formatInTimeZone(new Date(`${iso}T12:00:00Z`), "UTC", "MMM d, yyyy");

/** PDF certificate of approved volunteer hours. Members get their own; admins can pass ?user=<id>. */
export async function GET(req: Request) {
  const me = await getCurrentUser();
  if (!me) return new Response("Sign in required", { status: 401 });
  const sp = new URL(req.url).searchParams;
  const userId = sp.get("user") && me.role === "admin" ? sp.get("user")! : me.id;
  if (!/^[0-9a-f-]{36}$/i.test(userId)) return new Response("Not found", { status: 404 });
  const period = sp.get("period") === "all" ? "all" : "year";
  const u = (await db.select({ name: users.name, title: users.title }).from(users).where(eq(users.id, userId)).limit(1))[0];
  if (!u) return new Response("Not found", { status: 404 });
  const since = period === "year" ? schoolYearStart() : null;
  const rows = await db.select().from(volunteerHours)
    .where(and(eq(volunteerHours.userId, userId), eq(volunteerHours.status, "approved"), since ? gte(volunteerHours.date, since) : undefined))
    .orderBy(asc(volunteerHours.date));
  const total = rows.reduce((n, r) => n + r.minutes, 0);

  const pdf = await PDFDocument.create();
  pdf.setTitle(`Volunteer hours — ${u.name}`);
  pdf.setAuthor("Courage for Kids");
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const italic = await pdf.embedFont(StandardFonts.HelveticaOblique);
  let logo: Awaited<ReturnType<typeof pdf.embedPng>> | null = null;
  try { const r = await fetch(new URL("/logo.png", req.url)); if (r.ok) logo = await pdf.embedPng(new Uint8Array(await r.arrayBuffer())); } catch { /* logo optional */ }

  const W = 612, H = 792, M = 54;
  let page = pdf.addPage([W, H]);
  // Header band
  page.drawRectangle({ x: 0, y: H - 110, width: W, height: 110, color: NAVY });
  page.drawRectangle({ x: 0, y: H - 116, width: W, height: 6, color: YELLOW });
  if (logo) { page.drawCircle({ x: M + 26, y: H - 55, size: 30, color: rgb(1, 1, 1) }); const s = 40 / logo.width; page.drawImage(logo, { x: M + 26 - (logo.width * s) / 2, y: H - 55 - (logo.height * s) / 2, width: logo.width * s, height: logo.height * s }); }
  page.drawText("Courage for Kids", { x: M + 70, y: H - 50, size: 22, font: bold, color: rgb(1, 1, 1) });
  page.drawText("Their fight. Our mission.", { x: M + 70, y: H - 70, size: 11, font: italic, color: rgb(1, 1, 1) });

  let y = H - 170;
  page.drawText("CERTIFICATE OF VOLUNTEER SERVICE", { x: M, y, size: 13, font: bold, color: NAVY });
  y -= 34;
  page.drawText("This certifies that", { x: M, y, size: 12, font, color: GRAY });
  y -= 30;
  page.drawText(u.name, { x: M, y, size: 26, font: bold, color: rgb(0.07, 0.09, 0.15) });
  y -= 30;
  const periodText = rows.length
    ? rows[0].date === rows.at(-1)!.date ? `on ${niceDate(rows[0].date)}` : `from ${niceDate(rows[0].date)} to ${niceDate(rows.at(-1)!.date)}`
    : period === "year" ? `during the ${schoolYearStart().slice(0, 4)}–${Number(schoolYearStart().slice(0, 4)) + 1} school year` : "to date";
  const line = `completed ${fmtH(total)} hours of approved volunteer service with Courage for Kids, a 501(c)(3)`;
  page.drawText(line, { x: M, y, size: 12, font, color: rgb(0.2, 0.22, 0.26) });
  y -= 17;
  page.drawText(`nonprofit organization (EIN 39-3833022), ${periodText}.`, { x: M, y, size: 12, font, color: rgb(0.2, 0.22, 0.26) });

  // Entries table
  y -= 36;
  const col = [M, M + 92, W - M - 50];
  const header = () => {
    page.drawText("Date", { x: col[0], y, size: 9, font: bold, color: GRAY });
    page.drawText("Activity", { x: col[1], y, size: 9, font: bold, color: GRAY });
    page.drawText("Hours", { x: col[2], y, size: 9, font: bold, color: GRAY });
    y -= 6; page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 0.7, color: rgb(0.85, 0.87, 0.9) }); y -= 14;
  };
  header();
  if (!rows.length) { page.drawText("No approved hours in this period yet.", { x: M, y, size: 10, font: italic, color: GRAY }); y -= 16; }
  for (const r of rows) {
    if (y < 170) { page = pdf.addPage([W, H]); y = H - M; header(); }
    const act = r.activity.length > 70 ? r.activity.slice(0, 67) + "…" : r.activity;
    page.drawText(niceDate(r.date), { x: col[0], y, size: 10, font, color: rgb(0.2, 0.22, 0.26) });
    page.drawText(act, { x: col[1], y, size: 10, font, color: rgb(0.2, 0.22, 0.26) });
    page.drawText(fmtH(r.minutes), { x: col[2], y, size: 10, font, color: rgb(0.2, 0.22, 0.26) });
    y -= 16;
  }
  y -= 4; page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 0.7, color: rgb(0.85, 0.87, 0.9) }); y -= 16;
  page.drawText("Total", { x: col[1], y, size: 10, font: bold, color: NAVY });
  page.drawText(fmtH(total), { x: col[2], y, size: 10, font: bold, color: NAVY });

  // Signatures
  const sy = 110;
  const sig = (x: number, label: string, name: string) => {
    page.drawLine({ start: { x, y: sy }, end: { x: x + 220, y: sy }, thickness: 0.8, color: rgb(0.6, 0.62, 0.66) });
    page.drawText(name, { x, y: sy - 14, size: 10, font: bold, color: rgb(0.2, 0.22, 0.26) });
    page.drawText(label, { x, y: sy - 27, size: 9, font, color: GRAY });
  };
  sig(M, "Founder & Executive Director", "Jacob Rogers");
  sig(W - M - 220, "Adult Advisor", " ");
  const id = randomBytes(4).toString("hex").toUpperCase();
  page.drawText(`Issued ${formatInTimeZone(new Date(), "America/New_York", "MMMM d, yyyy")} · Certificate ${id} · Questions: courageforkids.org@gmail.com`, { x: M, y: 48, size: 8, font, color: GRAY });

  await audit(me.id, "hours.certificate", "user", userId, { period, minutes: total, id });
  const bytes = await pdf.save();
  const file = `Courage-for-Kids-volunteer-hours-${u.name.replace(/[^a-z0-9]+/gi, "-")}.pdf`;
  return new Response(new Uint8Array(bytes), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${file}"`, "Cache-Control": "private, no-store" } });
}
