import { test, expect } from "@playwright/test";
import { login, sql } from "./helpers";

test("a member can complete and submit an assignment on an iPhone", async ({ page }) => {
  const [sam] = await sql`select id from users where email = 'sam@demo.cfk.test'`;
  const [task] = await sql`insert into tasks (title, status, due_at, submission_types, checklist, timezone)
    values ('Mobile check: stack the supply bins', 'not_started', now() + interval '2 days', '["checklist","text"]'::jsonb,
      '[{"id":"a","label":"Bins stacked"},{"id":"b","label":"Labels facing out"}]'::jsonb, 'America/New_York') returning id`;
  await sql`insert into task_assignees (task_id, user_id) values (${task.id}, ${sam.id})`;
  await login(page, "sam");
  for (const path of ["/", "/tasks", `/tasks/${task.id}`, "/calendar", "/announcements", "/notifications", "/profile"]) {
    await page.goto(path);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, `horizontal overflow on ${path}`).toBeLessThanOrEqual(1);
  }
  await expect(page.getByRole("navigation", { name: "Primary" })).toBeVisible();
  await page.goto(`/tasks/${task.id}`);
  for (const box of await page.locator('input[name="checklist"]').all()) await box.check();
  await page.fill("#text", "Done from my phone.");
  await page.getByRole("button", { name: /Submit for review/ }).click();
  await expect(page.getByText("Submitted — nice work!")).toBeVisible();
});

test("on a phone the chat fills the screen between the top bar and the tabs", async ({ page }) => {
  const [team] = await sql`select id from conversations where kind = 'team'`;
  await login(page, "sam");
  await page.goto(`/messages/${team.id}`);
  await page.waitForTimeout(600); // let the page transition finish
  const box = await page.locator("[data-kb-fit]").boundingBox();
  const vh = page.viewportSize()!.height;
  expect(box!.y).toBeLessThanOrEqual(60);
  expect(box!.height).toBeGreaterThan(vh * 0.6);
  // and it stays that way when going back and forth between screens
  await page.goto("/messages");
  await page.goto(`/messages/${team.id}`);
  await page.waitForTimeout(600);
  expect((await page.locator("[data-kb-fit]").boundingBox())!.height).toBeGreaterThan(vh * 0.6);
});
