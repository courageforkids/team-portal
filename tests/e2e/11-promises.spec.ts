import { test, expect } from "@playwright/test";
import { as, sql, toast } from "./helpers";

test("an admin keeps a private list of sponsor promises", async ({ browser }) => {
  const who = `Yaber ${Date.now()}`;
  const admin = await as(browser, "jacob");
  await admin.page.goto("/admin/promises");
  await admin.page.fill("#p-who", who);
  await admin.page.fill("#p-what", "Unboxing reel and tag them in posts");
  await admin.page.getByRole("button", { name: "Add" }).click();
  await toast(admin.page, "Promise saved.");
  const item = admin.page.locator("li", { hasText: who });
  await expect(item).toBeVisible();
  await item.getByRole("button", { name: "Done" }).click();
  await toast(admin.page, "Marked as done.");
  await expect(admin.page.getByRole("heading", { name: /^Done/ })).toBeVisible();

  // Nobody else can reach the page
  const leader = await as(browser, "julia");
  await leader.page.goto("/admin/promises");
  await expect(leader.page).not.toHaveURL(/\/admin\/promises/);
  await expect(leader.page.getByText(who)).toHaveCount(0);

  // Another admin sees only their own list, never Jacob's
  const [julia] = await sql`select role from users where email = 'julia@demo.cfk.test'`;
  await sql`update users set role = 'admin' where email = 'julia@demo.cfk.test'`;
  try {
    const other = await as(browser, "julia");
    await other.page.goto("/admin/promises");
    await expect(other.page.getByRole("heading", { level: 1, name: "What we promised" })).toBeVisible();
    await expect(other.page.getByText(who)).toHaveCount(0);
    await other.ctx.close();
  } finally {
    await sql`update users set role = ${julia.role} where email = 'julia@demo.cfk.test'`;
  }
  await admin.ctx.close(); await leader.ctx.close();
});
