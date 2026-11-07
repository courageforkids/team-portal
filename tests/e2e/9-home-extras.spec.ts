import { test, expect } from "@playwright/test";
import { as, sql, toast } from "./helpers";

test("countdowns show on Home and birthdays save from the profile", async ({ browser }) => {
  const [ev] = await sql`insert into events (title, type, starts_at) values (${"E2E Gala " + Date.now()}, 'fundraising', now() + interval '2 hours') returning id, title`;
  const r = await as(browser, "reese");
  await r.page.goto("/");
  await expect(r.page.getByText(new RegExp(`${ev.title} (is today!|in 1 day)`))).toBeVisible();
  await sql`delete from events where id = ${ev.id}`;

  await r.page.goto("/profile");
  await r.page.locator("#bd-m").selectOption("3");
  await r.page.locator("#bd-d").selectOption("14");
  await r.page.getByRole("button", { name: "Save" }).last().click();
  await toast(r.page, /Birthday saved/);
  expect((await sql`select birthday from users where email = 'reese@demo.cfk.test'`)[0].birthday).toBe("03-14");
});
