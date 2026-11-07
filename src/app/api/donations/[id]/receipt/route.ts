import { eq } from "drizzle-orm";
import { formatInTimeZone } from "date-fns-tz";
import { db } from "@/db";
import { donations, donors } from "@/db/schema";
import { getCurrentUser } from "@/server/auth";
import { canManageDonations, ORG_EIN, ORG_LEGAL_NAME, receiptSettings, receiptStatements } from "@/server/donations";
import { brandedDoc, GRAY } from "@/server/pdf-brand";
import { audit } from "@/server/audit";
import { fmtMoney } from "@/lib/money";

const longDate = (d: string) => formatInTimeZone(new Date(`${d}T12:00:00Z`), "UTC", "MMMM d, yyyy");

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const me = await getCurrentUser();
  if (!me) return new Response("Sign in required", { status: 401 });
  if (!(await canManageDonations(me))) return new Response("Not allowed", { status: 403 });
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) return new Response("Not found", { status: 404 });
  const row = (await db.select({ g: donations, d: donors }).from(donations).innerJoin(donors, eq(donors.id, donations.donorId)).where(eq(donations.id, id)).limit(1))[0];
  if (!row) return new Response("Not found", { status: 404 });
  const { g, d } = row;
  const s = await receiptSettings();
  const st = receiptStatements(g);
  const title = st.tax ? "Donation receipt" : "Gift acknowledgment";
  const c = await brandedDoc(req, `${title} ${g.receiptNumber}`, `${title} · No. ${g.receiptNumber}`);

  c.text(ORG_LEGAL_NAME, { f: c.bold, size: 11, gap: 0 });
  if (s.address) c.text(s.address, { size: 10, color: GRAY, gap: 0 });
  c.text(`EIN ${ORG_EIN}`, { size: 10, color: GRAY, gap: 14 });
  c.text(`Date issued: ${formatInTimeZone(new Date(), "America/New_York", "MMMM d, yyyy")}`, { size: 10, color: GRAY, gap: 14 });

  c.heading("Donor");
  c.text(d.name, { f: c.bold, gap: 0 });
  if (d.address) c.text(d.address, { size: 10, color: GRAY, gap: 0 });
  c.y -= 10;

  c.heading("Gift");
  c.row("Date received", longDate(g.receivedOn));
  if (g.type === "cash") { c.row("Amount", fmtMoney(g.amountCents)); if (g.method) c.row("Method", g.method); if (g.description) c.row("Note", g.description); }
  else if (g.type === "in_kind") c.row("Donated items", g.description);
  else { c.row("Gift", g.description); if (g.amountCents) c.row("Amount", fmtMoney(g.amountCents)); }
  c.y -= 8;

  if (st.tax) {
    c.heading("Statement");
    c.text(`${ORG_LEGAL_NAME} is a tax-exempt organization under Section 501(c)(3) of the Internal Revenue Code (EIN ${ORG_EIN}).`);
    for (const l of st.lines) c.text(l);
    c.text("Please keep this receipt for your records.", { color: GRAY });
  }
  c.y -= 10;
  c.text("Thank you for supporting kids facing hospital stays.", { f: c.italic, gap: 26 });
  c.ensure(50);
  c.page.drawLine({ start: { x: c.M, y: c.y }, end: { x: c.M + 200, y: c.y }, thickness: 0.6, color: GRAY });
  c.y -= 14;
  c.text(s.signerName, { f: c.bold, gap: 0 });
  c.text(`${s.signerTitle}, ${ORG_LEGAL_NAME}`, { size: 10, color: GRAY });
  c.footer(`${ORG_LEGAL_NAME} · 501(c)(3) · EIN ${ORG_EIN} · Receipt ${g.receiptNumber}`);

  await audit(me.id, "donation.receipt", "donation", g.id, { receiptNumber: g.receiptNumber });
  const file = `Courage-for-Kids-receipt-${g.receiptNumber}.pdf`;
  return new Response(await c.bytes(), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${file}"`, "Cache-Control": "private, no-store" } });
}
