import { test, expect } from "@playwright/test";
import { as, sql, toast } from "./helpers";

test("meetings: agenda, notes, attendance and action items", async ({ browser }) => {
  const julia = await as(browser, "julia"); // leaders can run meetings
  await julia.page.goto("/meetings");
  await julia.page.getByRole("button", { name: "New meeting page" }).click();
  const name = `E2E check-in ${Date.now()}`;
  await julia.page.fill("#mt-title", name);
  await julia.page.fill("#mt-agenda", "1. Wins\n2. Plans");
  await julia.page.getByRole("button", { name: "Create" }).click();
  await julia.page.waitForURL(/\/meetings\/[0-9a-f-]{36}$/);
  const id = julia.page.url().split("/").pop()!;
  await julia.page.getByRole("button", { name: "Take notes" }).click();
  await julia.page.locator(`#notes-${id}`).fill("Decided: packing on Saturday.");
  await julia.page.getByRole("button", { name: "Save" }).click();
  await toast(julia.page, /Saved/);
  await julia.page.getByRole("listitem").filter({ hasText: "Owen" }).getByRole("radio", { name: "Here" }).click();
  await expect.poll(async () => (await sql`select status from meeting_attendance where meeting_id = ${id}`)[0]?.status).toBe("present");

  // Someone else saving in between is detected instead of silently overwritten
  const isaac = await as(browser, "isaac");
  await isaac.page.goto(`/meetings/${id}`);
  await julia.page.getByRole("button", { name: "Edit" }).nth(1).click();
  await isaac.page.getByRole("button", { name: "Edit" }).nth(1).click();
  await isaac.page.locator(`#notes-${id}`).fill("Isaac's version");
  await isaac.page.getByRole("button", { name: "Save" }).click();
  await toast(isaac.page, /Saved/);
  await julia.page.locator(`#notes-${id}`).fill("Julia's version");
  await julia.page.getByRole("button", { name: "Save" }).click();
  await expect(julia.page.getByRole("alert").filter({ hasText: /just edited this page/ }).first()).toBeVisible();
  expect((await sql`select notes from meetings where id = ${id}`)[0].notes).toBe("Isaac's version");

  // Admin turns an action item into a task
  const admin = await as(browser, "jacob");
  await admin.page.goto(`/meetings/${id}`);
  await admin.page.fill("#ai-title", "Book the community room");
  await admin.page.selectOption("#ai-who", { label: "David" });
  await admin.page.getByRole("button", { name: "Add" }).click();
  await toast(admin.page, /Action item added/);
  const [t] = await sql`select t.title, u.name from tasks t join task_assignees a on a.task_id = t.id join users u on u.id = a.user_id where t.meeting_id = ${id}`;
  expect(t).toEqual({ title: "Book the community room", name: "David" });
  // Volunteers can read but not edit
  const sam = await as(browser, "sam");
  await sam.page.goto(`/meetings/${id}`);
  await expect(sam.page.getByText("Isaac's version")).toBeVisible();
  await expect(sam.page.getByRole("button", { name: "Edit" })).toHaveCount(0);
  for (const c of [julia, isaac, admin, sam]) await c.ctx.close();
});

test("polls: create, vote, change vote; anonymous polls hide names", async ({ browser }) => {
  const julia = await as(browser, "julia");
  const q = `E2E poll ${Date.now()}?`;
  await julia.page.goto("/polls");
  await julia.page.getByRole("button", { name: "New poll" }).click();
  await julia.page.fill("#pq", q);
  await julia.page.getByLabel("Choice 1").fill("Pizza");
  await julia.page.getByLabel("Choice 2").fill("Tacos");
  await julia.page.getByRole("dialog").getByText("Anonymous", { exact: true }).click();
  await julia.page.getByRole("button", { name: "Post poll" }).click();
  await toast(julia.page, /Poll posted/);
  const owen = await as(browser, "owen");
  await owen.page.goto("/notifications");
  await expect(owen.page.getByText(`New poll: ${q}`)).toBeVisible();
  await owen.page.goto("/polls");
  const card = owen.page.locator("article", { hasText: q });
  await card.getByText("Tacos").click();
  await card.getByRole("button", { name: "Vote" }).click();
  await toast(owen.page, /Vote saved/);
  await expect(card.getByText("1 · 100%")).toBeVisible();
  await expect(card.getByText("Owen")).toHaveCount(0); // anonymous
  await card.getByRole("button", { name: "Change my vote" }).click();
  await card.getByText("Pizza").click();
  await card.getByRole("button", { name: "Update vote" }).click();
  await toast(owen.page, /Vote saved/);
  const [v] = await sql`select count(*)::int as n from poll_votes pv join polls p on p.id = pv.poll_id where p.question = ${q}`;
  expect(v.n).toBe(1); // one vote per person
  await julia.ctx.close(); await owen.ctx.close();
});

test("shout-outs: give one, recipient is notified, others can cheer", async ({ browser }) => {
  const reese = await as(browser, "reese");
  const msg = `E2E thanks ${Date.now()}`;
  await reese.page.goto("/shoutouts");
  await reese.page.getByRole("button", { name: "Give a shout-out" }).click();
  await reese.page.getByRole("dialog").getByText("David", { exact: true }).click();
  await reese.page.getByRole("button", { name: /Teamwork/ }).click();
  await reese.page.fill("#so-msg", msg);
  await reese.page.getByRole("button", { name: "Post shout-out" }).click();
  await toast(reese.page, /Shout-out posted/);
  const david = await as(browser, "david");
  await david.page.goto("/notifications");
  await expect(david.page.getByText(/gave you a shout-out/).first()).toBeVisible();
  await david.page.goto("/shoutouts");
  const card = david.page.locator("article", { hasText: msg });
  await card.getByRole("button", { name: "Cheer" }).click();
  await expect(card.getByRole("button", { pressed: true })).toBeVisible();
  await expect.poll(async () => (await sql`select count(*)::int as n from shoutout_cheers c join shoutouts s on s.id = c.shoutout_id where s.message = ${msg}`)[0].n).toBe(1);
  await reese.ctx.close(); await david.ctx.close();
});
