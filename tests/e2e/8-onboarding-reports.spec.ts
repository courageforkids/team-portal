import { test, expect } from "@playwright/test";
import { as, sql, toast } from "./helpers";

test("onboarding: checklist ticks, auto steps, admin edits and reminders", async ({ browser }) => {
  const [owen] = await sql`select id from users where email = 'owen@demo.cfk.test'`;
  await sql`delete from onboarding_progress where user_id = ${owen.id}`;
  await sql`delete from messages where author_id = ${owen.id} and conversation_id in (select id from conversations where kind = 'team')`;

  const o = await as(browser, "owen");
  await o.page.goto("/");
  await expect(o.page.getByRole("region", { name: "Setup checklist" })).toBeVisible();

  await o.page.goto("/onboarding");
  const manual = o.page.getByRole("button", { name: /Mark “Read the Code of Conduct.*” done/ });
  await manual.click();
  await expect(o.page.getByRole("button", { name: /Mark “Read the Code of Conduct.*” not done/ })).toBeVisible();
  await expect.poll(async () => (await sql`select count(*)::int as n from onboarding_progress where user_id = ${owen.id}`)[0].n).toBe(1);

  // Auto step: posting in the team chat ticks "Say hi" without any clicking
  await expect(o.page.getByRole("listitem").filter({ hasText: "Say hi in the team chat" }).getByLabel("Not done yet")).toBeVisible();
  const [team] = await sql`select id from conversations where kind = 'team' limit 1`;
  await sql`insert into messages (conversation_id, author_id, body) values (${team.id}, ${owen.id}, 'Hi all!')`;
  await o.page.reload();
  await expect(o.page.getByRole("listitem").filter({ hasText: "Say hi in the team chat" }).getByLabel("Done")).toBeVisible();

  // Admin adds a step and reminds Owen
  const a = await as(browser, "jacob");
  await a.page.goto("/settings/onboarding");
  const title = `E2E step ${Date.now()}`;
  await a.page.getByText("Add step").first().click();
  await a.page.fill("#os-title", title);
  await a.page.getByRole("dialog").getByRole("button", { name: "Add step" }).click();
  await toast(a.page, /Step added/);
  await expect(a.page.getByText(title).first()).toBeVisible();
  await a.page.getByRole("listitem").filter({ hasText: "Owen" }).getByRole("button", { name: "Remind" }).click();
  await toast(a.page, /Reminder sent/);
  await expect.poll(async () => (await sql`select count(*)::int as n from notifications where user_id = ${owen.id} and created_at > now() - interval '1 minute'`)[0].n).toBeGreaterThan(0);

  await o.page.reload();
  await expect(o.page.getByText(title)).toBeVisible();
  await sql`delete from onboarding_steps where title = ${title}`;
});

test("monthly report: admin saves numbers and downloads the PDF; others can't", async ({ browser }) => {
  const a = await as(browser, "jacob");
  await a.page.goto("/admin/reports");
  await a.page.fill("#r-boxes", "37");
  await a.page.fill("#r-money", "$1,250");
  await a.page.fill("#r-hi", "E2E highlight one\nE2E highlight two");
  await a.page.getByRole("button", { name: "Save report" }).click();
  await toast(a.page, /Report saved/);
  const [row] = await sql`select boxes_delivered, money_raised, highlights from monthly_reports order by updated_at desc limit 1`;
  expect(row.boxes_delivered).toBe(37);
  expect(row.money_raised).toBe("$1,250");

  const pdf = await a.page.request.get("/api/reports/monthly");
  expect(pdf.status()).toBe(200);
  expect(pdf.headers()["content-type"]).toContain("application/pdf");
  expect((await pdf.body()).subarray(0, 4).toString()).toBe("%PDF");

  const j = await as(browser, "julia");
  expect((await j.page.request.get("/api/reports/monthly")).status()).toBe(403);
  await j.page.goto("/admin/reports");
  await expect(j.page).not.toHaveURL(/\/admin\/reports/);
});
