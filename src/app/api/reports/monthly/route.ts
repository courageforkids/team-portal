import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { formatInTimeZone } from "date-fns-tz";
import { getCurrentUser } from "@/server/auth";
import { currentMonth, monthlyReport } from "@/server/reports";
import { audit } from "@/server/audit";
import { EVENT_TYPE_LABEL } from "@/lib/task-meta";

const NAVY = rgb(0, 79 / 255, 129 / 255), YELLOW = rgb(254 / 255, 212 / 255, 56 / 255), INK = rgb(0.13, 0.15, 0.2), GRAY = rgb(0.42, 0.45, 0.5), LINE = rgb(0.87, 0.89, 0.92);

/** Wraps text to a width; standard PDF fonts only cover basic Latin, so other characters are dropped. */
function wrap(text: string, font: PDFFont, size: number, width: number) {
  const clean = text.replace(/[^\x20-\x7E\n]/g, "");
  const lines: string[] = [];
  for (const para of clean.split("\n")) {
    let line = "";
    for (const word of para.split(/\s+/)) {
      const t = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(t, size) > width && line) { lines.push(line); line = word; } else line = t;
    }
    lines.push(line);
  }
  return lines;
}

export async function GET(req: Request) {
  const me = await getCurrentUser();
  if (!me) return new Response("Sign in required", { status: 401 });
  if (me.role !== "admin") return new Response("Administrators only", { status: 403 });
  const m = new URL(req.url).searchParams.get("month");
  const month = m && /^\d{4}-\d{2}$/.test(m) ? m : currentMonth();
  const r = await monthlyReport(month);

  const pdf = await PDFDocument.create();
  pdf.setTitle(`Courage for Kids — ${r.label} report`);
  const font = await pdf.embedFont(StandardFonts.Helvetica), bold = await pdf.embedFont(StandardFonts.HelveticaBold), italic = await pdf.embedFont(StandardFonts.HelveticaOblique);
  let logo: Awaited<ReturnType<typeof pdf.embedPng>> | null = null;
  try { const res = await fetch(new URL("/logo.png", req.url)); if (res.ok) logo = await pdf.embedPng(new Uint8Array(await res.arrayBuffer())); } catch { /* optional */ }
  const W = 612, H = 792, M = 50;
  let page: PDFPage = pdf.addPage([W, H]);
  page.drawRectangle({ x: 0, y: H - 96, width: W, height: 96, color: NAVY });
  page.drawRectangle({ x: 0, y: H - 101, width: W, height: 5, color: YELLOW });
  if (logo) { page.drawCircle({ x: M + 24, y: H - 48, size: 26, color: rgb(1, 1, 1) }); const s = 34 / logo.width; page.drawImage(logo, { x: M + 24 - (logo.width * s) / 2, y: H - 48 - (logo.height * s) / 2, width: logo.width * s, height: logo.height * s }); }
  page.drawText("Courage for Kids", { x: M + 62, y: H - 44, size: 20, font: bold, color: rgb(1, 1, 1) });
  page.drawText(`Monthly report · ${r.label}`, { x: M + 62, y: H - 64, size: 11, font, color: rgb(1, 1, 1) });
  let y = H - 135;
  const ensure = (need: number) => { if (y - need < 60) { page = pdf.addPage([W, H]); y = H - M; } };
  const heading = (t: string) => { ensure(40); page.drawText(t.toUpperCase(), { x: M, y, size: 10, font: bold, color: NAVY }); y -= 8; page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 0.7, color: LINE }); y -= 18; };
  const tiles = (items: [string, string, string?][]) => {
    const cols = 3, gap = 12, w = (W - 2 * M - gap * (cols - 1)) / cols, h = 58;
    items.forEach((it, i) => {
      const cx = M + (i % cols) * (w + gap), cy = y - Math.floor(i / cols) * (h + gap);
      if (i % cols === 0) ensure(h + gap);
      page.drawRectangle({ x: cx, y: cy - h, width: w, height: h, borderColor: LINE, borderWidth: 0.8, color: rgb(1, 1, 1) });
      page.drawText(it[0], { x: cx + 10, y: cy - 16, size: 8.5, font, color: GRAY });
      page.drawText(it[1], { x: cx + 10, y: cy - 38, size: 18, font: bold, color: INK });
      if (it[2]) page.drawText(it[2], { x: cx + 10, y: cy - 51, size: 7.5, font, color: GRAY });
    });
    y -= Math.ceil(items.length / cols) * (h + gap) + 6;
  };
  const para = (t: string) => { for (const line of wrap(t, font, 10.5, W - 2 * M)) { ensure(15); page.drawText(line, { x: M, y, size: 10.5, font, color: INK }); y -= 15; } y -= 6; };

  heading("Impact");
  tiles([["Boxes delivered", String(r.manual?.boxesDelivered ?? "-")], ["Hospitals served", String(r.manual?.hospitalsServed ?? "-")], ["Money raised", (r.manual?.moneyRaised || "-").replace(/[^\x20-\x7E]/g, "")]]);
  heading("Team");
  tiles([
    ["Volunteer hours", String(r.volunteer.hours), `${r.volunteer.volunteers} people`],
    ["Tasks completed", String(r.tasks.approved), `${r.tasks.created} assigned`],
    ["On-time rate", r.tasks.onTimeRate === null ? "-" : `${r.tasks.onTimeRate}%`, r.tasks.onTimeBase ? `of ${r.tasks.onTimeBase} due` : undefined],
    ["Event shifts filled", String(r.volunteer.signups), `${r.volunteer.attended} attended`],
    ["Meetings", String(r.meetings.count), r.meetings.avgAttendance ? `avg ${r.meetings.avgAttendance} attended` : undefined],
    ["Team members", String(r.team.activeMembers), r.team.newMembers ? `+${r.team.newMembers} new` : undefined],
  ]);
  if (r.manual?.highlights.trim()) { heading("Highlights"); para(r.manual.highlights); }
  if (r.events.length) { heading("Events"); para(r.events.map((e) => `${formatInTimeZone(e.startsAt, "America/New_York", "MMM d")} - ${e.title} (${EVENT_TYPE_LABEL[e.type]})`).join("\n")); }
  if (r.manual?.challenges.trim()) { heading("Challenges"); para(r.manual.challenges); }
  if (r.manual?.nextMonth.trim()) { heading("Coming up"); para(r.manual.nextMonth); }
  pdf.getPages().forEach((p, i, all) => p.drawText(`Courage for Kids · 501(c)(3) · EIN 39-3833022 · Generated ${formatInTimeZone(new Date(), "America/New_York", "MMM d, yyyy")} · Page ${i + 1} of ${all.length}`, { x: M, y: 32, size: 7.5, font: italic, color: GRAY }));

  await audit(me.id, "report.download", "report", month);
  return new Response(new Uint8Array(await pdf.save()), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="Courage-for-Kids-${month}-report.pdf"`, "Cache-Control": "private, no-store" } });
}
