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
