import { test, expect } from "@playwright/test";
import { as, sql, toast } from "./helpers";

test("monthly report: admin saves numbers and downloads the PDF; others can't", async ({ browser }) => {
  const a = await as(browser, "jacob");
  await a.page.goto("/admin/reports");
  await a.page.fill("#r-boxes", "37");
  await a.page.fill("#r-money", "$1,250");
  await a.page.fill("#r-hi", "E2E highlight one\nE2E highlight two");
  await a.page.getByRole("button", { name: "Save report" }).click();
  await toast(a.page, /Report saved/);
  const [row] = await sql`select boxes_delivered, money_raised, highlights from monthly_reports order by updated_at desc limit 1`;
  expect(row.boxes_delivered).toBe(37);
  expect(row.money_raised).toBe("$1,250");

  const pdf = await a.page.request.get("/api/reports/monthly");
  expect(pdf.status()).toBe(200);
  expect(pdf.headers()["content-type"]).toContain("application/pdf");
  expect((await pdf.body()).subarray(0, 4).toString()).toBe("%PDF");

  const j = await as(browser, "julia");
  expect((await j.page.request.get("/api/reports/monthly")).status()).toBe(403);
  await j.page.goto("/admin/reports");
  await expect(j.page).not.toHaveURL(/\/admin\/reports/);
});

test("donations: log gifts, receipts, year-end summary and access", async ({ browser }) => {
  const a = await as(browser, "jacob");
  await a.page.goto("/donations");
  const donor = `E2E Donor ${Date.now()}`;
  await a.page.getByRole("button", { name: "Log a gift" }).click();
  const dlg = a.page.getByRole("dialog");
  await dlg.locator("#g-newname").fill(donor);
  await dlg.locator("#g-amount").fill("$300");
  await dlg.getByRole("button", { name: "Save gift" }).click();
  await toast(a.page, /Gift logged · receipt \d{4}-\d{4}/);
  const [g] = await sql`select d.id, d.receipt_number, d.donor_id, d.amount_cents from donations d join donors o on o.id = d.donor_id where o.name = ${donor}`;
  expect(g.amount_cents).toBe(30000);

  // In-kind with something given back but value missing → flagged
  await a.page.getByRole("button", { name: "Log a gift" }).click();
  await dlg.locator("#g-donor").selectOption({ label: donor });
  await dlg.getByText("Donated items", { exact: true }).click();
  await dlg.locator("#g-desc").fill("12 stuffed animals");
  await dlg.getByText("They got something back").click();
  await dlg.locator("#g-goods").fill("A s'more");
  await dlg.getByRole("button", { name: "Save gift" }).click();
  await toast(a.page, /Gift logged/);
  await expect(a.page.getByText("Add value of what they got").first()).toBeVisible();
  const [k] = await sql`select amount_cents, goods_value_cents from donations where donor_id = ${g.donor_id} and type = 'in_kind'`;
  expect(k.amount_cents).toBeNull();

  const r = await a.page.request.get(`/api/donations/${g.id}/receipt`);
  expect(r.status()).toBe(200);
  expect(r.headers()["content-type"]).toContain("application/pdf");
  const year = String(g.receipt_number).slice(0, 4);
  const sum = await a.page.request.get(`/api/donations/donors/${g.donor_id}/summary?year=${year}`);
  expect(sum.status()).toBe(200);

  // Leaders can't see donations until an admin adds them
  const j = await as(browser, "julia");
  expect((await j.page.request.get(`/api/donations/${g.id}/receipt`)).status()).toBe(403);
  await j.page.goto("/donations");
  await expect(j.page).not.toHaveURL(/\/donations/);
  await a.page.getByRole("checkbox", { name: /Julia/ }).check();
  await a.page.getByRole("button", { name: "Save receipt settings" }).click();
  await toast(a.page, /Receipt settings saved/);
  await j.page.goto("/donations");
  await expect(j.page.getByRole("heading", { name: "Donations", exact: true })).toBeVisible();
  await expect(j.page.getByRole("link", { name: "Donations" }).first()).toBeVisible();
  await a.page.reload();
  await a.page.getByRole("checkbox", { name: /Julia/ }).uncheck();
  await a.page.getByRole("button", { name: "Save receipt settings" }).click();
  await toast(a.page, /Receipt settings saved/);
});

test("donations API logs a gift with a key", async ({ browser, request }) => {
  const a = await as(browser, "jacob");
  await a.page.goto("/settings/api-keys");
  await a.page.fill("#ak-name", "E2E donations");
  await a.page.getByRole("button", { name: "Create key" }).click();
  const key = await a.page.getByTestId("copy-value").inputValue();
  const H = { Authorization: `Bearer ${key}` };
  const donor = `API Donor ${Date.now()}`;
  const res = await request.post("/api/v1/donations", { headers: H, data: { donor, amount: 25, method: "Cash" } });
  expect(res.status(), await res.text()).toBe(200);
  const body = await res.json();
  expect(body.receiptNumber).toMatch(/^\d{4}-\d{4}$/);
  const bad = await request.post("/api/v1/donations", { headers: H, data: { donor, type: "in_kind" } });
  expect(bad.status()).toBe(400);
  const list = await (await request.get("/api/v1/donations", { headers: H })).json();
  expect(list.gifts.some((g: { donor: string }) => g.donor === donor)).toBe(true);
});
