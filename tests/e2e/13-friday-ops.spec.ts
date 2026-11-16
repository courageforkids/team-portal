import { test, expect } from "@playwright/test";
import { as, sql, PASSWORD } from "./helpers";
import { hotp, base32Decode } from "../../src/lib/friday-pure";

test("F.R.I.D.A.Y. operations: knowledge, partners, work queue, inbox and weekly reports, and two-step approvals", async ({ browser, request }) => {
  await sql`delete from friday_settings`;
  await sql`truncate friday_messages, friday_memories, friday_actions, friday_jobs, friday_events, friday_briefings, friday_partners, friday_reports`;
  const jacob = await as(browser, "jacob");
  const p = jacob.page;

  // Claiming her loads verified org knowledge and the partners already on record.
  await p.goto("/friday?tab=partners");
  await expect(p.locator("li", { hasText: "Offered a free refurbished K2S projector" })).toBeVisible();
  await expect(p.getByText("We promised: Unboxing reel on Instagram and tags in posts made with it")).toBeVisible();
  await p.goto("/friday?tab=memory");
  await expect(p.getByText("Their fight. Our mission.", { exact: false }).first()).toBeVisible();

  // Limited mode answers from data, and queues real work for her next scheduled run.
  await p.goto("/friday");
  await p.fill("#cmd", "Friday, how is fundraising going?");
  await p.getByRole("button", { name: "Send" }).click();
  await expect(p.getByText(/From gifts logged in the portal/)).toBeVisible();
  await p.fill("#cmd", "Prepare our next fundraising campaign");
  await p.getByRole("button", { name: "Send" }).click();
  await expect(p.getByText(/added that to my work queue/)).toBeVisible();
  await p.fill("#cmd", "remember the Dickens booth is December 1");
  await p.getByRole("button", { name: "Send" }).click();
  await expect(p.getByText("Noted, sir. It's in my memory.")).toBeVisible();

  // Her scheduled run sees the queue, does the work and reports back.
  await p.goto("/settings/api-keys");
  await p.fill("#ak-name", "Friday runs");
  await p.getByRole("button", { name: "Create key" }).click();
  const H = { Authorization: `Bearer ${await p.getByTestId("copy-value").inputValue()}` };
  const ctx = await (await request.get("/api/v1/friday", { headers: H })).json();
  const job = ctx.workQueue.find((j: { title: string }) => j.title === "Prepare our next fundraising campaign");
  expect(job).toBeTruthy();
  expect((await request.post("/api/v1/friday", { headers: H, data: { action: "tool", name: "upsert_partner", input: { name: "Wacaco", kind: "brand", status: "contacted", next_step: "Follow up if no reply", source: "Gmail draft" } } })).status()).toBe(200);
  expect((await request.post("/api/v1/friday", { headers: H, data: { action: "job", id: job.id, status: "done", result: "Drafted a 4-week holiday campaign plan and 3 sponsor emails." } })).status()).toBe(200);
  expect((await request.post("/api/v1/friday", { headers: H, data: { action: "report", kind: "inbox", content: { reviewed: 12, items: [{ category: "sponsorship", from: "Yaber", subject: "Projector donation", summary: "Offering a refurbished K2S.", action: "Send the drafted acceptance", drafted: true }] } } })).status()).toBe(200);
  expect((await request.post("/api/v1/friday", { headers: H, data: { action: "report", kind: "weekly", content: { weekOf: "Nov 16", priorities: ["Confirm the ECU Health delivery"], deadlines: [{ what: "Dickens booth", when: "Dec 1" }] } } })).status()).toBe(200);

  await p.goto("/friday?tab=agents");
  await expect(p.getByText("Prepare our next fundraising campaign").first()).toBeVisible();
  await expect(p.getByText("done", { exact: true }).first()).toBeVisible();
  await p.goto("/friday?tab=comms");
  await expect(p.getByText("Offering a refurbished K2S.")).toBeVisible();
  await expect(p.getByText("1 reply drafts waiting in Gmail", { exact: false })).toBeVisible();
  await p.goto("/friday?tab=briefing");
  await expect(p.getByText("Confirm the ECU Health delivery")).toBeVisible();
  await p.goto("/friday?tab=partners");
  await expect(p.getByText("Wacaco", { exact: false }).first()).toBeVisible();

  // Two-step approvals: set up an authenticator, then approvals need password + code.
  await p.goto("/friday?tab=system");
  await p.fill("#tf-pw1", PASSWORD);
  await p.getByRole("button", { name: "Set up authenticator" }).click();
  await expect(p.getByText(/Enter a setup key/)).toBeVisible();
  const [st] = await sql`select totp_pending from friday_settings where id = 1`;
  const code = () => hotp(base32Decode(st.totp_pending as string), Math.floor(Date.now() / 30000));
  await p.fill("#tf-c1", await code());
  await p.getByRole("button", { name: "Confirm" }).click();
  await expect(p.getByText(/Authenticator codes are on/).first()).toBeVisible();

  await request.post("/api/v1/friday", { headers: H, data: { action: "tool", name: "post_announcement", input: { title: "Two-step test", body: "Testing approvals." } } });
  await p.goto("/friday?tab=approvals");
  const card = p.locator("li", { hasText: 'Post announcement "Two-step test"' });
  await card.getByLabel("Your password to approve").fill(PASSWORD);
  await card.getByLabel("Authenticator code").fill("000000");
  await card.getByRole("button", { name: "Approve" }).click();
  await expect(card.getByText("That authenticator code isn't right. Nothing was run.")).toBeVisible();
  expect((await sql`select count(*)::int as n from announcements where title = 'Two-step test'`)[0].n).toBe(0);
  await card.getByLabel("Your password to approve").fill(PASSWORD);
  await card.getByLabel("Authenticator code").fill(await code());
  await card.getByRole("button", { name: "Approve" }).click();
  await expect(p.getByText("Nothing needs your approval.")).toBeVisible();
  expect((await sql`select count(*)::int as n from announcements where title = 'Two-step test'`)[0].n).toBe(1);

  // Voice "pause" works as an emergency stop.
  await p.goto("/friday");
  await p.fill("#cmd", "Friday, pause");
  await p.getByRole("button", { name: "Send" }).click();
  await expect(p.getByText(/I've stopped everything/)).toBeVisible();
  expect((await request.post("/api/v1/friday", { headers: H, data: { action: "log", summary: "should be blocked" } })).status()).toBe(423);
  await sql`update friday_settings set paused = false, totp_secret = null where id = 1`;
  await jacob.ctx.close();
});
