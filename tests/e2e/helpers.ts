import { expect, type Browser, type Page } from "@playwright/test";
import postgres from "postgres";

export const PASSWORD = "CourageDemo2026!";
export const sql = postgres(process.env.E2E_DATABASE_URL ?? process.env.DATABASE_URL ?? "postgres://postgres@localhost:5432/cfk_test", { max: 2 });

export async function login(page: Page, who: string, password = PASSWORD) {
  await page.goto("/login");
  await page.fill("#email", who.includes("@") ? who : `${who}@demo.cfk.test`);
  await page.fill("#password", password);
  await Promise.all([page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 60_000 }), page.click("button[type=submit]")]);
}

export async function as(browser: Browser, who: string) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await login(page, who);
  return { ctx, page };
}

export async function toast(page: Page, text: string | RegExp) {
  await expect(page.getByRole("status").filter({ hasText: text }).first()).toBeVisible();
}
