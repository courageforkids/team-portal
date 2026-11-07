import "server-only";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";

export const NAVY = rgb(0, 79 / 255, 129 / 255), YELLOW = rgb(254 / 255, 212 / 255, 56 / 255), INK = rgb(0.13, 0.15, 0.2), GRAY = rgb(0.42, 0.45, 0.5), LINE = rgb(0.87, 0.89, 0.92), WHITE = rgb(1, 1, 1);

/** Standard PDF fonts only cover basic Latin, so other characters are swapped or dropped. */
export const ascii = (t: string) => t.replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, "-").replace(/…/g, "...").replace(/[^\x20-\x7E\n\u00B7]/g, "");

export function wrap(text: string, font: PDFFont, size: number, width: number) {
  const lines: string[] = [];
  for (const para of ascii(text).split("\n")) {
    let line = "";
    for (const word of para.split(/\s+/)) {
      const t = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(t, size) > width && line) { lines.push(line); line = word; } else line = t;
    }
    lines.push(line);
  }
  return lines;
}

/** A US-letter document with the navy/yellow header and a simple cursor for writing top to bottom. */
export async function brandedDoc(req: Request, title: string, subtitle: string) {
  const pdf = await PDFDocument.create();
  pdf.setTitle(ascii(`Courage for Kids - ${title}`));
  const font = await pdf.embedFont(StandardFonts.Helvetica), bold = await pdf.embedFont(StandardFonts.HelveticaBold), italic = await pdf.embedFont(StandardFonts.HelveticaOblique);
  let logo: Awaited<ReturnType<typeof pdf.embedPng>> | null = null;
  try { const res = await fetch(new URL("/logo.png", req.url)); if (res.ok) logo = await pdf.embedPng(new Uint8Array(await res.arrayBuffer())); } catch { /* optional */ }
  const W = 612, H = 792, M = 54;
  let page: PDFPage = pdf.addPage([W, H]);
  page.drawRectangle({ x: 0, y: H - 96, width: W, height: 96, color: NAVY });
  page.drawRectangle({ x: 0, y: H - 101, width: W, height: 5, color: YELLOW });
  if (logo) { page.drawCircle({ x: M + 24, y: H - 48, size: 26, color: WHITE }); const s = 34 / logo.width; page.drawImage(logo, { x: M + 24 - (logo.width * s) / 2, y: H - 48 - (logo.height * s) / 2, width: logo.width * s, height: logo.height * s }); }
  page.drawText("Courage for Kids", { x: M + 62, y: H - 44, size: 20, font: bold, color: WHITE });
  page.drawText(ascii(subtitle), { x: M + 62, y: H - 64, size: 11, font, color: WHITE });
  const c = {
    pdf, font, bold, italic, W, H, M, y: H - 135,
    get page() { return page; },
    ensure(need: number) { if (c.y - need < 70) { page = pdf.addPage([W, H]); c.y = H - M; } },
    text(t: string, o: { size?: number; f?: PDFFont; color?: ReturnType<typeof rgb>; x?: number; width?: number; gap?: number } = {}) {
      const size = o.size ?? 10.5, f = o.f ?? font, x = o.x ?? M;
      for (const line of wrap(t, f, size, o.width ?? W - M - x)) { c.ensure(size + 5); page.drawText(line, { x, y: c.y, size, font: f, color: o.color ?? INK }); c.y -= size + 4.5; }
      c.y -= o.gap ?? 6;
    },
    heading(t: string) { c.ensure(40); c.y -= 4; page.drawText(ascii(t).toUpperCase(), { x: M, y: c.y, size: 9.5, font: bold, color: NAVY }); c.y -= 7; page.drawLine({ start: { x: M, y: c.y }, end: { x: W - M, y: c.y }, thickness: 0.7, color: LINE }); c.y -= 16; },
    row(label: string, value: string) { c.ensure(16); page.drawText(ascii(label), { x: M, y: c.y, size: 9.5, font, color: GRAY }); const lines = wrap(value, bold, 10.5, W - 2 * M - 130); lines.forEach((l, i) => { if (i) { c.ensure(15); } page.drawText(l, { x: M + 130, y: c.y, size: 10.5, font: bold, color: INK }); c.y -= 15; }); c.y -= 2; },
    footer(t: string) { pdf.getPages().forEach((p, i, all) => p.drawText(ascii(`${t} · Page ${i + 1} of ${all.length}`), { x: M, y: 34, size: 7.5, font: italic, color: GRAY })); },
    async bytes() { return new Uint8Array(await pdf.save()); },
  };
  return c;
}
