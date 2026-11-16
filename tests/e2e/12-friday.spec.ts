import { test, expect } from "@playwright/test";
import { as, sql, toast, PASSWORD } from "./helpers";

test("F.R.I.D.A.Y. is private to her owner, answers in limited mode, and every outside action waits for a password approval", async ({ browser, request }) => {
  await sql`delete from friday_settings`;
  await sql`truncate friday_messages, friday_memories, friday_actions, friday_jobs, friday_events, friday_briefings`;

  // The first admin to open her becomes her owner; the menu link appears for them.
  const jacob = await as(browser, "jacob");
  await jacob.page.goto("/friday");
  await expect(jacob.page.getByText("F.R.I.D.A.Y.").first()).toBeVisible();
  await expect(jacob.page.getByText("Limited mode").first()).toBeVisible();
  await jacob.page.goto("/");
  await expect(jacob.page.getByRole("link", { name: "F.R.I.D.A.Y." }).first()).toBeAttached();

  // A leader can't see her or use her chat.
  const julia = await as(browser, "julia");
  await julia.page.goto("/friday");
  await expect(julia.page.getByText("F.R.I.D.A.Y. belongs to another admin.")).toBeVisible();
  expect((await julia.page.request.post("/api/friday/chat", { data: { text: "hi" } })).status()).toBe(401);
  await expect(julia.page.getByRole("link", { name: "F.R.I.D.A.Y." })).toHaveCount(0);

  // Limited mode (no Claude API key) still answers from real data.
  await jacob.page.goto("/friday");
  await jacob.page.fill("#cmd", "Friday, good morning");
  await jacob.page.getByRole("button", { name: "Send" }).click();
  await expect(jacob.page.getByText(/I don't have a briefing yet/)).toBeVisible();

  // The overnight run (a Claude scheduled task) uses Jacob's API key.
  await jacob.page.goto("/settings/api-keys");
  await jacob.page.fill("#ak-name", "Friday overnight");
  await jacob.page.getByRole("button", { name: "Create key" }).click();
  const key = await jacob.page.getByTestId("copy-value").inputValue();
  const H = { Authorization: `Bearer ${key}` };
  expect((await request.get("/api/v1/friday")).status()).toBe(401);
  const ctx = await (await request.get("/api/v1/friday", { headers: H })).json();
  expect(ctx.tools.map((t: { name: string }) => t.name)).toContain("post_announcement");

  // Level 1 runs right away; Level 3 lands in the approval center and does nothing yet.
  const mem = await (await request.post("/api/v1/friday", { headers: H, data: { action: "tool", name: "remember", input: { kind: "fact", title: "Next delivery", content: "Next Courage Box delivery goes to ECU Health.", source: "Jacob told me", verified: true } } })).json();
  expect(mem.ok).toBe(true);
  const ann = await (await request.post("/api/v1/friday", { headers: H, data: { action: "tool", name: "post_announcement", input: { title: "Packing day Saturday", body: "Packing day is Saturday at 10am." } } })).json();
  expect(ann.result.status).toBe("awaiting_approval");
  expect((await sql`select count(*)::int as n from announcements where title = 'Packing day Saturday'`)[0].n).toBe(0);
  expect((await request.post("/api/v1/friday", { headers: H, data: { action: "briefing", content: "Good morning, sir. One announcement is waiting for your approval. Shall we begin?" } })).status()).toBe(200);
  expect((await request.post("/api/v1/friday", { headers: H, data: { action: "log", summary: "Reviewed the portal and queued one announcement." } })).status()).toBe(200);

  // "Good morning" now reads the real briefing.
  await jacob.page.goto("/friday");
  await jacob.page.fill("#cmd", "Good morning Friday");
  await jacob.page.getByRole("button", { name: "Send" }).click();
  await expect(jacob.page.getByText("Good morning, sir. One announcement is waiting for your approval. Shall we begin?").last()).toBeVisible();

  // Approval: wrong password runs nothing; the right one posts exactly that announcement.
  await jacob.page.goto("/friday?tab=approvals");
  const card = jacob.page.locator("li", { hasText: 'Post announcement "Packing day Saturday"' });
  await card.getByLabel("Your password to approve").fill("not-my-password");
  await card.getByRole("button", { name: "Approve" }).click();
  await expect(card.getByText("That password isn't right. Nothing was run.")).toBeVisible();
  expect((await sql`select count(*)::int as n from announcements where title = 'Packing day Saturday'`)[0].n).toBe(0);
  await card.getByLabel("Your password to approve").fill(PASSWORD);
  await card.getByRole("button", { name: "Approve" }).click();
  await expect(jacob.page.getByText("Nothing needs your approval.")).toBeVisible();
  expect((await sql`select count(*)::int as n from announcements where title = 'Packing day Saturday'`)[0].n).toBe(1);

  // Memory shows what she saved, with its source.
  await jacob.page.goto("/friday?tab=memory");
  await expect(jacob.page.getByText("Next Courage Box delivery goes to ECU Health.")).toBeVisible();

  // Emergency stop blocks the overnight connection too.
  await jacob.page.goto("/friday?tab=system");
  await jacob.page.getByRole("button", { name: "Emergency stop" }).click();
  await expect(jacob.page.getByRole("button", { name: "Resume Friday" })).toBeVisible();
  expect((await request.post("/api/v1/friday", { headers: H, data: { action: "log", summary: "x" } })).status()).toBe(423);
  await jacob.page.getByRole("button", { name: "Resume Friday" }).click();
  await expect(jacob.page.getByRole("button", { name: "Emergency stop" })).toBeVisible();

  // Another admin's key can't use her.
  await sql`update users set role = 'admin' where email = 'julia@demo.cfk.test'`;
  try {
    const j2 = await as(browser, "julia");
    await j2.page.goto("/settings/api-keys");
    await j2.page.fill("#ak-name", "Julia key");
    await j2.page.getByRole("button", { name: "Create key" }).click();
    const jk = await j2.page.getByTestId("copy-value").inputValue();
    expect((await request.get("/api/v1/friday", { headers: { Authorization: `Bearer ${jk}` } })).status()).toBe(403);
    await j2.page.goto("/friday");
    await expect(j2.page.getByText("F.R.I.D.A.Y. belongs to another admin.")).toBeVisible();
    await j2.ctx.close();
  } finally {
    await sql`update users set role = 'leader' where email = 'julia@demo.cfk.test'`;
  }
  void toast;
  await jacob.ctx.close(); await julia.ctx.close();
});
