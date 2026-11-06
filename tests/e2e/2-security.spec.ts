import { test, expect } from "@playwright/test";
import { as, sql } from "./helpers";

test("members can't see other members' tasks or files", async ({ browser, request }) => {
  const [task] = await sql`select t.id, t.title from tasks t join task_assignees a on a.task_id = t.id join users u on u.id = a.user_id where u.email = 'julia@demo.cfk.test' limit 1`;
  const [file] = await sql`select f.id from files f join submissions s on s.id = f.owner_id where f.owner_type = 'submission' limit 1`;
  const sam = await as(browser, "sam");
  await sam.page.goto(`/tasks/${task.id}`);
  // (Streaming pages return 200 with the not-found UI; what matters is that nothing leaks.)
  await expect(sam.page.getByText("We couldn't find that page")).toBeVisible();
  await expect(sam.page.locator("main")).not.toContainText(String(task.title ?? "__none__"));
  expect(file, "run after the workflow tests so a submission file exists").toBeTruthy();
  {
    const fr = await sam.page.request.get(`/api/files/${file.id}`);
    expect(fr.status()).toBe(404);
    const anon = await request.get(`/api/files/${file.id}`);
    expect(anon.status()).toBe(401);
  }
  // Volunteer only sees their own tasks in My tasks
  await sam.page.goto("/tasks?view=everything");
  await expect(sam.page.getByText("Help set up the packing tables")).toBeVisible();
  await expect(sam.page.getByText("Draft sponsor thank-you list")).toHaveCount(0);
  await sam.ctx.close();
});

test("non-administrators can't use administrator pages or actions", async ({ browser }) => {
  for (const who of ["julia", "sam"]) {
    const { page, ctx } = await as(browser, who);
    for (const path of ["/tasks/all", "/tasks/new", "/admin", "/admin/performance", "/admin/accountability", "/settings/members"]) {
      await page.goto(path);
      await page.waitForURL((u) => u.pathname === "/", { timeout: 15_000 });
      await expect(page.getByText("That page is only available to administrators.")).toBeVisible();
    }
    const exp = await page.request.get("/api/export/json");
    expect([401, 403, 404]).toContain(exp.status());
    await ctx.close();
  }
});

test("signed-out visitors are sent to sign in", async ({ page }) => {
  await page.goto("/tasks");
  await expect(page).toHaveURL(/\/login\?next=%2Ftasks/);
});

test("cron endpoint requires the secret; reminders are never duplicated", async ({ request }) => {
  expect((await request.get("/api/cron")).status()).toBe(401);
  const secret = process.env.CRON_SECRET ?? "dev-cron-secret-change-me";
  const [julia] = await sql`select id from users where email = 'julia@demo.cfk.test'`;
  const [t] = await sql`insert into tasks (title, due_at, status, timezone) values ('E2E reminder task', now() + interval '20 hours', 'not_started', 'America/New_York') returning id`;
  await sql`insert into task_assignees (task_id, user_id) values (${t.id}, ${julia.id})`;
  const prev = await sql`select data from settings where id = 1`;
  await sql`update settings set data = data || '{"quietHoursStart":0,"quietHoursEnd":0}'::jsonb where id = 1`;
  try {
    for (let i = 0; i < 3; i++) expect((await request.get("/api/cron", { headers: { authorization: `Bearer ${secret}` } })).status()).toBe(200);
    const notes = await sql`select dedupe_key from notifications where user_id = ${julia.id} and href = ${"/tasks/" + t.id} and type = 'deadline_soon'`;
    expect(notes.length).toBe(1);
    expect(notes[0].dedupe_key).toContain(":24:");
    // Changing the deadline re-arms exactly one new reminder
    await sql`update tasks set due_at = now() + interval '30 hours' where id = ${t.id}`;
    await request.get("/api/cron", { headers: { authorization: `Bearer ${secret}` } });
    await request.get("/api/cron", { headers: { authorization: `Bearer ${secret}` } });
    const notes2 = await sql`select dedupe_key from notifications where user_id = ${julia.id} and href = ${"/tasks/" + t.id} and type = 'deadline_soon'`;
    expect(notes2.length).toBe(2);
  } finally {
    await sql`update settings set data = ${sql.json(prev[0].data)} where id = 1`;
    await sql`delete from tasks where id = ${t.id}`;
  }
});
