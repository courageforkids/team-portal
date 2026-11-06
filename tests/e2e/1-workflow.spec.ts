import { test, expect } from "@playwright/test";
import { as, login, sql, toast } from "./helpers";

/**
 * Full assignment lifecycle:
 * admin assigns → member views → submits attachment → admin requests revision → member resubmits → admin approves → stats update.
 */
test("assign → submit → revise → resubmit → approve", async ({ browser }) => {
  const title = `E2E graphics ${Date.now()}`;
  const admin = await as(browser, "jacob");
  const member = await as(browser, "arleigh");

  // Baseline: member's "Completed this month" before
  await member.page.goto("/");
  const completedCard = member.page.locator("a", { hasText: "Completed this month" });
  const before = Number(await completedCard.locator(".tabular-nums").innerText());

  // 3. Admin assigns a task
  await admin.page.goto("/tasks/new");
  await admin.page.fill("#title", title);
  await admin.page.fill("#instructions", "Make three graphics.");
  await admin.page.getByRole("group", { name: "Assignees" }).getByText("Arleigh", { exact: true }).click();
  await admin.page.getByText("File upload", { exact: true }).click();
  const tomorrow = new Date(Date.now() + 36 * 3600_000);
  const local = `${tomorrow.toISOString().slice(0, 10)}T17:00`;
  await admin.page.fill("#dueAt", local);
  await admin.page.getByRole("button", { name: "Create & assign" }).click();
  await admin.page.waitForURL(/\/tasks\/[0-9a-f-]{36}$/);
  const taskId = admin.page.url().split("/").pop()!;
  await expect(admin.page.getByRole("heading", { name: title })).toBeVisible();

  // 4. Member sees it (dashboard + My tasks) and gets a notification
  await member.page.goto("/tasks");
  await expect(member.page.getByText(title)).toBeVisible();
  await member.page.goto("/notifications");
  await expect(member.page.getByText(`New assignment: ${title}`)).toBeVisible();

  // Upload restriction: a renamed executable is rejected
  await member.page.goto(`/tasks/${taskId}`);
  await member.page.setInputFiles("#files", "tests/fixtures/evil.png");
  await member.page.fill("#text", "attempt");
  await member.page.getByRole("button", { name: /Submit for review/ }).click();
  await expect(member.page.getByRole("alert").filter({ hasText: /doesn't look like a valid png/ }).first()).toBeVisible();
  await expect(member.page.locator("#text")).toHaveValue("attempt"); // what they typed survives an error
  const [noSub] = await sql`select count(*)::int as n from submissions where task_id = ${taskId}`;
  expect(noSub.n).toBe(0); // a rejected upload leaves nothing behind

  // 5. Member submits an attachment
  await member.page.reload();
  await member.page.setInputFiles("#files", "tests/fixtures/graphic-v1.png");
  await member.page.fill("#text", "Here are my graphics.");
  await member.page.fill("#note", "First draft");
  await member.page.getByRole("button", { name: /Submit for review/ }).click();
  await toast(member.page, /Submitted for review/);
  await expect(member.page.getByText("Submitted — nice work!")).toBeVisible();
  const [t1] = await sql`select status from tasks where id = ${taskId}`;
  expect(t1.status).toBe("submitted"); // submitting is NOT completion

  // 6–7. Admin reviews in the review center and requests a revision
  await admin.page.goto(`/review?task=${taskId}`);
  const item = admin.page.locator(`#review-${taskId}`);
  await expect(item.getByText("Here are my graphics.")).toBeVisible();
  await expect(item.locator("img")).toHaveCount(1);
  await item.getByLabel("Feedback").fill("Please make the logo bigger.");
  await item.getByRole("button", { name: "Request revision" }).click();
  await toast(admin.page, /Revision requested/);
  const [t2] = await sql`select status from tasks where id = ${taskId}`;
  expect(t2.status).toBe("revision_requested");

  // 8. Member sees feedback and resubmits — original kept
  await member.page.goto(`/tasks/${taskId}`);
  await expect(member.page.getByText("Please make the logo bigger.").first()).toBeVisible();
  await member.page.setInputFiles("#files", "tests/fixtures/graphic-v2.png");
  await member.page.fill("#text", "Updated with a bigger logo.");
  await member.page.getByRole("button", { name: /Submit revision for review/ }).click();
  await toast(member.page, /Submitted for review/);
  await expect(member.page.getByText("Version 2", { exact: true })).toBeVisible();
  await expect(member.page.getByText("Version 1", { exact: true })).toBeVisible();
  const subs = await sql`select s.version, count(f.id)::int as files from submissions s left join files f on f.owner_id = s.id where s.task_id = ${taskId} group by s.version order by s.version`;
  expect(subs.map((s) => [s.version, s.files])).toEqual([[1, 1], [2, 1]]);

  // 9. Admin approves from the task page
  await admin.page.goto(`/tasks/${taskId}`);
  await admin.page.getByLabel("Feedback").fill("Looks great!");
  await admin.page.getByRole("button", { name: "Approve" }).click();
  await toast(admin.page, /Approved/);
  const [t3] = await sql`select status, completed_at from tasks where id = ${taskId}`;
  expect(t3.status).toBe("approved");
  expect(t3.completed_at).not.toBeNull();

  // 10. Member dashboard statistics update
  await member.page.goto("/");
  await expect(completedCard.locator(".tabular-nums")).toHaveText(String(before + 1));
  await member.page.goto("/notifications");
  await expect(member.page.getByText(`Approved: ${title}`)).toBeVisible();

  await admin.ctx.close(); await member.ctx.close();
});

test("extension request is approved and moves the deadline", async ({ browser }) => {
  const [task] = await sql`select t.id, t.due_at from tasks t join task_assignees a on a.task_id = t.id join users u on u.id = a.user_id
    where u.email = 'dominik@demo.cfk.test' and t.status in ('not_started','in_progress') limit 1`;
  const member = await as(browser, "dominik");
  await member.page.goto(`/tasks/${task.id}`);
  await member.page.getByRole("button", { name: "Request more time" }).click();
  const newDue = new Date(new Date(task.due_at).getTime() + 3 * 86400_000);
  await member.page.fill("#requestedDueAt", `${newDue.toISOString().slice(0, 10)}T18:00`);
  await member.page.fill("#ext-reason", "Exams this week");
  await member.page.getByRole("button", { name: "Send request" }).click();
  await toast(member.page, /Extension requested/);

  const admin = await as(browser, "jacob");
  await admin.page.goto("/review?tab=extensions");
  await expect(admin.page.getByText("Exams this week")).toBeVisible();
  await admin.page.getByRole("button", { name: "Approve" }).first().click();
  await toast(admin.page, /Extension approved/);
  const [after] = await sql`select due_at, original_due_at from tasks where id = ${task.id}`;
  expect(new Date(after.due_at).getTime()).toBeGreaterThan(new Date(task.due_at).getTime());
  expect(after.original_due_at).not.toBeNull();
  await member.ctx.close(); await admin.ctx.close();
});

test("recurring tasks create their own instances", async ({ browser }) => {
  const title = `E2E weekly ${Date.now()}`;
  const admin = await as(browser, "jacob");
  await admin.page.goto("/tasks/new");
  await admin.page.fill("#title", title);
  await admin.page.getByRole("group", { name: "Assignees" }).getByText("Owen", { exact: true }).click();
  await admin.page.getByRole("group", { name: "Assignees" }).getByText("Dominik", { exact: true }).click();
  const due = new Date(Date.now() + 3 * 86400_000);
  await admin.page.fill("#dueAt", `${due.toISOString().slice(0, 10)}T17:00`);
  await admin.page.selectOption("#repeat", "weekly");
  await admin.page.getByRole("button", { name: "Create & assign" }).click();
  await toast(admin.page, /Recurring task created/);
  const rows = await sql`select t.id, t.due_at, t.series_id from tasks t where t.title = ${title}`;
  expect(rows.length).toBe(2); // one copy each for Owen and Dominik
  const [series] = await sql`select next_due_at from task_series where id = ${rows[0].series_id}`;
  expect(new Date(series.next_due_at).getTime() - new Date(rows[0].due_at).getTime()).toBe(7 * 86400_000);
  await admin.ctx.close();
});

test("admin invites a new member who signs up and signs in", async ({ browser }) => {
  const email = `newmember${Date.now()}@demo.cfk.test`;
  const admin = await as(browser, "jacob");
  await admin.page.goto("/settings/invitations");
  await admin.page.fill("#inv-email", email);
  await admin.page.fill("#inv-name", "Taylor Test");
  await admin.page.fill("#inv-title", "Media Volunteer");
  await admin.page.getByRole("button", { name: "Create invitation" }).click();
  const link = await admin.page.getByTestId("copy-value").inputValue();
  expect(link).toMatch(/\/invite\/[A-Za-z0-9_-]{20,}$/);

  // Public registration doesn't exist: an invalid token is refused
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto("/invite/not-a-real-token");
  await expect(page.getByText("This invitation isn't valid")).toBeVisible();

  await page.goto(new URL(link).pathname);
  await page.fill("#password", "TaylorPass-2026");
  await page.fill("#confirm", "TaylorPass-2026");
  await page.getByRole("button", { name: "Create account" }).click();
  await page.waitForURL((u) => u.pathname === "/");
  await expect(page.getByRole("heading", { level: 1, name: /Taylor!/ })).toBeVisible();
  // The link can't be reused
  const again = await browser.newContext(); const p2 = await again.newPage();
  await p2.goto(new URL(link).pathname);
  await expect(p2.getByText("This invitation isn't valid")).toBeVisible();
  // Sign out and back in
  await page.goto("/profile");
  await ctx.clearCookies();
  await login(page, email, "TaylorPass-2026");
  await expect(page.getByRole("heading", { level: 1, name: /Taylor!/ })).toBeVisible();
  const [u] = await sql`select role from users where email = ${email}`;
  expect(u.role).toBe("volunteer");
  await admin.ctx.close(); await ctx.close(); await again.close();
});
