import { test, expect } from "@playwright/test";
import { as, sql, toast } from "./helpers";

test("the Sorting gives a new member a Cape", async ({ browser }) => {
  await sql`update users set cape = null, sorted_at = null where email = 'sam@demo.cfk.test'`;
  const sam = await as(browser, "sam");
  await sam.page.goto("/");
  const dlg = sam.page.getByRole("dialog", { name: "The Sorting" });
  await dlg.getByRole("button", { name: "Find my cape" }).click();
  for (let i = 0; i < 6; i++) await dlg.locator("button.rounded-xl").first().click();
  await expect(dlg.getByText("Welcome to the")).toBeVisible({ timeout: 10_000 });
  await dlg.getByRole("button", { name: "Let's go" }).click();
  await expect(dlg).toHaveCount(0);
  const [u] = await sql`select cape from users where email = 'sam@demo.cfk.test'`;
  expect(["navy", "gold"]).toContain(u.cape);
  await sam.ctx.close();
});

test("paper planes fly, land and are collected; spells and bonuses work", async ({ browser }) => {
  const [owen] = await sql`select id from users where email = 'owen@demo.cfk.test'`;
  await sql`delete from paper_planes where to_id = ${owen.id}`;
  const julia = await as(browser, "julia");
  await julia.page.goto("/academy");
  await julia.page.getByRole("button", { name: "Throw a paper plane" }).first().click();
  const d = julia.page.getByRole("dialog").filter({ hasText: "A quick note that flies" });
  await d.locator("#pl-to").selectOption({ label: "Owen" });
  await d.getByText("You crushed it").click();
  await d.locator("#pl-msg").fill("Great graphics today!");
  await d.getByRole("button", { name: "Throw it" }).click();
  await toast(julia.page, /flying to Owen/);

  const o = await as(browser, "owen");
  await o.page.goto("/");
  await o.page.getByRole("button", { name: /Paper plane from Julia/ }).click();
  await expect(o.page.getByRole("dialog", { name: /Paper plane from Julia/ }).getByText("Great graphics today!")).toBeVisible();
  await o.page.getByRole("button", { name: /Keep it/ }).click();
  await expect.poll(async () => (await sql`select seen_at from paper_planes where to_id = ${owen.id}`)[0]?.seen_at).not.toBeNull();
  await o.page.goto("/academy/planes");
  await expect(o.page.getByText("Great graphics today!")).toBeVisible();

  // A spell in team chat
  await julia.page.goto("/messages");
  await julia.page.getByRole("link", { name: /Everyone/ }).first().click();
  await julia.page.locator("#composer").fill("/confetti");
  await julia.page.locator("#composer").press("Enter");
  await expect(julia.page.getByText("You cast Confetti")).toBeVisible();

  // Admin bonus + countdown on Home
  const [ev] = await sql`insert into events (title, type, starts_at) values (${"E2E Gala " + Date.now()}, 'fundraising', now() + interval '2 hours') returning id, title`;
  const a = await as(browser, "jacob");
  await a.page.goto("/academy");
  await a.page.locator("#bo-to").selectOption({ label: "Gold Cape" });
  await a.page.fill("#bo-why", "E2E bonus");
  await a.page.getByRole("button", { name: "Give bonus" }).click();
  await toast(a.page, /\+10 to Gold Cape/);
  await a.page.goto("/");
  await expect(a.page.getByText(new RegExp(`${ev.title} (is today!|in 1 day)`))).toBeVisible();
  await sql`delete from events where id = ${ev.id}`;
  await sql`delete from cape_bonuses where reason = 'E2E bonus'`;
  await a.page.goto("/legends");
  await expect(a.page.getByRole("heading", { name: "The Hall of Legends" })).toBeVisible();
});

test("birthday is saved from the profile", async ({ browser }) => {
  const r = await as(browser, "reese");
  await r.page.goto("/profile");
  await r.page.locator("#bd-m").selectOption("3");
  await r.page.locator("#bd-d").selectOption("14");
  await r.page.getByRole("button", { name: "Save" }).last().click();
  await toast(r.page, /Birthday saved/);
  expect((await sql`select birthday from users where email = 'reese@demo.cfk.test'`)[0].birthday).toBe("03-14");
});
