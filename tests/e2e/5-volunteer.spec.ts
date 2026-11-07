import { test, expect } from "@playwright/test";
import { as, sql, toast } from "./helpers";

test("sign-ups respect the spot limit, and attendance turns into approved hours", async ({ browser }) => {
  const [ev] = await sql`insert into events (title, type, starts_at, ends_at) values (${"E2E packing " + Date.now()}, 'volunteer', now() + interval '3 days', now() + interval '3 days 2 hours') returning id, starts_at`;
  const [shift] = await sql`insert into event_shifts (event_id, label, starts_at, ends_at, capacity) values (${ev.id}, 'Tiny shift', ${ev.starts_at}, ${ev.starts_at}::timestamptz + interval '90 minutes', 1) returning id`;

  const owen = await as(browser, "owen");
  await owen.page.goto(`/volunteer/events/${ev.id}`);
  await owen.page.getByRole("button", { name: "Sign up" }).click();
  await toast(owen.page, /signed up for Tiny shift/);

  const reese = await as(browser, "reese");
  await reese.page.goto(`/volunteer/events/${ev.id}`);
  await expect(reese.page.getByRole("button", { name: "Full" })).toBeDisabled(); // 1 spot, taken

  // Admin marks attendance → 1.5 approved hours for Owen
  const admin = await as(browser, "jacob");
  await admin.page.goto(`/volunteer/events/${ev.id}`);
  await admin.page.getByRole("listitem").filter({ hasText: "Owen" }).getByRole("button", { name: "Came", exact: true }).click();
  await expect.poll(async () => (await sql`select minutes, status from volunteer_hours where shift_id = ${shift.id}`)[0]).toEqual({ minutes: 90, status: "approved" });
  // Undo removes the hours again
  await admin.page.getByRole("listitem").filter({ hasText: "Owen" }).getByRole("button", { name: "Came", exact: true }).click();
  await expect.poll(async () => (await sql`select count(*)::int as n from volunteer_hours where shift_id = ${shift.id}`)[0].n).toBe(0);
  // Non-admins don't get attendance controls
  await expect(owen.page.getByRole("button", { name: "Came", exact: true })).toHaveCount(0);
  await owen.ctx.close(); await reese.ctx.close(); await admin.ctx.close();
  await sql`delete from events where id = ${ev.id}`;
});

test("log hours → admin approves → certificate downloads as a PDF", async ({ browser }) => {
  const dominik = await as(browser, "dominik");
  const activity = `E2E service ${Date.now()}`;
  await dominik.page.goto("/volunteer/hours");
  await dominik.page.fill("#h-hours", "2.5");
  await dominik.page.fill("#h-act", activity);
  await dominik.page.getByRole("button", { name: "Log hours" }).click();
  await toast(dominik.page, /Hours logged/);
  await expect(dominik.page.getByText(activity)).toBeVisible();

  const admin = await as(browser, "jacob");
  await admin.page.goto("/volunteer/review");
  await admin.page.getByRole("listitem").filter({ hasText: activity }).getByRole("button", { name: "Approve", exact: true }).click();
  await toast(admin.page, /Approved/);
  const [row] = await sql`select status, minutes from volunteer_hours where activity = ${activity}`;
  expect(row).toEqual({ status: "approved", minutes: 150 });

  const pdf = await dominik.page.request.get("/api/hours/certificate?period=all");
  expect(pdf.status()).toBe(200);
  expect(pdf.headers()["content-type"]).toBe("application/pdf");
  expect((await pdf.body()).subarray(0, 4).toString()).toBe("%PDF");
  // A member can't pull someone else's certificate (the user param is ignored for non-admins)
  const [julia] = await sql`select id from users where email = 'julia@demo.cfk.test'`;
  const other = await dominik.page.request.get(`/api/hours/certificate?user=${julia.id}&period=all`);
  expect(other.headers()["content-disposition"]).toContain("Dominik");
  // Only admins reach the review page
  await dominik.page.goto("/volunteer/review");
  await dominik.page.waitForURL((u) => u.pathname === "/");
  await dominik.ctx.close(); await admin.ctx.close();
});
