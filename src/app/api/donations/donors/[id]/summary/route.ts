import { and, asc, eq, gte, lt, ne } from "drizzle-orm";
import { formatInTimeZone } from "date-fns-tz";
import { db } from "@/db";
import { donations, donors } from "@/db/schema";
import { getCurrentUser } from "@/server/auth";
import { canManageDonations, ORG_EIN, ORG_LEGAL_NAME, receiptSettings } from "@/server/donations";
import { brandedDoc, GRAY, LINE } from "@/server/pdf-brand";
import { audit } from "@/server/audit";
import { fmtMoney } from "@/lib/money";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const me = await getCurrentUser();
  if (!me) return new Response("Sign in required", { status: 401 });
  if (!(await canManageDonations(me))) return new Response("Not allowed", { status: 403 });
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) return new Response("Not found", { status: 404 });
  const y = Number(new URL(req.url).searchParams.get("year")) || new Date().getFullYear() - (new Date().getMonth() === 0 ? 1 : 0);
  const d = (await db.select().from(donors).where(eq(donors.id, id)).limit(1))[0];
  if (!d) return new Response("Not found", { status: 404 });
  // Gifts like stock or donor-advised fund grants are acknowledged separately without tax wording, so they're left out here.
  const gifts = await db.select().from(donations).where(and(eq(donations.donorId, id), ne(donations.type, "other"), gte(donations.receivedOn, `${y}-01-01`), lt(donations.receivedOn, `${y + 1}-01-01`))).orderBy(asc(donations.receivedOn));
  const s = await receiptSettings();
  const c = await brandedDoc(req, `${y} giving summary`, `${y} giving summary`);

  c.text(ORG_LEGAL_NAME, { f: c.bold, size: 11, gap: 0 });
  if (s.address) c.text(s.address, { size: 10, color: GRAY, gap: 0 });
  c.text(`EIN ${ORG_EIN} · Issued ${formatInTimeZone(new Date(), "America/New_York", "MMMM d, yyyy")}`, { size: 10, color: GRAY, gap: 14 });
  c.heading("Donor");
  c.text(d.name, { f: c.bold, gap: 0 });
  if (d.address) c.text(d.address, { size: 10, color: GRAY, gap: 0 });
  c.y -= 10;

  c.heading(`Gifts received in ${y}`);
  if (!gifts.length) c.text(`No gifts recorded for ${y}.`, { color: GRAY });
  const cols = [c.M, c.M + 78, c.M + 150, c.M + 360];
  const hdr = ["Date", "Receipt", "Gift", "Received in return"];
  c.ensure(20); hdr.forEach((h, i) => c.page.drawText(h, { x: cols[i], y: c.y, size: 8.5, font: c.bold, color: GRAY })); c.y -= 14;
  let cash = 0, goods = 0, missing = false;
  for (const g of gifts) {
    const what = g.type === "cash" ? `${fmtMoney(g.amountCents)}${g.method ? ` (${g.method})` : ""}` : `Items: ${g.description}`;
    const ret = g.goodsProvided ? `${g.goodsDescription || "Goods/services"}, value ${g.goodsValueCents === null ? "$______" : fmtMoney(g.goodsValueCents)}` : "None";
    const startY = c.y;
    c.ensure(16);
    c.page.drawText(formatInTimeZone(new Date(`${g.receivedOn}T12:00:00Z`), "UTC", "MMM d, yyyy"), { x: cols[0], y: c.y, size: 9.5, font: c.font });
    c.page.drawText(g.receiptNumber, { x: cols[1], y: c.y, size: 9.5, font: c.font });
    const yy = c.y;
    c.text(what, { x: cols[2], width: 200, size: 9.5, gap: 0 });
    const afterWhat = c.y; c.y = yy;
    c.text(ret, { x: cols[3], width: c.W - c.M - cols[3], size: 9.5, gap: 0 });
    c.y = Math.min(c.y, afterWhat) - 4;
    c.page.drawLine({ start: { x: c.M, y: c.y + 8 }, end: { x: c.W - c.M, y: c.y + 8 }, thickness: 0.4, color: LINE });
    void startY;
    if (g.type === "cash") cash += g.amountCents ?? 0;
    if (g.goodsProvided) { if (g.goodsValueCents === null) missing = true; else goods += g.goodsValueCents; }
  }
  c.y -= 8;
  c.row("Total money given", fmtMoney(cash));
  if (gifts.some((g) => g.goodsProvided)) c.row("Value received in return", missing ? `${fmtMoney(goods)} + $______` : fmtMoney(goods));
  if (gifts.some((g) => g.type === "in_kind")) c.row("Donated items", `${gifts.filter((g) => g.type === "in_kind").length} gift(s), listed above without a dollar value`);
  c.y -= 8;
  c.heading("Statement");
  c.text(`${ORG_LEGAL_NAME} is a tax-exempt organization under Section 501(c)(3) of the Internal Revenue Code (EIN ${ORG_EIN}).`);
  if (!gifts.some((g) => g.goodsProvided)) c.text("No goods or services were provided in exchange for any of the contributions listed.");
  else c.text("Except where shown under \"Received in return,\" no goods or services were provided in exchange for these contributions. Where something was received, the deductible amount is limited to the contribution minus its estimated fair market value.");
  if (gifts.some((g) => g.type === "in_kind")) c.text(`${ORG_LEGAL_NAME} does not assign a dollar value to donated items. Determining their value is the donor's responsibility.`);
  c.text("Please keep this summary for your records.", { color: GRAY, gap: 20 });
  c.text("Thank you for standing with kids facing hospital stays.", { f: c.italic, gap: 24 });
  c.text(s.signerName, { f: c.bold, gap: 0 });
  c.text(`${s.signerTitle}, ${ORG_LEGAL_NAME}`, { size: 10, color: GRAY });
  c.footer(`${ORG_LEGAL_NAME} · 501(c)(3) · EIN ${ORG_EIN} · ${y} giving summary`);

  await audit(me.id, "donor.summary", "donor", d.id, { year: y });
  const file = `Courage-for-Kids-${y}-giving-summary-${d.name.replace(/[^A-Za-z0-9]+/g, "-")}.pdf`;
  return new Response(await c.bytes(), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${file}"`, "Cache-Control": "private, no-store" } });
}
