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
