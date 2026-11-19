import { test, expect } from "@playwright/test";
import { writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { as, sql, toast } from "./helpers";

test("Courage HQ: import, add, check off, private to its owner", async ({ browser }) => {
  const stamp = Date.now();
  const admin = await as(browser, "jacob");
  const p = admin.page;
  await sql`delete from hq_items where owner_id = (select id from users where email = 'jacob@demo.cfk.test')`;
  await p.goto("/admin/hq");
  await expect(p.getByRole("heading", { level: 1 })).toContainText("Jacob");

  // Import an export file (twice: the second run updates instead of doubling up)
  const dir = mkdtempSync(join(tmpdir(), "hq-"));
  const file = join(dir, "courage-hq-export.json");
  writeFileSync(file, JSON.stringify({ items: [
    { externalId: "t1", kind: "task", title: `Imported task ${stamp}`, category: "Events", date: "2030-01-05", person: "Dominik" },
    { externalId: "g1", kind: "grant", title: "Kars4Kids", subtitle: "Small Grant Program", category: "Submitted", amount: 5000 },
    { externalId: "gf1", kind: "gift", title: "Minky Couture", subtitle: "50 blankets", category: "In-kind", amount: 900, date: "2026-05-06", done: true },
    { externalId: "c1", kind: "contact", title: "WSPA 7News", category: "Media", date: "2030-01-02", nextStep: "Send pitch" },
  ] }));
  for (const msg of ["Imported 4 new.", "Imported 0 new and updated 4."]) {
    await p.getByRole("button", { name: "Import from old HQ" }).click();
    await p.setInputFiles("#hq-import-file", file);
    await p.getByRole("button", { name: "Import", exact: true }).click();
    await toast(p, msg);
  }
  const [{ n }] = await sql`select count(*)::int as n from hq_items where owner_id = (select id from users where email = 'jacob@demo.cfk.test')`;
  expect(n).toBe(4);
  // Donated items never carry a dollar value
  const [gift] = await sql`select amount_cents from hq_items where external_id = 'gf1'`;
  expect(gift.amount_cents).toBeNull();

  // Add a task and check it off
  const title = `Order the banner ${stamp}`;
  await p.getByRole("button", { name: "Add task" }).click();
  await p.locator("dialog[open] input[name=title]").fill(title);
  await p.locator("dialog[open]").getByRole("button", { name: "Add", exact: true }).click();
  await toast(p, "Added to HQ.");
  await p.getByRole("button", { name: `Mark done: ${title}` }).click();
  await toast(p, "Nice. Marked done.");

  // Tabs
  await p.getByRole("navigation", { name: "HQ sections" }).getByRole("link", { name: /^Grants/ }).click();
  await expect(p.getByText("Kars4Kids")).toBeVisible();
  await expect(p.getByText("$5,000").first()).toBeVisible();

  // Leaders can't reach it
  const leader = await as(browser, "julia");
  await leader.page.goto("/admin/hq");
  await expect(leader.page).not.toHaveURL(/\/admin\/hq/);
  await admin.ctx.close(); await leader.ctx.close();
});

test("Courage HQ sends one phone/in-app nudge per due item", async ({ request }) => {
  const secret = process.env.CRON_SECRET ?? "";
  test.skip(secret.length < 16, "needs CRON_SECRET on the test server");
  const hour = Number(new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "numeric", hourCycle: "h23" }).format(new Date()));
  test.skip(hour < 7, "nudges only go out after 7am");
  const [me] = await sql`select id from users where email = 'jacob@demo.cfk.test'`;
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date());
  const title = `Nudge me ${Date.now()}`;
  await sql`insert into hq_items (owner_id, kind, title, date) values (${me.id}, 'task', ${title}, ${today})`;
  for (let i = 0; i < 2; i++) expect((await request.get("/api/cron", { headers: { authorization: `Bearer ${secret}` } })).ok()).toBe(true);
  const rows = await sql`select href from notifications where user_id = ${me.id} and title = ${"Due today: " + title}`;
  expect(rows.length).toBe(1);
  expect(rows[0].href).toBe("/admin/hq?tab=task");
});
